#!/usr/bin/env bash
# Asanagi Gateway Watchdog — produksi
# - Healthz gagal 2x berturut -> hard kill + start ulang (jalur nohup proven)
# - 429 storm (>=6 dari 20 request terakhir) -> bersihkan state + restart
# - Log: watchdog.log di folder gateway
GW=/data/data/com.termux/files/home/.opencode-proxy
HEALTH=http://127.0.0.1:8123/healthz
LOG=$GW/watchdog.log
FAILS=0
MANAGER=/data/data/com.termux/files/home/.local/bin/opencode-proxy

# One supervisor per installation. The gateway manager also serializes starts.
exec 8>"$GW/watchdog.lock"
flock -n 8 || exit 0

say() { echo "[$(date '+%m-%d %H:%M:%S')] $1" >> "$LOG"; }

kill_gw() {
    "$MANAGER" stop 8>&- >> "$LOG" 2>&1
}

start_gw() {
    if "$MANAGER" start 8>&- >> "$LOG" 2>&1; then
        say "gateway recovered"
        return 0
    fi
    say "WARNING: gateway startup failed; see proxy.log"
    return 1
}

storm() {
    grep 'request_routed' "$GW/proxy.log" 2>/dev/null | tail -20 | grep -c '"status":429'
}

clean_state() {
    cd "$GW" || return
    rm -f config.json.*.json config.json.models.* config.json.rotation.json server_key_metadata* 2>/dev/null
    say "state files dibersihkan"
}

say "=== watchdog start (pid $$) ==="
date +%s > "$GW/watchdog.heartbeat"
while true; do
    date +%s > "$GW/watchdog.heartbeat"
    sleep 30 8>&-
    if curl --noproxy '*' -fsS --connect-timeout 2 --max-time 3 "$HEALTH" 2>/dev/null |
        jq -e '.ready == true and .status == "ok"' >/dev/null 2>&1; then
        FAILS=0
        S=$(storm)
        if [ "${S:-0}" -ge 6 ]; then
            say "429 STORM terdeteksi ($S/20) -> clean state + restart"
            kill_gw
            clean_state
            start_gw
        fi
    else
        FAILS=$((FAILS+1))
        say "healthz gagal ($FAILS/2)"
        if [ "$FAILS" -ge 2 ]; then
            say "RESTART gateway (healthz mati/wedge)"
            kill_gw
            start_gw
            FAILS=0
        fi
    fi
done
