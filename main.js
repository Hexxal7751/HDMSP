// HDMSP — Electron Main Process
// Replaces the Rust/Tauri backend entirely. Spawns yt-dlp and ffmpeg
// as child processes, streams progress back to the renderer via IPC.

const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require("electron");
const path    = require("path");
const os      = require("os");
const fs      = require("fs");
const cp      = require("child_process");

const DEV  = process.argv.includes("--dev");
const PROD = !DEV;

// ── Tool resolution ────────────────────────────────────────────────────────
// Search order: install dir → PATH
function findTool(name) {
  // 1. Next to the app exe (installed location)
  const installDir = path.join(
    process.env.LOCALAPPDATA || os.homedir(),
    "HDMSP"
  );
  const local = path.join(installDir, `${name}.exe`);
  if (fs.existsSync(local)) return local;

  // 2. Same directory as our own exe (dev / portable)
  const beside = path.join(path.dirname(process.execPath), `${name}.exe`);
  if (fs.existsSync(beside)) return beside;

  // 3. Fallback — rely on PATH
  return name;
}

// ── Window ─────────────────────────────────────────────────────────────────
let win;

function createWindow() {
  const iconPath = path.join(__dirname, "src", "icon.ico");

  win = new BrowserWindow({
    width:           900,
    height:          600,
    minWidth:        640,
    minHeight:       440,
    backgroundColor: "#09090e",
    autoHideMenuBar: true,
    title:           "HDMSP — High Definition Media Stream Processor",
    icon:            iconPath,
    webPreferences: {
      preload:          path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  win.loadFile(path.join(__dirname, "src", "index.html"));

  if (DEV) {
    // Dev only — F12 opens DevTools
    win.webContents.on("before-input-event", (_e, input) => {
      if (input.key === "F12") win.webContents.openDevTools({ mode: "detach" });
    });
    win.webContents.on("console-message", (_e, level, msg, line, src) => {
      if (level >= 2) console.error(`[Renderer] ${msg} (${src}:${line})`);
    });
  } else {
    // Production — forcibly close DevTools if somehow opened
    win.webContents.on("devtools-opened",  () => win.webContents.closeDevTools());
    // Block all inspect keyboard shortcuts at the browser level
    win.webContents.on("before-input-event", (_e, input) => {
      const key  = input.key.toLowerCase();
      const ctrl = input.control || input.meta;
      const shift = input.shift;
      const blocked =
        key === "f12" ||
        (ctrl && shift && ["i", "j", "c"].includes(key)) ||
        (ctrl && key === "u");   // view-source shortcut
      if (blocked) _e.preventDefault();
    });
  }
}

// Force Windows taskbar identity — without this Electron shows its own name
app.setAppUserModelId("com.hdmsp.app");
app.name = "HDMSP";

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

// ── Error humanization ─────────────────────────────────────────────────────
function humanizeError(rawError) {
  const msg = String(rawError).toLowerCase();
  
  // URL validation errors
  if (msg.includes("unsupported url") || msg.includes("no video formats found")) {
    return "This URL is not supported. Please check the link and try again.";
  }
  if (msg.includes("video unavailable") || msg.includes("private video")) {
    return "This video is unavailable or private.";
  }
  if (msg.includes("video has been removed")) {
    return "This video has been removed by the uploader.";
  }
  if (msg.includes("copyright") || msg.includes("blocked")) {
    return "This video is blocked due to copyright restrictions.";
  }
  if (msg.includes("age") && msg.includes("restricted")) {
    return "This video is age-restricted and cannot be downloaded.";
  }
  if (msg.includes("geo") || msg.includes("not available in your country")) {
    return "This video is not available in your region.";
  }
  if (msg.includes("live") && msg.includes("stream")) {
    return "Live streams cannot be downloaded while they're still broadcasting.";
  }
  if (msg.includes("playlist")) {
    return "Playlist URLs are not supported. Please use a direct video link.";
  }
  if (msg.includes("invalid") && msg.includes("url")) {
    return "Invalid URL format. Please enter a valid video link.";
  }
  if (msg.includes("http error 404") || msg.includes("not found")) {
    return "Video not found. The link may be broken or the video was deleted.";
  }
  if (msg.includes("http error 403") || msg.includes("forbidden")) {
    return "Access denied. This video may be private or region-locked.";
  }
  if (msg.includes("http error 429") || msg.includes("too many requests")) {
    return "Too many requests. Please wait a few minutes and try again.";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "Connection timed out. Check your internet connection and try again.";
  }
  if (msg.includes("network") || msg.includes("connection")) {
    return "Network error. Please check your internet connection.";
  }
  
  // Download errors
  if (msg.includes("disk") && (msg.includes("full") || msg.includes("space"))) {
    return "Not enough disk space. Free up some space and try again.";
  }
  if (msg.includes("permission denied") || msg.includes("access is denied")) {
    return "Permission denied. Check folder permissions or choose a different location.";
  }
  if (msg.includes("file already exists")) {
    return "A file with this name already exists in the destination folder.";
  }
  
  // Tool errors
  if (msg.includes("could not run yt-dlp")) {
    return "yt-dlp is not installed or cannot be found. Please run the HDMSP Toolkit.";
  }
  if (msg.includes("could not run ffmpeg")) {
    return "ffmpeg is not installed or cannot be found. Please run the HDMSP Toolkit.";
  }
  
  // Generic fallback
  if (msg.includes("error:")) {
    const cleaned = rawError.replace(/ERROR:\s*/i, "").trim();
    return cleaned.length > 0 && cleaned.length < 200 ? cleaned : "An error occurred. Please try again.";
  }
  
  return rawError.length < 200 ? rawError : "An unexpected error occurred. Please try again.";
}

// ── IPC handlers ───────────────────────────────────────────────────────────

// Default save directory
ipcMain.handle("get-downloads-dir", () => {
  const base = app.getPath("downloads");
  const dir  = path.join(base, "HDMSP Downloads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
});

// Folder picker
ipcMain.handle("browse-folder", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties:  ["openDirectory"],
    defaultPath: app.getPath("downloads"),
  });
  return result.canceled ? null : result.filePaths[0];
});

// Check which tools are available
ipcMain.handle("check-deps", () => {
  const ytdlp  = findTool("yt-dlp");
  const ffmpeg = findTool("ffmpeg");
  const has = (bin) => {
    try {
      cp.execFileSync(bin, ["--version"], { timeout: 4000, stdio: "ignore" });
      return true;
    } catch { return false; }
  };
  return { ytdlp: has(ytdlp), ffmpeg: has(ffmpeg) };
});

// Fetch stream metadata via yt-dlp --dump-json
ipcMain.handle("analyze-url", (_e, url) => {
  return new Promise((resolve, reject) => {
    const ytdlp = findTool("yt-dlp");
    let stdout  = "";
    let stderr  = "";

    const proc = cp.spawn(ytdlp, [
      "--dump-json", "--no-playlist", "--quiet", url,
    ]);

    proc.stdout.on("data", d => { stdout += d.toString(); });
    proc.stderr.on("data", d => { stderr += d.toString(); });

    proc.on("close", code => {
      if (code === 0 && stdout.trim()) {
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch (e) {
          reject(humanizeError("Failed to parse metadata from yt-dlp."));
        }
      } else {
        const msg = stderr.split("\n")
          .find(l => l.includes("ERROR:") || l.trim())
          ?.replace(/ERROR:\s*/, "")
          ?.trim() || "Unknown error";
        reject(humanizeError(msg));
      }
    });

    proc.on("error", e => reject(humanizeError(`Could not run yt-dlp: ${e.message}`)));
  });
});

// Download — streams progress events back to renderer
ipcMain.handle("start-download", (_e, { url, formatSpec, outputDir, titleHint, isAudio }) => {
  return new Promise((resolve, reject) => {
    const ytdlp = findTool("yt-dlp");

    fs.mkdirSync(outputDir, { recursive: true });

    // Sanitise filename
    const safe = titleHint
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 120);

    const outtmpl = path.join(outputDir, `${safe}.%(ext)s`);

    // Structured progress lines we parse reliably
    const PROG_TMPL = [
      "download:PROG",
      "%(progress.status)s",
      "%(progress.downloaded_bytes)s",
      "%(progress.total_bytes)s",
      "%(progress.total_bytes_estimate)s",
      "%(progress.speed)s",
      "%(progress.eta)s",
    ].join("|");

    const args = [
      "--newline",
      "--no-playlist",
      "--quiet",
      "--progress",
      "--no-mtime",                    // ← prevents file date being set to upload date
      "--progress-template", PROG_TMPL,
      "--print",             "after_move:filepath",
      "-f",                  formatSpec,
      "-o",                  outtmpl,
    ];

    if (!isAudio) {
      args.push("--merge-output-format", "mp4");
    }

    args.push(url);

    const proc = cp.spawn(ytdlp, args);

    let finalPath  = "";
    let phaseIndex = 0;  // 0=video, 1=audio, 2=merging
    let stderr     = "";

    // ── stdout: progress lines + final filepath ──────────────────────────
    proc.stdout.on("data", chunk => {
      const lines = chunk.toString().split("\n");
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        if (line.startsWith("PROG|")) {
          const p = line.split("|");
          //  p[0]=PROG  p[1]=status  p[2]=dl_bytes  p[3]=total  p[4]=total_est  p[5]=speed  p[6]=eta
          if (p.length < 7) continue;

          const status   = p[1];
          const dlBytes  = parseInt(p[2]) || 0;
          const total    = parseInt(p[3]) || parseInt(p[4]) || 0;
          const speedRaw = parseFloat(p[5]) || 0;
          const etaRaw   = parseInt(p[6]) || 0;

          const percent = total > 0 ? Math.min(dlBytes / total, 1.0) : 0;

          const speedStr = speedRaw > 0
            ? speedRaw >= 1048576
              ? `${(speedRaw / 1048576).toFixed(1)} MB/s`
              : `${Math.round(speedRaw / 1024)} KB/s`
            : "";

          const etaStr = etaRaw > 0 ? `ETA  ${etaRaw}s` : "";

          let phase;
          if (isAudio) {
            phase = "Downloading audio stream…";
          } else if (phaseIndex === 0) {
            phase = "Downloading video stream…";
          } else {
            phase = "Downloading audio stream…";
          }

          win.webContents.send("download-progress", {
            phase, percent, speed: speedStr, eta: etaStr, phaseIndex,
          });

          if (status === "finished") phaseIndex++;

        } else if (line.includes("[Merger]") || line.includes("[ffmpeg]")) {
          win.webContents.send("download-progress", {
            phase: "Merging streams…", percent: 1.0,
            speed: "", eta: "", phaseIndex: 2,
          });

        } else if (!line.startsWith("[") && !line.startsWith("PROG")) {
          // `--print after_move:filepath` output
          if (line.length > 3) finalPath = line;
        }
      }
    });

    proc.stderr.on("data", d => { stderr += d.toString(); });

    proc.on("close", code => {
      if (code === 0) {
        resolve(finalPath);
      } else {
        const msg = stderr
          .split("\n")
          .find(l => l.includes("ERROR:") || l.trim())
          ?.replace(/ERROR:\s*/, "")
          ?.trim() || "Download failed.";
        reject(humanizeError(msg));
      }
    });

    proc.on("error", e => reject(humanizeError(`Could not run yt-dlp: ${e.message}`)));
  });
});

// Open Windows Explorer with the file highlighted
ipcMain.handle("reveal-file", (_e, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);  // Electron's built-in — does /select, correctly
  } else {
    shell.openPath(path.dirname(filePath));
  }
});
