# Lavalink VPS Setup — Complete Guide

Setting up a standalone Lavalink server on an AWS VPS for a Discord music bot. This configuration solves YouTube blocking from datacenter IPs (login-only videos, broken cipher extraction, per-video CDN blocks).

---

## 1. Topology

```
Discord ── bot (laptop/server) ──> Lavalink VPS :2333
                                    └──> googlevideo.com (YouTube CDN)
                                          ├── IPv4 (0.0.0.0/0 → IGW)  — popular videos OK
                                          └── IPv6 (::/0 → IGW)       — niche videos OK
```

- The bot connects to Lavalink over a private/internal network — the port does not need to be exposed to the public internet.
- Lavalink's outbound traffic to YouTube uses IPv6 (preferred) with IPv4 fallback — **both stacks are required**, this is the key to getting every video to play.
- SSH to the VPS via your normal SSH key/password setup.

## 2. VPS Prerequisites

- **AWS EC2 Ubuntu 24.04** (2 vCPU / 2GB RAM is enough for 1 guild; scale up for multi-guild)
- **Java 17+** (`java -version`)
- Working directory: `~/lavalink/`

## 3. Folder Structure

```
~/lavalink/
├── Lavalink.jar          # Lavalink jar (v4.2.2)
├── application.yml       # config (see section 4)
├── lavalink.log          # startup log output
├── logs/                 # Lavalink log files (rolling 1GB x 30)
└── plugins/              # plugin jars (ALL jars here are auto-loaded)
```

## 4. application.yml (hardened config)

```yaml
server:
  port: 2333
  address: 0.0.0.0
  http2:
    enabled: false

lavalink:
  plugins:
    - dependency: "com.github.topi314.lavasearch:lavasearch-plugin:1.0.0"
      repository: "https://maven.lavalink.dev/releases"
    - dependency: "com.dunctebot:skybot-lavalink-plugin:1.7.0"
      repository: "https://maven.lavalink.dev/releases"
    - dependency: "com.github.devoxin:lavadspx-plugin:0.0.5"
      repository: "https://jitpack.io"
    - dependency: "com.github.topi314.lavalyrics:lavalyrics-plugin:1.1.0"
      repository: "https://maven.lavalink.dev/releases"
    - dependency: "me.duncte123:java-lyrics-plugin:1.6.6"
      repository: "https://maven.lavalink.dev/releases"
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.18.2"
      snapshot: false
    - dependency: "com.github.topi314.sponsorblock:sponsorblock-plugin:3.0.0"
      repository: "https://maven.lavalink.dev/releases"
    - dependency: "com.github.topi314.lavasrc:lavasrc-plugin:4.0.1"
      repository: "https://maven.lavalink.dev/releases"
  server:
    password: "<PASSWORD>"   # REQUIRED — use your own password
    sources:
      youtube: false         # legacy source manager disabled — youtube-plugin handles it
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      nico: true
      http: true
      local: false
    filters:
      volume: true
      equalizer: true
      karaoke: true
      timescale: true
      tremolo: true
      vibrato: true
      distortion: true
      rotation: true
      channelMix: true
      lowPass: true
    nonAllocatingFrameBuffer: false
    bufferDurationMs: 400
    frameBufferDurationMs: 5000
    opusEncodingQuality: 10
    resamplingQuality: LOW
    trackStuckThresholdMs: 10000
    useSeekGhosting: true
    youtubePlaylistLoadLimit: 6
    playerUpdateInterval: 5
    youtubeSearchEnabled: true
    soundcloudSearchEnabled: true
    soundcloudFilterOutPreviewTracks: false
    gc-warnings: true
    timeouts:
      connectTimeoutMs: 3000
      connectionRequestTimeoutMs: 3000
      socketTimeoutMs: 3000

plugins:
  lyrics:
    countryCode: en-AU

  java-lyrics:
    sources:
      - provider: "lrclib"
      - provider: "musixmatch"
      - provider: "netease"
      - provider: "deezer"
      - provider: "spotify"

  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    clients:
      - TV           # the ONLY client that supports OAuth (login-only videos)
      - WEB
      - ANDROID_VR
    oauth:
      enabled: true
      refreshToken: "<REFRESH_TOKEN>"   # see section 8
    remoteCipher:
      url: "https://cipher.kikkia.dev/"
      userAgent: "<BOT_NAME>"

  dunctebot:
    ttsLanguage: "en-US"
    sources:
      getyarn: true
      clypit: true
      tts: true
      pornhub: true
      reddit: true
      ocremix: true
      tiktok: true
      mixcloud: true
      soundgasm: true

metrics:
  prometheus:
    enabled: false
    endpoint: /metrics

sentry:
  dsn: ""
  environment: ""

logging:
  file:
    path: ./logs/
  level:
    root: INFO
    lavalink: INFO
  request:
    enabled: true
    includeClientInfo: true
    includeHeaders: false
    includeQueryString: true
    includePayload: true
    maxPayloadLength: 10000
  logback:
    rollingpolicy:
      max-file-size: 1GB
      max-history: 30
```

### Why this config (key decisions)

| Decision | Reason |
|---|---|
| `youtube-plugin 1.18.2` | Latest version; the legacy YouTube source manager (`sources.youtube: false`) is not used |
| clients `[TV, WEB, ANDROID_VR]` | **Only `TV` supports OAuth** (official docs: *"Only the TV client supports OAuth... Web, Android, and Music clients only support public content"*). `WEB`/`ANDROID_VR` stay as fallback for public videos. `MUSIC` is not used — search-only, cannot stream. |
| `oauth.enabled: true` + refreshToken | Bypasses the "This video requires login" block for restricted videos (age-restricted, region-locked, etc.) |
| `remoteCipher.url` | youtube-plugin 1.18.2 regex cipher is **broken** against new YouTube player scripts (`Must find sig function`, issue #225 — maintainer: *"use a remote cipher server"*). Public yt-cipher instance, 10 req/s rate limit. Self-host `kikkia/yt-cipher` for >1k players. |
| `skybot-lavalink-plugin 1.7.0` | **DO NOT upgrade to 1.7.1** — the jar is broken (5 classes only, missing source managers; shadow misconfig). Pin at 1.7.0. |
| `plugins/` auto-load | Lavalink loads ALL jars in `plugins/` — if 1.7.1 was ever downloaded, delete its jar from the folder; application.yml does not disable plugins. |

## 5. AWS — Enable IPv6 (key for niche videos)

IPv6 outbound is NOT automatic for instances created before the VPC had IPv6. Order of operations in the AWS Console:

1. **VPC** → select the instance's VPC → *Actions → Edit CIDRs → Add IPv6 CIDR* → **Amazon-provided IPv6 CIDR block**
2. **Subnets** → select the subnet → *Actions → Edit IPv6 CIDRs* → **Add IPv6 CIDR** (Amazon-provided)
3. Same subnet → *Actions → Edit subnet settings* → check **Enable auto-assign IPv6 address**
4. **EC2 → Instances** → select the instance → *Networking → Manage IP addresses* → **Assign new IPv6 address** → Auto-assign
5. **Route tables** → select the instance's route table → *Actions → Edit routes* → **Add route**: Destination `::/0`, Target `igw-xxx` (the same Internet Gateway as the `0.0.0.0/0` route) → Save
   - **This step is the most commonly missed one** — without it the IPv6 address appears but outbound traffic hangs (dropped SYNs, not a fast error)
6. (Optional) Security group inbound IPv6 `::/0` if you want IPv6 access — not required for streaming (outbound is allow-all by default)

## 6. OS — Verify & Enable IPv6

```bash
# Check for a global address (not just fe80::)
ip -6 addr show | grep inet6
# Should show: 2406:.../128 scope global dynamic

# Check the IPv6 default route
ip -6 route show default
# default via fe80::... dev enpX proto ra metric 100

# Test IPv6 connectivity to the internet
curl -6 --connect-timeout 8 -sS -o /dev/null -w "%{http_code}\n" https://www.google.com
# 200 = IPv6 works
```

If no global address appears (SLAAC not active):

```bash
sudo sysctl -w net.ipv6.conf.all.accept_ra=2   # required: accept Router Advertisements
sudo netplan apply
```

Note: the IPv6 default route from RA has `expires ~1800s` — normal, the IGW re-announces continuously and `accept_ra=2` makes the route auto-refresh. Nothing to manage.

## 7. Start Lavalink

**IMPORTANT — Java network stack:**

| Flag | Effect |
|---|---|
| `-Djava.net.preferIPv4Stack=true` | **Forces IPv4-only** — use in phase 1 when the VPS has no IPv6 yet (without it: `Network is unreachable`) |
| `-Djava.net.preferIPv6Addresses=true` | **Prefers** IPv6, IPv4 fallback automatically — use now (phase 2) |

```bash
cd ~/lavalink
nohup java -Djava.net.preferIPv6Addresses=true -jar Lavalink.jar > lavalink.log 2>&1 &
```

Verify startup (~10 seconds):

```bash
sleep 12 && tail -30 lavalink.log
```

Things that must appear:
- `Lavalink is ready` / server listening on :2333
- OAuth refresh token refreshed successfully (TV client login OK)
- No `Must find sig function` (means the remote cipher is active)

Restart: `pkill -f Lavalink.jar` then start again with the command above.

## 8. OAuth Refresh Token

Obtain the token via the youtube-plugin TV OAuth flow (see youtube-source docs: the OAuth flow yields a `refreshToken`). Once obtained:

- Store it in `plugins.youtube.oauth.refreshToken` in the VPS application.yml
- **Do not store the token in version control or shared files** — use a placeholder
- The plugin auto-refreshes the token itself (log shows a successful refresh with no errors)

## 9. Updating Plugin / Lavalink

```bash
# Stop
pkill -f Lavalink.jar
# Backup config
cp application.yml application.yml.bak
# Replace jars (Lavalink.jar, plugins/*.jar) — always verify:
#   - youtube-plugin: do not upgrade while the regex cipher is still broken in newer versions (check upstream CHANGELOG)
#   - skybot: stay on 1.7.0 (1.7.1 is broken)
#   - Delete replaced jars from plugins/ (ALL jars are auto-loaded)
# Start again
nohup java -Djava.net.preferIPv6Addresses=true -jar Lavalink.jar > lavalink.log 2>&1 &
```

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Boot fails / source managers missing | skybot-lavalink-plugin 1.7.1 (broken jar) | Pin 1.7.0, delete the 1.7.1 jar from `plugins/` |
| `Must find sig function` on load | Regex cipher broken vs new player script (issue #225) | Enable `remoteCipher` (section 4) |
| `OAuth has been enabled without registering any OAuth-compatible clients` | `TV` missing from configured clients | Add `TV` to `clients` |
| `This video requires login` (all clients) | OAuth disabled / expired token / non-TV client | `oauth.enabled: true` + valid refreshToken; check the refresh log |
| `Network is unreachable` while streaming | Java forced IPv4, VPS has no IPv6 | Switch to `preferIPv6Addresses=true` (or `preferIPv4Stack=true` for IPv4-only) |
| `Connect timed out` to googlevideo (niche videos) | Per-video CDN block on IPv4 datacenter (SYN blackhole) | Enable IPv6 (sections 5-6) — resolves most cases |
| Niche video still fails on both stacks | CDN node blocked on IPv4+IPv6 | Not fixable in config — the bot-side multi-source fallback handles it (ytsearch → scsearch → dzsearch) |
| `guildId: __keepalive__` WARN in logs | lavalink-client keepalive request with wrong format | Harmless, ignored by Lavalink, no crash |
| `Client [WEB]/[ANDROID_VR] failed: requires login` in logs | Non-OAuth clients do fail on login-only videos | Normal — `TV` handles those; not an error |
| Choppy stream | Buffer too small / not enough VPS CPU | Increase `bufferDurationMs`, lower `resamplingQuality` |

## 11. Bot Configuration (Discord)

`.env` of the bot connecting to this server:

```env
# NODELINK_HOST (active) — Lavalink host/ip per network (e.g. localhost for local testing)
NODELINK_HOST=localhost
```

Notes:
- The bot connects to Lavalink at the configured host — adjust it to the network where the bot runs
- The bot side should already have fallbacks: permanent-error detection + multi-source (ytsearch → scsearch → dzsearch) + autoplay stuck fallback — the last layer if Lavalink still cannot play a specific video
- After a Lavalink restart the bot detects the disconnected node and recreates the player automatically (stale player fix)
