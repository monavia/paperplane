<div align="center">

# 🎵 Paperplane

Single-process Discord music bot + AI assistant.  
TypeScript, discord.js v14, NodeLink, Express, PostgreSQL/MongoDB.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)

</div>

---

## ✨ Features

- **🎶 Music Playback** — 23 commands, multi-source (YouTube, Spotify, SoundCloud, Deezer)
- **🤖 AI Assistant** — Chat via OpenRouter, triggered by `@bot` or configurable trigger word
- **🔀 In-Memory Queue** — No Redis dependency, `withQueueLock` prevents race conditions
- **⚡ NodeLink** — Zero-downtime failover across multiple nodes (≤1s detect)
- **📌 Position Resume** — Saves position every 5s, resumes on restart after hard kill
- **🛡️ SponsorBlock** — Auto-skips sponsors, intros, outros on YouTube videos
- **📋 Queue Limit** — 150 max tracks (configurable via `MAX_QUEUE`)
- **🗂️ Spotify Scraper** — HTML scraper, no API key needed
- **🔄 Auto-Failover** — 3 layers (nodeError, nodeDisconnect, health check 1s)
- **🔍 Smart Search** — `ytmsearch:` → `ytsearch:` → `scsearch:` fallback chain
- **🔇 Idle Disconnect** — 1-min alone / 3-min with others

## 🚀 Quick Start

```bash
cp .env.example .env      # Configure your token
npm install
npm run dev                # Hot-reload (tsx watch)
npm run typecheck          # Type checking
npm run build && npm start # Production
```

## 📋 Commands

All 23 commands available as **slash** (`/`) and **prefix** (`-`):

| Category | Commands |
|----------|----------|
| **Playback** | `play` `search` `skip` `stop` `pause` `resume` `seek` |
| **Queue** | `queue` `clear` `remove` `move` `swap` `jump` |
| **Display** | `nowplaying` `lyrics` `queue` |
| **Control** | `loop` `shuffle` `volume` `autoplay` `filter` `equalizer` |
| **Utility** | `help` `prefix` |

## 🏗️ Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 22+, TypeScript |
| **Framework** | discord.js v14.26 |
| **Audio** | NodeLink, lavalink-client v2.10 |
| **Database** | PostgreSQL (Prisma) / MongoDB (Mongoose) — hybrid |
| **API** | Express (health, nowplaying, queue, stats) |
| **AI** | OpenRouter (configurable endpoint, any OpenAI-compatible API) |

<details>
<summary><b>📁 Architecture</b></summary>

```
src/
├── index.ts                      ← Entry point
├── bot/
│   ├── config/                   ← Env-driven config
│   ├── core/state/               ← RAM stores (queues, nowPlaying, loop, queue lock)
│   ├── core/utils/               ← Logger, ShutdownManager
│   ├── core/bootstrap/           ← Startup: load commands, events, shutdown tasks
│   ├── music/
│   │   ├── engine/               ← NodeLink client, PlaybackEngine, QueueEngine, PlayerWatchdog
│   │   ├── services/             ← PlayerService, QueueService, SearchService, StateService
│   │   └── commands/             ← Slash + prefix (auto-loaded by filename)
│   ├── ai/                       ← AIEngine, AITaskQueue, ConversationMemory
│   ├── events/                   ← Discord event handlers
│   ├── api/apiServer.ts          ← Express API (auth: TRUSTED_IPS + BOT_API_TOKEN)
│   ├── database/                 ← Prisma (PostgreSQL) + Mongoose models + hybrid repositories
│   └── ui/                       ← Embed builders, button components
```

</details>

## 🌐 Environment

See `.env.example`. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_TOKEN` | — | Bot token |
| `PREFIX` | `-` | Prefix for text commands |
| `TRIGGER` | `mona` | AI trigger word |
| `AI_API_KEY` | — | OpenRouter / OpenAI API key |
| `NODELINK_HOST` | `localhost` | NodeLink server host |
| `NODELINK_PORT` | `2333` | WebSocket port |
| `NODELINK_PASSWORD` | `youshallnotpass` | Server password |
| `MAX_QUEUE` | `150` | Max tracks in queue |
| `MONGO_URI` | — | MongoDB connection string (default) |
| `DATABASE_URL` | — | PostgreSQL connection string (optional, overrides MongoDB) |
| `API_PORT` | `3001` | Express API port |

## ⚙️ Production (PM2)

```bash
npm install -g pm2
npm run build
npm run pm2:start
pm2 save
pm2 startup           # Auto-start on reboot
```

## 📄 License

MIT
