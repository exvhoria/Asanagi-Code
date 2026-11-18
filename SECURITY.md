# Security & VirusTotal

All published Asanagi Code artifacts were scanned with **VirusTotal** on
**2026-11-19** using the official API v3. Every file returned **0 malicious and
0 suspicious detections**.

[![VirusTotal](https://img.shields.io/badge/VirusTotal-0%20detections-brightgreen)](SECURITY.md)

## Scan results

| Artifact | SHA-256 | Detections | VirusTotal report |
|---|---|---|---|
| `install.sh` | `7c42ec82fa25a7ca26563e77866314c9b0fd4c85c3af4097ea97a27c11815d20` | **0 / 61** | [View](https://www.virustotal.com/gui/file/7c42ec82fa25a7ca26563e77866314c9b0fd4c85c3af4097ea97a27c11815d20) |
| `asanagi-launcher` | `d67230060b16f5e784ef5e1415f32eea30dd06ce0a3d4c721acf234e5fbd8f94` | **0 / 60** | [View](https://www.virustotal.com/gui/file/d67230060b16f5e784ef5e1415f32eea30dd06ce0a3d4c721acf234e5fbd8f94) |
| `gateway/opencode-proxy` | `7c2a0782652c71e482cc759cef12f51948723b1af73e0a3e90d741ec0d94a87d` | **0 / 61** | [View](https://www.virustotal.com/gui/file/7c2a0782652c71e482cc759cef12f51948723b1af73e0a3e90d741ec0d94a87d) |
| `gateway/watchdog.sh` | `530e2da0d6156cdea9976d128aca03ddf0cdf65669789376dafc3ed056516734` | **0 / 61** | [View](https://www.virustotal.com/gui/file/530e2da0d6156cdea9976d128aca03ddf0cdf65669789376dafc3ed056516734) |
| `gateway/watchdog2.sh` | `2df4fd4549bd1460a6fc265b053fcc997bb87ab499f13d4619d72d4aa72626dc` | **0 / 56** | [View](https://www.virustotal.com/gui/file/2df4fd4549bd1460a6fc265b053fcc997bb87ab499f13d4619d72d4aa72626dc) |
| Gateway engine (`engine-v2/opencode2api-linux-arm64`) | `f6a141b7431b4cff6c0eb6d4a1337dc553fbae7df7a6b59be86bf705c67d44e1` | **0 / 62** | [View](https://www.virustotal.com/gui/file/f6a141b7431b4cff6c0eb6d4a1337dc553fbae7df7a6b59be86bf705c67d44e1) |
| OpenCode CLI tarball (`sst/opencode` v2.2.7) | `a03405f94ae02db7acb0870cf32030bab86460dc7faf524780e9cae305526b96` | **0 / 61** | [View](https://www.virustotal.com/gui/file/a03405f94ae02db7acb0870cf32030bab86460dc7faf524780e9cae305526b96) |

**Detections** is `malicious + suspicious` vendors over vendors that returned a
verdict. Some engines are excluded when they do not support shell scripts
("type unsupported") or time out; none reported the files as malicious or
suspicious.

## What the installer downloads

| Component | Source |
|---|---|
| OpenCode CLI v2.2.7 (musl) | Official [`sst/opencode`](https://github.com/sst/opencode/releases/tag/v2.2.7) release — the exact tarball above |
| Gateway engine | This repository's [`engine-v2`](https://github.com/exvhoria/Asanagi-Code/releases/tag/engine-v2) release |
| Alpine musl / libstdc++ / libgcc | Official Alpine CDN (`dl-cdn.alpinelinux.org`) |
| Launcher, watchdog, gateway tools | This repository (plain text shell scripts, no obfuscation) |
| OpenCode provider config | Generated locally by `install.sh` |

No component is fetched from an unofficial mirror or a third-party file host.

## Verify the hashes yourself

```bash
sha256sum install.sh asanagi-launcher gateway/opencode-proxy \
          gateway/watchdog.sh gateway/watchdog2.sh
```

The installed CLI binary is the upstream tarball extracted and patched with
`patchelf` (interpreter + rpath only). Its integrity can be checked against the
tarball hash above before installation.

## Reproduce a VirusTotal lookup

```bash
curl -s -H "x-apikey: $VT_API_KEY" \
  "https://www.virustotal.com/api/v3/files/7c42ec82fa25a7ca26563e77866314c9b0fd4c85c3af4097ea97a27c11815d20" \
  | jq '.data.attributes.last_analysis_stats'
```

## Scope and disclaimer

- VirusTotal is a **point-in-time** multi-engine scan, not a security guarantee.
- The project is fully open source: every script executed by `install.sh` is in
  this repository and readable before you run it. You can download and inspect it
  first instead of piping it directly to `bash`:

  ```bash
  curl -fsSLO https://raw.githubusercontent.com/exvhoria/Asanagi-Code/main/install.sh
  less install.sh
  bash install.sh
  ```

- If a future commit changes a scanned file, its hash — and therefore its
  report — changes too. Re-run the lookup or check this document for the
  current commit.
