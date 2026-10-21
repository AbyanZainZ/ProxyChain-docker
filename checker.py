import re
import time
import asyncio
import httpx
from typing import Optional, List, Dict, Any

class ProxyItem:
    def __init__(self, raw_str: str):
        self.raw = raw_str.strip()
        self.protocol = "HTTP"
        self.host: Optional[str] = None
        self.port: Optional[int] = None
        self.user: Optional[str] = None
        self.password: Optional[str] = None

        # Health info
        self.is_alive: Optional[bool] = None
        self.latency_ms: Optional[float] = None
        self.exit_ip: Optional[str] = None
        self.country: Optional[str] = None
        self.city: Optional[str] = None
        self.error: Optional[str] = None
        self.last_checked: Optional[float] = None

        self._parse()

    def _parse(self):
        raw = self.raw
        if not raw or raw.startswith("#"):
            return
        if "#" in raw:
            raw = raw.split("#", 1)[0].strip()
        raw = re.sub(r'^(?:LIVE\s+|\d+[\.\)]\s+)', '', raw, flags=re.I).strip()
        if "|" in raw:
            raw = raw.replace("|", ":").strip()
        if not raw or raw.startswith("{") or '{"pid":' in raw:
            return

        ptype = "HTTP"
        m_proto = re.match(r'^(socks5|socks4|https?|http)(?::/+|[;:]{1,2})(.*)$', raw, re.I)
        if m_proto:
            ptype = m_proto.group(1).upper()
            if ptype == "HTTPS": ptype = "HTTP"
            raw = m_proto.group(2).strip()

        self.protocol = ptype

        if "@" in raw:
            auth_part, host_part = raw.rsplit("@", 1)
            u, p = auth_part.split(":", 1) if ":" in auth_part else (auth_part, "")
            if ":" in host_part:
                h, po = host_part.split(":", 1)
                po_clean = re.sub(r'[^\d]', '', po)
                if po_clean and (1 <= int(po_clean) <= 65535):
                    self.host = h.strip()
                    self.port = int(po_clean)
                    self.user = u.strip() or None
                    self.password = p.strip() or None
            return

        cleaned = raw.replace(";", ":").replace("\t", ":").strip()
        if " " in cleaned:
            cleaned = cleaned.split()[0].strip()
        parts = [p.strip() for p in cleaned.split(":") if p.strip()]

        if len(parts) == 4:
            if parts[1].isdigit() and 1 <= int(parts[1]) <= 65535:
                self.host = parts[0]
                self.port = int(parts[1])
                self.user = parts[2]
                self.password = parts[3]
            elif parts[3].isdigit() and 1 <= int(parts[3]) <= 65535:
                self.host = parts[2]
                self.port = int(parts[3])
                self.user = parts[0]
                self.password = parts[1]
        elif len(parts) == 2:
            if parts[1].isdigit() and 1 <= int(parts[1]) <= 65535:
                self.host = parts[0]
                self.port = int(parts[1])

    @property
    def is_valid(self) -> bool:
        return bool(self.host and self.port and 1 <= self.port <= 65535)

    def to_url(self) -> str:
        if not self.is_valid:
            return ""
        proto = "socks5" if self.protocol == "SOCKS5" else "http"
        if self.user and self.password:
            return f"{proto}://{self.user}:{self.password}@{self.host}:{self.port}"
        return f"{proto}://{self.host}:{self.port}"

    def to_display(self) -> str:
        auth_txt = f" ({self.user})" if self.user else ""
        return f"[{self.protocol}] {self.host}:{self.port}{auth_txt}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "raw": self.raw,
            "protocol": self.protocol,
            "host": self.host,
            "port": self.port,
            "user": self.user,
            "has_auth": bool(self.user and self.password),
            "display": self.to_display(),
            "url": self.to_url(),
            "is_alive": self.is_alive,
            "latency_ms": round(self.latency_ms, 1) if self.latency_ms else None,
            "exit_ip": self.exit_ip,
            "country": self.country,
            "city": self.city,
            "error": self.error,
            "last_checked": self.last_checked
        }


def parse_proxies_text(content: str) -> List[ProxyItem]:
    items = []
    seen = set()
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        p = ProxyItem(line)
        if p.is_valid:
            key = (p.protocol, p.host, p.port, p.user)
            if key not in seen:
                seen.add(key)
                items.append(p)
    return items


_IP_REGEX = re.compile(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$')

CHECK_TARGETS = [
    "http://api.ipify.org",
    "http://icanhazip.com",
    "http://checkip.amazonaws.com"
]

async def check_single_proxy(proxy: ProxyItem, timeout: float = 5.0) -> ProxyItem:
    if not proxy.is_valid:
        proxy.is_alive = False
        proxy.error = "Format proxy tidak valid"
        return proxy

    proxy_url = proxy.to_url()
    t0 = time.time()
    last_err = "Check failed"

    # Gunakan endpoint tanpa rate limit (ipify & icanhazip)
    for target_url in CHECK_TARGETS:
        try:
            async with httpx.AsyncClient(proxy=proxy_url, timeout=timeout, verify=False) as client:
                resp = await client.get(target_url, timeout=timeout)
                elapsed = (time.time() - t0) * 1000.0
                proxy.last_checked = time.time()

                if resp.status_code == 200:
                    text_ip = resp.text.strip()
                    # Pastikan balasan adalah IP publik valid (bukan HTML 502 / Error Page)
                    if _IP_REGEX.match(text_ip):
                        proxy.is_alive = True
                        proxy.latency_ms = round(elapsed, 1)
                        proxy.exit_ip = text_ip
                        proxy.error = None
                        return proxy
                    else:
                        last_err = "Respon bukan IP valid"
                else:
                    last_err = f"HTTP {resp.status_code}"
        except Exception as e:
            proxy.last_checked = time.time()
            err_str = str(e).strip()
            if "timed out" in err_str.lower() or "timeout" in err_str.lower():
                last_err = f"Timeout ({timeout}s)"
            else:
                last_err = err_str[:35] or "Gagal terkoneksi"

    proxy.is_alive = False
    proxy.error = last_err
    return proxy


async def check_all_proxies(proxies: List[ProxyItem], max_concurrency: int = 15, timeout: float = 6.0) -> List[ProxyItem]:
    sem = asyncio.Semaphore(max_concurrency)

    async def _worker(p):
        async with sem:
            return await check_single_proxy(p, timeout=timeout)

    tasks = [_worker(p) for p in proxies]
    return await asyncio.gather(*tasks)


if __name__ == "__main__":
    import sys
    test_lines = """
    198.105.121.120:6382:thosxyue:sunvk9xa5oox
    socks5|78.29.56.178:1080
    http://31.58.9.4:6077
    """
    items = parse_proxies_text(test_lines)
    print(f"Parsed {len(items)} items:")
    for item in items:
        print(f"  {item.to_display()} -> URL: {item.to_url()}")
