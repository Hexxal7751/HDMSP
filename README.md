# HDMSP — High Definition Media Stream Processor

<p align="center">
  <img src="src/icon.png" width="96" alt="HDMSP Logo" />
</p>

<p align="center">
  <strong>A fast, local, privacy-first media downloader for Windows.</strong><br />
  No server. No account. No nonsense.
</p>

---

## Table of Contents

- [What is HDMSP?](#what-is-hdmsp)
- [Features](#features)
- [UI](#ui)
- [Installation (End Users)](#installation-end-users)
- [Developer Setup](#developer-setup)
- [Building](#building)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Appearance & Theming](#appearance--theming)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [License](#license)

---

## What is HDMSP?

HDMSP is a Windows desktop application that downloads video and audio streams from YouTube and thousands of other sites. It is built on top of [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://ffmpeg.org), wrapped in a native Electron shell with a custom dark UI.

**Why HDMSP over a website or browser extension?**

|                    | Web-based tools            | Browser extensions           | HDMSP               |
|--------------------|----------------------------|------------------------------|---------------------|
| Blocked by YouTube | Often                      | Sometimes                    | No — runs locally   |
| Privacy            | Sends your URL to a server | Requires browser permissions | 100% local          |
| Quality selection  | Limited                    | Limited                      | Full — every stream |
| No install needed  | ✓                         | ✗                            | ✗ (small toolkit)   |
| Works offline      | ✗                         | ✗                            | ✓ (once installed)  |

---

## Features

- **Full quality selection** — every resolution from 144p to 8K, every audio bitrate
- **Video + Audio merge** — downloads the best separate streams and merges via ffmpeg into a clean MP4
- **Audio-only mode** — extract audio in its native format (M4A, OPUS, WebM)
- **Android codec warning** — flags VP9/AV1 at 4K+ which many Android devices can't play
- **Correct file dates** — uses `--no-mtime` so downloaded files show today's date, not the upload date
- **Explorer integration** — "Show in Folder" opens Windows Explorer with the file highlighted
- **Custom save location** — browse to any folder
- **Dependency auto-detection** — finds yt-dlp and ffmpeg next to the exe or in PATH
- **Fully themed UI** — 7 toggleable visual effects, 5 accent colours, 3 dark themes, all saved per-user

---

## UI

The UI follows a linear 5-step flow:

```
INPUT  ──  ANALYZING  ──  SELECT FORMAT  ──  DOWNLOADING  ──  COMPLETE
```

**Step 0 — Input:** Paste any supported URL and hit ANALYZE.

**Step 1 — Analyzing:** HDMSP calls `yt-dlp --dump-json` to fetch full stream metadata. A shimmer bar plays while it works.

**Step 2 — Select Format:** Shows the video thumbnail, title, duration, view count, and uploader. Choose between Video+Audio or Audio Only, pick a quality, set a save folder, and download.

**Step 3 — Downloading:** Real-time progress bar with percentage, speed, and ETA. Three-phase dot indicator shows Video → Audio → Merge.

**Step 4 — Complete:** Confirmation with the final file path and buttons to open in Explorer or start another download.

### Appearance Settings (⚙ top-right)

| Setting           | Default | Effect                                   |
|-------------------|---------|------------------------------------------|
| Ambient Orbs      | ON      | Floating glow blobs in the background    |
| Particle Field    | OFF     | Animated dot-network canvas (heavier)    |
| Glow & Bloom      | ON      | Neon shadows on accented elements        |
| Glass Panels      | ON      | Frosted glassmorphism on cards and bars  |
| Scanlines         | OFF     | Subtle CRT-style horizontal line overlay |
| Film Grain        | OFF     | Texture noise overlay                    |
| Animations        | ON      | Screen transitions and motion effects    |
| **Accent colour** | Cyan    | Cyan / Violet / Amber / Rose / Emerald   |
| **Theme**         | Abyss   | Abyss / Midnight / Obsidian              |

All settings persist between sessions via `localStorage`.

---

## Installation (End Users)

### Option A — HDMSP Toolkit (recommended)

1. Download `HDMSP-Toolkit.exe` from the releases page.
2. Run it — a console window opens and auto-detects whether HDMSP is already installed.
3. Select an option from the menu. The toolkit downloads and installs:
   - `yt-dlp.exe` — the stream extractor (latest from GitHub)
   - `ffmpeg.exe` — the media muxer (essentials build)
   - `HDMSP.exe` — the main application
4. Desktop and Start Menu shortcuts are created automatically.
5. HDMSP appears in **Add or Remove Programs** for clean uninstallation.

> Re-run `HDMSP-Toolkit.exe` at any time to **repair** missing files, **update** all components, or **fully uninstall** HDMSP.

### Option B — Portable (manual)

1. Download `HDMSP.exe`.
2. Place it in any folder alongside `yt-dlp.exe` and `ffmpeg.exe`.
3. Run `HDMSP.exe` directly — no installation needed.

**Where to get the tools manually:**
- yt-dlp: https://github.com/yt-dlp/yt-dlp/releases/latest → `yt-dlp.exe`
- ffmpeg: https://github.com/GyanD/codexffmpeg/releases/latest → any `essentials_build.zip`, extract `ffmpeg.exe` from `bin/`

---

## Developer Setup

### Prerequisites

| Tool    | Version         | Download                                  |
|---------|-----------------|-------------------------------------------|
| Node.js | LTS (18+)       | https://nodejs.org                        |
| npm     | comes with Node |                     —                     |
| yt-dlp  | latest          | https://github.com/yt-dlp/yt-dlp/releases |
| ffmpeg  | any recent      | https://ffmpeg.org/download.html          |

You do **not** need Rust, Visual Studio, or any C++ toolchain. HDMSP is pure JavaScript/Node.

### Quick start

```powershell
# Clone or download the project, then:
cd "High Definition Media Stream Processor"

# Install dependencies
npm install

# Place yt-dlp.exe and ffmpeg.exe in the project root
# Then launch in dev mode (enables DevTools via F12):
npm run dev

# Or launch in production mode (DevTools locked):
npm start
```

The app opens immediately with no compilation step. Changes to `src/index.html`, `src/style.css`, and `src/main.js` take effect on the next restart.

---

## Building

### Main app — `HDMSP.exe`

```powershell
cd "High Definition Media Stream Processor"
npm run build
```

Output: `dist/HDMSP.exe` — a single portable executable (~160 MB including Electron's Chromium).

**What `npm run build` does:**
1. Runs `electron-builder --win portable`
2. Packages `main.js`, `preload.js`, and the entire `src/` folder
3. Embeds the icon from `src/icon.ico`
4. Produces a portable exe — no installer, no registry changes

### HDMSP Toolkit — `HDMSP-Toolkit.exe`

The toolkit is a compiled PowerShell script. It has **no npm dependencies** and produces a tiny executable (~300 KB–1 MB) compared to an Electron build.

**Prerequisites:** PowerShell 5.1+ (built into every Windows 10/11 machine). The build command auto-installs the `ps2exe` module from the PowerShell Gallery on first run.

```powershell
cd "High Definition Media Stream Processor\HDMSP-Setup"
npm run build
```

Output: `HDMSP-Setup/dist/HDMSP-Toolkit.exe`

> **Before releasing:** open `HDMSP-Setup/toolkit.ps1` and confirm the `$HDMSP_URL` variable points to the correct GitHub release download URL for `HDMSP.exe`. Rebuild the toolkit after any change to this URL.

### Setting up GitHub Releases

1. Push your project to GitHub.
2. Tag a release: `git tag v1.0.0 && git push origin v1.0.0`
3. Go to GitHub → Releases → Draft a new release.
4. Upload `HDMSP.exe` as a release asset.
5. Copy the asset's direct download URL.
6. Paste it into `$HDMSP_URL` in `HDMSP-Setup/toolkit.ps1`.
7. Rebuild the toolkit: `npm run build` in `HDMSP-Setup/`.
8. Upload `HDMSP-Toolkit.exe` as the second release asset.

### Build output summary

```
dist/
└── HDMSP.exe                     ← main app (portable, ~160 MB)

HDMSP-Setup/dist/
└── HDMSP-Toolkit.exe             ← toolkit (install/repair/uninstall, ~300 KB–1 MB)
```

---

## Project Structure

```
High Definition Media Stream Processor/
│
├── main.js                   ← Electron main process (Node.js backend)
├── preload.js                ← Context bridge — exposes window.hdmsp API to renderer
├── package.json              ← npm config + electron-builder config
│
├── src/                      ← Renderer (frontend)
│   ├── index.html            ← App shell, all 5 screens, settings panel HTML
│   ├── style.css             ← Full design system (tokens, themes, effects, components)
│   ├── main.js               ← App logic + settings system + particle engine
│   ├── icon.ico              ← App icon (Windows)
│   └── icon.png              ← App icon (UI usage)
│
├── HDMSP-Setup/              ← Toolkit sub-project
│   ├── toolkit.ps1           ← PowerShell source — install, repair, uninstall logic
│   ├── icon.ico              ← Toolkit icon
│   └── package.json          ← Build script only (no npm deps)
│
├── yt-dlp.exe                ← yt-dlp binary (dev convenience copy, gitignored)
└── ffmpeg.exe                ← ffmpeg binary (dev convenience copy, gitignored)
```

---

## Architecture

### Two-process model (standard Electron)

```
┌─────────────────────────────────────────────────────┐
│  Main Process  (Node.js — main.js)                  │
│                                                     │
│  • Creates the BrowserWindow                        │
│  • Handles all IPC commands from renderer           │
│  • Spawns yt-dlp / ffmpeg as child processes        │
│  • Streams progress events back via win.webContents │
│  • Opens file dialogs, reveals files in Explorer    │
└───────────────────┬─────────────────────────────────┘
                    │  contextBridge (preload.js)
                    │  window.hdmsp.* API
                    ▼
┌─────────────────────────────────────────────────────┐
│  Renderer Process  (Chromium — src/)                │
│                                                     │
│  • index.html + style.css — visual UI               │
│  • main.js — app logic, format parsing              │
│  • settings system — reads/writes localStorage      │
│  • particle engine — canvas animation               │
│  • NO direct access to Node.js or filesystem        │
└─────────────────────────────────────────────────────┘
```

### IPC API surface (`window.hdmsp`)

| Method                      | Returns                    | Description                                                   |
|-----------------------------|----------------------------|---------------------------------------------------------------|
| `getDownloadsDir()`         | `Promise<string>`          | Default save path (`%USERPROFILE%\Downloads\HDMSP Downloads`) |
| `browseFolder()`            | `Promise<string\|null>`    | Opens a native folder picker dialog                           |
| `checkDeps()`               | `Promise<{ytdlp, ffmpeg}>` | Checks both tools are executable                              |
| `analyzeUrl(url)`           | `Promise<object>`          | Runs `yt-dlp --dump-json`, returns raw JSON                   |
| `startDownload(opts)`       | `Promise<string>`          | Starts download, resolves with final file path                |
| `revealFile(path)`          | `Promise<void>`            | Opens Explorer with file selected                             |
| `onProgress(cb)`            | `void`                     | Subscribes to `download-progress` IPC events                  |
| `removeProgressListeners()` | `void`                     | Cleans up event subscriptions                                 |

### Tool discovery order

When HDMSP looks for `yt-dlp.exe` or `ffmpeg.exe`:
1. `%LOCALAPPDATA%\HDMSP\` — the installed location
2. Same directory as `HDMSP.exe` — portable/dev mode
3. System `PATH` — fallback

---

## How It Works

### Analysis phase

```
User pastes URL
  → renderer calls window.hdmsp.analyzeUrl(url)
  → main process runs: yt-dlp --dump-json --no-playlist --quiet <url>
  → stdout is parsed as JSON
  → renderer iterates format list:
      - video-only streams (vcodec != "none", acodec == "none")
        → grouped by height, best bitrate kept per height
      - audio-only streams (vcodec == "none", acodec != "none")
        → sorted by bitrate descending
  → labelled format objects returned to UI
```

### Download phase

```
User clicks DOWNLOAD
  → format spec built: "137+140" (video_id + best_audio_id)
                    or "140"    (audio-only)
  → renderer calls window.hdmsp.startDownload(opts)
  → main process runs: yt-dlp \
      --newline --no-playlist --quiet --progress --no-mtime \
      --progress-template "download:PROG|%(status)s|%(dl_bytes)s|..." \
      --print "after_move:filepath" \
      -f "137+140" \
      --merge-output-format mp4 \
      -o "C:\Users\...\HDMSP Downloads\Title.%(ext)s" \
      <url>
  → stdout lines parsed:
      "PROG|..." lines → progress events → renderer updates bar
      plain path line  → final file path stored
  → on process exit 0: resolves with file path
  → renderer shows Step 4 (Complete)
```

### Progress parsing format

```
PROG|downloading|45678901|120000000|NA|2457600|18
     ^status     ^dl_bytes ^total    ^est ^speed  ^eta_secs
```

---

## Appearance & Theming

All visual state lives on `<html>` as CSS classes. No JavaScript touches inline styles for theming.

### Effect classes

| Class           | Effect                                  |
|-----------------|-----------------------------------------|
| `fx-orbs`       | Enables ambient floating glow orbs      |
| `fx-particles`  | Enables canvas particle network         |
| `fx-glow`       | Enables neon glow shadows               |
| `fx-glass`      | Enables glassmorphism (backdrop-filter) |
| `fx-scanlines`  | Enables CRT scanline overlay            |
| `fx-grain`      | Enables film grain noise overlay        |
| `fx-animations` | Enables screen transitions and motion   |

### Accent classes

`accent-cyan` / `accent-violet` / `accent-amber` / `accent-rose` / `accent-green`

Each overrides the `--accent`, `--accent-dim`, `--accent-glow`, and `--accent-rgb` CSS variables.

### Theme classes

`theme-abyss` / `theme-midnight` / `theme-obsidian`

Each overrides the background-family CSS variables (`--bg`, `--bg-mid`, `--bg-card`, etc).

### Adding a new theme or accent

**New accent** — add to `style.css`:
```css
.accent-mycolour {
  --accent:         #rrggbb;
  --accent-dim:     #rrggbb;
  --accent-glow:    rgba(r, g, b, 0.18);
  --accent-glow-sm: rgba(r, g, b, 0.10);
  --accent-rgb:     r, g, b;
}
```
Then add a swatch button to `index.html` and register the class name in the accent array in `src/main.js`.

---

## Troubleshooting

### "yt-dlp is not installed or cannot be found"

HDMSP looks for `yt-dlp.exe` in `%LOCALAPPDATA%\HDMSP\`, next to `HDMSP.exe`, or in PATH. Run `HDMSP-Toolkit.exe` and choose **Repair** to re-download it automatically.

### Download fails immediately

The error message is shown directly in the UI. Common causes:
- The video is private, members-only, or age-restricted
- yt-dlp is outdated (YouTube changes its API regularly) — run the toolkit's Repair option to get the latest version

### ffmpeg not found / merge fails

The merge step requires `ffmpeg.exe`. If it's missing, video and audio won't be combined. Run the toolkit's Repair option.

### Thumbnail doesn't load

Normal for some videos — the thumbnail URL from yt-dlp may be inaccessible or require cookies. The placeholder is shown instead and the download is unaffected.

### The file date shows the video's upload date

This should not happen — HDMSP passes `--no-mtime` to yt-dlp. If you see it, make sure you're running the latest build.

### "Electron" still appears in the taskbar

This only happens when running in raw dev mode (`npm start`) before the app's User Model ID fully registers. Built exes from `npm run build` always show the correct name.

### Settings don't persist between sessions

Settings use `localStorage` inside Electron's renderer. If you're running a portable build from a read-only location this may fail silently — move the exe to a writable folder.

### DevTools / Inspect Element

DevTools are **disabled in all release builds** and cannot be opened. To inspect the renderer during development, launch with `npm run dev` — this enables F12.

---

## FAQ

**Q: Which sites does HDMSP support?**
HDMSP uses yt-dlp under the hood. It supports YouTube, Vimeo, Twitter/X, Reddit, TikTok, SoundCloud, and [thousands more](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md).

**Q: Why is the main exe so large (~160 MB)?**
Electron bundles a full Chromium browser engine — the same reason VS Code, Discord, and Slack are large. The trade-off is zero runtime dependencies for the end user.

**Q: Why is the toolkit so small compared to the main app?**
The toolkit (`HDMSP-Toolkit.exe`) is a compiled PowerShell script — it has no bundled runtime since PowerShell is built into every Windows 10/11 machine. The main app bundles Chromium and cannot avoid its size.

**Q: Can I download playlists?**
Not yet — HDMSP passes `--no-playlist` intentionally to keep the UI simple. Playlist support is a potential future feature.

**Q: Is this legal?**
Downloading publicly available content for personal use is legal in most jurisdictions. Downloading copyrighted content for redistribution is not. HDMSP is a tool — how you use it is your responsibility.

**Q: Does HDMSP send any data anywhere?**
No. HDMSP makes no network requests of its own. The only outbound connections are from yt-dlp fetching the stream directly from the source website. Nothing passes through any HDMSP server.

**Q: Can I contribute?**
Yes — pull requests welcome. The codebase is intentionally simple: one main process file, one preload, one HTML, one CSS, one renderer JS.

---

## License

MIT — do whatever you want with it. Attribution appreciated but not required.

---

<p align="center">Built with Electron · yt-dlp · ffmpeg · PowerShell</p>
