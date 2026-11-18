# ✦ Asanagi Code

**Unlimited free-tier AI coding agent for Termux/Android** — an OpenCode v2.2.7 rebrand with a self-hosted gateway, WARP egress pool, and automatic session re-minting.

> Stress test result: **55.6M tokens / ~52 AI runs (including 3 concurrent sessions) — zero permanent quota failures.** Full report: [`docs/STRESS-TEST-REPORT.md`](docs/STRESS-TEST-REPORT.md)

---

## One-Shot Install

Run inside **Termux** (normal user, not root):

```bash
curl -fsSL https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main/install.sh | bash
```

The installer automatically: installs dependencies (python, jq, util-linux, patchelf) and the Alpine musl/C++ runtime → downloads the static gateway engine → installs launcher + watchdog + gateway config → writes the OpenCode provider config (with a backup of any existing one) → downloads OpenCode CLI v2.2.7 musl (253 MB) → patches it for the musl loader → starts the watchdog-supervised gateway.

Then just run: **`asanagi`**

### Optional: test inside PRoot

Asanagi Code is designed to run **natively in Termux without PRoot**. PRoot mode exists for testing and installs the CLI only — it reuses the gateway running in Termux and **never replaces the distro's original `opencode`**:

```bash
proot-distro login ubuntu
bash "/storage/emulated/0/Asanagi Code/install.sh"
```

The launcher is installed as **`asanagi`** (and `opencode-asanagi`). The gateway on `127.0.0.1:8123` must already be running in Termux (`opencode-proxy start`). For the full installation, use native Termux.

---

## Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  TUI/CLI     │────▶│  Gateway (:8123)    │────▶│  opencode.ai zen │
│  (Asanagi)   │     │  opencode2api +     │     │  free tier       │
└──────────────┘     │  WARP pool (ipv6) + │     └──────────────────┘
                     │  session re-mint    │
                     └─────────────────────┘
                     ┌─────────────────────┐
                     │  Watchdog           │  healthz down → restart ~80s
                     │  (auto-heal +       │  429 storm → clean state + restart
                     │  429-storm healing) │
                     └─────────────────────┘
```

### Why is it unlimited?
The opencode.ai free tier meters usage **per session id + egress**. This gateway:
1. **Re-mints the session** automatically on 429 (fresh quota bucket) — engine built from [opencode2api PR #175](https://github.com/jasonxu114514/opencode2api/pull/175).
2. **Rotates WARP egress** (Cloudflare WARP ipv6, pool of 6 exits).
3. **Auto-heals accumulated state**: burned state files are wiped automatically by the watchdog.

## Repository Layout

| Path | Purpose |
|---|---|
| `install.sh` | One-shot installer (native Termux; PRoot test mode) |
| `asanagi-launcher` | Main launcher (menu, banner, farewell screen) |
| `gateway/opencode-proxy` | Gateway CLI manager (start/stop/status/logs) |
| `gateway/watchdog.sh` | 24/7 supervisor (auto-restart + 429-storm healing) |
| `gateway/config.example.json` | Gateway config template |
| `gateway/opencode.example.jsonc` | OpenCode provider config (11 free models) |
| `lattice/` | **Lattice** — standalone API service (same engine, separate install — for users without Asanagi Code) |
| `discord-bot/` | Multipurpose Discord bot (NodeJS, 21+ commands, 223 passing tests) — built entirely by the AI through the gateway as a stress test |
| `docs/STRESS-TEST-REPORT.md` | Full stress test + production hardening report |

## Validated Free Models

`beam-free` · `big-pickle` · `deepseek-v4.1-flash-free` · `flint-40b-free` · `hy4-flash-free` · `iceman-free` · `inkling-2-small-free` · `longcat-2.5-free` · `mimo-v2.6-flash-free` · `nemotron-3.5-lightning-free` · `nemotron-3.5-super-vl-free` (11 free-tier models)

### Reasoning effort (upstream parity)

The `asanagi` provider sets `canonical: "opencode"`, so OpenCode inherits the
exact upstream catalog metadata (variants, limits, compatibility) for matching
model IDs. This is why DeepSeek exposes the full ladder — not just `high`:

| Model | Variants |
|---|---|
| `deepseek-v4.1-flash-free` | `low` · `high` · `max` |
| `beam-free`, `flint-40b-free` | `low` · `medium` · `high` · `xhigh` · `max` |
| `inkling-2-small-free` | `none` · `minimal` · `low` · `medium` · `high` · `max` |
| `nemotron-3.5-super-vl-free` | `none` · `minimal` · `low` · `medium` · `high` · `xhigh` |
| `hy4-flash-free` | `none` · `high` |
| `big-pickle`, `iceman-free`, `longcat-2.5-free`, `mimo-v2.6-flash-free`, `nemotron-3.5-lightning-free` | no variants |

Select one with `#variant`, for example:

```bash
opencode run --model asanagi/deepseek-v4.1-flash-free#max "Review this migration"
```

## Manual Emergency Recovery

```bash
pkill -9 -f "opencode2api -config"   # kill gateway
rm ~/.opencode-proxy/config.json.*.json ~/.opencode-proxy/config.json.models.* 2>/dev/null
cd ~/.opencode-proxy && nohup ./bin/opencode2api -config config.json >> proxy.log 2>&1 &
```

## Engine Build Notes

The engine **must** be a static build (`CGO_ENABLED=0`) to run on both Termux and proot — dynamic glibc builds fail with `not found` inside Termux. The pinned build (`engine-v2`) is **upstream v1.4.8 + PR #175 session re-mint merged**:

- v1.4.8 identity fixes (required): tool-name hashing, fresh project id per request, probe identity — without them, real TUI sessions (which always send tool definitions) hit free-tier 429 even with fresh state.
- PR #175 (unmerged upstream): re-mints the free-tier session automatically when a bucket is burned, so recovery does not wait for a restart.

The previous build (`engine-v1`) was based on an older upstream and lacked the v1.4.5–v1.4.7 identity fixes — this was the root cause of "unlimited fails when actually used from the TUI" (verified: tool-call requests got 429 on the old build while v1.4.8 passed identical requests).

See *Production Hardening* in the report for troubleshooting details (ghost daemons, state burn, port conflicts).

## Credits

- [OpenCode](https://github.com/sst/opencode) — CLI/TUI
- [opencode2api](https://github.com/jasonxu114514/opencode2api) — gateway engine
- [opencode-termux-unlimited](https://github.com/leangtg123-art/opencode-termux-unlimited) — original setup inspiration
