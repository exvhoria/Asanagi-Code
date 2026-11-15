#!/usr/bin/env bash
# Asanagi Gateway Watchdog — produksi
# - Healthz gagal 2x berturut -> hard kill + start ulang (jalur nohup proven)
# - 429 storm (>=6 dari 20 request terakhir) -> bersihkan state + restart
# - Log: watchdog.log di folder gateway
GW=/data/data/com.termux/files/home/.opencode-proxy
HEALTH=http://127.0.0.1:8123/healthz
LOG=$GW/watchdog.log
FAILS=0

say() { echo "[$(date '+%m-%d %H:%M:%S')] $1" >> "$LOG"; }

kill_gw() {
    /data/data/com.termux/files/usr/bin/bash -c 'pkill -9 -f "opencode2ap[i] -config"' 2>/dev/null
    sleep 6
}

start_gw() {
    cd "$GW" || return 1
    rm -f proxy.pid
    nohup ./bin/opencode2api -config config.json >> proxy.log 2>&1 &
    sleep 35
    for i in $(seq 1 10); do
        H=$(timeout 5 curl -s "$HEALTH" | head -c 10)
        [ -n "$H" ] && { say "gateway pulih (attempt $i)"; return 0; }
        sleep 6
    done
    say "WARNING: gateway belum ready 10 attempt setelah start"
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
while true; do
    sleep 45
    H=$(timeout 5 curl -s "$HEALTH" | head -c 10)
    if [ -n "$H" ]; then
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
