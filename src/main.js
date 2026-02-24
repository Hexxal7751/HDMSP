/**
 * HDMSP — Renderer Logic (Electron build)
 * All IPC goes through window.hdmsp (defined in preload.js).
 * Format parsing happens here since the Electron backend returns raw yt-dlp JSON.
 */

"use strict";

// ── Error sanitiser ─────────────────────────────────────────────────────────────
// Electron wraps IPC rejections as "Error invoking remote method 'X': Error: msg"
// We strip that whole prefix so only the human-readable message reaches the UI.
function cleanError(raw) {
  return String(raw)
    .replace(/Error invoking remote method '[^']*':\s*/gi, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

// ── State ─────────────────────────────────────────────────────────────────────
let rawInfo       = null;   // raw yt-dlp JSON
let videoFormats  = [];     // parsed [{label, id, androidWarn}]
let audioFormats  = [];     // parsed [{label, id}]
let bestAudioId   = "";
let selectedFmt   = null;   // {id, androidWarn?}
let isAudioMode   = false;
let saveDir       = "";
let finalFilePath = "";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const screens       = [0,1,2,3,4].map(n => $(`screen-${n}`));
const steps         = document.querySelectorAll(".step-bar .step");
const urlInput      = $("urlInput");
const analyzeBtn    = $("analyzeBtn");
const inputError    = $("inputError");
const thumbImg      = $("thumbImg");
const thumbPlaceholder = $("thumbPlaceholder");
const metaTitle     = $("metaTitle");
const metaRow       = $("metaRow");
const modeVideo     = $("modeVideo");
const modeAudio     = $("modeAudio");
const qualitySelect = $("qualitySelect");
const codecWarn     = $("codecWarn");
const codecWarnText = $("codecWarnText");
const savePath      = $("savePath");
const browseBtn     = $("browseBtn");
const dlBtn         = $("dlBtn");
const dlPhase       = $("dlPhase");
const dlBarFill     = $("dlBarFill");
const dlPct         = $("dlPct");
const dlSpeed       = $("dlSpeed");
const dlEta         = $("dlEta");
const dots          = [0,1,2].map(n => $(`dot-${n}`));
const donePath      = $("donePath");
const revealBtn     = $("revealBtn");
const againBtn      = $("againBtn");

// ── Resolution name map ───────────────────────────────────────────────────────
const RES_NAMES = {
  4320: "8K",
  2160: "4K / UHD",
  1440: "2K / QHD",
  1080: "Full HD",
  720:  "HD",
  480:  "SD",
  360:  "360p",
  240:  "240p",
  144:  "144p",
};

function resLabel(h, fps, size) {
  const name  = RES_NAMES[h] || `${h}p`;
  const tech  = `${h}p`;
  const fpsS  = fps > 1 ? `  ${Math.round(fps)}fps` : "";
  const szS   = size ? `  ~${size}` : "";
  // e.g.  "Full HD  (1080p)  60fps  ~850 MB"
  return RES_NAMES[h]
    ? `${name}  (${tech})${fpsS}${szS}`
    : `${tech}${fpsS}${szS}`;
}

function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576)    return `${Math.round(bytes / 1048576)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function fmtDuration(secs) {
  if (!secs) return "0:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h
    ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    : `${m}:${String(s).padStart(2,"0")}`;
}

// ── Format parsing ────────────────────────────────────────────────────────────
const ANDROID_BAD = ["av01","av1","vp9","vp09"];

function parseFormats(info) {
  const fmts = info.formats || [];
  const vMap = {};   // height → best video-only
  const aList = [];  // all audio-only

  for (const f of fmts) {
    const vc = f.vcodec || "none";
    const ac = f.acodec || "none";

    if (vc !== "none" && ac === "none") {
      const h = f.height || 0;
      if (!h) continue;
      const tbr = f.tbr || 0;
      if (!vMap[h] || tbr > (vMap[h].tbr || 0)) vMap[h] = f;
    } else if (vc === "none" && ac !== "none") {
      aList.push(f);
    }
  }

  // Fallback to muxed if no video-only
  if (!Object.keys(vMap).length) {
    for (const f of fmts) {
      const vc = f.vcodec || "none";
      if (vc === "none") continue;
      const h = f.height || 0;
      if (!h) continue;
      if (!vMap[h] || (f.tbr || 0) > (vMap[h].tbr || 0)) vMap[h] = f;
    }
  }

  videoFormats = Object.keys(vMap)
    .map(Number)
    .sort((a, b) => b - a)
    .map(h => {
      const f    = vMap[h];
      const fps  = f.fps || 0;
      const sz   = fmtSize(f.filesize || f.filesize_approx || 0);
      const vc   = (f.vcodec || "").toLowerCase();
      const warn = h >= 2160 && ANDROID_BAD.some(c => vc.includes(c));
      return { id: f.format_id, label: resLabel(h, fps, sz), androidWarn: warn };
    });

  aList.sort((a, b) => (b.abr || 0) - (a.abr || 0));
  audioFormats = aList.map(f => {
    const abr = f.abr ? Math.round(f.abr) : 0;
    const ext = (f.ext || "m4a").toUpperCase();
    const sz  = fmtSize(f.filesize || f.filesize_approx || 0);
    const szS = sz ? `  ~${sz}` : "";
    return {
      id:    f.format_id,
      label: abr ? `${abr} kbps  ${ext}${szS}` : `${ext}${szS}`,
    };
  });

  bestAudioId = audioFormats.length
    ? aList[0].format_id
    : "bestaudio/best";
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showStep(n) {
  screens.forEach((s, i) => s.classList.toggle("active", i === n));
  steps.forEach((el, i) => {
    el.classList.remove("active", "done");
    if (i === n) el.classList.add("active");
    if (i <  n)  el.classList.add("done");
  });
}

// ── Step 0 → Analyze ─────────────────────────────────────────────────────────
async function handleAnalyze() {
  const url = urlInput.value.trim();
  if (!url) { inputError.textContent = "⚠  Please enter a URL."; return; }
  inputError.textContent = "";
  showStep(1);

  try {
    rawInfo = await window.hdmsp.analyzeUrl(url);
    parseFormats(rawInfo);
    populateSelectScreen(rawInfo);
    showStep(2);
  } catch (err) {
    inputError.textContent = `⚠  ${cleanError(err).slice(0, 160)}`;
    showStep(0);
  }
}

// ── Step 2: Populate ─────────────────────────────────────────────────────────
function populateSelectScreen(info) {
  const t = info.title || "Untitled";
  metaTitle.textContent = t.length > 90 ? t.slice(0, 90) + "…" : t;

  const dur   = fmtDuration(info.duration);
  const views = info.view_count ? Number(info.view_count).toLocaleString() : "—";
  const ch    = info.uploader || info.channel || "—";
  metaRow.textContent = `⏱ ${dur}    👁 ${views}    📡 ${ch}`;

  if (info.thumbnail) {
    thumbImg.src           = info.thumbnail;
    thumbImg.style.display = "block";
    thumbPlaceholder.style.display = "none";
    thumbImg.onerror = () => {
      thumbImg.style.display = "none";
      thumbPlaceholder.style.display = "flex";
    };
  }

  setMode("video");
}

function setMode(mode) {
  isAudioMode = mode === "audio";
  modeVideo.classList.toggle("active", !isAudioMode);
  modeAudio.classList.toggle("active",  isAudioMode);
  refreshFormats();
}

function refreshFormats() {
  qualitySelect.innerHTML = "";
  const list = isAudioMode ? audioFormats : videoFormats;

  if (!list.length) {
    qualitySelect.innerHTML = "<option>No formats available</option>";
    dlBtn.disabled = true;
    return;
  }

  list.forEach((f, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = f.label;
    qualitySelect.appendChild(opt);
  });

  dlBtn.disabled = false;
  onQualityChange();
}

function onQualityChange() {
  codecWarn.style.display = "none";
  const idx = parseInt(qualitySelect.value, 10);
  if (isNaN(idx)) { dlBtn.disabled = true; return; }

  const list = isAudioMode ? audioFormats : videoFormats;
  selectedFmt = list[idx] || null;
  if (!selectedFmt) { dlBtn.disabled = true; return; }

  if (!isAudioMode && selectedFmt.androidWarn) {
    codecWarnText.textContent =
      "This codec (VP9 / AV1 at 4K+) may not play on all Android devices.";
    codecWarn.style.display = "flex";
  }
}

async function handleBrowse() {
  const chosen = await window.hdmsp.browseFolder();
  if (chosen) {
    saveDir = chosen;
    savePath.textContent = chosen;
  }
}

// ── Step 3: Download ──────────────────────────────────────────────────────────
async function handleDownload() {
  if (!selectedFmt || !rawInfo) return;

  const formatSpec = isAudioMode
    ? selectedFmt.id
    : `${selectedFmt.id}+${bestAudioId}`;

  showStep(3);
  resetProgressUI();
  window.hdmsp.removeProgressListeners();

  // Wire up live progress
  window.hdmsp.onProgress(p => updateProgress(p));

  try {
    finalFilePath = await window.hdmsp.startDownload({
      url:        rawInfo.webpage_url || rawInfo.original_url || "",
      formatSpec,
      outputDir:  saveDir,
      titleHint:  rawInfo.title || "download",
      isAudio:    isAudioMode,
    });

    window.hdmsp.removeProgressListeners();
    donePath.textContent = finalFilePath || `Saved to  ${saveDir}`;
    showStep(4);

  } catch (err) {
    window.hdmsp.removeProgressListeners();
    showStep(2);
    codecWarnText.textContent = `✗  ${cleanError(err).slice(0, 160)}`;
    codecWarn.style.display = "flex";
  }
}

function resetProgressUI() {
  dlBarFill.style.width = "0%";
  dlPct.textContent     = "0 %";
  dlPhase.textContent   = "Preparing…";
  dlSpeed.textContent   = "";
  dlEta.textContent     = "";
  dots.forEach(d => {
    delete d.dataset.active;
    delete d.dataset.done;
  });
  dots[0].dataset.active = "true";
}

function updateProgress(p) {
  const pct = Math.min(Math.max((p.percent || 0) * 100, 0), 100);
  dlBarFill.style.width = `${pct.toFixed(1)}%`;
  dlPct.textContent     = `${pct.toFixed(1)} %`;
  dlPhase.textContent   = p.phase  || "";
  dlSpeed.textContent   = p.speed  || "";
  dlEta.textContent     = p.eta    || "";

  const pi = p.phaseIndex || 0;
  dots.forEach((d, i) => {
    delete d.dataset.active;
    delete d.dataset.done;
    if (i === pi) d.dataset.active = "true";
    if (i <  pi)  d.dataset.done   = "true";
  });
}

// ── Step 4 ────────────────────────────────────────────────────────────────────
async function handleReveal() {
  await window.hdmsp.revealFile(finalFilePath);
}

function reset() {
  urlInput.value = "";
  inputError.textContent = "";
  rawInfo = null; selectedFmt = null; finalFilePath = "";
  codecWarn.style.display = "none";
  thumbImg.style.display  = "none";
  thumbPlaceholder.style.display = "flex";
  showStep(0);
  urlInput.focus();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  saveDir = await window.hdmsp.getDownloadsDir();
  savePath.textContent = saveDir;

  analyzeBtn.addEventListener("click", handleAnalyze);
  urlInput.addEventListener("keydown", e => { if (e.key === "Enter") handleAnalyze(); });
  modeVideo.addEventListener("click", () => setMode("video"));
  modeAudio.addEventListener("click", () => setMode("audio"));
  qualitySelect.addEventListener("change", onQualityChange);
  browseBtn.addEventListener("click", handleBrowse);
  dlBtn.addEventListener("click", handleDownload);
  revealBtn.addEventListener("click", handleReveal);
  againBtn.addEventListener("click", reset);

  // Deps check — show warning banner if tools missing
  try {
    const deps = await window.hdmsp.checkDeps();
    const missing = [];
    if (!deps.ytdlp)  missing.push("yt-dlp.exe");
    if (!deps.ffmpeg) missing.push("ffmpeg.exe");
    if (missing.length) {
      const banner = document.getElementById("depsBanner");
      if (banner) {
        banner.textContent =
          `⚠  Missing: ${missing.join(", ")} — Run the HDMSP installer to fix this.`;
        banner.style.display = "block";
      }
    }
  } catch (_) {}
}

window.addEventListener("DOMContentLoaded", init);


/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS SYSTEM
   ═══════════════════════════════════════════════════════════════════════════ */

const SETTINGS_KEY = "hdmsp-appearance";
const DEFAULTS = {
  orbs:       true,
  particles:  false,
  glow:       true,
  glass:      true,
  scanlines:  false,
  grain:      false,
  animations: true,
  accent:     "cyan",
  theme:      "abyss",
};

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; }
  catch { return { ...DEFAULTS }; }
}

function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

function applySettings(s) {
  const html = document.documentElement;

  // FX class toggles
  const fxMap = {
    orbs: "fx-orbs",   particles: "fx-particles", glow: "fx-glow",
    glass: "fx-glass", scanlines: "fx-scanlines", grain: "fx-grain",
    animations: "fx-animations",
  };
  for (const [key, cls] of Object.entries(fxMap)) {
    html.classList.toggle(cls, !!s[key]);
    // Also add no-* counterpart for glass/glow so CSS can target it
    if (cls === "fx-glass")      html.classList.toggle("no-glass", !s[key]);
    if (cls === "fx-glow")       html.classList.toggle("no-glow",  !s[key]);
    if (cls === "fx-animations") html.classList.toggle("no-animations", !s[key]);
  }

  // Accent
  ["cyan", "violet", "amber", "rose", "green"].forEach(a => html.classList.remove(`accent-${a}`));
  html.classList.add(`accent-${s.accent}`);

  // Theme
  ["abyss", "midnight", "obsidian"].forEach(t => html.classList.remove(`theme-${t}`));
  html.classList.add(`theme-${s.theme}`);

  // Particle engine
  if (s.particles) startParticles(); else stopParticles();
}

function syncSettingsUI(s) {
  // Pill toggles
  const togMap = {
    "tog-orbs":       s.orbs,
    "tog-particles":  s.particles,
    "tog-glow":       s.glow,
    "tog-glass":      s.glass,
    "tog-scanlines":  s.scanlines,
    "tog-grain":      s.grain,
    "tog-animations": s.animations,
  };
  for (const [id, on] of Object.entries(togMap)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("on", on);
  }

  // Accent swatches
  document.querySelectorAll(".accent-swatch").forEach(el => {
    el.classList.toggle("active", el.dataset.accent === s.accent);
  });

  // Theme buttons
  document.querySelectorAll(".theme-btn").forEach(el => {
    el.classList.toggle("active", el.dataset.theme === s.theme);
  });
}

function initSettings() {
  const s = loadSettings();
  applySettings(s);
  syncSettingsUI(s);

  // Settings panel open/close
  const panel    = document.getElementById("settingsPanel");
  const btn      = document.getElementById("settingsBtn");
  const closeBtn = document.getElementById("settingsClose");
  const overlay  = document.getElementById("settingsOverlay");

  function openPanel()  { panel.classList.add("open");  btn.classList.add("open"); }
  function closePanel() { panel.classList.remove("open"); btn.classList.remove("open"); }

  btn.addEventListener("click", () => panel.classList.contains("open") ? closePanel() : openPanel());
  closeBtn.addEventListener("click", closePanel);
  overlay.addEventListener("click", closePanel);

  // FX pill toggles
  document.querySelectorAll(".pill-toggle").forEach(tog => {
    tog.addEventListener("click", () => {
      const cur = loadSettings();
      const fx  = tog.dataset.fx.replace("fx-", ""); // e.g. "orbs"
      cur[fx] = !cur[fx];
      saveSettings(cur);
      applySettings(cur);
      syncSettingsUI(cur);
    });
  });

  // Accent swatches
  document.querySelectorAll(".accent-swatch").forEach(sw => {
    sw.addEventListener("click", () => {
      const cur = loadSettings();
      cur.accent = sw.dataset.accent;
      saveSettings(cur);
      applySettings(cur);
      syncSettingsUI(cur);
    });
  });

  // Theme buttons
  document.querySelectorAll(".theme-btn").forEach(tb => {
    tb.addEventListener("click", () => {
      const cur = loadSettings();
      cur.theme = tb.dataset.theme;
      saveSettings(cur);
      applySettings(cur);
      syncSettingsUI(cur);
    });
  });
}


/* ═══════════════════════════════════════════════════════════════════════════
   PARTICLE ENGINE
   ═══════════════════════════════════════════════════════════════════════════ */

let particleAnim = null;

function startParticles() {
  const canvas = document.getElementById("bgCanvas");
  if (!canvas || particleAnim) return;

  const ctx = canvas.getContext("2d");
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  // Get accent colour from CSS variable
  function getAccentRgb() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-rgb").trim();
    return raw ? raw.split(",").map(Number) : [0, 212, 255];
  }

  const COUNT = Math.min(Math.floor(window.innerWidth * window.innerHeight / 14000), 80);

  particles = Array.from({ length: COUNT }, () => ({
    x:  Math.random() * window.innerWidth,
    y:  Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r:  Math.random() * 1.5 + 0.5,
    o:  Math.random() * 0.4 + 0.15,
  }));

  function draw() {
    if (!document.documentElement.classList.contains("fx-particles")) {
      stopParticles();
      return;
    }
    ctx.clearRect(0, 0, W, H);
    const [r, g, b] = getAccentRgb();
    const LINK_DIST = 120;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W;  if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;  if (p.y > H) p.y = 0;

      // Draw dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${p.o})`;
      ctx.fill();

      // Draw links to nearby particles
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < LINK_DIST) {
          const alpha = (1 - dist / LINK_DIST) * 0.12;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    particleAnim = requestAnimationFrame(draw);
  }

  particleAnim = requestAnimationFrame(draw);
}

function stopParticles() {
  if (particleAnim) { cancelAnimationFrame(particleAnim); particleAnim = null; }
  const canvas = document.getElementById("bgCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}


/* ── Boot settings after DOM ready ──────────────────────────────────────── */
window.addEventListener("DOMContentLoaded", initSettings);
