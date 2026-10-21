<#
.SYNOPSIS
    Deploy ProxyChain Gateway langsung ke Docker Cloud Sandbox (https://agentic-platform.docker.com/sandboxes/new)
.DESCRIPTION
    Skrip ini mengotomatiskan upload dan instalasi ProxyChain ke sandbox cloud via SSH.
#>
param (
    [string]$ConnectScript = "",
    [string]$RemoteHost = "user@ssh.sandboxes-cloud.docker.com"
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "⚡ PROXYCHAIN GATEWAY — WINDOWS TO DOCKER CLOUD SANDBOX DEPLOYER" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# 1. Cari script connect sandbox jika tidak di-supply
if (-not $ConnectScript) {
    $parentDir = Split-Path -Parent $ScriptDir
    $found = Get-ChildItem -Path $parentDir -Filter "connect-sbx_*.ps1" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($found) {
        $ConnectScript = $found.FullName
        Write-Host "[+] Menemukan script connect sandbox terbaru: $ConnectScript" -ForegroundColor Green
    }
}

if (-not $ConnectScript -or -not (Test-Path $ConnectScript)) {
    Write-Host @"
[!] Script connect sandbox (connect-sbx_*.ps1) tidak ditemukan secara otomatis.

Cara Menjalankan:
1. Buat sandbox baru di https://agentic-platform.docker.com/sandboxes/new
2. Download file 'connect-sbx_XXXXX.ps1' dari halaman sandbox ke folder laptop Anda.
3. Jalankan kembali script ini dengan parameter:
   .\deploy_to_sandbox.ps1 -ConnectScript "path\ke\connect-sbx_XXXXX.ps1"

Atau jalankan instalasi 1-baris langsung di terminal SSH Sandbox Anda:
   curl -fsSL https://raw.githubusercontent.com/AbyanZainZ/ProxyChain-docker/main/install_sandbox.sh | bash
"@ -ForegroundColor Yellow
    exit 0
}

Write-Host "[+] Menyiapkan arsip direktori ProxyChain..." -ForegroundColor Green
$tarPath = Join-Path $env:TEMP "proxychain_bundle.tar.gz"
if (Test-Path $tarPath) { Remove-Item -Force $tarPath }

# Buat tar.gz menggunakan tar bawaan Windows 10/11
tar -czf $tarPath -C $ScriptDir --exclude="*.log" --exclude="venv" --exclude="__pycache__" .
Write-Host "[✓] Bundle dibuat: $tarPath ($([math]::Round((Get-Item $tarPath).Length / 1KB, 2)) KB)" -ForegroundColor Green

Write-Host "[+] Mengunggah bundle dan mengeksekusi installer di Sandbox Cloud..." -ForegroundColor Cyan

# Jalankan ekstraksi dan eksekusi install_sandbox.sh di sandbox
$remoteCommand = "mkdir -p /opt/proxychain && tar -xzf - -C /opt/proxychain && cd /opt/proxychain && bash install_sandbox.sh"

Get-Content $tarPath -AsByteStream -Raw | & $ConnectScript $remoteCommand

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "🎉 PROXYCHAIN SELESAI DI-DEPLOY KE DOCKER CLOUD SANDBOX!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
