# ✦ Asanagi Code

**Unlimited free-tier AI coding agent untuk Termux/Android** — rebrand OpenCode v2.2.7 dengan gateway self-hosted, pool WARP, dan session re-mint otomatis.

> Hasil stress test: **55,6M token / ~52 run AI (termasuk 3-session paralel) — nol kegagalan kuota permanen.** Laporan lengkap: [`docs/LAPORAN-STRESS-TEST.md`](docs/LAPORAN-STRESS-TEST.md)

---

## Arsitektur

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  TUI/CLI     │────▶│  Gateway (8123)     │────▶│  opencode.ai zen │
│  (Asanagi)   │     │  opencode2api +     │     │  free tier       │
└──────────────┘     │  WARP pool (ipv6) + │     └──────────────────┘
                     │  session re-mint    │
                     └─────────────────────┘
                     ┌─────────────────────┐
                     │  Watchdog (auto-    │  healthz gagal → restart ±80s
                     │  heal + 429 storm   │  429 storm → clean state + restart
                     │  auto-clean)        │
                     └─────────────────────┘
```

### Kenapa unlimited bisa?
Kuota free tier opencode.ai dihitung **per session id + egress**. Gateway ini:
1. **Re-mint session** otomatis saat 429 (bucket kuota baru) — build dari [opencode2api PR #175](https://github.com/jasonxu114514/opencode2api/pull/175).
2. **Rotasi egress WARP** (Cloudflare WARP ipv6, pool 6 exit).
3. **Auto-heal state**: state menumpuk yang terbakar dibersihkan otomatis oleh watchdog.

## Isi Repo

| Path | Fungsi |
|---|---|
| `asanagi-launcher` | Launcher utama (menu, banner, farewell screen) |
| `gateway/opencode-proxy` | CLI manager gateway (start/stop/status/logs) |
| `gateway/watchdog.sh` | Supervisor 24/7 (auto-restart + 429 storm heal) |
| `gateway/daemon_spawn.py` | Daemonizer |
| `gateway/config.example.json` | Template config gateway |
| `discord-bot/` | Bot Discord multipurpose (NodeJS, 21+ command, 223 test hijau) — dibangun penuh oleh AI via gateway sebagai stress test |
| `docs/LAPORAN-STRESS-TEST.md` | Laporan lengkap stress test + production hardening |

## Model Free Tervalidasi

`glm-5.3-flash-free` · `deepseek-v4.1-flash-free` · `minimax-m3.1-flash-free` · `nemotron-3.5-lightning-free` · `longcat-2.5-free` · `flint-40b-free` · dst. (12 model, semua berakhiran `-free`)

## Instalasi (ringkas)

1. Install Termux + proot Ubuntu, lalu pasang OpenCode v2.2.x dan engine:
   ```bash
   # engine gateway (arm64):
   https://github.com/jasonxu114514/opencode2api/releases/download/v1.4.7/opencode2api_v1.4.7_linux_arm64.tar.gz
   ```
2. Salin `asanagi-launcher` → `~/.local/bin/opencode` (chmod +x), `gateway/` → `~/.opencode-proxy/`.
3. Sesuaikan `config.json` dari `config.example.json` (port, keys).
4. Jalankan `asanagi` → pilih **1 Unlimited Proxy**.

> ⚠️ Catatan: engine build **statis** (`CGO_ENABLED=0`) wajib agar jalan di Termux
> maupun proot. Lihat bagian Production Hardening di laporan untuk detail
> troubleshooting (ghost daemon, state burn, port conflict).

## Kredit

- [OpenCode](https://github.com/sst/opencode) — CLI/TUI
- [opencode2api](https://github.com/jasonxu114514/opencode2api) — engine gateway
- [opencode-termux-unlimited](https://github.com/leangtg123-art/opencode-termux-unlimited) — inspirasi setup original
