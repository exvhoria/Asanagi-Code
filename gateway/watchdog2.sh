#!/usr/bin/env bash
# Asanagi Gateway — Watchdog Layer 2 (watchdog-of-the-watchdog)
# - watchdog mati  -> start ulang
# - watchdog stuck (heartbeat > 12 menit) -> kill + start ulang
GW=/data/data/com.termux/files/home/.opencode-proxy
LOG=$GW/watchdog2.log
HB=$GW/watchdog.heartbeat

say() { echo "[$(date '+%m-%d %H:%M:%S')] $1" >> "$LOG"; }
start_wd() { ( cd "$GW" && nohup ./watchdog.sh >/dev/null 2>&1 & ); }

say "=== watchdog2 start (pid $$) ==="
while true; do
    sleep 60
    if ! pgrep -f "watchdog.s[h]" >/dev/null 2>&1; then
        say "watchdog MATI -> start ulang"
        start_wd
        continue
    fi
    NOW=$(date +%s)
    LAST=$(cat "$HB" 2>/dev/null || echo 0)
    AGE=$(( NOW - LAST ))
    if [ "$AGE" -gt 720 ]; then
        say "watchdog STUCK (heartbeat $AGE s) -> kill + start ulang"
        pkill -f "watchdog.s[h]" 2>/dev/null
        sleep 2
        start_wd
    fi
done
