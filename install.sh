#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Asanagi Code — One-Shot Installer (Termux, ARM64)
#  Run:  curl -fsSL https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main/install.sh | bash
# ═══════════════════════════════════════════════════════════════
set -u
RED='\033[31m'; GREEN='\033[32m'; YELLOW='\033[33m'; CYAN='\033[36m'; NC='\033[0m'
REPO="https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main"
ENGINE_URL="https://github.com/exvhoria/Asanagi-Code/releases/download/engine-v2/opencode2api-linux-arm64"
CLI_URL="https://github.com/sst/opencode/releases/download/v2.2.7/opencode-linux-arm64-musl.tar.gz"
GW="$HOME/.opencode-proxy"
LIBEXEC="$PREFIX/libexec/asanagi"
TMP="${TMPDIR:-$PREFIX/tmp}/asanagi-install.$$"
say(){ echo -e "$1"; }
die(){ say "${RED}[-] $1${NC}"; exit 1; }
dl(){ curl -fsSL --retry 3 --retry-delay 2 "$1" -o "$2" || die "Download failed: $1"; }

say "${CYAN}╭──────────────────────────────────────╮${NC}"
say "${CYAN}│    ✦  A S A N A G I   C O D E  ✦     │${NC}"
say "${CYAN}│   one-shot installer - v2.2.7        │${NC}"
say "${CYAN}╰──────────────────────────────────────╯${NC}"

# ── 0. environment sanity ─────────────────────────────────────
[ -n "${PREFIX:-}" ] && [ -d "$PREFIX" ] || die "Run this inside Termux (not proot, not Linux distro)."
if [ "$(id -u)" = "0" ]; then
    die "Running as root is not supported (pkg/apt break and files get wrong ownership).
    Open Termux as the NORMAL user and run the installer again."
fi
mkdir -p "$TMP" "$GW/bin" "$LIBEXEC" "$HOME/.local/bin" "$PREFIX/bin" "$HOME/.config/opencode" || \
    die "Cannot create install directories — check storage permissions (termux-setup-storage)."

# repair ownership/permissions from any previous broken install
chmod -R u+rwX "$GW" 2>/dev/null || true
chmod -R u+rwX "$LIBEXEC" 2>/dev/null || true
rm -f "$GW/proxy.pid"

# ── 1. dependencies ───────────────────────────────────────────
say "${CYAN}[*] Updating package lists (required on fresh Termux)...${NC}"
pkg update -y >/dev/null 2>&1 || apt update -y >/dev/null 2>&1 \
    || say "${YELLOW}[!] pkg update failed — trying to install anyway${NC}"
say "${CYAN}[*] Installing dependencies (proot, python)...${NC}"
pkg install -y proot python >/dev/null 2>&1 \
    || apt install -y proot python >/dev/null 2>&1 \
    || say "${YELLOW}[!] pkg/apt failed — trying to continue anyway${NC}"

# musl loader ships bundled with this repo — no pkg needed
if [ -x "$PREFIX/lib/ld-musl-aarch64.so.1" ]; then
    say "${GREEN}[+] musl loader OK${NC}"
else
    say "${CYAN}[*] Installing bundled musl loader (723 KB)...${NC}"
    dl "$REPO/vendor/ld-musl-aarch64.so.1" "$PREFIX/lib/ld-musl-aarch64.so.1"
    chmod +x "$PREFIX/lib/ld-musl-aarch64.so.1"
    [ -x "$PREFIX/lib/ld-musl-aarch64.so.1" ] \
        && say "${GREEN}[+] musl loader installed${NC}" \
        || die "Could not install the musl loader. Check your network and re-run."
fi
command -v python3 >/dev/null 2>&1 || die "python3 missing. Run: pkg update && pkg install python"

# ── 2. gateway engine (static build, session re-mint) ─────────
say "${CYAN}[*] Downloading gateway engine (12 MB)...${NC}"
dl "$ENGINE_URL" "$GW/bin/opencode2api"
chmod 771 "$GW/bin/opencode2api"

# ── 3. gateway tools + launcher + configs ─────────────────────
say "${CYAN}[*] Downloading gateway tools + launcher...${NC}"
dl "$REPO/gateway/opencode-proxy"      "$HOME/.local/bin/opencode-proxy"
dl "$REPO/gateway/watchdog.sh"         "$GW/watchdog.sh"
dl "$REPO/gateway/daemon_spawn.py"     "$GW/daemon_spawn.py"
dl "$REPO/gateway/config.example.json" "$GW/config.example.json"
dl "$REPO/gateway/opencode.example.jsonc" "$HOME/.config/opencode/opencode.jsonc"
dl "$REPO/asanagi-launcher"            "$HOME/.local/bin/opencode"
chmod +x "$HOME/.local/bin/opencode" "$HOME/.local/bin/opencode-proxy" "$GW/watchdog.sh"
ln -sf "$HOME/.local/bin/opencode" "$PREFIX/bin/asanagi"

# ── 4. active gateway config (port 8123) ──────────────────────
python3 - "$GW/config.example.json" "$GW/config.json" << 'PY'
import json, sys
c = json.load(open(sys.argv[1]))
c['listen'] = '127.0.0.1:8123'
c['server_keys'] = ['local-test-key']
c.setdefault('webui', {})['listen'] = '127.0.0.1:8124'
json.dump(c, open(sys.argv[2], 'w'), indent=2)
print('[+] gateway config written (port 8123)')
PY

# ── 5. OpenCode CLI v2.2.7 musl (253 MB) ──────────────────────
if [ -x "$LIBEXEC/asanagi-v2-musl.bin" ]; then
    say "${GREEN}[+] CLI already installed, skipping download.${NC}"
else
    say "${CYAN}[*] Downloading OpenCode CLI v2.2.7 musl (253 MB — be patient)...${NC}"
    curl -fSL --retry 3 --retry-delay 2 "$CLI_URL" -o "$TMP/cli.tar.gz" || die "CLI download failed"
    tar -xzf "$TMP/cli.tar.gz" -C "$TMP" || die "CLI extract failed"
    FIND=$(find "$TMP" -name 'opencode*' -type f -perm -u+x | head -1)
    [ -n "$FIND" ] && mv "$FIND" "$LIBEXEC/asanagi-v2-musl.bin" && chmod +x "$LIBEXEC/asanagi-v2-musl.bin" \
        || die "CLI binary not found in archive"
    rm -rf "$TMP"
fi

# ── 6. start watchdog + gateway ───────────────────────────────
say "${CYAN}[*] Starting gateway + watchdog...${NC}"
touch "$GW/proxy.log" "$GW/watchdog.log" 2>/dev/null || die "Cannot write in $GW — fix permissions and re-run."
( cd "$GW" && nohup ./watchdog.sh >/dev/null 2>&1 & )
sleep 45
H=""
for i in $(seq 1 10); do
    H=$(timeout 5 curl -s http://127.0.0.1:8123/healthz 2>/dev/null | head -c 10)
    [ -n "$H" ] && break
    say "${YELLOW}[~] waiting for gateway ($i/10)...${NC}"
    sleep 6
done
[ -n "$H" ] || die "Gateway not ready — check logs: cat $GW/proxy.log"

say ""
say "${GREEN}╭──────────────────────────────────────╮${NC}"
say "${GREEN}│   ✦  INSTALLATION COMPLETE  ✦        │${NC}"
say "${GREEN}╰──────────────────────────────────────╯${NC}"
say "  Run        : ${CYAN}asanagi${NC}"
say "  Gateway    : http://127.0.0.1:8123 (watchdog supervised)"
say "  Free models: glm-5.3-flash-free, deepseek-v4.1-flash-free, +10 more"
