// ==============================================================================
// PROXYCHAIN GATEWAY v2 — CYBER COCKPIT JAVASCRIPT
// Dual-Box Architecture: Box 1 (Active Relay Pool) & Box 2 (Scrape Testing Lab)
// ==============================================================================

let currentStatusData = null;
let pollTimer = null;
let stagingPollTimer = null;

// DOM ELEMENTS — HEADER & METRICS
const valServerIp = document.getElementById('val-server-ip');
const statTotalProxies = document.getElementById('stat-total-proxies');
const statPortsRange = document.getElementById('stat-ports-range');
const statAliveProxies = document.getElementById('stat-alive-proxies');
const statAlivePct = document.getElementById('stat-alive-pct');
const statStagingTotal = document.getElementById('stat-staging-total');
const statStagingDesc = document.getElementById('stat-staging-desc');
const statActiveConns = document.getElementById('stat-active-conns');
const statDataTransfer = document.getElementById('stat-data-transfer');

// DOM ELEMENTS — CONFIG
const cfgUser = document.getElementById('cfg-user');
const cfgPass = document.getElementById('cfg-pass');
const cfgStartPort = document.getElementById('cfg-start-port');
const cfgPublicHost = document.getElementById('cfg-public-host');

// DOM ELEMENTS — BOX 1 (ACTIVE RELAY POOL)
const tagActiveCount = document.getElementById('tag-active-count');
const activeTextarea = document.getElementById('active-textarea');
const btnActiveApply = document.getElementById('btn-active-apply');
const btnCopyLive = document.getElementById('btn-copy-live');
const btnActiveCheck = document.getElementById('btn-active-check');
const btnActivePurgeDead = document.getElementById('btn-active-purge-dead');
const btnCopyEndpoints = document.getElementById('btn-copy-endpoints');
const btnClearActive = document.getElementById('btn-clear-active');
const chkAutoPurgeBox1 = document.getElementById('chk-auto-purge-box1');
const selPurgeInterval = document.getElementById('sel-purge-interval');

// DOM ELEMENTS — BOX 2 (SCRAPE TESTING LAB)
const tagStagingCount = document.getElementById('tag-staging-count');
const stagingTextarea = document.getElementById('staging-textarea');
const chkAutoTransfer = document.getElementById('chk-auto-transfer');
const btnStagingTest = document.getElementById('btn-staging-test');
const btnStagingTransfer = document.getElementById('btn-staging-transfer');
const btnStagingClear = document.getElementById('btn-staging-clear');
const lblStagingSummary = document.getElementById('lbl-staging-summary');

// DOM ELEMENTS — TABLE & UTILS
const tableFilter = document.getElementById('table-filter');
const portsTbody = document.getElementById('ports-tbody');
const toastEl = document.getElementById('pc-toast');
const healthStatusText = document.getElementById('health-check-status-text');

// FORMAT HELPER
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showToast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.style.borderColor = isError ? '#ff5252' : '#00e5ff';
    toastEl.style.color = isError ? '#ff5252' : '#00e5ff';
    toastEl.style.display = 'block';
    setTimeout(() => {
        toastEl.style.display = 'none';
    }, 3500);
}

// UNIVERSAL CLIPBOARD HELPER (Works on HTTP & HTTPS)
async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {}
    }
    // Fallback untuk HTTP biasa tanpa SSL
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        document.body.removeChild(textArea);
        return false;
    }
}

// COPY SINGLE ENDPOINT HELPER
window.copyText = async function(text) {
    const ok = await copyToClipboard(text);
    if (ok) {
        showToast(`📋 Berhasil disalin: ${text}`);
    } else {
        showToast(`Gagal menyalin ke clipboard.`, true);
    }
};

// COUNT HELPERS
function updateActiveCount() {
    const lines = activeTextarea.value.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));
    tagActiveCount.textContent = `${lines.length} Aktif`;
}

function updateStagingCount() {
    const lines = stagingTextarea.value.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));
    tagStagingCount.textContent = `${lines.length} Mentah`;
}

let stagingAutoSaveTimer = null;
function saveStagingContent() {
    if (stagingAutoSaveTimer) clearTimeout(stagingAutoSaveTimer);
    stagingAutoSaveTimer = setTimeout(async () => {
        try {
            await fetch('/api/staging/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ raw_text: stagingTextarea.value })
            });
        } catch (e) {}
    }, 500);
}

activeTextarea.addEventListener('input', updateActiveCount);
stagingTextarea.addEventListener('input', () => {
    updateStagingCount();
    saveStagingContent();
});
stagingTextarea.addEventListener('blur', saveStagingContent);

// FETCH STATUS
async function fetchStatus() {
    try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const data = await res.json();
        currentStatusData = data;
        renderDashboard(data);
    } catch (err) {
        console.error("Error fetching status:", err);
    }
}

// FETCH RAW ACTIVE & STAGING
async function fetchRawData() {
    try {
        const [resAct, resStg] = await Promise.all([
            fetch('/api/active/raw'),
            fetch('/api/staging/raw')
        ]);
        if (resAct.ok && activeTextarea.value === "") {
            activeTextarea.value = await resAct.text();
            updateActiveCount();
        }
        if (resStg.ok && stagingTextarea.value === "") {
            stagingTextarea.value = await resStg.text();
            updateStagingCount();
        }
    } catch (e) {}
}

// RENDER DASHBOARD
function renderDashboard(data) {
    const srvIp = data.server_ip || '127.0.0.1';
    valServerIp.textContent = srvIp;

    // Config fields (only update if not focused)
    if (document.activeElement !== cfgUser) cfgUser.value = data.config.client_user || '';
    if (document.activeElement !== cfgPass) cfgPass.value = data.config.client_pass || '';
    if (document.activeElement !== cfgStartPort) cfgStartPort.value = data.config.proxy_start_port || 10001;
    if (cfgPublicHost && document.activeElement !== cfgPublicHost) {
        cfgPublicHost.value = data.config.public_host || '';
    }
    if (chkAutoPurgeBox1 && document.activeElement !== chkAutoPurgeBox1) {
        chkAutoPurgeBox1.checked = data.config.auto_purge_dead !== false;
    }
    if (selPurgeInterval && document.activeElement !== selPurgeInterval) {
        selPurgeInterval.value = data.config.auto_purge_interval_minutes || 10;
    }

    // Box 1 Metrics
    const b1 = data.box1_active || {};
    const totalActive = b1.total || 0;
    const aliveActive = b1.alive || 0;
    statTotalProxies.textContent = totalActive;
    statAliveProxies.textContent = aliveActive;
    const pct = totalActive > 0 ? Math.round((aliveActive / totalActive) * 100) : 0;
    statAlivePct.textContent = `${pct}% Siap Pakai`;

    if (totalActive > 0) {
        const startP = data.config.proxy_start_port || 10001;
        statPortsRange.textContent = `Port ${startP} - ${startP + totalActive - 1}`;
    } else {
        statPortsRange.textContent = `Belum ada port aktif`;
    }

    // Box 2 Metrics
    const b2 = data.box2_staging || {};
    const totalStaging = b2.total || 0;
    statStagingTotal.textContent = totalStaging;
    statStagingDesc.textContent = `${b2.alive || 0} Alive • ${b2.dead || 0} Dead`;

    if (b2.is_checking) {
        lblStagingSummary.innerHTML = `<span style="color: #ffd600;">🩺 Sedang menguji proxy hasil scrape...</span>`;
    } else if (b2.status === "completed") {
        lblStagingSummary.textContent = `Hasil Tes: ${b2.alive || 0} Alive | ${b2.dead || 0} Dead`;
    }

    // Traffic & Connections
    let activeConns = 0;
    let totalBytes = 0;
    data.ports.forEach(p => {
        activeConns += (p.active_conns || 0);
        totalBytes += (p.bytes_in || 0) + (p.bytes_out || 0);
    });

    statActiveConns.textContent = activeConns;
    statDataTransfer.textContent = formatBytes(totalBytes);

    if (b1.is_checking) {
        healthStatusText.innerHTML = `<span style="color: #00e5ff;">🩺 Sedang memeriksa Box 1 di latar belakang...</span>`;
    } else {
        healthStatusText.textContent = `System ready • Sync tiap 4 detik`;
    }

    renderTable(data.ports, srvIp, data.config.client_user, data.config.client_pass);
}

// RENDER TABLE
function renderTable(ports, srvIp, user, pass) {
    const filter = tableFilter.value.toLowerCase().trim();

    if (!ports || ports.length === 0) {
        portsTbody.innerHTML = `<tr><td colspan="7" class="pc-text-center pc-muted">Belum ada port proxy aktif. Tambahkan proxy di Box 1 dan klik "JALANKAN / UPDATE RELAY".</td></tr>`;
        return;
    }

    const filtered = ports.filter(p => {
        if (!filter) return true;
        const up = p.upstream || {};
        const str = `${p.port} ${up.host} ${up.country} ${up.city} ${up.exit_ip}`.toLowerCase();
        return str.includes(filter);
    });

    if (filtered.length === 0) {
        portsTbody.innerHTML = `<tr><td colspan="7" class="pc-text-center pc-muted">Tidak ada proxy yang cocok dengan pencarian "${filter}".</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(item => {
        const up = item.upstream || {};
        const port = item.port;
        const endpoint = (user && pass) ? `${srvIp}:${port}:${user}:${pass}` : `${srvIp}:${port}`;

        // Status badge
        let statusBadge = '';
        if (up.is_alive === true) {
            statusBadge = `<span class="pc-badge pc-badge-alive">🟢 ALIVE</span>`;
        } else if (up.is_alive === false) {
            statusBadge = `<span class="pc-badge pc-badge-dead">🔴 DEAD</span>`;
        } else {
            statusBadge = `<span class="pc-badge pc-badge-pending">⚡ PENDING</span>`;
        }

        // Latency
        let latText = '-';
        if (up.latency_ms !== null && up.latency_ms !== undefined) {
            const col = up.latency_ms < 300 ? '#00e676' : (up.latency_ms < 800 ? '#ffd600' : '#ff5252');
            latText = `<span style="color: ${col}; font-weight: bold;">${up.latency_ms} ms</span>`;
        } else if (up.error) {
            latText = `<span style="color: #ff5252; font-size: 10px;">${up.error}</span>`;
        }

        // Location / Exit IP
        let locText = up.exit_ip || up.host || '-';
        if (up.country) {
            locText += ` <span style="color: #90caf9; font-size: 11px;">(${up.country})</span>`;
        }

        // Trafik
        const tf = formatBytes((item.bytes_in || 0) + (item.bytes_out || 0));

        html += `
        <tr>
            <td style="color: #00e5ff; font-weight: bold;">${port}</td>
            <td>
                <div class="pc-endpoint-cell">
                    <span>${endpoint}</span>
                    <span class="pc-copy-icon" title="Salin Endpoint" onclick="copyText('${endpoint}')">📋</span>
                </div>
            </td>
            <td><span style="color: #90caf9;">${up.display || '-'}</span></td>
            <td>${locText}</td>
            <td>${latText}</td>
            <td>${tf}</td>
            <td>${statusBadge}</td>
        </tr>
        `;
    });

    portsTbody.innerHTML = html;
}

tableFilter.addEventListener('input', () => {
    if (currentStatusData) {
        renderTable(currentStatusData.ports, currentStatusData.server_ip, currentStatusData.config.client_user, currentStatusData.config.client_pass);
    }
});

// ==============================================================================
// BOX 1 (PRODUCTION RELAY POOL) ACTIONS
// ==============================================================================
btnActiveApply.addEventListener('click', async () => {
    const raw = activeTextarea.value.trim();
    if (!raw) {
        showToast("⚠️ Daftar proxy di Box 1 masih kosong!", true);
        return;
    }

    btnActiveApply.disabled = true;
    btnActiveApply.innerHTML = `<span>⏳ Mengaktifkan Port VPS...</span>`;

    try {
        // 1. Simpan konfigurasi
        await fetch('/api/config', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                client_user: cfgUser.value.trim(),
                client_pass: cfgPass.value.trim(),
                proxy_start_port: parseInt(cfgStartPort.value) || 10001,
                public_host: cfgPublicHost ? cfgPublicHost.value.trim() : ''
            })
        });

        // 2. Terapkan proxy Box 1 ke relay engine
        const res = await fetch('/api/active/apply', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ raw_text: raw })
        });
        const result = await res.json();
        showToast(result.message || "Relay berhasil diaktifkan!");
        await fetchStatus();
    } catch (e) {
        showToast("Gagal menghubungi server.", true);
    } finally {
        btnActiveApply.disabled = false;
        btnActiveApply.innerHTML = `<span>🚀 JALANKAN / UPDATE RELAY</span>`;
    }
});

btnCopyLive.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/export?alive_only=true');
        if (!res.ok) {
            showToast("Gagal mengambil data live proxy dari server.", true);
            return;
        }
        const txt = await res.text();
        if (!txt || txt.trim() === "") {
            showToast("⚠️ Belum ada proxy berstatus ALIVE yang siap disalin.", true);
            return;
        }
        const ok = await copyToClipboard(txt);
        if (ok) {
            const count = txt.split('\n').filter(Boolean).length;
            showToast(`📋 Berhasil menyalin ${count} LIVE PROXY ke Clipboard!`);
        } else {
            showToast("Browser memblokir akses clipboard.", true);
        }
    } catch (e) {
        showToast("Gagal menyalin live proxy.", true);
    }
});

btnActiveCheck.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/active/check', { method: 'POST' });
        const data = await res.json();
        showToast(data.message);
        await fetchStatus();
    } catch (e) {
        showToast("Gagal memulai audit Box 1.", true);
    }
});

btnActivePurgeDead.addEventListener('click', async () => {
    if (!confirm("Hapus semua proxy yang berstatus DEAD dari Box 1?\nPort yang mati akan dimatikan dari VPS.")) return;

    btnActivePurgeDead.disabled = true;
    btnActivePurgeDead.innerHTML = `<span>⏳ Menghapus...</span>`;

    try {
        const res = await fetch('/api/active/purge-dead', { method: 'POST' });
        const data = await res.json();
        showToast(data.message, !data.success);
        if (data.success && data.new_raw_text !== undefined) {
            activeTextarea.value = data.new_raw_text;
            updateActiveCount();
            await fetchStatus();
        }
    } catch (e) {
        showToast("Gagal menghapus proxy dead.", true);
    } finally {
        btnActivePurgeDead.disabled = false;
        btnActivePurgeDead.innerHTML = `<span>🗑️ DELETE ALL DEAD PROXY</span>`;
    }
});

btnCopyEndpoints.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/export?alive_only=false');
        const txt = await res.text();
        if (!txt || txt.trim() === "") {
            showToast("Belum ada port proxy aktif untuk disalin.", true);
            return;
        }
        const ok = await copyToClipboard(txt);
        if (ok) {
            const count = txt.split('\n').filter(Boolean).length;
            showToast(`📋 ${count} Endpoint berhasil disalin!`);
        }
    } catch (e) {
        showToast("Gagal menyalin endpoint.", true);
    }
});

btnClearActive.addEventListener('click', () => {
    if (confirm("Kosongkan daftar proxy di Box 1?")) {
        activeTextarea.value = '';
        updateActiveCount();
        showToast("Box 1 telah dikosongkan.");
    }
});

// ==============================================================================
// BOX 2 (SCRAPE TESTING LAB / STAGING) ACTIONS
// ==============================================================================
btnStagingTest.addEventListener('click', async () => {
    const raw = stagingTextarea.value.trim();
    if (!raw) {
        showToast("⚠️ Box 2 masih kosong! Tempel proxy hasil scrape terlebih dahulu.", true);
        return;
    }

    btnStagingTest.disabled = true;
    btnStagingTest.innerHTML = `<span>⏳ Menguji Proxy Scrape...</span>`;
    lblStagingSummary.innerHTML = `<span style="color: #ffd600;">🩺 Menjalankan test paralel di Box 2...</span>`;

    try {
        const res = await fetch('/api/staging/test', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                raw_text: raw,
                auto_transfer: chkAutoTransfer.checked
            })
        });
        const data = await res.json();
        showToast(data.message, !data.success);

        // Polling status Box 2
        pollStagingProgress();
    } catch (e) {
        showToast("Gagal memulai pengujian Box 2.", true);
        btnStagingTest.disabled = false;
        btnStagingTest.innerHTML = `<span>🩺 TEST PROXY SCRAPE</span>`;
    }
});

function pollStagingProgress() {
    if (stagingPollTimer) clearInterval(stagingPollTimer);

    stagingPollTimer = setInterval(async () => {
        try {
            const res = await fetch('/api/staging/status');
            if (!res.ok) return;
            const data = await res.json();
            const sum = data.summary || {};

            if (data.is_checking) {
                lblStagingSummary.innerHTML = `<span style="color: #ffd600;">🩺 Sedang menguji: ${sum.alive || 0} Alive | ${sum.dead || 0} Dead</span>`;
            } else {
                clearInterval(stagingPollTimer);
                stagingPollTimer = null;
                btnStagingTest.disabled = false;
                btnStagingTest.innerHTML = `<span>🩺 TEST PROXY SCRAPE</span>`;
                lblStagingSummary.textContent = `Selesai: ${sum.alive || 0} Alive | ${sum.dead || 0} Dead`;

                if (chkAutoTransfer.checked && sum.alive > 0) {
                    showToast(`🎉 Tes selesai! ${sum.alive} proxy ALIVE otomatis ditransfer ke Box 1.`);
                    // Refresh data Box 1
                    const actRes = await fetch('/api/active/raw');
                    if (actRes.ok) {
                        activeTextarea.value = await actRes.text();
                        updateActiveCount();
                    }
                } else {
                    showToast(`Tes selesai: ${sum.alive || 0} ALIVE, ${sum.dead || 0} DEAD.`);
                }
                await fetchStatus();
            }
        } catch (e) {
            clearInterval(stagingPollTimer);
            btnStagingTest.disabled = false;
            btnStagingTest.innerHTML = `<span>🩺 TEST PROXY SCRAPE</span>`;
        }
    }, 2000);
}

btnStagingTransfer.addEventListener('click', async () => {
    btnStagingTransfer.disabled = true;
    btnStagingTransfer.innerHTML = `<span>⏳ Mentransfer...</span>`;

    try {
        const res = await fetch('/api/staging/transfer-live', { method: 'POST' });
        const data = await res.json();
        showToast(data.message, !data.success);

        if (data.success && data.new_active_raw !== undefined) {
            activeTextarea.value = data.new_active_raw;
            updateActiveCount();
            await fetchStatus();
        }
    } catch (e) {
        showToast("Gagal memindahkan proxy ke Box 1.", true);
    } finally {
        btnStagingTransfer.disabled = false;
        btnStagingTransfer.innerHTML = `<span>➡️ TRANSFER LIVE KE BOX 1</span>`;
    }
});

btnStagingClear.addEventListener('click', async () => {
    try {
        stagingTextarea.value = '';
        updateStagingCount();
        lblStagingSummary.textContent = "Lab Ready • Kosong";
        await fetch('/api/staging/clear', { method: 'POST' });
        showToast("🧹 Box 2 telah dikosongkan.");
        await fetchStatus();
    } catch (e) {
        showToast("Gagal mengosongkan Box 2.", true);
    }
});

// AUTO-PURGE CONFIG LISTENERS
async function saveAutoPurgeConfig() {
    try {
        await fetch('/api/config', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                client_user: cfgUser.value.trim(),
                client_pass: cfgPass.value.trim(),
                proxy_start_port: parseInt(cfgStartPort.value) || 10001,
                auto_purge_dead: chkAutoPurgeBox1 ? chkAutoPurgeBox1.checked : true,
                auto_purge_interval_minutes: selPurgeInterval ? parseInt(selPurgeInterval.value) : 10,
                public_host: cfgPublicHost ? cfgPublicHost.value.trim() : ''
            })
        });
        const isAct = chkAutoPurgeBox1 ? chkAutoPurgeBox1.checked : true;
        const mins = selPurgeInterval ? selPurgeInterval.value : 10;
        showToast(`Auto-Purge disetel: ${isAct ? 'AKTIF (' + mins + ' menit)' : 'NONAKTIF'}`);
    } catch (e) {}
}

if (chkAutoPurgeBox1) chkAutoPurgeBox1.addEventListener('change', saveAutoPurgeConfig);
if (selPurgeInterval) selPurgeInterval.addEventListener('change', saveAutoPurgeConfig);
if (cfgPublicHost) {
    cfgPublicHost.addEventListener('change', async () => {
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    client_user: cfgUser.value.trim(),
                    client_pass: cfgPass.value.trim(),
                    proxy_start_port: parseInt(cfgStartPort.value) || 10001,
                    public_host: cfgPublicHost.value.trim()
                })
            });
            showToast('Public Host diperbarui!');
            fetchStatus();
        } catch (e) {}
    });
}

// START APPLICATION
fetchRawData();
fetchStatus();
pollTimer = setInterval(fetchStatus, 4000);
