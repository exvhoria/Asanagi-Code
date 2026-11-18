# Changelog

All notable changes to **Asanagi Code** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- **PRoot test mode** in `install.sh`: when run inside a PRoot distro it installs
  the CLI only, reuses the Termux gateway on `127.0.0.1:8123`, and never replaces
  the distro's original `opencode` (launchers are `asanagi` / `opencode-asanagi`).
  A prominent notice reminds users that Asanagi Code runs natively in Termux
  without PRoot.
- **`ASANAGI_TARBALL`** environment variable for offline/test installs from a
  local CLI tarball.

### Fixed
- **Fresh-install musl runtime**: the installer now downloads the Alpine
  `musl`/`libstdc++`/`libgcc` packages, installs `libc.musl-aarch64.so.1`, and
  runs `patchelf --set-interpreter/--set-rpath` on the CLI. Previously a fresh
  install moved the unpatched binary in place, which expects
  `/lib/ld-musl-aarch64.so.1` — a path that does not exist in Termux.
- **Config backups**: an existing `opencode.jsonc` *and* `opencode.json` are
  backed up before the generated provider config is written.
- **Full upstream reasoning effort**: the `asanagi` provider was migrated to the
  V2 format (`providers` + `package`) and now uses `canonical: "opencode"`, so
  model metadata — effort variants, limits, and compatibility — follows the
  official upstream catalog. DeepSeek V4.1 Flash now shows `low / high / max`
  like upstream OpenCode; Beam/Flint go up to `xhigh`/`max`; non-reasoning
  models no longer show fake variants.
- **Model limits synced with upstream**: DeepSeek V4.1 Flash free is 200K
  context / 32K output (previously listed as 1M); other models follow the
  gateway/upstream catalog — preventing overflow and premature compaction.
- **Installer config**: `opencode.example.jsonc` now points to gateway port
  `8123` (previously `8080`) and contains the 11 free models actually exposed
  by the gateway.

## [2.0.0] - 2026-11-13

A major upgrade from `opencode-termux-unlimited` (the v1 project, OpenCode core
**v1.19.5**) to **official OpenCode v2.2.7** — no PRoot, no glibc-runner for the CLI.

### Added
- **Native musl OpenCode v2**: the official `@opencode/cli-linux-arm64-musl` binary
  from npm, *patchelf*'d to the Alpine musl loader (`$PREFIX/lib/ld-musl-aarch64.so.1`) —
  running the v2 client-server architecture (including the `serve` daemon spawn) natively in Termux.
- **Musl runtime**: Alpine `musl`, `libstdc++`, `libgcc` automatically installed into `$PREFIX/lib`
  (or from `vendor/` — offline ready).
- **DNS egress proxy** (`asanagi-proxy.py`, port `8089`) + flock single-instance watchdog:
  Node/c-ares on Android cannot resolve; external traffic goes through this proxy,
  while local gateway traffic is excluded via `NO_PROXY`.
- **Staged update + rollback boundary**: the new binary is tested (`--version` + `run --help`)
  before being promoted; the old binary is kept as `.last-good` along with `VERSION`/`SHA256`.
- **`asanagi` launcher** takes over the `opencode` name (the v1 launcher is kept as
  `opencode-v1`), with `doctor`, `update`, `repair`, `kill` subcommands, `-1/-2/-0` mode
  flags, and a shared-service helper (`asanagi-shared`).
- **8 AMOLED v2 themes** (dark + light) copied to `~/.config/opencode/themes/`.
- **Updater** (`scripts/check-update.sh`) against the official npm channel — never downgrades.
- **Offline vendor**: v2.2.7 tarball + Alpine packages bundled in `vendor/`.
- **"Asanagi Code" rebrand of the binary** (`scripts/rebrand.py`): same-length byte patch
  of user-visible strings — CLI/help descriptions, splash (`Loading Asanagi `),
  window/terminal titles, auth/update/crash messages, system prompt (including the
  UTF-16 form), and the session title prefix `AC | `. Functional identifiers are protected:
  data directory names (`~/.config/opencode` etc.), `OPENCODE_*` env vars, `X-OpenCode-*`/
  `OpenCode-User` headers, event/export names (`OpenCodeEvent`, `OpenCode.make`,
  `OpenCodeTools`), the winget ID, and URLs. The installer applies it automatically
  (idempotent, file size unchanged).
- **"ASANAGI" TUI splash banner**: the TUI renderer does not read splash text from
  source, but from the binary string table (a UTF-16 region at offset `115329092`,
  444 bytes, 13 entries). The banner patch replaces that region with the user's 2-line
  ASCII art (v14): a left "ASAN" block of 18 columns (entries 1-3) + a right "AGI"
  block of 12 columns (entries 5-7) = 31 columns side-by-side; each entry's original
  hash is preserved, each entry length does not exceed its original slot (overflow
  corrupts the next entry header → Bun `abort()`), and the total region stays 444 bytes.
  The renderer replaces `^~_,` with colored shadows; breakpoints: `width<44` → stacked
  (ASAN above AGI), `width<22` → null. Verified in the live TUI at 80 and 36 columns.
- **Launcher branding**: `asanagi version`/`--version` prints "Asanagi Code v2.2.7",
  `--help` output is branded via a filter (the binary's internal name stays `opencode`
  for data-directory continuity), `OPENCODE_CLIENT=Asanagi Code` for TUI client identity.

### Changed
- **CLI core**: OpenCode v1.19.5 (Bun/glibc-runner monolith) → OpenCode v2.2.7 (Node/musl).
- **GLM 5.3 reasoning unlock without byte-patching**: effort (`low/high/max`) now goes
  through `variants` in `opencode.json` — verified that `reasoning_effort` is sent in the
  request body (v1 required a 1:1 byte patch of the binary; the v2 catalog supports it natively).
- **Config**: `~/.config/opencode/opencode.json` was migrated — provider `asanagi`
  (baseURL `http://127.0.0.1:8080/v1`) with 12 live free models from the gateway,
  plus provider `openrouter` (bridge 8085). The old config was backed up (`.v1.bak`).
- **Model catalog updated**: `iceman-free`, `inkling-2-small-free`, `longcat-2.5-free`,
  `minimax-m3.1-flash-free` added; `pulse-alpha-free`/`crouton-alpha-free` (no longer
  exposed by the gateway) removed.

### Fixed (post-delivery)
- **`opencode serve` → "Unrecognized flag: --standalone"**: `--standalone` is now
  injected only for the `run` subcommand (v2.2.7 rejects it in `serve`/`web`/`acp`).
- **`asanagi help`/`asanagi version` → `ENOENT chdir`**: CLI v2 treats the first
  single word as a project directory; the launcher now routes to `--help`/`--version`.
- **Empty version banner + "Binary corrupted" loop**: `LD_*` sanitization moved to the
  very top of the launcher (Termux's bionic preload made the musl binary exit 127 from
  the first version call), plus an `ASANAGI_REPAIRING` recursion guard and verification
  through the binary directly.
- **Port 49374 conflict** (with another PRoot installation): dedicated service port
  `49375` + auto-move guard via a `/dev/tcp` probe.
- **Chat stuck on `messages[N]... unsupported value "image_url"`**: certain OpenAI-compatible
  providers (e.g. the GLM/Dahl route) reject image parts. Added
  `scripts/clean-session-images.py` to remove image payloads from session history
  (user attachments or `read` tool results) with automatic backup; affected sessions
  were cleaned and can be resumed.

### Preserved (reused from v1)
- Unlimited Gateway `opencode2api` (127.0.0.1:8080) + Cloudflare WARP ipv6 pool (6 workers),
  web dashboard (8081) — existing installations are reused as-is.
- OpenRouter Bridge (127.0.0.1:8085) + smart multi-egress probing.
- `opencode-proxy` / `openrouter-bridge` manager CLI (the `pkill` pattern was adjusted
  so it does not kill the Asanagi DNS egress proxy).
- Session data, user config, and allow-all permissions.

### Removed
- The CLI's dependency on `glibc-runner`/`grun` (still used only by the gateway engine
  on fresh installations).
- The GLM 5.3 byte-patch on `opencode-bin` (irrelevant on v2).

## [1.x] — opencode-termux-unlimited

For the v1 version history (2.0.1–2.0.7 of the project, OpenCode core v1.19.5), see the
original repository:
[leangtg123-art/opencode-termux-unlimited](https://github.com/leangtg123-art/opencode-termux-unlimited/blob/main/CHANGELOG.md).
End of v1: multi-mode launcher, WARP ipv6 gateway, SQLite auto-repair, doctor/repair,
npm binary-hijack guard.
