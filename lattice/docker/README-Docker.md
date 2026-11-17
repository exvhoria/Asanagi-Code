# Docker (linux/amd64)

For hosts that run Docker images without root, TCP-only reachability, and a
persistent data folder.

## Build

```bash
cd api/docker
docker build -t lattice .
```

## Run

```bash
docker run -d \
  -e PORT=8133 \
  -e API_KEY=Lattice \
  -e WARP=true \
  -p 8133:8133 \
  lattice
```

- `PORT` — TCP port the API listens on (platform may override).
- `API_KEY` — value for `Authorization: Bearer <key>`.
- `WARP` — `true` (default): try the in-process WARP egress pool first; if the
  host blocks UDP the container automatically restarts with WARP disabled and
  keeps serving. Quota escaping works either way (per session-id re-mint).

All state (config, quota state files) is written to `/data`, which maps to the
host's persistent data folder. The watchdog is intentionally not included —
the platform restarts the container on failure.

## Verify

```bash
curl http://<host>:8133/healthz
curl http://<host>:8133/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer Lattice' \
  -d '{"model":"glm-5.3-flash-free","messages":[{"role":"user","content":"say ok"}],"max_tokens":50}'
```

## Notes

- Image is `linux/amd64` (arm64 hosts: swap the binary for
  `opencode2api-linux-arm64` from Releases and adjust `COPY`).
- No root, no devices, no network changes, no volume mounts beyond `/data`.
