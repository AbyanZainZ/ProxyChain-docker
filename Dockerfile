# ==============================================================================
# PROXYCHAIN GATEWAY — DOCKERFILE
# Multi-Port Authenticated Proxy Forwarder, Chaining Relay & Live Health-Check
# ==============================================================================
FROM python:3.11-slim

# Prevent Python from writing .pyc and buffering stdout/stderr
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install runtime utilities (curl for healthcheck, procps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    procps \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies first (cached layers)
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy application source
COPY . .

# Expose Web Dashboard Port (8080) and Default Proxy Port Range (10001-10050)
EXPOSE 8080
EXPOSE 10001-10050

# Container Healthcheck via FastAPI status endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://127.0.0.1:8080/api/status || exit 1

# Start ProxyChain
CMD ["python3", "app.py"]
