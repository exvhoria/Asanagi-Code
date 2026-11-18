#!/usr/bin/env bash
# Asanagi Gateway — Watchdog Layer 2 (watchdog-of-the-watchdog)
# - watchdog mati  -> start ulang
# - watchdog stuck (heartbeat > 12 menit) -> kill + start ulang
GW=/data/data/com.termux/files/home/.opencode-proxy
LOG=$GW/watchdog2.log
HB=$GW/watchdog.heartbeat
exec 8>"$GW/watchdog2.lock"
flock -n 8 || exit 0

say() { echo "[$(date '+%m-%d %H:%M:%S')] $1" >> "$LOG"; }
start_wd() { nohup "$GW/watchdog.sh" </dev/null >/dev/null 2>&1 8>&- & }

say "=== watchdog2 start (pid $$) ==="
MISS=0
while true; do
    sleep 60 8>&-
    if ! pgrep -f '\.opencode-proxy/watchdog\.sh' >/dev/null 2>&1; then
        say "watchdog MATI -> start ulang"
        start_wd
        MISS=0
        continue
    fi
    NOW=$(date +%s)
    LAST=$(cat "$HB" 2>/dev/null || echo 0)
    case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac
    # Beri grace 1 siklus: watchdog baru menulis heartbeat saat start.
    if [ "$LAST" -lt 1000000000 ]; then
        MISS=$((MISS+1))
        if [ "$MISS" -ge 2 ]; then
            say "watchdog tanpa heartbeat -> kill + start ulang"
            pkill -f '\.opencode-proxy/watchdog\.sh' 2>/dev/null
            sleep 2
            start_wd
            MISS=0
        fi
        continue
    fi
    MISS=0
    AGE=$(( NOW - LAST ))
    if [ "$AGE" -gt 720 ]; then
        say "watchdog STUCK (heartbeat $AGE s) -> kill + start ulang"
        pkill -f '\.opencode-proxy/watchdog\.sh' 2>/dev/null
        sleep 2
        start_wd
    fi
done
