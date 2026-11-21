# AutoEdit — free-first browser video editor MVP

A React + Vite proof of concept for prompt-driven browser video editing. **No paid AI or cloud processing.** The current prompt interpreter is deterministic rules, not an LLM.

## What works
- Import a single local video; preview, play and seek
- Prompt commands for crop aspect ratio (16:9, 9:16, 1:1, 4:5), trimming ("first 15 seconds", "from 5 to 20"), and mute
- Manual trim controls and output ratio settings
- Real-time export to WebM using Canvas captureStream + MediaRecorder and Web Audio for audio routing
- GitHub Pages workflow

## Not yet implemented
AI understanding, subtitles, highlight selection, silence removal, transitions, multi-clip timeline, stabilization, color grading, MP4 export. Browser performance/codec support varies. Export takes approximately the selected clip's real-time duration and is capped to 1280 px. Browser-tab throttling and A/V drift may affect long exports. Audio export is best tested in desktop Chromium browsers.

## Deploy without installing software
1. Create a **public** GitHub repository.
2. Upload the **contents** of this folder to the repository (including `.github/workflows/deploy.yml`). GitHub's web uploader may hide dotfolders; if so create the workflow file through GitHub's **Add file → Create new file** path `.github/workflows/deploy.yml` and paste its content.
3. Open repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Push to `main` and wait for the deployment action to finish. Open the URL shown in the Pages deployment.

## Local development (optional)
`npm ci && npm run dev`

## Privacy and limitations
Video is handled in the browser, not uploaded to an app server. This prototype does not include accounts or server storage. The browser downloads frontend code and dependencies as usual. Test exports on short, non-sensitive clips first. GitHub Pages usage is subject to GitHub's limits and policies; this is intended as a prototype, not a commercial video-processing SaaS.
