# AutoEdit Studio 3.0 — browser video editor

**Main website:** https://braie-aep.github.io/Autoedits/

A free-first, GitHub-hosted video-editing workspace inspired by the *workflow* of online editors like InVideo. The design and code are AutoEdit's own. Built in React + Vite.

## Studio 3.0 editing workspace

- Clean canvas-first interface with Media, Text, Music, Elements, Captions, Shorts, AI Edit, and Canvas panels
- Storyboard of scene thumbnails, nondestructive split-at-playhead markers, and scene selection
- Layers view with V1 video, A1 source audio, A2 imported music, text/graphics and caption tracks
- Editable heading, subtitle, or minimal text layers; position, size, color and background controls
- Simple emoji sticker/element overlays; position and size controls
- Load your own local music (MP3/WAV/M4A/OGG as supported by your browser), mute and adjust volume
- Brightness, contrast and saturation adjustments in preview and canvas export
- True-aspect 9:16 portrait monitor: landscape sources are cropped to fill portrait, with subtitles/overlays inside the output frame
- Existing prompt editing, cuts, silence detection, English captions, highlight suggestions and browser WebM export

### What is still limited

This is an **editor prototype, not a complete InVideo replacement**. A project currently uses one source video. Scene markers divide the original source for **selecting, trimming and exporting a scene**, not a fully reorderable multi-source sequence. Music repeats across the source timeline and is mixed during browser export. Video exports are WebM through real-time browser recording, not MP4. Titles, stickers, color adjustments and audio are rendered with the selected video; automated highlights and captions remain experimental. Review any generated clip before posting.

The UI passes browser automated tests, but features can vary across codecs, browser versions, and machines.

## GitHub Pages and private import backend

The GitHub Pages URL above is the primary AutoEdit editing website. Its source code and frontend are hosted entirely on GitHub. **GitHub Pages cannot execute Python, FFmpeg or video import jobs.** For an authorized YouTube-video import, AutoEdit connects to a private FastAPI importer on a separately hosted service, which is optional and cannot be used publicly without secure end-user authentication.

A Render service has previously been deployed from this repository, but **the video-link download and complete Shorts pipeline have not been independently verified end-to-end**; YouTube source restrictions may prevent download. An owner-operated import requires the private API key in the Media panel's server settings; do **not** share that key with users. The key remains in browser memory, not persistent storage. Do not distribute this shared-key prototype as a public multi-user product.

The backend is described by `backend/README.md`, the combined container `Dockerfile` and Render Blueprint `render.yaml`. The GitHub Pages site can be used for normal local video editing without connecting a backend.

## Run locally

```bash
npm install
npm run dev
```

Automated UI and geometry tests are in `src/*.test.mjs` and `scripts/editor-smoke.mjs`. The test workflow also performs a Chromium browser check.

## Safety and privacy

Media files selected from your computer are processed within the browser. If you explicitly use the authorized video-link importer, imported video bytes transit the backend server and are temporarily stored there. Respect source owners' rights and third-party platform rules. For a public hosted application, add per-user authentication, file limits, rate limits, monitoring and a security review.
