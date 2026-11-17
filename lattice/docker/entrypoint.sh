#!/bin/sh
# Lattice — container entrypoint
# - Writes config.json into /data (the persistent data folder)
# - Pre-flights outbound UDP: if the host blocks it, starts WITHOUT warp
#   immediately so the HTTP listener binds fast (avoids platform health
#   check timeouts — the engine fails closed while WARP init hangs).
# - Optional Turso sync via TURSO_URL / TURSO_AUTH_TOKEN.
set -u
PORT="${PORT:-8133}"
API_KEY="${API_KEY:-Lattice}"
WARP="${WARP:-true}"
TURSO_URL="${TURSO_URL:-}"
TURSO_AUTH_TOKEN="${TURSO_AUTH_TOKEN:-}"
TURSO_SYNC_SECONDS="${TURSO_SYNC_SECONDS:-15}"

write_config() {
    TURSO_BLOCK=""
    if [ -n "$TURSO_URL" ] && [ -n "$TURSO_AUTH_TOKEN" ]; then
        TURSO_BLOCK=",
  \"turso\": { \"enabled\": true, \"url\": \"${TURSO_URL}\", \"auth_token\": \"${TURSO_AUTH_TOKEN}\", \"sync_seconds\": ${TURSO_SYNC_SECONDS} }"
    fi
    cat > /data/config.json <<EOF
{
  "listen": "0.0.0.0:${PORT}",
  "server_keys": ["${API_KEY}"],
  "webui": { "enabled": false },
  "warp": { "enabled": $1, "pool_size": 6, "stack": "ipv6" }${TURSO_BLOCK}
}
EOF
}

# ---- UDP pre-flight: WARP needs outbound UDP. If blocked, never try it. ----
UDP_OK=""
if command -v timeout >/dev/null 2>&1; then
    timeout 6 nslookup opencode.ai 1.1.1.1 >/dev/null 2>&1 && UDP_OK=1
else
    nslookup opencode.ai 1.1.1.1 >/dev/null 2>&1 && UDP_OK=1
fi
if [ "$WARP" = "true" ] && [ -z "$UDP_OK" ]; then
    echo "[lattice] outbound UDP blocked by host -> starting WITHOUT warp (session re-mint keeps the escape working)"
    write_config "false"
    WARP="false"
else
    write_config "$WARP"
fi

/app/opencode2api -config /data/config.json &
PID=$!

# wait for healthz (model refresh can take ~40s)
H=""
for i in $(seq 1 10); do
    sleep 5
    H=$(wget -q -O- "http://127.0.0.1:${PORT}/healthz" 2>/dev/null | head -c 20)
    [ -n "$H" ] && break
done

# backup fallback: warp was supposedly allowed but engine never bound
if [ -z "$H" ] && [ "$WARP" = "true" ]; then
    echo "[lattice] healthz not ready with WARP=true — restarting WITHOUT warp"
    kill "$PID" 2>/dev/null
    sleep 3
    write_config "false"
    exec /app/opencode2api -config /data/config.json
fi

wait "$PID"
