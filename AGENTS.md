# Paperplane Single Node

Single-process Discord music bot + AI assistant. **No cluster / Redis / EventBus** — runs as one Node process. This is the simplified alternative to the clustered `Paperplane/` bot; use one bot deployment at a time.

## Quick Start

```bash
cp .env.example .env
npm install
npm run dev            # tsx watch — hot reload
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start with hot-reload (tsx watch) |
| `npm start` | Run compiled bot (`node dist/index.js`) |
| `npm run build` | Compile TypeScript to `dist/` (`tsc`) |
| `npm run typecheck` | Type-check only (`tsc --noEmit`) |

No linter, formatter, or test framework configured. `npm run typecheck` is the only verification step.

## Setup / env (`.env`)

- `DISCORD_TOKEN`, `CLIENT_ID` — required.
- `PREFIX` — command prefix, default `-`.
- `DEPLOY_COMMANDS=true` by default — set `false` to skip global slash-command deploy on every restart.
- `API_PORT` — Express API port, default `3001` (falls back to `BOT_API_PORT`). Must match the dashboard's `BOT_API_URL`.
- `MONGO_URI` — MongoDB connection.
- `LAVALINK_HOST/PORT/PASSWORD/SECURE/REGION` (+ optional `_2` for a second node) — music playback.
- AI (optional): `AI_API_KEY` (fallback `OPENROUTER_API_KEY`), `AI_MODEL` (fallback `OPENROUTER_MODEL`, default `qwen2.5:7b`), `AI_BASE_URL` (default `https://openrouter.ai/api/v1`), plus `AI_TEMPERATURE`, `AI_MAX_TOKENS`. AI trigger word = `TRIGGER` env (default `mona`) or `@bot` mention.
- Dashboard auth (optional): `NEXTAUTH_SECRET` + `TRUSTED_IPS` mirror the clustered bot's `pp_session` HMAC gate.

## Architecture

`src/index.ts` is a thin orchestrator; startup logic lives in `src/bot/core/bootstrap/`.

```
src/bot/
  music/
    commands/{slash,prefix}/  ← only music commands; auto-loaded by filename (no registration)
    engine/                   ← playback engine (musicEvents, lavalink, PlayerManager, ...)
    resolvers/                ← Youtube / Spotify / Soundcloud
    services/                 ← PlayerService, MusicService, QueueService, SearchService, ...
  core/
    state/                    ← in-RAM state: StateManager, QueueStore, NowPlayingStore, LoopStore, QueueLock
    utils/                    ← Logger, ShutdownManager, CooldownManager, VoiceCheck
    bootstrap/                ← loadCommands, loadEvents, registerShutdownTasks
    constants/                ← Colors, Emojis, MusicModes
  ai/
    engine/                   ← AIEngine, AIDJ, CommandInterpreter, ConversationMemory, PromptBuilder
    services/                 ← AIService, AITaskQueue, WebSearchService, PromptFilter, MemoryService
  database/
    connection.ts             ← MongoDB (mongoose)
    models/                   ← Guild, PlayerState, Conversation, Memory, Activity, SongRequest, HistoryEntry
    repositories/             ← GuildRepository, MemoryRepository, ActivityRepository, SongRequestRepository
  api/apiServer.ts            ← Express API (health / nowplaying / queue / stats)
  events/                     ← ready, messageCreate, interactionCreate, voiceStateUpdate
  ui/{embeds,components}/      ← embed builders + button rows
  telemetry/                  ← MetricsCollector (stub)
```

## Key design

- **Queue truth = `state.queues` (RAM)**, not Lavalink's internal queue. **NowPlaying = `state.nowPlaying`** (RAM).
- **`withQueueLock(guildId, fn)`** serializes every "mutate queue + play" path — prevents `shift()`+`play()` races between `advanceQueue`, `skip`, and `trackError`.
- **Auto-advance** skips failed tracks instead of nuking the rest of the queue.
- **Source filter** ("Spotify feel"): keeps 2–7 min tracks + keyword blacklist (karaoke/live/nightcore/etc.); "live" is bound to a live-context word.
- **Idle disconnect**: 1-min (bot alone) / 3-min (others present); sets `idleDisconnect` so `voiceStateUpdate` skips the embed on idle timeout.
- **AI** bounded concurrency via `AITaskQueue` (default 4); web search via DuckDuckGo.

## Music command status

| Command | Status | Voice | | Command | Status | Voice |
|---------|--------|-------|---|---------|--------|-------|
| play | ✅ | Same VC | | search | ✅ | Same VC |
| skip | ✅ | Same VC | | remove | ✅ | Same VC |
| stop | ✅ | Same VC | | move | ✅ | Same VC |
| pause | ✅ | Same VC | | swap | ✅ | Same VC |
| resume | ✅ | Same VC | | jump | ✅ | Same VC |
| queue | ✅ | None | | autoplay | ✅ | Same VC |
| nowplaying | ✅ | None | | filter | ✅ | Same VC |
| loop | ✅ | Same VC | | equalizer | ✅ | Same VC |
| shuffle | ✅ | Same VC | | | | |
| clear | ✅ | Same VC | | | | |
| volume | ✅ | Same VC | | | | |
| seek | ✅ | Same VC | | | | |
| lyrics | ✅ | Same VC | | | | |

## Style conventions

- **No emojis in embeds / user-facing messages.** Success, error, and warning embeds (and any Discord reply) must not contain emoji characters. Convey status via embed color + text only. Remove the `Emojis` constant (`src/bot/core/constants/Emojis.ts`) and any emoji literals from embed builders.
- **Exception:** Source indicator emoji (Spotify/Deezer) allowed in `NowPlayingEmbed` and `trackStart`/`Resumed` embeds (`getSourceEmoji` in `NowPlayingEmbed.ts`).

## Gotchas

- **No Redis.** Despite the filename, `src/bot/music/services/RedisPlayerState.ts` is an in-memory `EventEmitter` stub ("not used in single node"). Do not add `REDIS_URL` — it is unused.
- **Engine files are single-node copies** of the clustered `Paperplane/` engine: `closeOnError: false` on nodes, `markTrackStartSuppressed` flag, node-level error handler removed (LavalinkNode is not an EventEmitter), telemetry stubbed.
- **Commands auto-load by filename** from `src/bot/music/commands/{slash,prefix}/` on startup — adding a file is enough; no manual registration. Only music commands exist here (no setup/system/ai/plugin trees).
- **Custom `Logger`** (`src/bot/core/utils/Logger.ts`), not `console`. Use `Logger.info/error/...`.
- **`DEPLOY_COMMANDS` defaults to `true`** → global slash redeploy every restart; set `DEPLOY_COMMANDS=false` for normal runs.
- This repo is the **bot only** — the dashboard lives in the separate `Dashboard Discord/` repo.

## Audit findings (2026-07-13)

Senior-dev audit of all `src/`. No CRITICAL (no silent death — global `unhandledRejection`/`uncaughtException` present; lavalink listeners + slash path try/caught). `QueueLock` finally-guard safe. Radio/djperm fully removed (0 refs).

**HIGH**
- **H1 (FIXED 2026-07-13)** `play`/`search`/`SpotifyFallback`/`resolveAndQueueTracks` mutate `state.queues` + `player.play` **outside `withQueueLock`** (`play.ts:113,155`, `prefix/play.ts:79,109,148`, `search.ts:63`, `SpotifyFallbackService.ts:133`, `PlayerService.ts:117`). Race with `advanceQueue`/`skip`/`trackError` → queue corruption / double-play. Fix: wrap mutate+play in `withQueueLock` (mirror `PlaybackEngine.skip`/`stop`).
- **H2 (FIXED 2026-07-13)** `worker/TaskQueue.ts` broken: `handleTimeout` (`:123`) uses stale `idx` → wrong `splice` + emits `task:failed` for a task that succeeded; `activeCount` double-decrements (`:128` + `:96`); completed tasks never spliced → unbounded `this.queue`. Fix: key tasks in `Map<id>`, prune on settle.
- **H3 (FIXED 2026-07-13)** `StateService.restoreAllStates` (`:158`) never called (only internal recursion). `saveState` writes `PlayerState` to Mongo but it's never read → resume-after-restart is dead (`isRestoredGuild`/`clearRestoredGuild` in `musicEvents.ts:168` dead). Fix: call `restoreAllStates(client)` once after Lavalink ready (`ready.ts`).

**MEDIUM**
- **M1 (FIXED 2026-07-13)** API server (`apiServer.ts`) has no auth + binds `0.0.0.0` → guild/voice info disclosure. Enforce `TRUSTED_IPS` / token or bind `127.0.0.1`.
- **M2 (FIXED 2026-07-13)** `/filter` & `/equalizer` both use `lastFilter` (`GuildRepository.ts:30-39`) → wrong "current" state. Use the existing `lastEqualizer` field.
- **M3 (FIXED 2026-07-13)** Embeds still use `Emojis` (`NowPlayingEmbed.ts:3,7,17,27`) + wrong `getSourceEmoji` (returns `DEEZER` for all non-Spotify). Violates the no-emoji rule — remove `Emojis`, fix source mapping.
- **M4 (FIXED 2026-07-13)** `ActivityService.ts:32-41` buffer grows unbounded on sustained Mongo flush failure.
- **M5 (FIXED 2026-07-13)** Prefix dispatch (`messageCreate.ts:27,30`) not wrapped in try/catch (slash is) → throwing prefix command = unhandledRejection, no user error.
- **M6 (FIXED 2026-07-13)** `/play` won't restart a stalled player (`play.ts:146`): appends only when `!playing && !paused` is false.

**LOW**
- **L1 (FIXED 2026-07-13)** `AIEngine.isReady()` allows localhost without `apiKey` → empty `Bearer`.
- **L2 (FIXED 2026-07-13)** `PromptFilter` `allowedContext` whitelist defeats `blockedPatterns`.
- **L3 (FIXED 2026-07-13)** Emoji in console (`index.ts:93`, `Logger.ts:33`).
- **L5 (FIXED 2026-07-13)** `messageCreate.ts:50` `sendTyping()` not try/caught.

**Verified safe against `lavalink-client` v2.10.2 (do NOT "fix" these):**
- **H4 (auto-advance via `stopPlaying()`→`queueEnd`) is CORRECT.** `stopPlaying()` sets `internal_stopPlaying=true` and sends `track:{encoded:null}` (`dist/index.js:5985-6000`); Lavalink emits `trackEnd`, library emits `queueEnd` when queue empty (`dist/index.js:2756`). So `stopPlaying()`→`queueEnd`→`advanceQueue` works.
- **L4 (`player.queue.current` for `seek`/`lyrics`) is RELIABLE.** `player.play({track, clientTrack})` sets `player.queue.current = clientTrack` (`dist/index.js:5667`); `trackStart` only overrides if absent. Bot always passes `clientTrack`, so it stays in sync.
- Not run: `npm run typecheck` (no compiler executed). Run before merge.
