#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Asanagi Code — One-Shot Installer (Termux)
#  Run:  curl -fsSL https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main/install.sh | bash
# ═══════════════════════════════════════════════════════════════
set -u
RED='\033[31m'; GREEN='\033[32m'; YELLOW='\033[33m'; CYAN='\033[36m'; NC='\033[0m'
REPO="https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main"
ENGINE_URL="https://github.com/exvhoria/Asanagi-Code/releases/download/engine-v1/opencode2api-linux-arm64"
CLI_URL="https://github.com/sst/opencode/releases/download/v2.2.7/opencode-linux-arm64-musl.tar.gz"
GW="$HOME/.opencode-proxy"
LIBEXEC="$PREFIX/libexec/asanagi"
TMP="${TMPDIR:-$PREFIX/tmp}/asanagi-install.$$"
say(){ echo -e "$1"; }
die(){ say "${RED}[-] $1${NC}"; exit 1; }

say "${CYAN}╭──────────────────────────────────────╮${NC}"
say "${CYAN}│   ✦  A S A N A G I   C O D E  ✦     │${NC}"
say "${CYAN}│   one-shot installer · v2.2.7        │${NC}"
say "${CYAN}╰──────────────────────────────────────╯${NC}"

[ -n "${PREFIX:-}" ] && [ -d "$PREFIX" ] || die "Jalankan ini di Termux (bukan proot/root)."
mkdir -p "$TMP" "$GW/bin" "$LIBEXEC" "$HOME/.local/bin" "$PREFIX/bin" "$HOME/.config/opencode"

# ── 1. dependensi ──────────────────────────────────────────────
say "${CYAN}[*] Install dependensi Termux (musl, proot, python)...${NC}"
pkg install -y musl proot python >/dev/null 2>&1 || true
[ -x "$PREFIX/lib/ld-musl-aarch64.so.1" ] || say "${YELLOW}[!] musl loader tidak ada — CLI mungkin tak jalan${NC}"

# ── 2. engine gateway (static, session re-mint) ───────────────
say "${CYAN}[*] Download gateway engine (12 MB)...${NC}"
curl -fsSL "$ENGINE_URL" -o "$GW/bin/opencode2api" || die "gagal download engine"
chmod 771 "$GW/bin/opencode2api"

# ── 3. file gateway + launcher ────────────────────────────────
say "${CYAN}[*] Download gateway tools + launcher...${NC}"
curl -fsSL "$REPO/gateway/opencode-proxy"    -o "$HOME/.local/bin/opencode-proxy" || die "opencode-proxy"
curl -fsSL "$REPO/gateway/watchdog.sh"       -o "$GW/watchdog.sh"                 || die "watchdog"
curl -fsSL "$REPO/gateway/daemon_spawn.py"   -o "$GW/daemon_spawn.py"             || die "daemon_spawn"
curl -fsSL "$REPO/gateway/config.example.json" -o "$GW/config.example.json"       || die "config example"
curl -fsSL "$REPO/gateway/opencode.example.jsonc" -o "$HOME/.config/opencode/opencode.jsonc" || die "opencode.jsonc"
curl -fsSL "$REPO/asanagi-launcher"          -o "$HOME/.local/bin/opencode"       || die "launcher"
chmod +x "$HOME/.local/bin/opencode" "$HOME/.local/bin/opencode-proxy" "$GW/watchdog.sh"
ln -sf "$HOME/.local/bin/opencode" "$PREFIX/bin/asanagi"

# ── 4. config gateway aktif (port 8123) ───────────────────────
python3 - "$GW/config.example.json" "$GW/config.json" << 'PY'
import json, sys
c = json.load(open(sys.argv[1]))
c['listen'] = '127.0.0.1:8123'
c['server_keys'] = ['local-test-key']
c.setdefault('webui', {})['listen'] = '127.0.0.1:8124'
json.dump(c, open(sys.argv[2], 'w'), indent=2)
print('config.json ok (port 8123)')
PY

# ── 5. OpenCode CLI v2.2.7 musl (253 MB, sabar...) ────────────
if [ ! -x "$LIBEXEC/asanagi-v2-musl.bin" ]; then
    say "${CYAN}[*] Download OpenCode CLI v2.2.7 musl (253 MB)...${NC}"
    curl -fSL "$CLI_URL" -o "$TMP/cli.tar.gz" || die "gagal download CLI"
    tar -xzf "$TMP/cli.tar.gz" -C "$TMP" || die "gagal extract CLI"
    FIND=$(find "$TMP" -name 'opencode*' -type f -perm -u+x | head -1)
    [ -n "$FIND" ] && mv "$FIND" "$LIBEXEC/asanagi-v2-musl.bin" && chmod +x "$LIBEXEC/asanagi-v2-musl.bin" \
        || die "binary CLI tidak ditemukan di arsip"
    rm -rf "$TMP"
else
    say "${GREEN}[+] CLI sudah ada, skip download.${NC}"
fi

# ── 6. start watchdog + gateway ───────────────────────────────
say "${CYAN}[*] Start gateway + watchdog...${NC}"
( cd "$GW" && nohup ./watchdog.sh >/dev/null 2>&1 & )
sleep 45
for i in $(seq 1 10); do
    H=$(timeout 5 curl -s http://127.0.0.1:8123/healthz 2>/dev/null | head -c 10)
    [ -n "$H" ] && break
    sleep 6
done
[ -n "$H" ] || die "gateway tidak ready — cek $GW/proxy.log"

say ""
say "${GREEN}╭──────────────────────────────────────╮${NC}"
say "${GREEN}│   ✦  INSTALASI BERHASIL  ✦          │${NC}"
say "${GREEN}╰──────────────────────────────────────╯${NC}"
say "  Jalankan   : ${CYAN}asanagi${NC}"
say "  Gateway    : http://127.0.0.1:8123 (watchdog supervised)"
say "  Model free : glm-5.3-flash-free, deepseek-v4.1-flash-free, +10 lagi"
