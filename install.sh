#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Asanagi Code — One-Shot Installer (Termux + PRoot)
#  Termux : curl -fsSL https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main/install.sh | bash
#  PRoot  : bash install.sh   (inside the distro; CLI-only, shares the Termux gateway)
# ═══════════════════════════════════════════════════════════════
set -u
RED='\033[31m'; GREEN='\033[32m'; YELLOW='\033[33m'; CYAN='\033[36m'; NC='\033[0m'
BOLD='\033[1m'; DIM='\033[2m'
REPO="https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main"
ENGINE_URL="https://github.com/exvhoria/Asanagi-Code/releases/download/engine-v2/opencode2api-linux-arm64"
CLI_URL="https://github.com/sst/opencode/releases/download/v2.2.7/opencode-linux-arm64-musl.tar.gz"
say(){ echo -e "$1"; }
die(){ printf "\r  ${RED}✖${NC} %s\n" "$1" >&2; exit 1; }
dl(){ curl -fsSL --retry 3 --retry-delay 2 "$1" -o "$2" || die "Download failed: $(basename "$2")"; }
ok(){ printf "  ${GREEN}✔${NC} %s\n" "$1"; }
skip(){ printf "  ${YELLOW}•${NC} %s\n" "$1"; }
note(){ printf "  ${CYAN}•${NC} %s\n" "$1"; }

human(){
    local b="${1:-0}"
    if   [ "$b" -ge 1073741824 ]; then printf "%d.%d GB" $((b/1073741824)) $((b%1073741824*10/1073741824))
    elif [ "$b" -ge 1048576 ];    then printf "%d.%d MB" $((b/1048576)) $((b%1048576*10/1048576))
    elif [ "$b" -ge 1024 ];       then printf "%d KB" $((b/1024))
    else printf "%d B" "$b"; fi
}

run_spin(){
    local label="$1"; shift
    local log="$TMP/spin.log" pid frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' i=0
    "$@" >"$log" 2>&1 &
    pid=$!
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r  ${CYAN}%s${NC} %-34s\033[K" "${frames:$((i%10)):1}" "$label"
        i=$((i+1)); sleep 0.1
    done
    if wait "$pid"; then
        printf "\r  ${GREEN}✔${NC} %-40s\033[K\n" "$label"
    else
        printf "\r  ${RED}✖${NC} %-40s\033[K\n" "$label"
        [ -s "$log" ] && tail -4 "$log" | sed 's/^/      /'
        return 1
    fi
}

download_bar(){
    local url="$1" out="$2" label="$3"
    local total cur pct width filled empty speed elapsed now pid bar j
    total="$(curl -fsIL --connect-timeout 15 --max-time 30 "$url" 2>/dev/null \
        | tr -d '\r' | awk 'tolower($1)=="content-length:"{v=$2} END{print v+0}')"
    rm -f "$out"
    curl -fsSL --retry 2 --retry-delay 2 "$url" -o "$out" 2>/dev/null &
    pid=$!
    local start; start=$(date +%s)
    while kill -0 "$pid" 2>/dev/null; do
        cur=0; [ -f "$out" ] && cur=$(stat -c %s "$out" 2>/dev/null || echo 0)
        now=$(date +%s); elapsed=$((now-start)); [ "$elapsed" -lt 1 ] && elapsed=1
        speed=$((cur/elapsed))
        width=$(( ${COLUMNS:-70} - 58 )); [ "$width" -lt 8 ] && width=8; [ "$width" -gt 24 ] && width=24
        if [ "$total" -gt 0 ]; then pct=$((cur*100/total)); [ "$pct" -gt 100 ] && pct=100; else pct=0; fi
        filled=$((pct*width/100)); empty=$((width-filled))
        bar=""
        for ((j=0;j<filled;j++)); do bar+="█"; done
        for ((j=0;j<empty;j++)); do bar+="░"; done
        printf "\r  ${CYAN}↓${NC} %-14s ${CYAN}%s${NC} %3d%% %s" "$label" "$bar" "$pct" "$(human "$cur")"
        [ "$total" -gt 0 ] && printf "/%s" "$(human "$total")"
        printf " %s/s\033[K    " "$(human "$speed")"
        sleep 0.2
    done
    if wait "$pid"; then
        printf "\r  ${GREEN}✔${NC} %-14s %s downloaded\033[K\n" "$label" "$(human "$(stat -c %s "$out" 2>/dev/null || echo 0)")"
    else
        printf "\r  ${RED}✖${NC} %-14s download failed\n" "$label"
        return 1
    fi
}

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

# ── banner ────────────────────────────────────────────────────
printf "\n  ${CYAN}✦${NC} ${BOLD}ASANAGI CODE${NC} ${DIM}installer v2.2.7${NC}\n"
if [ "$MODE" = "termux" ]; then
    printf "  native Termux (no PRoot) — recommended\n\n"
else
    printf "  PRoot test mode · gateway: Termux :8123\n"
    printf "  ${YELLOW}⚠ Asanagi Code works natively in Termux without PRoot.${NC}\n"
    printf "  ${YELLOW}⚠ CLI-only here · original 'opencode' is untouched.${NC}\n\n"
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
install_deps(){
    if [ "$MODE" = "termux" ]; then
        pkg update -y >/dev/null 2>&1 || apt update -y >/dev/null 2>&1 || true
        pkg install -y python jq util-linux patchelf >/dev/null 2>&1 \
            || apt install -y python jq util-linux patchelf >/dev/null 2>&1 || true
    else
        local MISSING=0 cmd
        for cmd in curl tar python3 patchelf; do
            command -v "$cmd" >/dev/null 2>&1 || MISSING=1
        done
        if [ "$MISSING" = "1" ]; then
            if command -v apt-get >/dev/null 2>&1; then
                apt-get update -y >/dev/null 2>&1 || true
                DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
                    curl ca-certificates tar python3 patchelf >/dev/null 2>&1 || true
            elif command -v apk >/dev/null 2>&1; then
                apk add --no-cache curl ca-certificates tar python3 patchelf >/dev/null 2>&1 || true
            fi
        fi
    fi
    local cmd
    for cmd in curl tar python3 patchelf; do
        command -v "$cmd" >/dev/null 2>&1 || { echo "Missing '$cmd'"; return 1; }
    done
}
run_spin "dependencies" install_deps || die "Could not install dependencies."

# ── 2. musl runtime (Alpine loader + libstdc++/libgcc) ────────
ensure_runtime(){
    if [ -x "$MUSL_LOADER" ] && [ -e "$RUNTIME/libstdc++.so.6" ] \
        && [ -e "$RUNTIME/libgcc_s.so.1" ] && [ -e "$RUNTIME/libc.musl-aarch64.so.1" ]; then
        return 0
    fi
    local AB="https://dl-cdn.alpinelinux.org/alpine/latest-stable/main/aarch64"
    local IDX MP LP GP LSTD p
    IDX="$(curl -fsSL --connect-timeout 15 --max-time 60 --retry 3 "$AB/" 2>/dev/null)" \
        || { echo "Cannot reach the Alpine mirror"; return 1; }
    MP="$(printf '%s\n' "$IDX" | grep -oE 'musl-[0-9][^"<]*\.apk' | sort -uV | tail -1)"
    LP="$(printf '%s\n' "$IDX" | grep -oE 'libstdc\+\+-[0-9][^"<]*\.apk' | sort -uV | tail -1)"
    GP="$(printf '%s\n' "$IDX" | grep -oE 'libgcc-[0-9][^"<]*\.apk' | sort -uV | tail -1)"
    [ -n "$MP" ] && [ -n "$LP" ] && [ -n "$GP" ] || { echo "Alpine packages not found"; return 1; }
    mkdir -p "$TMP/rt"
    for p in "$MP" "$LP" "$GP"; do
        curl -fsSL --retry 3 "$AB/$p" -o "$TMP/$p" || return 1
        tar -xzf "$TMP/$p" -C "$TMP/rt" 2>/dev/null || return 1
    done
    install -m 755 "$TMP/rt/lib/ld-musl-aarch64.so.1" "$RUNTIME/ld-musl-aarch64.so.1" || return 1
    ln -sfn ld-musl-aarch64.so.1 "$RUNTIME/libc.musl-aarch64.so.1"
    install -m 755 "$TMP/rt/usr/lib/libgcc_s.so.1" "$RUNTIME/libgcc_s.so.1" || return 1
    LSTD="$(ls "$TMP/rt/usr/lib/libstdc++.so.6."* 2>/dev/null | head -1)"
    [ -n "$LSTD" ] || { echo "libstdc++ not found"; return 1; }
    install -m 755 "$LSTD" "$RUNTIME/$(basename "$LSTD")" || return 1
    ln -sfn "$(basename "$LSTD")" "$RUNTIME/libstdc++.so.6"
    rm -rf "$TMP/rt" "$TMP/$MP" "$TMP/$LP" "$TMP/$GP"
}
run_spin "musl runtime" ensure_runtime || die "Could not install the musl runtime."

# ── 3. gateway engine (Termux only) ───────────────────────────
if [ "$MODE" = "termux" ]; then
    download_bar "$ENGINE_URL" "$GW/bin/opencode2api" "gateway engine" || die "Gateway engine download failed."
    chmod 771 "$GW/bin/opencode2api"
    ok "gateway engine"
else
    skip "gateway engine (using Termux :8123)"
fi

# ── 4. gateway tools + launcher (Termux only) ─────────────────
if [ "$MODE" = "termux" ]; then
    fetch_tools(){
        dl "$REPO/gateway/opencode-proxy"      "$BIN_DIR/opencode-proxy"
        dl "$REPO/gateway/watchdog.sh"         "$GW/watchdog.sh"
        dl "$REPO/gateway/watchdog2.sh"        "$GW/watchdog2.sh"
        dl "$REPO/gateway/config.example.json" "$GW/config.example.json"
        dl "$REPO/asanagi-launcher"            "$BIN_DIR/opencode"
        chmod +x "$BIN_DIR/opencode" "$BIN_DIR/opencode-proxy" "$GW/watchdog.sh" "$GW/watchdog2.sh"
        ln -sfn "$BIN_DIR/opencode" "$SYS_BIN/asanagi"
    }
    run_spin "gateway tools + launcher" fetch_tools || die "Could not install the gateway tools."
    ok "launcher (asanagi)"
fi

# ── 5. OpenCode provider config (written inline) ──────────────
# Generated locally so a one-shot install never depends on a separately
# published template. canonical: "opencode" inherits the full upstream
# metadata (reasoning variants, limits, compatibility) per model id.
write_config(){
    local f BK TS
    TS="$(date +%Y%m%d%H%M%S)"
    for f in "$CFG" "$CONFIG_DIR/opencode.json"; do
        [ -f "$f" ] || continue
        BK="$f.bak-$TS"
        cp -p "$f" "$BK" 2>/dev/null || cp "$f" "$BK"
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
    python3 - "$CFG" << 'PY'
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
assert len(cfg['providers']['asanagi']['models']) == 11
PY
}
run_spin "provider config" write_config || die "Could not write a valid OpenCode config."
ok "provider config (11 models)"

# ── 6. active gateway config (Termux only, port 8123) ─────────
if [ "$MODE" = "termux" ]; then
    write_gateway_config(){
        python3 - "$GW/config.example.json" "$GW/config.json" << 'PY'
import json, sys
c = json.load(open(sys.argv[1]))
c['listen'] = '127.0.0.1:8123'
c['server_keys'] = ['local-test-key']
c.setdefault('webui', {})['listen'] = '127.0.0.1:8124'
json.dump(c, open(sys.argv[2], 'w'), indent=2)
PY
    }
    run_spin "gateway config" write_gateway_config || die "Could not write the gateway config."
fi

# ── 7. OpenCode CLI v2.2.7 musl (253 MB) ──────────────────────
if [ -x "$BIN" ]; then
    skip "OpenCode CLI already installed"
else
    if [ -n "${ASANAGI_TARBALL:-}" ] && [ -f "$ASANAGI_TARBALL" ]; then
        note "using local CLI tarball"
        cp "$ASANAGI_TARBALL" "$TMP/cli.tar.gz"
        ok "OpenCode CLI tarball"
    else
        download_bar "$CLI_URL" "$TMP/cli.tar.gz" "OpenCode CLI" || die "CLI download failed."
    fi
    extract_cli(){
        tar -xzf "$TMP/cli.tar.gz" -C "$TMP" 2>/dev/null || return 1
        local FIND
        FIND=$(find "$TMP" -name 'opencode*' -type f -perm -u+x | head -1)
        [ -n "$FIND" ] || return 1
        mv "$FIND" "$BIN" && chmod +x "$BIN"
    }
    run_spin "extracting CLI" extract_cli || die "CLI extract failed."
    rm -rf "$TMP/package" "$TMP/cli.tar.gz"
fi

patch_cli(){
    patchelf --set-interpreter "$MUSL_LOADER" "$BIN" || return 1
    patchelf --set-rpath "$RUNTIME" "$BIN" >/dev/null 2>&1 || true
}
run_spin "patching CLI (musl)" patch_cli || die "patchelf failed."
CLI_VER="$(env LD_LIBRARY_PATH="$RUNTIME" "$BIN" --version 2>&1)" \
    || die "CLI smoke test failed: $CLI_VER"
ok "OpenCode CLI $CLI_VER"

# ── 8. PRoot launcher (never replaces the original opencode) ──
if [ "$MODE" = "proot" ]; then
    for name in asanagi opencode-asanagi; do
        cat > "$BIN_DIR/$name" << EOF
#!/usr/bin/env bash
exec "$BIN" "\$@"
EOF
        chmod +x "$BIN_DIR/$name"
    done
    ok "launcher (asanagi, opencode-asanagi)"
fi

# ── 9. start watchdog + gateway (Termux only) ─────────────────
if [ "$MODE" = "termux" ]; then
    touch "$GW/proxy.log" "$GW/watchdog.log" 2>/dev/null || die "Cannot write in $GW — fix permissions and re-run."
    run_spin "starting gateway" "$BIN_DIR/opencode-proxy" start || die "Gateway startup failed — check $GW/proxy.log"
    nohup "$GW/watchdog.sh" </dev/null >/dev/null 2>&1 &
    nohup "$GW/watchdog2.sh" </dev/null >/dev/null 2>&1 &
    ok "gateway + watchdog"
else
    if curl -fsS --max-time 5 http://127.0.0.1:8123/healthz >/dev/null 2>&1; then
        ok "Termux gateway reachable"
    else
        skip "Termux gateway not reachable (run: opencode-proxy start)"
    fi
fi

printf "\n  ${GREEN}✦ Done${NC}  run: ${CYAN}asanagi${NC}\n"
if [ "$MODE" = "termux" ]; then
    printf "  ${DIM}gateway: http://127.0.0.1:8123 · 11 free models${NC}\n\n"
else
    printf "  ${DIM}gateway: Termux :8123 · native Termux without PRoot is recommended${NC}\n\n"
fi
