@echo off
title ProxyChain Gateway (Docker & Localhost Edition)
color 0b

echo ==============================================================================
echo ⚡ PROXYCHAIN GATEWAY - LOCALHOST LAUNCHER
echo ==============================================================================

cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python tidak ditemukan di PATH sistem Anda.
    pause
    exit /b 1
)

if not exist "venv\Scripts\activate.bat" (
    echo [1/2] Membuat Virtual Environment Python (venv)...
    python -m venv venv
    echo [2/2] Menginstall dependensi...
    call venv\Scripts\activate.bat
    python -m pip install --upgrade pip
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate.bat
)

echo.
echo [✓] Menjalankan ProxyChain di http://127.0.0.1:8080 ...
start "" http://127.0.0.1:8080
python app.py
pause
