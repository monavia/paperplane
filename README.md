# Paperplane

Single-process Discord music bot + AI assistant. TypeScript, discord.js v14, NodeLink, MongoDB, Express.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev              # hot-reload (tsx watch)
npm run typecheck        # type-check
npm run build && npm start  # production
```

## Features

- **Music**: 21 commands (play, skip, stop, queue, loop, shuffle, filter, equalizer, lyrics, etc.)
- **AI**: Chat assistant via OpenRouter, triggered by `@bot` or configurable trigger word
- **Queue**: In-memory state (`state.queues`) — no Redis dependency
- **NodeLink**: Music playback over audio nodes (up to 20 nodes, auto-failover, session resuming)
- **Source filter**: 2–7 min window + keyword blacklist
- **Autoplay**: Generates similar tracks when queue ends
- **Idle disconnect**: 1-min alone / 3-min with others
- **Playback state**: MongoDB persistence — resume after restart
- **API**: Express server on `:3001` (health, nowplaying, queue, stats)

## Commands

All 21 commands available as both **slash** (`/`) and **prefix** (`PREFIX`, default `-`):

`play` `search` `skip` `stop` `pause` `resume` `queue` `nowplaying` `loop` `shuffle` `clear` `volume` `seek` `lyrics` `remove` `move` `swap` `jump` `autoplay` `filter` `equalizer`

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js, TypeScript |
| Framework | discord.js v14.26 |
| Music | NodeLink, lavalink-client v2.10 |
| Database | MongoDB (mongoose v8) |
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
| `MONGO_URI` | — | MongoDB connection string |
| `API_PORT` | `3001` | Express API port |
| `BOT_API_TOKEN` | — | Optional shared token for API auth |

## Architecture

```
src/
  index.ts               ← entry point
  bot/config/            ← env-driven config
  bot/core/state/        ← in-RAM stores (queues, nowPlaying, loop, queue lock)
  bot/core/utils/        ← Logger, ShutdownManager, CooldownManager
  bot/core/bootstrap/    ← startup: load commands, events, shutdown tasks
  bot/music/engine/      ← NodeLink client, PlaybackEngine, QueueEngine, PlayerManager
  bot/music/services/    ← PlayerService, QueueService, SearchService, StateService
  bot/music/commands/    ← slash + prefix (auto-loaded by filename)
  bot/ai/                ← AIEngine, AITaskQueue, AIDJ, ConversationMemory
  bot/events/            ← Discord event handlers
  bot/api/apiServer.ts   ← Express API
  bot/database/          ← mongoose models + repositories
  bot/ui/                ← embed builders, button components
```

## Gotchas

- No Redis — `RedisPlayerState.ts` is an in-memory stub
- Commands auto-discovered by filename — just add a file
- `DEPLOY_COMMANDS=false` to skip slash deploy on restart
- Custom `Logger`, not `console`

## License

MIT
