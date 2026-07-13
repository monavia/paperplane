# Paperplane

Single-process Discord music bot + AI assistant. TypeScript, discord.js v14, NodeLink, Express, PostgreSQL/MongoDB.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev              # hot-reload (tsx watch)
npm run typecheck        # type-check
npm run build && npm start  # production
```

## Features

- **Music**: 22 commands (play, skip, stop, queue, loop, shuffle, filter, equalizer, lyrics, help, etc.)
- **AI**: Chat assistant via OpenRouter, triggered by `@bot` or configurable trigger word
- **Queue**: In-memory state (`state.queues`) — no Redis dependency
- **NodeLink**: Music playback over audio nodes (up to 20 nodes, auto-failover)
- **Position resume** — saves position every 5s, restores on restart
- **Failover** — 3 layer (nodeError, nodeDisconnect, health check 5s). Instant detect + failover via heartbeat 1s
- **Watchdog** — detects stuck players (>15s), triggers failover after 3 consecutive sticks
- **Internet glitch recovery** — watchdog detects silent voice loss, reconnects + replays
- **SponsorBlock** — auto-skip sponsor, intro, outro segments
- **Source filter**: 2–7 min window + hard reject BAD_KEYWORDS (word boundary)
- **Autoplay**: Generates similar tracks when queue ends
- **Idle disconnect**: 1-min alone / 3-min with others
- **Playback state**: PostgreSQL (Prisma) or MongoDB — resume after restart
- **Queue limit**: 150 max tracks (configurable via `MAX_QUEUE`)
- **Spotify scraper**: HTML scraper (no API key needed), support playlists, albums, tracks
- **Spotify URL embed**: Shows Spotify link (not YouTube) in `NowPlayingEmbed`
- **API**: Express server on `:3001` (health, nowplaying, queue, stats)
- **Help**: `/help` or `-help` (aliases `h`, `commands`)

## Commands

All 22 commands available as both **slash** (`/`) and **prefix** (`PREFIX`, default `-`):

`play` `search` `skip` `stop` `pause` `resume` `queue` `nowplaying` `loop` `shuffle` `clear` `volume` `seek` `lyrics` `remove` `move` `swap` `jump` `autoplay` `filter` `equalizer` `help`

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js, TypeScript |
| Framework | discord.js v14.26 |
| Music | NodeLink, lavalink-client v2.10 |
| Database | PostgreSQL (Prisma) / MongoDB (Mongoose) — hybrid fallback |
| API | Express |
| AI | OpenRouter (configurable endpoint) |

## Environment

See `.env.example`. Key vars:

| Var | Default | Description |
|-----|---------|-------------|
| `DISCORD_TOKEN` | — | Bot token |
| `PREFIX` | `-` | Prefix for text commands |
| `TRIGGER` | `mona` | AI trigger word |
| `AI_API_KEY` | — | OpenRouter API key (or `OPENROUTER_API_KEY`) |
| `AI_MODEL` | `qwen2.5:7b` | LLM model ID |
| `NODELINK_HOST` | `localhost` | NodeLink server host |
| `NODELINK_PORT` | `2333` | WebSocket port |
| `NODELINK_PASSWORD` | `youshallnotpass` | Server password |
| `MAX_QUEUE` | `150` | Max tracks in queue |
| `DATABASE_URL` | — | PostgreSQL connection string (Prisma) |
| `MONGO_URI` | — | MongoDB connection string (fallback) |
| `API_PORT` | `3001` | Express API port |
| `BOT_API_TOKEN` | — | Optional shared token for API auth |

## Architecture

```
src/
  index.ts               ← entry point
  bot/config/            ← env-driven config (PREFIX, TRIGGER, MAX_QUEUE, NODELINK_*)
  bot/core/state/        ← in-RAM stores (queues, nowPlaying, loop, queue lock)
  bot/core/utils/        ← Logger, ShutdownManager, CooldownManager
  bot/core/bootstrap/    ← startup: load commands, events, shutdown tasks
  bot/music/engine/      ← NodeLink client, PlaybackEngine, QueueEngine, PlayerManager, PlayerWatchdog
  bot/music/services/    ← PlayerService, QueueService, SearchService, StateService (hybrid Prisma/Mongoose)
  bot/music/commands/    ← slash + prefix (auto-loaded by filename)
  bot/ai/                ← AIEngine, AITaskQueue, AIDJ, ConversationMemory
  bot/events/            ← Discord event handlers
  bot/api/apiServer.ts   ← Express API (auth: TRUSTED_IPS + BOT_API_TOKEN)
  bot/database/          ← prisma (PostgreSQL) + models (Mongoose) + repositories (hybrid)
  bot/ui/                ← embed builders, button components
```

## Gotchas

- No Redis — `RedisPlayerState.ts` is an in-memory stub
- Commands auto-discovered by filename — just add a file
- `DEPLOY_COMMANDS=false` to skip slash deploy on restart
- Custom `Logger`, not `console`
- `stop` clears `PlayerState` — queue won't resume after restart
- Failover needs 2+ NodeLink instances (self-hosted recommended)
- SponsorBlock only for YouTube videos, not regular songs

## License

MIT
