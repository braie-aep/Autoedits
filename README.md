# AutoEdit — browser video editor and link-to-Shorts prototype

AutoEdit is a Vite + React browser video editor with silence detection, clip highlights, English speech-to-text captions, a 9:16 Shorts layout, basic motion-graphics title/progress bar, and per-clip WebM export. Highlight scores are *heuristics*, not real viewer-engagement statistics.

## Live static editor
https://braie-aep.github.io/Autoedits/

This GitHub Pages edition runs the editor in the browser. **It cannot run the YouTube importer**, because GitHub Pages cannot execute Python or FFmpeg.

## Combined video link app: Deploy to Render
AutoEdit now includes one Docker application that serves the website **and** its Python import API from a single host. The repository's `render.yaml` describes a Render free-plan service.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/braie-aep/Autoedits)

After Render deploys, use the **Render-hosted URL**, not the original GitHub Pages URL. Enter the private access key from your own Render service environment settings in the app's **Private access key / server settings** area, and paste a video URL you are authorized to edit. The app then attempts retrieval and automatically runs its highlight/caption workflow. The key is held in browser memory only. **Do not publish the secret or use this shared-key prototype for public users**; implement end-user authentication before releasing commercially.

### Important limits
- The service **has not been deployed or successfully tested with a YouTube video**. It may fail if source access is restricted, the hosting network is blocked, or the server runs out of RAM/disk/CPU. A free host isn't guaranteed to handle long or 1080p video.
- Importing YouTube videos is subject to YouTube's permissions and terms. Use only sources you own or are explicitly authorized to download/edit, and when permitted by the platform; the app doesn't bypass DRM or logins.
- Video editing, highlight selection, optional English caption processing, and per-clip exports occur in the browser. Captions may take considerable processing time. Clips must still be reviewed and individually exported.
- Render deployment requires your authorization to connect the GitHub repository and create a service; having `render.yaml` alone does not start a server.
- The Render environment generates a private `AUTOEDIT_API_KEY`. Keep it secret.
- The original static GitHub Pages editor stays separate and working.

## Repository layout
- `src/`: browser editing UI, captions, highlights
- `backend/`: private FastAPI importer + tests and detailed server documentation
- `Dockerfile`: combined production build
- `render.yaml`: Render Blueprint for one container
- `.github/workflows/`: GitHub Pages deployment and test jobs

## Local development (optional)
`npm install && npm run dev` starts the browser editor. The separate Python importer needs `AUTOEDIT_API_KEY`, FFmpeg, and dependencies from `backend/requirements.txt`.

## Safety and privacy
Treat API keys and source video as private. The browser-based editor stays local unless you explicitly call the importer, which temporarily stores imported footage on its server. The importer expires those files. Do not use this prototype as a public multi-user service without user authentication, quotas, storage controls, and security review.
