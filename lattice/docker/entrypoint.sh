#!/bin/sh
# Lattice — container entrypoint
# - Writes config.json into /data (the persistent data folder)
# - Starts the engine; if WARP init fails (host blocks UDP) it
#   automatically restarts WITHOUT warp and keeps serving.
set -u
PORT="${PORT:-8133}"
API_KEY="${API_KEY:-Lattice}"
WARP="${WARP:-true}"

write_config() {
    cat > /data/config.json <<EOF
{
  "listen": "0.0.0.0:${PORT}",
  "server_keys": ["${API_KEY}"],
  "webui": { "enabled": false },
  "warp": { "enabled": $1, "pool_size": 6, "stack": "ipv6" }
}
EOF
}

write_config "$WARP"
/app/opencode2api -config /data/config.json &
PID=$!

# wait for healthz (model refresh can take ~40s)
H=""
for i in $(seq 1 12); do
    sleep 8
    H=$(wget -q -O- "http://127.0.0.1:${PORT}/healthz" 2>/dev/null | head -c 20)
    [ -n "$H" ] && break
done

if [ -z "$H" ] && [ "$WARP" = "true" ]; then
    echo "[lattice] healthz not ready with WARP=true — host likely blocks UDP, restarting WITHOUT warp"
    kill "$PID" 2>/dev/null
    sleep 3
    write_config "false"
    exec /app/opencode2api -config /data/config.json
fi

wait "$PID"
