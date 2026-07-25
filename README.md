<div align="center">

# Paperplane

Single-process Discord music bot + AI assistant.  
TypeScript, discord.js v14, Express 5, Lavalink, PostgreSQL/MongoDB, Redis.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)

</div>

---

## Features

- **Music Playback** — 23 commands, multi-source (YouTube, Spotify, SoundCloud, Deezer)
- **AI Assistant** — Chat via OpenRouter, triggered by `@bot` or configurable trigger word
- **Redis Cache** — Optional Redis backend for rate limiting (graceful fallback to in-memory)
- **Lavalink** — Zero-downtime failover across multiple nodes (≤1s detect)
- **Position Resume** — Saves position every 5s, resumes on restart after hard kill
- **SponsorBlock** — Auto-skips sponsors, intros, outros on YouTube videos
- **Observability** — Prometheus metrics, Loki logs, Grafana dashboard (Docker Compose)
- **Spotify Scraper** — HTML scraper, no API key needed
- **Auto-Failover** — 3 layers (nodeError, nodeDisconnect, health check 1s)
- **Smart Search** — `ytmsearch:` → `ytsearch:` → `scsearch:` fallback chain
- **Idle Disconnect** — 1-min alone / 3-min with others

## Quick Start

```bash
cp .env.example .env      # Configure your token
npm install
npm run typecheck          # Type checking
npm run build && npm start # Production
```

### Optional: Docker stack (Redis + Observability)

```bash
docker compose up -d       # Starts Redis, Prometheus, Loki, Grafana
```

Grafana at `http://localhost:4000` (admin / paperplane).  
Prometheus auto-scrapes bot at `host.docker.internal:3001/api/metrics`.

## Commands

All 23 commands available as **slash** (`/`) and **prefix** (`-`):

| Category | Commands |
|----------|----------|
| **Playback** | `play` `search` `skip` `stop` `pause` `resume` `seek` |
| **Queue** | `queue` `clear` `remove` `move` `swap` `jump` |
| **Display** | `nowplaying` `lyrics` `queue` |
| **Control** | `loop` `shuffle` `volume` `autoplay` `filter` `equalizer` |
| **Utility** | `help` `prefix` |

## Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 22+, TypeScript 7 |
| **Framework** | discord.js v14.27 |
| **Audio** | Lavalink, lavalink-client v2.10 |
| **Database** | PostgreSQL (Prisma) / MongoDB (Mongoose) — hybrid |
| **Cache** | Redis 7 (optional) / in-memory fallback |
| **API** | Express 5 (health, nowplaying, queue, metrics) |
| **AI** | OpenRouter (configurable endpoint, any OpenAI-compatible API) |
| **Observability** | Prometheus, Loki, Grafana (Docker Compose) |

## Environment

See `.env.example`. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_TOKEN` | — | Bot token |
| `PREFIX` | `-` | Prefix for text commands |
| `TRIGGER` | `mona` | AI trigger word |
| `AI_API_KEY` | — | OpenRouter / OpenAI API key |
| `NODELINK_HOST` | `localhost` | Lavalink server host |
| `NODELINK_PORT` | `2333` | WebSocket port |
| `NODELINK_PASSWORD` | `youshallnotpass` | Server password |
| `MAX_QUEUE` | `150` | Max tracks in queue |
| `MONGO_URI` | — | MongoDB connection string (default) |
| `DATABASE_URL` | — | PostgreSQL connection string (optional, overrides MongoDB) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection (optional) |
| `API_PORT` | `3001` | Express API port |
| `LOG_FORMAT` | `pretty` | `pretty` or `json` (for Loki) |

## Production (PM2)

```bash
npm install -g pm2
npm run build
npm run pm2:start
pm2 save
pm2 startup           # Auto-start on reboot
```

## License

Apache License 2.0
