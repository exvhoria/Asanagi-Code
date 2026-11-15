# ✦ Asanagi Code

**Unlimited free-tier AI coding agent for Termux/Android** — an OpenCode v2.2.7 rebrand with a self-hosted gateway, WARP egress pool, and automatic session re-minting.

> Stress test result: **55.6M tokens / ~52 AI runs (including 3 concurrent sessions) — zero permanent quota failures.** Full report: [`docs/LAPORAN-STRESS-TEST.md`](docs/LAPORAN-STRESS-TEST.md)

---

## One-Shot Install

Run inside **Termux** (normal user, not root):

```bash
curl -fsSL https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main/install.sh | bash
```

The installer automatically: installs dependencies (musl, proot, python) → downloads the static gateway engine → installs launcher + watchdog + configs → downloads OpenCode CLI v2.2.7 musl (253 MB) → starts the watchdog-supervised gateway → verifies health.

Then just run: **`asanagi`**

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
| `install.sh` | One-shot installer |
| `asanagi-launcher` | Main launcher (menu, banner, farewell screen) |
| `gateway/opencode-proxy` | Gateway CLI manager (start/stop/status/logs) |
| `gateway/watchdog.sh` | 24/7 supervisor (auto-restart + 429-storm healing) |
| `gateway/daemon_spawn.py` | Daemonizer |
| `gateway/config.example.json` | Gateway config template |
| `gateway/opencode.example.jsonc` | OpenCode provider config (12 free models) |
| `discord-bot/` | Multipurpose Discord bot (NodeJS, 21+ commands, 223 passing tests) — built entirely by the AI through the gateway as a stress test |
| `docs/LAPORAN-STRESS-TEST.md` | Full stress test + production hardening report (Indonesian) |

## Validated Free Models

`glm-5.3-flash-free` · `deepseek-v4.1-flash-free` · `minimax-m3.1-flash-free` · `nemotron-3.5-lightning-free` · `longcat-2.5-free` · `flint-40b-free` · etc. (12 models, all ending in `-free`)

## Manual Emergency Recovery

```bash
pkill -9 -f "opencode2api -config"   # kill gateway
rm ~/.opencode-proxy/config.json.*.json ~/.opencode-proxy/config.json.models.* 2>/dev/null
cd ~/.opencode-proxy && nohup ./bin/opencode2api -config config.json >> proxy.log 2>&1 &
```

## Engine Build Notes

The engine **must** be a static build (`CGO_ENABLED=0`) to run on both Termux and proot — dynamic glibc builds fail with `not found` inside Termux. The pinned build is available in [Releases](https://github.com/exvhoria/Asanagi-Code/releases/tag/engine-v1).

See *Production Hardening* in the report for troubleshooting details (ghost daemons, state burn, port conflicts).

## Credits

- [OpenCode](https://github.com/sst/opencode) — CLI/TUI
- [opencode2api](https://github.com/jasonxu114514/opencode2api) — gateway engine
- [opencode-termux-unlimited](https://github.com/leangtg123-art/opencode-termux-unlimited) — original setup inspiration
