#Requires -Version 5.1
<#
.SYNOPSIS
    HDMSP Toolkit — Install, Repair & Uninstall
.DESCRIPTION
    Lightweight console toolkit for managing the HDMSP installation.
    Downloads yt-dlp, ffmpeg, and the HDMSP app; creates shortcuts;
    registers the uninstaller; and can repair or fully remove the app.
#>

# ── Self-elevation ─────────────────────────────────────────────────────────────
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $args0 = "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell -Verb RunAs -ArgumentList $args0
    exit
}

# ── Constants ──────────────────────────────────────────────────────────────────
$INSTALL_DIR  = Join-Path $env:LOCALAPPDATA "HDMSP"
$MARKER_FILE  = Join-Path $INSTALL_DIR ".hdmsp-installed"
$YTDLP_API    = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"
$FFMPEG_API   = "https://api.github.com/repos/GyanD/codexffmpeg/releases/latest"
$HDMSP_URL    = "https://github.com/Hexxal7751/HDMSP/releases/latest/download/HDMSP.exe"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ── Console helpers ────────────────────────────────────────────────────────────
function Write-Header {
    Clear-Host
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║         HDMSP Toolkit  v1.0.0            ║" -ForegroundColor Cyan
    Write-Host "  ║  High Definition Media Stream Processor  ║" -ForegroundColor DarkCyan
    Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($text) {
    Write-Host "  ► $text" -ForegroundColor Cyan
}

function Write-OK($text) {
    Write-Host "  ✓ $text" -ForegroundColor Green
}

function Write-Skip($text) {
    Write-Host "  · $text" -ForegroundColor DarkGray
}

function Write-Fail($text) {
    Write-Host "  ✗ $text" -ForegroundColor Red
}

function Write-Warn($text) {
    Write-Host "  ⚠ $text" -ForegroundColor Yellow
}

# ── Progress bar ───────────────────────────────────────────────────────────────
function Show-Progress($label, $pct) {
    $width  = 40
    $filled = [int]($pct * $width)
    $bar    = ("█" * $filled) + ("░" * ($width - $filled))
    $p      = [int]($pct * 100)
    $line   = "  [$bar] $p%  $label"
    Write-Host "`r$line" -NoNewline -ForegroundColor DarkCyan
}

# ── Download with progress ─────────────────────────────────────────────────────
function Download-File($url, $dest, $label) {
    $tmp = "$dest.tmp"
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "HDMSP-Toolkit/1.0")

        $total     = 0
        $lastPct   = -1

        $wc.add_DownloadProgressChanged({
            param($s, $e)
            $pct = $e.ProgressPercentage / 100.0
            if ([int]($pct * 100) -ne $lastPct) {
                $script:lastPct = [int]($pct * 100)
                Show-Progress $label $pct
            }
        })

        $done = $false
        $wc.add_DownloadFileCompleted({
            param($s, $e)
            $script:done  = $true
            $script:dlErr = $e.Error
        })

        $wc.DownloadFileAsync([uri]$url, $tmp)

        while (-not $done) { Start-Sleep -Milliseconds 100 }
        Write-Host ""   # newline after progress bar

        if ($dlErr) { throw $dlErr }

        if (Test-Path $dest) { Remove-Item $dest -Force }
        Rename-Item $tmp $dest -Force
        $wc.Dispose()
    }
    catch {
        if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
        throw
    }
}

# ── Fetch JSON from GitHub API ─────────────────────────────────────────────────
function Get-GithubRelease($apiUrl) {
    $headers = @{ "User-Agent" = "HDMSP-Toolkit/1.0" }
    $resp    = Invoke-RestMethod -Uri $apiUrl -Headers $headers -UseBasicParsing
    return $resp
}

# ── Find file recursively ──────────────────────────────────────────────────────
function Find-FileRecursive($dir, $name) {
    Get-ChildItem -Path $dir -Filter $name -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}

# ── Detect current state ───────────────────────────────────────────────────────
function Get-Mode {
    if (-not (Test-Path $INSTALL_DIR))  { return "install" }
    if (-not (Test-Path $MARKER_FILE))  { return "repair"  }
    $tools = @("yt-dlp.exe","ffmpeg.exe","HDMSP.exe") |
             ForEach-Object { Join-Path $INSTALL_DIR $_ }
    if ($tools | Where-Object { -not (Test-Path $_) }) { return "repair" }
    return "repair_or_uninstall"
}

# ── Create shortcuts ───────────────────────────────────────────────────────────
function New-Shortcuts($targetExe) {
    $ws       = New-Object -ComObject WScript.Shell
    $startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\HDMSP.lnk"
    $desktop   = Join-Path ([Environment]::GetFolderPath("Desktop")) "HDMSP.lnk"

    foreach ($lnkPath in @($startMenu, $desktop)) {
        $lnk = $ws.CreateShortcut($lnkPath)
        $lnk.TargetPath       = $targetExe
        $lnk.WorkingDirectory = $INSTALL_DIR
        $lnk.Description      = "High Definition Media Stream Processor"
        $lnk.Save()
    }
}

# ── Register in Add/Remove Programs ───────────────────────────────────────────
function Register-Uninstaller($setupExe) {
    $key  = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\HDMSP"
    $null = New-Item -Path $key -Force

    $props = @{
        DisplayName          = "HDMSP — High Definition Media Stream Processor"
        DisplayVersion       = "1.0.0"
        Publisher            = "HDMSP"
        InstallLocation      = $INSTALL_DIR
        UninstallString      = "`"$setupExe`""
        QuietUninstallString = "`"$setupExe`""
        NoModify             = 1
    }
    foreach ($kv in $props.GetEnumerator()) {
        Set-ItemProperty -Path $key -Name $kv.Key -Value $kv.Value -Force
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# INSTALL / REPAIR
# ══════════════════════════════════════════════════════════════════════════════
function Invoke-InstallOrRepair($action) {
    $label = if ($action -eq "install") { "Installing" } else { "Repairing" }
    Write-Host ""
    Write-Host "  $label HDMSP…" -ForegroundColor White
    Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host ""

    try {
        $null = New-Item -ItemType Directory -Path $INSTALL_DIR -Force

        # ── Step 1: yt-dlp ────────────────────────────────────────────────────
        Write-Step "Step 1 / 4 — yt-dlp"
        $ytdlpDest = Join-Path $INSTALL_DIR "yt-dlp.exe"
        if ($action -eq "install" -or -not (Test-Path $ytdlpDest)) {
            Write-Host "  Checking latest release…" -ForegroundColor DarkGray
            $rel   = Get-GithubRelease $YTDLP_API
            $asset = $rel.assets | Where-Object { $_.name -eq "yt-dlp.exe" } | Select-Object -First 1
            if (-not $asset) { throw "Could not find yt-dlp.exe in the GitHub release." }
            Download-File $asset.browser_download_url $ytdlpDest "yt-dlp $($rel.tag_name)"
            Write-OK "yt-dlp installed."
        } else {
            Write-Skip "yt-dlp already present, skipping."
        }
        Write-Host ""

        # ── Step 2: ffmpeg ────────────────────────────────────────────────────
        Write-Step "Step 2 / 4 — ffmpeg"
        $ffmpegDest = Join-Path $INSTALL_DIR "ffmpeg.exe"
        if ($action -eq "install" -or -not (Test-Path $ffmpegDest)) {
            Write-Host "  Checking latest essentials build…" -ForegroundColor DarkGray
            $rel   = Get-GithubRelease $FFMPEG_API
            $asset = $rel.assets | Where-Object { $_.name -like "*essentials*.zip" } | Select-Object -First 1
            if (-not $asset) { throw "Could not find ffmpeg essentials zip in the GitHub release." }
            $zipPath    = Join-Path $INSTALL_DIR "ffmpeg.zip"
            $extractDir = Join-Path $INSTALL_DIR "_ffmpeg_tmp"
            Download-File $asset.browser_download_url $zipPath "ffmpeg $($rel.tag_name)"
            Write-Host "  Extracting ffmpeg.exe…" -ForegroundColor DarkGray
            $null = New-Item -ItemType Directory -Path $extractDir -Force
            Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
            $found = Find-FileRecursive $extractDir "ffmpeg.exe"
            if (-not $found) { throw "ffmpeg.exe not found inside the downloaded archive." }
            Copy-Item $found $ffmpegDest -Force
            Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
            Remove-Item $zipPath    -Force           -ErrorAction SilentlyContinue
            Write-OK "ffmpeg installed."
        } else {
            Write-Skip "ffmpeg already present, skipping."
        }
        Write-Host ""

        # ── Step 3: HDMSP app ─────────────────────────────────────────────────
        Write-Step "Step 3 / 4 — HDMSP"
        $hdmspDest = Join-Path $INSTALL_DIR "HDMSP.exe"
        if ($action -eq "install" -or -not (Test-Path $hdmspDest)) {
            Download-File $HDMSP_URL $hdmspDest "HDMSP.exe"
            Write-OK "HDMSP installed."
        } else {
            Write-Skip "HDMSP.exe already present, skipping."
        }
        Write-Host ""

        # ── Step 4: Shortcuts & registry ──────────────────────────────────────
        Write-Step "Step 4 / 4 — Shortcuts & registry"
        New-Shortcuts    $hdmspDest
        Register-Uninstaller $MyInvocation.MyCommand.Path
        Set-Content -Path $MARKER_FILE -Value (Get-Date -Format o) -Encoding UTF8
        Write-OK "Desktop and Start Menu shortcuts created."
        Write-OK "Registered in Add/Remove Programs."
        Write-Host ""
        Write-Host "  ══════════════════════════════════════" -ForegroundColor Green
        $done = if ($action -eq "install") { "Installation complete!" } else { "Repair complete!" }
        Write-Host "    $done" -ForegroundColor Green
        Write-Host "  ══════════════════════════════════════" -ForegroundColor Green
        Write-Host ""

    } catch {
        Write-Host ""
        Write-Fail "Operation failed: $_"
        Write-Host ""
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# UNINSTALL
# ══════════════════════════════════════════════════════════════════════════════
function Invoke-Uninstall {
    Write-Host ""
    Write-Host "  Removing HDMSP…" -ForegroundColor White
    Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host ""

    try {
        # Shortcuts
        $startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\HDMSP.lnk"
        $desktop   = Join-Path ([Environment]::GetFolderPath("Desktop")) "HDMSP.lnk"
        foreach ($lnk in @($startMenu, $desktop)) {
            if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-OK "Removed shortcut: $(Split-Path $lnk -Leaf)" }
        }

        # Registry
        $key = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\HDMSP"
        if (Test-Path $key) {
            Remove-Item $key -Recurse -Force
            Write-OK "Removed from Add/Remove Programs."
        }

        # Install directory
        if (Test-Path $INSTALL_DIR) {
            Remove-Item $INSTALL_DIR -Recurse -Force
            Write-OK "Removed install directory."
        }

        Write-Host ""
        Write-Host "  ══════════════════════════════════════" -ForegroundColor Green
        Write-Host "    HDMSP has been fully uninstalled."   -ForegroundColor Green
        Write-Host "  ══════════════════════════════════════" -ForegroundColor Green
        Write-Host ""

    } catch {
        Write-Fail "Uninstall error: $_"
        Write-Host ""
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN MENU
# ══════════════════════════════════════════════════════════════════════════════
Write-Header

$mode = Get-Mode

switch ($mode) {
    "install" {
        Write-Host "  HDMSP is not installed." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  [1] Install HDMSP" -ForegroundColor White
        Write-Host "  [Q] Quit"          -ForegroundColor DarkGray
        Write-Host ""
        $choice = Read-Host "  Select an option"
        switch ($choice.Trim().ToUpper()) {
            "1" { Invoke-InstallOrRepair "install" }
            default { Write-Host "  Cancelled." -ForegroundColor DarkGray }
        }
    }

    "repair" {
        Write-Host "  HDMSP installation appears incomplete." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  [1] Repair (re-download missing files)" -ForegroundColor White
        Write-Host "  [2] Full reinstall"                     -ForegroundColor White
        Write-Host "  [Q] Quit"                               -ForegroundColor DarkGray
        Write-Host ""
        $choice = Read-Host "  Select an option"
        switch ($choice.Trim().ToUpper()) {
            "1" { Invoke-InstallOrRepair "repair"  }
            "2" { Invoke-InstallOrRepair "install" }
            default { Write-Host "  Cancelled." -ForegroundColor DarkGray }
        }
    }

    "repair_or_uninstall" {
        Write-Host "  HDMSP is installed at:" -ForegroundColor Green
        Write-Host "  $INSTALL_DIR"           -ForegroundColor DarkCyan
        Write-Host ""
        Write-Host "  [1] Repair  (re-download missing or corrupt files)" -ForegroundColor White
        Write-Host "  [2] Update  (re-download all files fresh)"          -ForegroundColor White
        Write-Host "  [3] Uninstall HDMSP"                                -ForegroundColor Yellow
        Write-Host "  [Q] Quit"                                           -ForegroundColor DarkGray
        Write-Host ""
        $choice = Read-Host "  Select an option"
        switch ($choice.Trim().ToUpper()) {
            "1" { Invoke-InstallOrRepair "repair"    }
            "2" { Invoke-InstallOrRepair "install"   }
            "3" {
                Write-Host ""
                Write-Warn "This will remove HDMSP and all its files."
                $confirm = Read-Host "  Type YES to confirm"
                if ($confirm -eq "YES") { Invoke-Uninstall }
                else { Write-Host "  Uninstall cancelled." -ForegroundColor DarkGray }
            }
            default { Write-Host "  Cancelled." -ForegroundColor DarkGray }
        }
    }
}

Write-Host "  Press any key to close…" -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
