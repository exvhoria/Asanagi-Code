# Asanagi Code

**OpenCode v2 native on Android Termux — no PRoot, no glibc-runner, with an Unlimited Gateway.**

Asanagi Code is an upgrade from [opencode-termux-unlimited](https://github.com/leangtg123-art/opencode-termux-unlimited) (OpenCode v1.19.5 + unlimited gateway) to the **official OpenCode v2.x** (`@opencode/cli`, currently v2.2.7) running as a **native musl binary** in Termux — an approach pioneered by [DEAD1nsane/opencode2-termux-musl](https://github.com/DEAD1nsane/opencode2-termux-musl) — combined with the entire unlimited-gateway infrastructure from v1.

---

## Why does this solve the "v2 crashes on Android" problem?

The v1 developer once said:

> *"OpenCode v2 changed to a client-server daemon setup that immediately crashes on native Android (exit code 127 / missing linker). Running v2 requires a heavy PRoot Linux distro which eats 2GB+ storage..."*

That analysis is **correct for glibc binaries** (Bun), but not for musl binaries:

| | v1 (glibc-runner) | v2 via PRoot | **Asanagi Code (native musl)** |
|---|---|---|---|
| Crash cause | `execve` child daemon bypasses the `grun` wrapper → no glibc linker → exit 127 | — | **No crash** |
| Solution | v1 monolith (stuck on v1.19.5) | Full Linux distro | musl interpreter *patchelf*'d **into the ELF** |
| Size | ~250 MB | 2 GB+ | **~300 MB** (binary + ~1 MB Alpine libs) |
| Daemon spawn (`serve`) | Fails in the child | OK | **OK — interpreter path is embedded, no wrapper needed** |
| Extra latency | 0 | High (PRoot syscall trap) | **~0** (native) |

The point: `patchelf --set-interpreter` makes every process — including the child daemon spawned via `execve` by the v2 client-server model — find its own loader without a shell wrapper. The exit-127 crash only happens if the child is executed through a wrapper (`grun`). Because the musl binary needs no wrapper at all, the v2 client-server architecture works as-is.

What is still needed: a tiny **DNS egress proxy** (Python, port `8089`) because Node/c-ares on Android cannot resolve DNS (raw UDP is blocked). This adds ~100–200 ms per external request; traffic to the local gateway (`127.0.0.1`) goes through `NO_PROXY` with no overhead.

---

## Architecture

```
                        ┌────────────────────────────┐
                        │   asanagi / opencode       │
                        │   Launcher (Mode 1/2/0)    │
                        └─────────────┬──────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
[OpenCode v2.2.7 musl]      [DNS Egress Proxy]           [Unlimited Gateway]
$PREFIX/libexec/asanagi/    127.0.0.1:8089 (Python)      127.0.0.1:8080 (Go)
asanagi-v2-musl.bin         resolve for Node/c-ares    opencode2api + WARP
        │                                                        pool (ipv6)
        │  model traffic (NO_PROXY 127.0.0.1)                    │
        └────────────────────────► /v1  ◄────────────────────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
              [OpenRouter Bridge]              opencode.ai/inference
              127.0.0.1:8085 (Mode 2)          (anonymous free tier)
              frontier: Claude, GPT,
              Gemini, DeepSeek R1/V3
```

## Free models (Mode 1, via the WARP gateway — no API key)

`glm-5.3-flash-free` (reasoning effort **low/high/max**), `deepseek-v4.1-flash-free`,
`nemotron-3.5-lightning-free`, `nemotron-3.5-super-vl-free`, `flint-40b-free`,
`big-pickle`, `beam-free`, `iceman-free`, `inkling-2-small-free`, `longcat-2.5-free`,
`mimo-v2.6-flash-free`, `minimax-m3.1-flash-free`.

**GLM 5.3 reasoning unlock**: in v1 this required a manual byte-patch of the binary because of the catalog whitelist. In v2.2.7 effort selection is **native to the catalog** and, on custom providers, configured through `variants` in `opencode.json` — already included, plus verified that `reasoning_effort` is actually sent upstream.

---

## Installation (Termux, aarch64)

From the package folder (this path):

```sh
sh "/storage/emulated/0/Asanagi Code/install.sh"
```

The installer automatically: installs the Alpine musl loader + libstdc++/libgcc, downloads
`@opencode/cli-linux-arm64-musl` (or uses the vendored tarball in `vendor/` — offline ready),
patchelf's the interpreter, smoke-tests → then promotes the binary (the old binary is kept
as `.last-good`), installs the gateway/bridge if not already present, takes over the
`opencode` command (the v1 launcher is kept as `opencode-v1`), and writes the provider config.

Upgrading from a working v1 installation **reuses** the gateway (8080/8081),
bridge (8085), config, and existing session data — only the CLI core is replaced.

## Usage

```sh
asanagi                 # mode menu (1 = unlimited, 2 = dual gateway, 0 = direct)
opencode                # same alias (v1 replaced; rollback: opencode-v1)
asanagi -1 "hello"      # go straight to unlimited mode
asanagi run -m asanagi/glm-5.3-flash-free#max "..."   # effort variant
asanagi doctor          # full diagnostics
asanagi update          # check + update from the official npm channel
asanagi repair          # reinstall / repair the binary
asanagi kill            # stop all gateway daemons
opencode-proxy status   # gateway control (start/stop/restart/status/test/logs)
openrouter-bridge status# bridge control (start/stop/restart/status/logs)
asanagi-shared serve --service   # shared service mode (faster TUI startup)
```

- **/variants** in the TUI (or `Tab` on the model statusline) to change GLM 5.3 effort.
- 8 AMOLED v2 themes are available in `/themes` (automatically copied to `~/.config/opencode/themes/`).
- Gateway web dashboard: `http://127.0.0.1:8081` (default `admin` / `changeme-changeme`).

## Rollback to v1

```sh
opencode-v1            # intact v1 launcher (v1.19.5 + the same gateway)
```

or uninstall v2 (`sh ".../Asanagi Code/uninstall.sh"`) — the v1 launcher is restored
automatically as `opencode`.

## Structure

```
/storage/emulated/0/Asanagi Code/
├── install.sh                  # main installer (Termux)
├── uninstall.sh
├── opencode.example.jsonc      # v2 provider config (12 models + GLM variants)
├── config.example.json         # gateway config example (opencode2api)
├── scripts/
│   ├── asanagi-proxy.py        # DNS egress proxy (port 8089)
│   ├── proxy-watchdog.sh       # proxy supervisor (flock single-instance)
│   ├── check-update.sh         # updater (official npm channel, never downgrade)
│   ├── enable-formatter.sh     # fix the prettier formatter in Termux (run once)
│   └── libresolvefix.c         # optional resolver shim (requires clang)
├── themes/                     # 8 AMOLED themes (dark+light)
└── vendor/                     # v2.2.7 tarball + Alpine libs (offline install)
```

Installed on the system:

```
$PREFIX/libexec/asanagi/asanagi-v2-musl.bin   # v2 binary (musl, patchelf'd)
$PREFIX/libexec/asanagi/{asanagi-proxy.py,proxy-watchdog.sh,VERSION,SHA256}
$PREFIX/lib/ld-musl-aarch64.so.1 (+libstdc++, libgcc)   # Alpine runtime
~/.local/bin/opencode                         # launcher (takes over the opencode name)
~/.local/bin/opencode-v1                      # v1 launcher (rollback)
~/.local/bin/{opencode-proxy,openrouter-bridge}
$PREFIX/bin/{asanagi,asanagi-shared,opencode-shared}   # main Asanagi launcher
~/.opencode-proxy/                            # gateway engine + config + logs
~/.config/opencode/opencode.jsonc          # asanagi + openrouter providers
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `getaddrinfo ETIMEOUT` / catalog fetch fails | Check the DNS egress proxy: `pgrep -f asanagi-proxy.py`; restart via `asanagi` (auto-start) |
| `ECONNREFUSED` when sending a prompt | Gateway is down: `opencode-proxy restart`, then `asanagi doctor` |
| `Model unavailable: asanagi/...` | Config missing/invalid: `asanagi repair` |
| Corrupted binary / fails to start | `asanagi repair` (automatic smoke test + last-good rollback) |
| `ServeError: Managed service port ... already in use` | Another OpenCode installation (e.g. a PRoot distro) holds the service port. The Asanagi launcher moves it automatically; force it manually with: `opencode service set port 49375` |
| Agent fails to run `python3` (exit 127, `invalid ELF header`) | Fixed via rpath — run `asanagi repair` on old installations |
| 429 rate limit | The WARP ipv6 pool is active; check `opencode-proxy status` |
| Cannot format files | `sh "/storage/emulated/0/Asanagi Code/scripts/enable-formatter.sh"` (once) |
| `asanagi help` / `asanagi version` → `ENOENT ... chdir` | Fixed in the launcher (single words are routed to `--help`/`--version`); run `asanagi repair` on old installations |
| `Unrecognized flag: --standalone in command opencode serve` | Fixed — `--standalone` is now injected only for the `run` subcommand; run `asanagi repair` on old installations |
| Empty version banner (`OpenCode v native musl`) | Fixed — `LD_*` sanitization moved to the very top of the launcher; run `asanagi repair` on old installations |
| The text "OpenCode" appears in the CLI/UI | The binary is rebranded to "Asanagi Code" (same-length byte patch, functional identifiers stay safe); `asanagi repair` reapplies it automatically |
| TUI splash banner | 2-line "ASANAGI" ASCII art patched into the binary string table (444 B region, slot-locked, original hash preserved) via `scripts/rebrand.py`; side-by-side at ≥44 columns, stacked below that |
| Chat fails: `messages[N].content[0].type has unsupported value "image_url"` | Some OpenAI-compatible providers (e.g. the GLM/Dahl route) reject image parts. Clean the session history (with automatic backup): `python3 "/storage/emulated/0/Asanagi Code/scripts/clean-session-images.py" --session <session-id> --apply`. This is not an OpenCode error — images from user attachments or the image `read` tool result are sent per the OpenAI standard, then rejected by the provider. If you want to use images, choose a provider/model that supports vision. |

## Credits

- [leangtg123-art/opencode-termux-unlimited](https://github.com/leangtg123-art/opencode-termux-unlimited) — unlimited gateway architecture (opencode2api + WARP pool + bridge)
- [DEAD1nsane/opencode2-termux-musl](https://github.com/DEAD1nsane/opencode2-termux-musl) — native musl bring-up for v2
- [OpenCode](https://opencode.ai) — the CLI itself; [opencode2api](https://github.com/jasonxu114514/opencode2api) — gateway engine
- Rebranding & v1→v2 integration: **Asanagi Code**

## License

MIT — see [LICENSE](LICENSE).
