// HDMSP — Preload Script
// Exposes a clean, typed API to the renderer via contextBridge.
// The renderer never touches Node.js or Electron directly.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hdmsp", {

  // ── One-shot queries ──────────────────────────────────────────────────
  getDownloadsDir: ()       => ipcRenderer.invoke("get-downloads-dir"),
  browseFolder:   ()        => ipcRenderer.invoke("browse-folder"),
  checkDeps:      ()        => ipcRenderer.invoke("check-deps"),
  analyzeUrl:     (url)     => ipcRenderer.invoke("analyze-url", url),
  revealFile:     (fp)      => ipcRenderer.invoke("reveal-file", fp),

  // ── Download (returns promise that resolves with final file path) ─────
  startDownload: (opts) => ipcRenderer.invoke("start-download", opts),

  // ── Progress event subscription ───────────────────────────────────────
  onProgress: (cb) => {
    ipcRenderer.on("download-progress", (_e, data) => cb(data));
  },
  onDownloadError: (cb) => {
    ipcRenderer.on("download-error", (_e, msg) => cb(msg));
  },
  removeProgressListeners: () => {
    ipcRenderer.removeAllListeners("download-progress");
    ipcRenderer.removeAllListeners("download-error");
  },

});
