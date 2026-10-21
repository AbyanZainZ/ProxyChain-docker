#!/usr/bin/env bash
# ==============================================================================
# PROXYCHAIN GATEWAY — DOCKER CLOUD SANDBOX & LINUX CONTAINER INSTALLER
# Non-systemd compatible: Works in Docker, Cloud Sandboxes, VPS & Colab
# ==============================================================================
set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}==============================================================================${NC}"
echo -e "${BOLD}${CYAN}   ⚡ PROXYCHAIN GATEWAY — DOCKER CLOUD SANDBOX INSTALLER (CYBER COCKPIT)    ${NC}"
echo -e "${CYAN}==============================================================================${NC}"

# 1. Pastikan Akses Root / Sudo
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${YELLOW}[!] Script ini membutuhkan hak akses root. Mengalihkan ke sudo...${NC}"
    exec sudo bash "$0" "$@"
fi

export DEBIAN_FRONTEND=noninteractive
INSTALL_DIR="/opt/proxychain"
SCREEN_NAME="proxychain"

# 2. Install Dependensi Sistem Linux
echo -e "${GREEN}[1/5] Memeriksa & Menginstall dependensi paket Linux...${NC}"
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y python3 python3-pip python3-venv git curl screen lsof procps >/dev/null 2>&1

# 3. Menyiapkan Direktori & Source Code
echo -e "${GREEN}[2/5] Menyiapkan direktori instalasi di ${INSTALL_DIR}...${NC}"
mkdir -p "$INSTALL_DIR"

if [ -f "app.py" ] && [ -d "static" ]; then
    echo -e "${CYAN}Menyalin file dari direktori saat ini...${NC}"
    cp -a . "$INSTALL_DIR/"
else
    REPO_URL="${1:-https://github.com/AbyanZainZ/ProxyChain-docker.git}"
    echo -e "${YELLOW}Mengunduh source code dari ${REPO_URL}...${NC}"
    if [ -d "$INSTALL_DIR/.git" ]; then
        git -C "$INSTALL_DIR" pull || true
    else
        rm -rf "$INSTALL_DIR"
        git clone "$REPO_URL" "$INSTALL_DIR"
    fi
fi

cd "$INSTALL_DIR"

# 4. Setup Python Virtual Environment
echo -e "${GREEN}[3/5] Menyiapkan Python Virtual Environment (venv) & Libraries...${NC}"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
venv/bin/pip install --upgrade pip >/dev/null 2>&1
venv/bin/pip install -r requirements.txt >/dev/null 2>&1

# 5. Buat Script Background Runner Loop
echo -e "${GREEN}[4/5] Menyiapkan Daemon Runner & Auto-Restart Loop...${NC}"
cat << 'EOF' > "$INSTALL_DIR/runner.sh"
#!/usr/bin/env bash
cd /opt/proxychain
export PYTHONUNBUFFERED=1
while true; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting ProxyChain Gateway..." >> /opt/proxychain/proxychain.log
    /opt/proxychain/venv/bin/python3 app.py >> /opt/proxychain/proxychain.log 2>&1
    EXIT_CODE=$?
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ProxyChain exited with code ${EXIT_CODE}. Restarting in 3 seconds..." >> /opt/proxychain/proxychain.log
    sleep 3
done
EOF
chmod +x "$INSTALL_DIR/runner.sh"

# 6. Buat CLI Command Tool Global: 'proxychain'
echo -e "${GREEN}[5/5] Membuat perintah global '/usr/local/bin/proxychain'...${NC}"
cat << 'EOF' > /usr/local/bin/proxychain
#!/usr/bin/env bash
INSTALL_DIR="/opt/proxychain"
SCREEN_NAME="proxychain"
LOG_FILE="$INSTALL_DIR/proxychain.log"

case "$1" in
    start)
        if screen -list | grep -q "\.${SCREEN_NAME}[[:space:]]"; then
            echo "[!] ProxyChain sudah berjalan di screen '${SCREEN_NAME}'."
        else
            echo "[+] Menjalankan ProxyChain di background screen '${SCREEN_NAME}'..."
            screen -dmS "$SCREEN_NAME" bash "$INSTALL_DIR/runner.sh"
            sleep 1
            echo "[✓] ProxyChain berhasil dijalankan!"
        fi
        ;;
    stop)
        echo "[-] Menghentikan ProxyChain..."
        screen -S "$SCREEN_NAME" -X quit 2>/dev/null || true
        pkill -f "/opt/proxychain/app.py" 2>/dev/null || true
        sleep 1
        echo "[✓] ProxyChain telah dihentikan."
        ;;
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
    status)
        echo "======================================================"
        echo " ⚡ PROXYCHAIN GATEWAY — RUNTIME STATUS"
        echo "======================================================"
        if screen -list | grep -q "\.${SCREEN_NAME}[[:space:]]"; then
            echo -e "Screen Daemon  : \033[0;32m● RUNNING\033[0m (Session: ${SCREEN_NAME})"
        else
            echo -e "Screen Daemon  : \033[0;31m○ STOPPED\033[0m"
        fi

        PIDS=$(pgrep -f "/opt/proxychain/app.py" || true)
        if [ -n "$PIDS" ]; then
            echo -e "Python Process : \033[0;32m● ACTIVE\033[0m (PID: ${PIDS})"
            ps aux | grep -E "/opt/proxychain/app.py" | grep -v grep | awk '{printf "Memory / CPU   : %s RAM | %s CPU\n", $4"%", $3"%"}'
        else
            echo -e "Python Process : \033[0;31m○ NOT RUNNING\033[0m"
        fi

        echo ""
        echo "--- Listening Ports (Dashboard & Relay) ---"
        if command -v ss >/dev/null 2>&1; then
            ss -tlpn | grep -E "python|8080|1000[0-9]|100[1-9][0-9]" || echo "Belum ada port yang terbuka."
        elif command -v lsof >/dev/null 2>&1; then
            lsof -iTCP -sTCP:LISTEN -P -n | grep python || echo "Belum ada port yang terbuka."
        fi

        echo ""
        echo "--- 15 Log Terbaru (${LOG_FILE}) ---"
        if [ -f "$LOG_FILE" ]; then
            tail -n 15 "$LOG_FILE"
        else
            echo "Belum ada log tercatat."
        fi
        echo "======================================================"
        ;;
    logs)
        if [ -f "$LOG_FILE" ]; then
            tail -f "$LOG_FILE"
        else
            echo "Log file belum tersedia. Jalankan 'proxychain start' terlebih dahulu."
        fi
        ;;
    attach)
        echo "Menghubungkan ke terminal screen '${SCREEN_NAME}'..."
        echo "(Tekan Ctrl+A lalu D untuk keluar tanpa mematikan proses)"
        screen -r "$SCREEN_NAME"
        ;;
    host)
        if [ -n "$2" ]; then
            python3 -c "
import json
with open('/opt/proxychain/config.json', 'r') as f:
    cfg = json.load(f)
cfg['public_host'] = '$2'
with open('/opt/proxychain/config.json', 'w') as f:
    json.dump(cfg, f, indent=2)
print('Public host updated to: $2')
"
            $0 restart
        else
            echo "Penggunaan: proxychain host <IP_ATAU_DOMAIN>"
        fi
        ;;
    *)
        echo "Penggunaan: proxychain {start|stop|restart|status|logs|attach|host <IP>}"
        exit 1
        ;;
esac
EOF
chmod +x /usr/local/bin/proxychain

# 7. Mulai Menjalankan Service
proxychain start

# 8. Deteksi IP Server & Info Docker Sandbox
SERVER_IP=$(curl -s -4 --max-time 3 https://api.ipify.org 2>/dev/null || curl -s -4 --max-time 3 https://ifconfig.me 2>/dev/null || echo "127.0.0.1")

echo ""
echo -e "${CYAN}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}🎉 PROXYCHAIN GATEWAY BERHASIL DIINSTALL & DIAKTIFKAN DI DOCKER SANDBOX!${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo -e "Web Dashboard : ${YELLOW}http://${SERVER_IP}:8080${NC} (Atau http://127.0.0.1:8080)"
echo -e "Default Auth  : ${CYAN}gemini / gemini${NC}"
echo -e "Port Awal     : ${CYAN}10001 (Port bertambah dinamis sesuai jumlah proxy Box 1)${NC}"
echo ""
echo -e "${BOLD}🛠️ Perintah Praktis di Terminal:${NC}"
echo -e "  - Cek Status & Port : ${GREEN}proxychain status${NC}"
echo -e "  - Pantau Log Realtime: ${GREEN}proxychain logs${NC}"
echo -e "  - Stop / Restart     : ${GREEN}proxychain stop${NC} / ${GREEN}proxychain restart${NC}"
echo -e "  - Ganti Host Tampil  : ${GREEN}proxychain host <IP_VPS_ATAU_DOMAIN>${NC}"
echo ""
echo -e "${BOLD}🔑 Akses dari Laptop via SSH Tunnel (Jika pakai Docker Cloud Sandbox):${NC}"
echo -e "  Jalankan perintah ini di PowerShell laptop Anda:"
echo -e "  ${YELLOW}ssh -N -L 8080:127.0.0.1:8080 -L 10001:127.0.0.1:10001 user@ssh.sandboxes-cloud.docker.com${NC}"
echo -e "  Lalu buka di browser laptop Anda: ${CYAN}http://127.0.0.1:8080${NC}"
echo -e "${CYAN}==============================================================================${NC}"
