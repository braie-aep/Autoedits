# AutoEdit authorized YouTube video-import API

This is **server code**, not a running hosted service. GitHub Pages runs only the static frontend and cannot run Python, FFmpeg, or yt-dlp.

## Purpose
- Private authenticated import of **YouTube videos you own or have permission to edit**.
- Only HTTPS YouTube video IDs. No arbitrary site URL proxy, playlist crawling, live streams, DRM circumvention, password bypass, or login cookies.
- The API checks duration and file-size limits, downloads a temporary source video when accessible, returns a private media URL, then expires files.
- The frontend can then import that file and use its existing browser-based Shorts pipeline to generate candidate clips, optional captions, effects, and individual exports.
- YouTube may block downloading or extraction, and its Terms of Service may restrict these operations. Use this only where you are authorized and the platform permits it. This is **not** the YouTube Data API.

## Hosting required
Deploy the `backend/` Docker image to a backend-capable host with persistent disk during processing and adequate network/CPU/storage. Set `AUTOEDIT_API_KEY` to a long random secret and `AUTOEDIT_ALLOWED_ORIGINS` to the actual frontend origin.

Example for a private Docker host:

```sh
docker build -t autoedit-import ./backend
docker run --rm -p 8080:8080 \
  -e AUTOEDIT_API_KEY="your-long-random-secret" \
  -e AUTOEDIT_ALLOWED_ORIGINS="https://braie-aep.github.io" \
  autoedit-import
```

Terminate TLS at the host (HTTPS required for a public GitHub Pages frontend). Configure the backend HTTPS URL and private API key in AutoEdit's source-import box. Never commit the key to GitHub or place it in a Vite environment variable, since Vite variables are public in the web bundle.

## API
- `GET /health` no authentication.
- `POST /api/import`: `Authorization: Bearer <key>`, JSON `{"url":"https://www.youtube.com/watch?v=...","authorized":true}`. The importer responds with `id`, `title`, `size`, and `download_path` if successful.
- `GET /api/media/{id}`: same bearer key. Temporary video bytes for import into the browser. Link expires after ~30 minutes, cleaned upon subsequent requests or shutdown.

## Known limits
- Import is synchronous and can be slow for long videos; the browser request stays open until download completes.
- The browser must have sufficient RAM to hold the imported file and edit it. Public shared deployments need authentication, monitoring, rate limiting, private disk and cost controls.
- This does not implement genuine viewer engagement metrics, speaker tracking, advanced automated motion design, or unattended multiple exports.
- It has **not** been deployed or end-to-end tested against YouTube. A successful GitHub Pages deployment does not prove backend functionality.
