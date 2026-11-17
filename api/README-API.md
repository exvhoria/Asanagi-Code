# Asanagi Unlimited API

A standalone OpenAI-compatible API powered by the Asanagi gateway engine
(upstream v1.4.8 + session re-mint). Users do **not** need to install
Asanagi Code — any OpenAI-compatible client can talk to this API directly.

## Layout

```
~/asanagi-api/            ← separate from ~/.opencode-proxy (Asanagi Code install)
├── api.sh                ← service manager (start/stop/status/logs)
├── watchdog-api.sh       ← 24/7 supervisor for this instance
├── bin/opencode2api      ← engine (static, aarch64)
└── config.json           ← port, keys, WARP pool
```

## Quick Start

```bash
mkdir -p ~/asanagi-api/bin
cp engine-binary ~/asanagi-api/bin/opencode2api      # from Releases (engine-v2)
cp api.sh watchdog-api.sh ~/asanagi-api/             # from this repo: api/
# create config.json (see gateway/config.example.json): set listen 127.0.0.1:8133
#   server_keys: ["<your-key>"], webui.enabled: false
chmod +x ~/asanagi-api/api.sh ~/asanagi-api/watchdog-api.sh ~/asanagi-api/bin/opencode2api
~/asanagi-api/api.sh start
```

## Using the API

| Setting | Value |
|---|---|
| Base URL | `http://127.0.0.1:8133/v1` (local mode) |
| Auth | `Authorization: Bearer <your-key>` |
| Models | any `*-free` model, e.g. `glm-5.3-flash-free` |

### Chat (non-streaming)

```bash
curl http://127.0.0.1:8133/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-key>' \
  -d '{"model":"glm-5.3-flash-free","messages":[{"role":"user","content":"say ok"}],"max_tokens":50}'
```

### Streaming

Add `"stream": true` — standard SSE chunks (`data: {...}`, terminated by `data: [DONE]`).

### Tool calls

Pass a standard OpenAI `tools` array. Tool-name hashing is handled by the
engine so free-tier sessions do not get 429'd (the fix that shipped in
upstream v1.4.6+; older builds lacked it).

### Health

```bash
curl http://127.0.0.1:8133/healthz
```

## Operations

```bash
~/asanagi-api/api.sh status    # status, WARP pool, model count
~/asanagi-api/api.sh logs 50   # tail gateway log
~/asanagi-api/api.sh stop      # stop gateway + watchdog
```

The watchdog auto-restarts on health failures (~80s) and auto-cleans burned
state on 429 storms (≥6/20 recent requests).

## Notes

- **Local mode**: bound to `127.0.0.1` — expose later via LAN bind or a
  Cloudflare Tunnel without changing anything else.
- Keep `server_keys` private; rotate by editing `config.json` and restarting.
- This instance is fully isolated from an Asanagi Code install (separate
  state files, separate WARP pool, separate watchdog).
