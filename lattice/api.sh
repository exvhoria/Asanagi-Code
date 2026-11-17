#!/usr/bin/env bash
# Lattice API — service manager
# usage: api.sh start|stop|status|logs [n]
GW=/data/data/com.termux/files/home/lattice
HEALTH=http://127.0.0.1:8133/healthz

case "$1" in
start)
    if timeout 2 curl -s "$HEALTH" >/dev/null 2>&1; then
        echo "[+] API already running: $HEALTH"
        exit 0
    fi
    # watchdog dijamin hidup
    pgrep -f "lattice-watchdog" >/dev/null 2>&1 || \
        ( cd "$GW" && nohup ./lattice-watchdog.sh >/dev/null 2>&1 & )
    # gateway distart langsung (tidak nunggu loop watchdog)
    if ! pgrep -f "lattice/bin/opencode2api" >/dev/null 2>&1; then
        echo "[*] starting API gateway (port 8133, watchdog supervised)..."
        nohup "$GW/bin/opencode2api" -config "$GW/config.json" >> "$GW/api-gateway.log" 2>&1 &
    else
        echo "[*] gateway process ada, nunggu healthz..."
    fi
    H=""
    for i in $(seq 1 12); do
        sleep 7
        H=$(timeout 5 curl -s "$HEALTH" | head -c 10)
        [ -n "$H" ] && break
    done
    if [ -n "$H" ]; then
        echo "[+] API ready: $HEALTH"
        echo "    base_url : http://127.0.0.1:8133/v1"
        echo "    api_key  : Lattice"
    else
        echo "[-] not ready — check: tail $GW/api-gateway.log"
        exit 1
    fi
    ;;
stop)
    pkill -9 -f "lattice/bin/opencode2api" 2>/dev/null
    pkill -f "lattice-watchdog" 2>/dev/null
    echo "[+] API stopped"
    ;;
status)
    R=$(timeout 5 curl -s "$HEALTH")
    if [ -n "$R" ]; then
        echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin); w=d['warp']
print('status :', d['status'])
print('warp   :', w['status'], '-', w['active'], 'exit aktif')
print('models :', d['models']['exposed'], 'exposed /', d['models']['total'])" 2>/dev/null || echo "$R"
    else
        echo "[-] API down (jalan: $GW/api.sh start)"
    fi
    ;;
logs)
    tail -n "${2:-20}" "$GW/api-gateway.log" 2>/dev/null
    ;;
*)
    echo "usage: api.sh start|stop|status|logs [n]"
    ;;
esac
