#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Asanagi Code — One-Shot Installer (Termux + PRoot)
#  Termux : curl -fsSL https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main/install.sh | bash
#  PRoot  : bash install.sh   (inside the distro; CLI-only, shares the Termux gateway)
# ═══════════════════════════════════════════════════════════════
set -u
RED='\033[31m'; GREEN='\033[32m'; YELLOW='\033[33m'; CYAN='\033[36m'; NC='\033[0m'
REPO="https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main"
ENGINE_URL="https://github.com/exvhoria/Asanagi-Code/releases/download/engine-v2/opencode2api-linux-arm64"
CLI_URL="https://github.com/sst/opencode/releases/download/v2.2.7/opencode-linux-arm64-musl.tar.gz"
say(){ echo -e "$1"; }
die(){ say "${RED}[-] $1${NC}"; exit 1; }
dl(){ curl -fsSL --retry 3 --retry-delay 2 "$1" -o "$2" || die "Download failed: $1"; }

# ── environment detection ─────────────────────────────────────
MODE="termux"
KREL="$(uname -r 2>/dev/null || true)"
case "$KREL" in *PRoot*|*proot*) MODE="proot" ;; esac
if [ "$MODE" = "termux" ] && { [ "$(id -u)" = "0" ] || [ "${HOME:-}" != /data/data/com.termux/files/home ] || [ ! -d "${PREFIX:-/nonexistent}/bin" ]; }; then
    if [ -d /data/data/com.termux/files/usr ] && [ "$(id -u)" = "0" ]; then
        MODE="proot"
    else
        die "Unsupported environment. Run in Termux as the normal user, or inside PRoot as root."
    fi
fi

ARCH="$(uname -m 2>/dev/null || true)"
if [ "$ARCH" != "aarch64" ] && [ "$ARCH" != "arm64" ]; then
    die "Asanagi Code requires aarch64/ARM64 (detected: ${ARCH:-unknown})."
fi

if [ "$MODE" = "termux" ]; then
    PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
    LIBEXEC="$PREFIX/libexec/asanagi"
    RUNTIME="$PREFIX/lib"
    SYS_BIN="$PREFIX/bin"
    GW="$HOME/.opencode-proxy"
    TMP="${TMPDIR:-$PREFIX/tmp}/asanagi-install.$$"
else
    [ "$(id -u)" = "0" ] || die "PRoot mode must run as root inside the distro (for example: proot-distro login ubuntu)."
    LIBEXEC="${ASANAGI_LIBEXEC:-/usr/local/libexec/asanagi}"
    RUNTIME="$LIBEXEC/runtime"
    SYS_BIN=""
    GW=""
    TMP="${TMPDIR:-/tmp}/asanagi-install.$$"
fi
BIN="$LIBEXEC/asanagi-v2-musl.bin"
MUSL_LOADER="$RUNTIME/ld-musl-aarch64.so.1"
BIN_DIR="$HOME/.local/bin"
CONFIG_DIR="$HOME/.config/opencode"
CFG="$CONFIG_DIR/opencode.jsonc"
trap 'rm -rf "$TMP"' EXIT

say "${CYAN}╭──────────────────────────────────────╮${NC}"
say "${CYAN}│    ✦  A S A N A G I   C O D E  ✦     │${NC}"
say "${CYAN}│   one-shot installer - v2.2.7        │${NC}"
say "${CYAN}╰──────────────────────────────────────╯${NC}"
if [ "$MODE" = "termux" ]; then
    say "${GREEN}[+] Native Termux mode (no PRoot) — recommended.${NC}"
else
    say "${YELLOW}[!] PRoot detected — test mode.${NC}"
    say "${YELLOW}    Asanagi Code is designed to run natively in Termux WITHOUT PRoot.${NC}"
    say "${YELLOW}    PRoot mode installs the CLI only and reuses the gateway running in Termux.${NC}"
    say "${YELLOW}    For the full setup (gateway + watchdog), run this installer directly in Termux.${NC}"
fi

# ── 0. environment sanity ─────────────────────────────────────
if [ "$MODE" = "termux" ]; then
    [ -n "${PREFIX:-}" ] && [ -d "$PREFIX" ] || die "Run this inside Termux (not proot, not a Linux distro)."
    [ "$HOME" = /data/data/com.termux/files/home ] || die "Run in the normal Termux shell; HOME must be the Termux home, not /root."
    mkdir -p "$TMP" "$GW/bin" "$LIBEXEC" "$BIN_DIR" "$SYS_BIN" "$CONFIG_DIR" || \
        die "Cannot create install directories — check storage permissions (termux-setup-storage)."
    chmod -R u+rwX "$GW" 2>/dev/null || true
    chmod -R u+rwX "$LIBEXEC" 2>/dev/null || true
    rm -f "$GW/proxy.pid"
else
    mkdir -p "$TMP" "$LIBEXEC" "$RUNTIME" "$BIN_DIR" "$CONFIG_DIR" || \
        die "Cannot create install directories under $HOME."
fi

# ── 1. dependencies ───────────────────────────────────────────
if [ "$MODE" = "termux" ]; then
    say "${CYAN}[*] Updating package lists (required on fresh Termux)...${NC}"
    pkg update -y >/dev/null 2>&1 || apt update -y >/dev/null 2>&1 \
        || say "${YELLOW}[!] pkg update failed — trying to install anyway${NC}"
    say "${CYAN}[*] Installing dependencies (python, jq, util-linux, patchelf)...${NC}"
    pkg install -y python jq util-linux patchelf >/dev/null 2>&1 \
        || apt install -y python jq util-linux patchelf >/dev/null 2>&1 \
        || say "${YELLOW}[!] pkg/apt failed — trying to continue anyway${NC}"
else
    MISSING=0
    for cmd in curl tar python3 patchelf; do
        command -v "$cmd" >/dev/null 2>&1 || MISSING=1
    done
    if [ "$MISSING" = "1" ]; then
        say "${CYAN}[*] Installing dependencies (curl, tar, python3, patchelf)...${NC}"
        if command -v apt-get >/dev/null 2>&1; then
            apt-get update -y >/dev/null 2>&1 || say "${YELLOW}[!] apt-get update failed — trying to install anyway${NC}"
            DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
                curl ca-certificates tar python3 patchelf >/dev/null 2>&1 \
                || say "${YELLOW}[!] apt-get install failed — trying to continue anyway${NC}"
        elif command -v apk >/dev/null 2>&1; then
            apk add --no-cache curl ca-certificates tar python3 patchelf >/dev/null 2>&1 \
                || say "${YELLOW}[!] apk add failed — trying to continue anyway${NC}"
        fi
    fi
fi

for cmd in curl tar python3 patchelf; do
    command -v "$cmd" >/dev/null 2>&1 || die "Missing '$cmd'. Install it and re-run the installer."
done

# ── 2. musl runtime (Alpine loader + libstdc++/libgcc) ────────
# The musl CLI needs /lib/ld-musl-aarch64.so.1, libstdc++.so.6, libgcc_s.so.1.
# Termux puts them in $PREFIX/lib; PRoot keeps them isolated under the install
# prefix. Downloads come from Alpine's main repository.
ensure_runtime() {
    if [ -x "$MUSL_LOADER" ] && [ -e "$RUNTIME/libstdc++.so.6" ] \
        && [ -e "$RUNTIME/libgcc_s.so.1" ] && [ -e "$RUNTIME/libc.musl-aarch64.so.1" ]; then
        say "${GREEN}[+] musl runtime OK${NC}"
        return 0
    fi
    say "${CYAN}[*] Installing musl runtime (Alpine loader + C++ libs)...${NC}"
    local AB="https://dl-cdn.alpinelinux.org/alpine/latest-stable/main/aarch64"
    local IDX MP LP GP LSTD
    IDX="$(curl -fsSL --connect-timeout 15 --max-time 60 --retry 3 "$AB/" 2>/dev/null)" \
        || die "Cannot reach the Alpine package mirror."
    MP="$(printf '%s\n' "$IDX" | grep -oE 'musl-[0-9][^"<]*\.apk' | sort -uV | tail -1)"
    LP="$(printf '%s\n' "$IDX" | grep -oE 'libstdc\+\+-[0-9][^"<]*\.apk' | sort -uV | tail -1)"
    GP="$(printf '%s\n' "$IDX" | grep -oE 'libgcc-[0-9][^"<]*\.apk' | sort -uV | tail -1)"
    [ -n "$MP" ] && [ -n "$LP" ] && [ -n "$GP" ] || die "Could not find Alpine musl packages."
    mkdir -p "$TMP/rt"
    dl "$AB/$MP" "$TMP/$MP"
    dl "$AB/$LP" "$TMP/$LP"
    dl "$AB/$GP" "$TMP/$GP"
    for p in "$TMP/$MP" "$TMP/$LP" "$TMP/$GP"; do
        tar -xzf "$p" -C "$TMP/rt" 2>/dev/null || die "Failed to extract $(basename "$p")"
    done
    install -m 755 "$TMP/rt/lib/ld-musl-aarch64.so.1" "$RUNTIME/ld-musl-aarch64.so.1"
    ln -sfn ld-musl-aarch64.so.1 "$RUNTIME/libc.musl-aarch64.so.1"
    install -m 755 "$TMP/rt/usr/lib/libgcc_s.so.1" "$RUNTIME/libgcc_s.so.1"
    LSTD="$(ls "$TMP/rt/usr/lib/libstdc++.so.6."* 2>/dev/null | head -1)"
    [ -n "$LSTD" ] || die "libstdc++.so.6 not found in the Alpine package."
    install -m 755 "$LSTD" "$RUNTIME/$(basename "$LSTD")"
    ln -sfn "$(basename "$LSTD")" "$RUNTIME/libstdc++.so.6"
    rm -rf "$TMP/rt"
    say "${GREEN}[+] musl runtime installed ($RUNTIME)${NC}"
}
ensure_runtime

# ── 3. gateway engine (Termux only) ───────────────────────────
if [ "$MODE" = "termux" ]; then
    say "${CYAN}[*] Downloading gateway engine (12 MB)...${NC}"
    dl "$ENGINE_URL" "$GW/bin/opencode2api"
    chmod 771 "$GW/bin/opencode2api"
else
    say "${YELLOW}[!] PRoot: skipping gateway engine — using the Termux gateway.${NC}"
fi

# ── 4. gateway tools + launcher (Termux only) ─────────────────
if [ "$MODE" = "termux" ]; then
    say "${CYAN}[*] Downloading gateway tools + launcher...${NC}"
    dl "$REPO/gateway/opencode-proxy"      "$BIN_DIR/opencode-proxy"
    dl "$REPO/gateway/watchdog.sh"         "$GW/watchdog.sh"
    dl "$REPO/gateway/watchdog2.sh"        "$GW/watchdog2.sh"
    dl "$REPO/gateway/config.example.json" "$GW/config.example.json"
    dl "$REPO/asanagi-launcher"            "$BIN_DIR/opencode"
    chmod +x "$BIN_DIR/opencode" "$BIN_DIR/opencode-proxy" "$GW/watchdog.sh" "$GW/watchdog2.sh"
    ln -sfn "$BIN_DIR/opencode" "$SYS_BIN/asanagi"
fi

# ── 5. OpenCode provider config (written inline) ──────────────
# Generated locally so a one-shot install never depends on a separately
# published template. canonical: "opencode" inherits the full upstream
# metadata (reasoning variants, limits, compatibility) per model id.
TS="$(date +%Y%m%d%H%M%S)"
for f in "$CFG" "$CONFIG_DIR/opencode.json"; do
    [ -f "$f" ] || continue
    BK="$f.bak-$TS"
    cp -p "$f" "$BK" 2>/dev/null || cp "$f" "$BK"
    say "${GREEN}[+] Existing config backed up:${NC} $BK"
done
cat > "$CFG" << 'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "update": "disable",
  "model": "asanagi/deepseek-v4.1-flash-free",
  "permission": {
    "*": "allow",
    "bash": "allow",
    "read": "allow",
    "write": "allow",
    "edit": "allow",
    "glob": "allow",
    "grep": "allow",
    "list": "allow",
    "websearch": "allow"
  },
  "providers": {
    "asanagi": {
      "name": "Asanagi Unlimited",
      // Inherit upstream OpenCode model metadata (reasoning variants, limits,
      // compatibility) for matching model IDs. This is what exposes the full
      // effort ladder, e.g. DeepSeek V4.1 Flash: low / high / max.
      "canonical": "opencode",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "http://127.0.0.1:8123/v1",
        "apiKey": "local-test-key"
      },
      "models": {
        "deepseek-v4.1-flash-free": {
          "name": "[Asanagi] DeepSeek V4.1 Flash"
        },
        "nemotron-3.5-lightning-free": {
          "name": "[Asanagi] Nemotron 3.5 Lightning"
        },
        "nemotron-3.5-super-vl-free": {
          "name": "[Asanagi] Nemotron 3.5 Super VL"
        },
        "flint-40b-free": {
          "name": "[Asanagi] Flint 40B"
        },
        "big-pickle": {
          "name": "[Asanagi] Big Pickle"
        },
        "beam-free": {
          "name": "[Asanagi] Beam"
        },
        "iceman-free": {
          "name": "[Asanagi] Iceman"
        },
        "inkling-2-small-free": {
          "name": "[Asanagi] Inkling 2 Small"
        },
        "longcat-2.5-free": {
          "name": "[Asanagi] LongCat 2.5"
        },
        "mimo-v2.6-flash-free": {
          "name": "[Asanagi] MiMo v2.6 Flash"
        },
        "hy4-flash-free": {
          "name": "[Asanagi] HY4 Flash",
          // Pinned: the CLI 2.2.7 bundled catalog predates hy4, so canonical
          // alone would fall back to low/medium/high and a 200K context limit.
          "limit": { "context": 1048576, "output": 65536 },
          "variants": [
            { "id": "none", "settings": { "reasoningEffort": "none" } },
            { "id": "high", "settings": { "reasoningEffort": "high" } }
          ]
        }
      }
    },
    "openrouter": {
      "name": "openrouter",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "http://127.0.0.1:8085/v1"
      },
      "models": {
        "anthropic/claude-3.7-sonnet": {},
        "anthropic/claude-3.5-sonnet": {},
        "openai/gpt-4o": {},
        "openai/o3-mini": {},
        "deepseek/deepseek-chat": {},
        "google/gemini-2.5-pro": {},
        "meta-llama/llama-3.3-70b-instruct": {}
      }
    }
  }
}
JSON
chmod 600 "$CFG"
python3 - "$CFG" << 'PY' || die "Generated OpenCode config is invalid"
import json, sys
src = open(sys.argv[1]).read()
out, i, n, in_str, esc = [], 0, len(src), False, False
while i < n:
    c = src[i]
    if in_str:
        out.append(c)
        if esc:
            esc = False
        elif c == '\\':
            esc = True
        elif c == '"':
            in_str = False
        i += 1
    elif c == '"':
        in_str = True
        out.append(c)
        i += 1
    elif c == '/' and i + 1 < n and src[i+1] == '/':
        while i < n and src[i] != '\n':
            i += 1
    else:
        out.append(c)
        i += 1
cfg = json.loads(''.join(out))
n = len(cfg['providers']['asanagi']['models'])
print('[+] OpenCode config written and validated (%d asanagi models)' % n)
PY

# ── 6. active gateway config (Termux only, port 8123) ─────────
if [ "$MODE" = "termux" ]; then
    python3 - "$GW/config.example.json" "$GW/config.json" << 'PY'
import json, sys
c = json.load(open(sys.argv[1]))
c['listen'] = '127.0.0.1:8123'
c['server_keys'] = ['local-test-key']
c.setdefault('webui', {})['listen'] = '127.0.0.1:8124'
json.dump(c, open(sys.argv[2], 'w'), indent=2)
print('[+] gateway config written (port 8123)')
PY
fi

# ── 7. OpenCode CLI v2.2.7 musl (253 MB) ──────────────────────
if [ -x "$BIN" ]; then
    say "${GREEN}[+] CLI already installed, skipping download.${NC}"
else
    if [ -n "${ASANAGI_TARBALL:-}" ] && [ -f "$ASANAGI_TARBALL" ]; then
        say "${CYAN}[*] Using local CLI tarball: $ASANAGI_TARBALL${NC}"
        cp "$ASANAGI_TARBALL" "$TMP/cli.tar.gz"
    else
        say "${CYAN}[*] Downloading OpenCode CLI v2.2.7 musl (253 MB — be patient)...${NC}"
        curl -fSL --retry 3 --retry-delay 2 "$CLI_URL" -o "$TMP/cli.tar.gz" || die "CLI download failed"
    fi
    tar -xzf "$TMP/cli.tar.gz" -C "$TMP" || die "CLI extract failed"
    FIND=$(find "$TMP" -name 'opencode*' -type f -perm -u+x | head -1)
    [ -n "$FIND" ] && mv "$FIND" "$BIN" && chmod +x "$BIN" \
        || die "CLI binary not found in archive"
    rm -rf "$TMP/package" "$TMP/cli.tar.gz"
fi

say "${CYAN}[*] Patching CLI interpreter (musl)...${NC}"
patchelf --set-interpreter "$MUSL_LOADER" "$BIN" || die "patchelf failed."
patchelf --set-rpath "$RUNTIME" "$BIN" >/dev/null 2>&1 || true
CLI_VER="$(env LD_LIBRARY_PATH="$RUNTIME" "$BIN" --version 2>&1)" \
    || die "CLI smoke test failed: $CLI_VER"
say "${GREEN}[+] CLI ready: $CLI_VER${NC}"

# ── 8. PRoot launcher (never replaces the original opencode) ──
if [ "$MODE" = "proot" ]; then
    say "${CYAN}[*] Installing launcher (original 'opencode' left untouched)...${NC}"
    for name in asanagi opencode-asanagi; do
        cat > "$BIN_DIR/$name" << EOF
#!/usr/bin/env bash
exec "$BIN" "\$@"
EOF
        chmod +x "$BIN_DIR/$name"
    done
    say "${GREEN}[+] Launchers:${NC} $BIN_DIR/asanagi, $BIN_DIR/opencode-asanagi"
fi

# ── 9. start watchdog + gateway (Termux only) ─────────────────
if [ "$MODE" = "termux" ]; then
    say "${CYAN}[*] Starting gateway + watchdog...${NC}"
    touch "$GW/proxy.log" "$GW/watchdog.log" 2>/dev/null || die "Cannot write in $GW — fix permissions and re-run."
    "$BIN_DIR/opencode-proxy" start || die "Gateway startup failed — check $GW/proxy.log"
    nohup "$GW/watchdog.sh" </dev/null >/dev/null 2>&1 &
    nohup "$GW/watchdog2.sh" </dev/null >/dev/null 2>&1 &
else
    say "${CYAN}[*] Checking the Termux gateway on 127.0.0.1:8123...${NC}"
    if curl -fsS --max-time 5 http://127.0.0.1:8123/healthz >/dev/null 2>&1; then
        say "${GREEN}[+] Termux gateway reachable.${NC}"
    else
        say "${YELLOW}[!] Gateway not reachable. Start it in Termux with: opencode-proxy start${NC}"
    fi
fi

say ""
say "${GREEN}╭──────────────────────────────────────╮${NC}"
say "${GREEN}│   ✦  INSTALLATION COMPLETE  ✦        │${NC}"
say "${GREEN}╰──────────────────────────────────────╯${NC}"
if [ "$MODE" = "termux" ]; then
    say "  Run        : ${CYAN}asanagi${NC}"
    say "  Gateway    : http://127.0.0.1:8123 (watchdog supervised)"
    say "  Free models: deepseek-v4.1-flash-free, big-pickle, +9 more (11 total)"
else
    say "  Run        : ${CYAN}asanagi${NC}  (or ${CYAN}opencode-asanagi${NC})"
    say "  CLI        : $BIN"
    say "  Gateway    : http://127.0.0.1:8123 (runs in Termux)"
    say "  Note       : original 'opencode' in this distro was not modified"
    say ""
    say "${YELLOW}  Reminder: Asanagi Code runs natively in Termux without PRoot."
    say "  Re-run this installer directly in Termux for the full gateway setup.${NC}"
fi
