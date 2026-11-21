"""AutoEdit source import API. Run only for videos you own or are authorized to edit.

The API is deliberately private (API key required) and does not bypass DRM,
logins, age restrictions or private videos. YouTube access may be restricted by
the platform and the platform's terms; a video ID never guarantees import.
"""
import asyncio
import os
import re
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

import yt_dlp
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

API_KEY = os.environ.get("AUTOEDIT_API_KEY", "")
if not API_KEY:
    raise RuntimeError("Set AUTOEDIT_API_KEY before starting the import service.")
ORIGINS = [s.strip() for s in os.getenv(
    "AUTOEDIT_ALLOWED_ORIGINS", "https://braie-aep.github.io"
).split(",") if s.strip()]
MAX_SECONDS = min(3 * 60 * 60, max(60, int(os.getenv("MAX_VIDEO_SECONDS", "3600"))))
MAX_BYTES = min(1024 ** 3, max(10 * 1024 ** 2, int(os.getenv("MAX_VIDEO_BYTES", str(500 * 1024 ** 2)))))
TTL = 1800
ROOT = Path(tempfile.mkdtemp(prefix="autoedit-import-"))
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
semaphore = asyncio.Semaphore(1)
items: dict[str, tuple[Path, float, str]] = {}

app = FastAPI(title="AutoEdit Video Import", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_credentials=False,
                   allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])


class ImportRequest(BaseModel):
    url: str = Field(min_length=10, max_length=1024)
    authorized: bool = False


def check_key(header: str | None):
    import secrets
    if not header or not header.startswith("Bearer ") or not secrets.compare_digest(header[7:], API_KEY):
        raise HTTPException(status_code=401, detail="Invalid importer API key")


def parse_video_id(value: str) -> str:
    try:
        address = urlparse(value)
    except ValueError:
        raise HTTPException(400, "Invalid YouTube URL")
    if address.scheme != "https" or address.username or address.password or address.port:
        raise HTTPException(400, "Only secure YouTube video URLs are accepted")
    host = (address.hostname or "").lower()
    if host == "youtu.be":
        video_id = address.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"):
        from urllib.parse import parse_qs
        if address.path == "/watch":
            video_id = parse_qs(address.query).get("v", [""])[0]
        else:
            match = re.fullmatch(r"/(?:shorts|live|embed)/([A-Za-z0-9_-]{11})/?", address.path)
            video_id = match.group(1) if match else ""
    else:
        raise HTTPException(400, "Only YouTube video URLs are supported by this importer")
    if not VIDEO_ID.fullmatch(video_id):
        raise HTTPException(400, "Invalid YouTube video ID")
    return video_id


def cleanup():
    now = time.time()
    for key, (file, created, folder) in list(items.items()):
        if now - created > TTL:
            shutil.rmtree(folder, ignore_errors=True)
            items.pop(key, None)


def download_authorized(video_id: str) -> tuple[Path, str]:
    folder = Path(tempfile.mkdtemp(prefix="source-", dir=ROOT))
    try:
        opts = {
            "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best[ext=mp4]/best",
            "outtmpl": str(folder / "source.%(ext)s"),
            "merge_output_format": "mp4",
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "socket_timeout": 25,
            "retries": 2,
            "max_filesize": MAX_BYTES,
            "ignoreerrors": False,
            "skip_download": True,
            "extract_flat": False,
        }
        url = "https://www.youtube.com/watch?v=" + video_id
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if not info or info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
            raise ValueError("Live or scheduled broadcasts cannot be imported")
        duration = info.get("duration")
        if duration is None or not (0 < duration <= MAX_SECONDS):
            raise ValueError("Video exceeds the duration limit or has no known duration")
        title = re.sub(r"[^a-zA-Z0-9 _-]+", "", info.get("title") or "YouTube video").strip()[:90]
        opts["skip_download"] = False
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
        paths = sorted([p for p in folder.glob("source.*") if p.suffix.lower() in (".mp4", ".webm", ".mkv")],
                       key=lambda p: p.stat().st_size, reverse=True)
        if not paths:
            raise ValueError("No editable file returned; this source may be unavailable")
        file = paths[0]
        if file.stat().st_size > MAX_BYTES:
            raise ValueError("Imported video exceeds the file limit")
        return file, title or "YouTube video"
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise


@app.get("/health")
def health():
    return {"ok": True, "service": "AutoEdit importer", "note": "Private authorized imports only"}


@app.post("/api/import")
async def import_video(payload: ImportRequest, authorization: str | None = Header(default=None)):
    check_key(authorization)
    if not payload.authorized:
        raise HTTPException(400, "Confirm that you own the video or have permission to import it")
    video_id = parse_video_id(payload.url)
    cleanup()
    if semaphore.locked():
        raise HTTPException(429, "Importer is busy. Try again after its current job.")
    async with semaphore:
        try:
            file, title = await asyncio.wait_for(asyncio.to_thread(download_authorized, video_id), timeout=900)
        except asyncio.TimeoutError:
            raise HTTPException(504, "Video import timed out")
        except Exception as exc:
            # Avoid leaking internals / request URLs into the browser.
            raise HTTPException(422, "Source unavailable or import failed: " + str(exc)[:160])
    key = uuid.uuid4().hex
    items[key] = (file, time.time(), str(file.parent))
    return {"id": key, "title": title, "size": file.stat().st_size,
            "download_path": "/api/media/" + key}


@app.get("/api/media/{video_id}")
def read_video(video_id: str, authorization: str | None = Header(default=None)):
    check_key(authorization)
    cleanup()
    result = items.get(video_id)
    if not result:
        raise HTTPException(404, "Imported video expired or unavailable")
    file, _, _ = result
    media_type = "video/mp4" if file.suffix == ".mp4" else "video/webm"
    return FileResponse(file, media_type=media_type, filename="autoedit-source" + file.suffix)


@app.on_event("shutdown")
def on_shutdown():
    shutil.rmtree(ROOT, ignore_errors=True)

# In a combined Docker deployment the Python service also hosts the Vite SPA.
# API routes are registered first. Running just the API still works without dist/.
STATIC_DIR = os.getenv("AUTOEDIT_STATIC_DIR", "")
if STATIC_DIR and Path(STATIC_DIR).is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="autoedit-ui")
