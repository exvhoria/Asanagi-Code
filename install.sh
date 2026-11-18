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
[ "$HOME" = /data/data/com.termux/files/home ] || die "Run in the normal Termux shell; HOME must be the Termux home, not /root."
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
say "${CYAN}[*] Installing dependencies (python, jq, util-linux)...${NC}"
pkg install -y python jq util-linux >/dev/null 2>&1 \
    || apt install -y python jq util-linux >/dev/null 2>&1 \
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

# ── 3. gateway tools + launcher ───────────────────────────────
say "${CYAN}[*] Downloading gateway tools + launcher...${NC}"
dl "$REPO/gateway/opencode-proxy"      "$HOME/.local/bin/opencode-proxy"
dl "$REPO/gateway/watchdog.sh"         "$GW/watchdog.sh"
dl "$REPO/gateway/watchdog2.sh"        "$GW/watchdog2.sh"
dl "$REPO/gateway/config.example.json" "$GW/config.example.json"
dl "$REPO/asanagi-launcher"            "$HOME/.local/bin/opencode"
chmod +x "$HOME/.local/bin/opencode" "$HOME/.local/bin/opencode-proxy" "$GW/watchdog.sh" "$GW/watchdog2.sh"
ln -sfn /data/data/com.termux/files/home/.local/bin/opencode "$PREFIX/bin/asanagi"
ln -sfn /data/data/com.termux/files/home/.local/bin/opencode "$PREFIX/bin/opencode"

# ── 4. OpenCode provider config (written inline) ──────────────
# Generated locally so a one-shot install never depends on a separately
# published template. canonical: "opencode" inherits the full upstream
# metadata (reasoning variants, limits, compatibility) per model id.
CFG="$HOME/.config/opencode/opencode.jsonc"
if [ -f "$CFG" ]; then
    BK="$CFG.bak-$(date +%Y%m%d%H%M%S)"
    cp -p "$CFG" "$BK" 2>/dev/null || cp "$CFG" "$BK"
    say "${GREEN}[+] Existing OpenCode config backed up:${NC} $BK"
fi
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

# ── 5. active gateway config (port 8123) ──────────────────────
python3 - "$GW/config.example.json" "$GW/config.json" << 'PY'
import json, sys
c = json.load(open(sys.argv[1]))
c['listen'] = '127.0.0.1:8123'
c['server_keys'] = ['local-test-key']
c.setdefault('webui', {})['listen'] = '127.0.0.1:8124'
json.dump(c, open(sys.argv[2], 'w'), indent=2)
print('[+] gateway config written (port 8123)')
PY

# ── 6. OpenCode CLI v2.2.7 musl (253 MB) ──────────────────────
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

# ── 7. start watchdog + gateway ───────────────────────────────
say "${CYAN}[*] Starting gateway + watchdog...${NC}"
touch "$GW/proxy.log" "$GW/watchdog.log" 2>/dev/null || die "Cannot write in $GW — fix permissions and re-run."
"$HOME/.local/bin/opencode-proxy" start || die "Gateway startup failed — check $GW/proxy.log"
nohup "$GW/watchdog.sh" </dev/null >/dev/null 2>&1 &
nohup "$GW/watchdog2.sh" </dev/null >/dev/null 2>&1 &

say ""
say "${GREEN}╭──────────────────────────────────────╮${NC}"
say "${GREEN}│   ✦  INSTALLATION COMPLETE  ✦        │${NC}"
say "${GREEN}╰──────────────────────────────────────╯${NC}"
say "  Run        : ${CYAN}asanagi${NC}"
say "  Gateway    : http://127.0.0.1:8123 (watchdog supervised)"
say "  Free models: deepseek-v4.1-flash-free, big-pickle, +9 more (11 total)"
