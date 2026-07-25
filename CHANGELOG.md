# Changelog — Paperplane

## 2026-07-26 — v3.0.0

### Backup & Rollback Runbook (Fase 1.0)

- **Backup script** — `scripts/backup.sh` (Linux) + `scripts/backup.ps1` (Windows). MongoDB dump + .env copy + auto-prune 7 hari.
- **Rollback docs** — `docs/backup.md`: step-by-step `git revert` → rebuild → restart → verify. Restore from backup prosedur.
- **Cron config** — backup otomatis tiap jam 3 pagi via crontab.

### Persistent Queue Store (Fase 1.1)

- **MongoQueueStore** — `lavalink.ts`: sudah terpasang di `queueOptions.queueStore`. Queue persist di MongoDB via `PlayerState`, dual-system dengan `saveState`. Restart bot → queue gak hilang.

### API Rate Limiting (Fase 1.10)

- **Global IP rate limit** — `api-base.ts`: middleware `globalRateLimit()` (default 1000 req/min, config via `API_RATE_LIMIT`, trusted IPs bypass).
- **Key spoofing fix** — `guildRateLimit()` key dari `guildId` → `guildId:clientIp`. Pakai `x-forwarded-for` header untuk reverse proxy.
- **Per-guild limits** — player 30/min, queue 20/min, filter/equalizer 20/min, search 15/min, GET 60/min.
- **Config** — bot.ts + .env.example: tambah `API_RATE_LIMIT`.

### DB Indexing (Fase 1.12)

- **Prisma** — compound index `(guildId, timestamp desc)` di Activity/HistoryEntry, `(userId, createdAt desc)` di Conversation/Memory, `updatedAt` di PlayerState.
- **Mongoose** — `updatedAt` index di PlayerState, `timestamp` index di UserActivity.

### Spotify env vars

- **Config** — bot.ts + .env.example: `MAX_SPOTIFY=100` (max playlist tracks), `SPOTIFY_BATCH=20` (parallel resolve per batch).

### AI prompt limit (1.8 H2)

- **Truncation** — `messageCreate.ts`: prompt di-potong ke 1500 chars sebelum dikirim ke AI. Cegah token abuse.

### removeByQuery confirmation (1.4 H5)

- **Button confirmation** — `remove.ts` (slash + prefix): kalo match >3, kirim embed + `ActionRow` button "Yes, Remove N Tracks" / "Cancel". Click Confirm → execute. Cancel / 30s timeout → disabled buttons.

### Fixes

- **Stop double embed** — `markStopDisconnect()` flag cegah `voiceStateUpdate.ts` kirim "Disconnected from voice channel." embed setelah manual stop.
- **removeByQuery await** — `prefix/remove.ts`: fix missing `await` on async function.

## 2026-07-25 — v2.2.3

### Cache migration to Redis (Fase 0.7.1–0.7.2)

- **SearchCache → getAdapter** (0.7.1) — `SearchCache.ts`: hapus in-memory Map class, `cachedSearch()` langsung pake `getAdapter()` — Redis auto kalo ada, fallback MemoryAdapter. TTL 1h→24h. Cache survive restart.
- **SpotifyScraper cache → getAdapter** (0.7.2) — `SpotifyScraper.ts`: hapus `Map<string, CacheEntry>` + `pruneCache()`. Pake `getCached()`/`setCached()` via `CacheAdapter`. TTL 30m→24h. Prefix `spotify:`.

### DB-Backed Track Resolver (0.7.3)

- **CachedTrack model** — `models/CachedTrack.ts` baru: Mongoose schema `{identifier, query, source, trackData, hitCount, expiresAt}`. TTL index 30 hari, indexed by hitCount.
- **CachedTrackRepository** — `repositories/CachedTrackRepository.ts` baru: `findCachedTrack()`, `upsertCachedTrack()` (upsert + inc hitCount), `pruneExpired()`.
- **Prisma schema** — `schema.prisma`: tambah model `CachedTrack` untuk PostgreSQL.
- **cachedSearch DB layer** — `SearchCache.ts`: flow Redis→DB→Lavalink. Miss di Redis → cek MongoDB → hit → simpan ke Redis + return. Miss di DB → Lavalink → simpan ke DB + Redis.

### Pre-Fetch Batch (0.7.4)

- **schedulePreFetch** — `musicEvents.ts`: setelah advanceQueue sukses play track, resolve n+1..n+5 di background via `Promise.allSettled`. Cache di Redis prefix `prefetch:{uri}` TTL 30m.
- **advanceQueue cache check** — sebelum re-resolution ke Lavalink, cek prefetch cache dulu. Skip Lavalink kalo ada cached encoded.

### SpotiFail Cache (0.7.5)

- **Fallback persistent** — `SpotifyFallbackService.ts`: `getFallbackCache()` + `setFallbackCache()`. Cek cache by Spotify URI + trackId. Simpan mapping `fallback:spotify:{trackId}` dan `fallback:spotify:{uri}` TTL 24h.
- **searchWithFallback cache** — sebelum Lavalink search, cek fallback cache. HIT → skip search, return cached YouTube track langsung. Setelah search sukses → simpan ke cache.

### Negative Cache — Dead Track Detection (0.7.6)

- **DeadTrackService** — `cache/DeadTrackService.ts` baru: `deadFingerprint(title, author)` → SHA1 hash, `isDead()` cek attempts >=3, `markDead()` increment + simpan. Cache `dead:{hash}` TTL 1h, `dead:spotify:{trackId}` TTL 6h.
- **advanceQueue integration** — `musicEvents.ts`: 3 titik cek dead fingerprint: sebelum resolve, setelah resolve gagal, setelah play gagal. Cegah infinite retry loop.

### Proactive Spotify Pre-Resolve (0.7.7)

- **schedulePreFetch Spotify path** — `musicEvents.ts`: preFetch deteksi Spotify URI → `findTrackWithDuration()` → simpan ke SpotiFailCache + prefetch cache. Non-Spotify via `player.search()`.

### Spotify batch overload fix (0.7.8)

- **Cap playlist** — `slash/play.ts` + `prefix/play.ts`: `MAX_SPOTIFY=50`. Source priority ytmsearch→ytsearch (scsearch dropped). Batch 5 (from 20).

### Prefix play fire-and-forget fix (0.7.9)

- **Await batch** — `prefix/play.ts`: `.then()` → `await` dengan `onProgress` callback. Status "Resolved X/Y tracks..." progressive, final "Added N tracks."

### RecommendationEngine autoplay fix (0.7.10)

- **Source priority: Mix first** — `RecommendationEngine.ts`: YouTube Mix (radio) jadi primary source, bukan fallback.
- **Source diversity** — similar artist search (`ytmsearch:{author}`), title search hanya kalo candidates < count.
- **Taste profile** — Redis `taste:{guildId}`: record artist preference per guild, boost rekomendasi dari artist favorit.

### Node Failover + Search Route Fix (v2.2.1)

- **failoverGuilds duplikat** — `musicEvents.ts`: panggil `FailoverManager.isFailoverGuild()` langsung, bukan `lavalink.isFailoverGuild()` yang pake set kosong. Fix embed tetap terkirim saat failover.
- **Search skip unhealthy node** — `SearchService.ts`: `searchWithRetry()` + `findTrackWithDuration()` cek `isDraining()` / `isUnhealthy()` / penalty >100 sebelum `player.search()`. Skip langsung ke `searchViaHealthyNode()`. Cegah ~3s delay retry di node broken.

### AI & fixes

- **AI prefix change fix** — `CommandInterpreter.ts`: tambah tipe `"prefix"`, regex detect "ubah prefix / ganti prefix / set prefix". `messageCreate.ts`: handler langsung `setPrefix()` + embed, bukan cuma display.
- **Mongoose deprecation fix** — `CachedTrackRepository.ts`: `new: true` → `returnDocument: "after"`.

### Infra & fixes

- **Idle disconnect 60s** — README update: 60s all cases.
- **Prometheus fix** — config mount path, `--add-host host.docker.internal`, `0.0.0.0`, `/api/metrics` exempt from auth.
- **Grafana provisioning** — datasource Prometheus+Loki, dashboard auto-import via Docker network.
- **Fase 0.8 CI pipeline** — `.github/workflows/ci.yml`: `typecheck` + `test` on push/PR. `npm audit fix`. Secrets rotation doc `docs/secrets-rotation.md`. `.env.example` sync (+6 missing vars).
- **Fase 0.9 test suites** — 7 new test files (harness, API, errors, concurrent, benchmark, state, failover, music-events). `createApp()` refactor dari `apiServer.ts`. Total 108 tests. **Dihapus dari git — lokal only.**
- **Fase 1.12 DB indexing** — Prisma: compound index `(guildId, timestamp desc)` di Activity/HistoryEntry, `(userId, createdAt desc)` di Conversation/Memory, `updatedAt` di PlayerState. Mongoose: `updatedAt` index di PlayerState, `timestamp` index di UserActivity.
- **Stop command double embed fix** — `markStopDisconnect()` flag cegah `voiceStateUpdate.ts` kirim "Disconnected from voice channel." embed setelah manual stop.

## 2026-07-25 — v2.2.2

### Foundation hardening (Fase 0.5)

- **DB disconnect shutdown** (0.5.2) — `registerShutdownTasks.ts`: +`disconnect-db` task priority `low`. Tutup Mongoose koneksi di shutdown sebelum process exit.
- **Health endpoint upgrade** (0.5.3) — `/api/health` now returns `database` (Mongoose readyState), `lavalink` (connected nodes), `memory` (rss/heap).
- **Uncaught exit** (0.5.5) — `index.ts`: `process.exit(1)` setelah uncaughtException handler. Cegah process zombie.
- **Shutdown task priority** (0.5.7) — `registerShutdownTasks.ts`: +`lavalink-disconnect` task priority `normal`. NodeLink disconnect duluan sebelum DB.
- **Rate limiter cleanup** (0.5.8) — `api-base.ts:52`: cleanup interval 60s→15s. Cegah memory leak di sliding window rate limiter.
- **Memory & event loop gauges** (0.5.10) — `MetricsCollector.ts`: RSS/heap/heapTotal + event loop lag di `/api/metrics`, update tiap 10s.
- **Label cardinality fix** (0.5.11) — `MetricsCollector.ts`: `tracksFailed` label `guild`→`error_type`. Turunkan cardinality dari ribuan guild ke ~10 error types.
- **JSON structured logging** (0.5.5.3) — `Logger.ts`: support `LOG_FORMAT=json` / `LOG_FORMAT=pretty`. JSON output `{"ts","level","msg"}` untuk Loki.

### Discord.js cache optimasi (Fase 0.6)

- **makeCache** — `index.ts`: `GuildMemberManager` max 200 per guild (keep bot sendiri), `ReactionManager` 0, `PresenceManager` 0, `MessageManager` 0. Cegah cache unlimited >3GB di 1000 guilds.
- **Sweepers agresif** — `index.ts`: `voiceStates` + `messages` purged tiap 10 menit (default 1 jam), `threads` purged >30 menit. Spread dari `Options.DefaultSweeperSettings`.
- **Partials** — `index.ts`: `[Message, Channel, Reaction]` — cegah crash di event uncached data.
- **allowedMentions** — `index.ts`: cuma `{parse:["users"]}` — cegah @everyone/@here auto-reply.
- **Consistent player lifecycle** — `/search.ts`: pake `createPlayer()` bukan raw lavalink node. Search tanpa player aktif sekarang buat player proper dengan queue + events.

### Queue end disconnect fix

- **Deferred path queue guard** — `musicEvents.ts:321`: tambah `(state.queues.get(player.guildId)?.length || 0) > 0` di condition deferred retry path. Cegah bot stuck di voice selamanya pas queue kosong. Sebelumnya `state.nowPlaying` masih ada (track terakhir) → masuk deferred retry → return tanpa set disconnect timer.

### Redis cache foundation (Fase 0.7.0)

- **Redis connection singleton** (0.7.0.1) — `src/bot/cache/redis.ts`: 2 koneksi terpisah — `redisCache` (opsional, retry + fallback) + `redisBus` (pub/sub, no fallback). Auto-connect di startup, graceful shutdown task priority `low`.
- **CacheAdapter interface** (0.7.0.1) — `src/bot/cache/CacheAdapter.ts`: `CacheAdapter` interface (`get`/`set`/`del`/`has`/`clear`/`size`) + `MemoryAdapter` (Map + TTL) + `RedisAdapter` (ioredis + JSON serialize + SCAN-based clear). Lazy singleton via `getAdapter()`, otomatis pilih Redis kalo available.
- **Cache hit/miss metrics** (0.7.0.4) — `MetricsCollector.ts`: counter `cacheHitCount` + `cacheMissCount` label `{cache:"..."}`. Ekspose di `/api/metrics` Prometheus (`paperplane_cache_hit_total`, `paperplane_cache_miss_total`).
- **Redis health check** — `/api/health` return `redis: {status: "connected"|"disabled"}`.
- **Rate limiter Redis backend** (0.7.0.8) — `api-base.ts`: `guildRateLimit()` pake Redis INCR+EXPIRE kalo available, fallback ke in-memory Map. Key prefix `paperplane:ratelimit:{guildId}`. Graceful degrade kalo Redis error.
- **Config env** — `bot.ts` + `.env.example`: tambah `REDIS_URL`, `REDIS_PREFIX`, `REDIS_ENABLED`.
- **Docker Compose Redis** — `docker-compose.yml`: tambah service `redis` (redis:7-alpine, maxmemory 512mb, allkeys-lru). Data persist di volume `redis_data`. Join stack bareng Prometheus/Loki/Grafana.

### Documentation & license

- **README refactor** — update stack (Express 5, discord.js v14.27, Redis), tambah section Docker deploy + observability stack, update env table.
- **License alignment** — `LICENSE.txt` udah Apache 2.0 sejak awal, tapi `README.md` bilang MIT. Fix: `package.json` + `README.md` → Apache 2.0.

## 2026-07-24 — v2.2.1

### Search health routing + failover fix

- **SearchViaHealthyNode** — `SearchService.ts`: new `searchViaHealthyNode()`. Saat `player.search()` gagal di node broken, search via node tersehat via `node.search()` (REST call, zero disruption to active playback).
- **searchWithRetry fallback** — setelah retries habis + node penalty > 300, coba 1x search via healthy node sebelum throw.
- **findTrackWithDuration fallback** — hapus `if (nodePenalty > 300)` guard. Selalu coba healthy node. `searchViaHealthyNode` panggil dengan `retries=0`.
- **NodePenaltyService drain fix** — `n.options?.name || n.name` → `n.options?.id`. lavalink-client NodeLinkNode gak punya `.name` property → drain/unhealthy filter mati total, scoreSorter `getPenalty(undefined)` = 0 untuk semua node. Sekarang filter + penalty scoring akurat.
- **Auto-failover di health check** — `lavalink.ts`: saat penalty > 1000 dan node masih connected, trigger `failoverFromNode()`. 60s cooldown cegah flapping.
- **Failover encoded→search priority** — `FailoverManager.ts`: search by URI dulu baru encoded. Encoded track node-specific, selalu error kalau dipindah ke Lavalink instance beda.
- **QueueEnd defer disconnect** — `musicEvents.ts`: kalo `state.nowPlaying` masih active (failover replay), tunda disconnect 30s (max 5x retry). Cegah bot leave saat background Spotify resolver belum selesai.

## 2026-07-24 — v2.2.0

### Runtime Migration: tsx → node

- **Core .js extension** — 70 files: `../foo` → `../foo.js` via bulk regex. Module `node16` + CJS explicit .js suffix.
- **@/ alias → relative** — 52 command files: `@/bot/foo` → `../../../../bot/foo.js`. `paths` dihapus dari tsconfig.
- **Side-effect import** — `import "./instrument"` → `"./instrument.js"`.
- **Build pipeline** — `"build": "tsc"` (standar), `"start": "node dist/index.js"`. Dev tetap `tsx watch` via `npm run dev`.
- **PM2** — script `dist/index.js`, interpreter `node`, tanpa `tsx` loader.
- **Verifikasi** — `tsc --noEmit` 0 error, `npm test` 38/38 lulus, `npm run build` 0 error.
- **AIEngine CJS interop fix** — `src/index.ts:113`: `const { default: AIEngine } = await import(...)` gagal karena CJS `module.exports` ter-wrap 2x oleh ESM `import()`. Fix: `(await import(...)).default` untuk unwrap layer pertama.

## 2026-07-24 — v2.1.8

### Config validation startup (0.5.1)
- `src/index.ts:40` — `validateEnv()` baru: cek `DISCORD_TOKEN`, `CLIENT_ID`, `MONGO_URI`/`DATABASE_URL` di awal `main()`. Exit dgn daftar missing + contoh .env.
- Wajib `DISCORD_TOKEN` dan `CLIENT_ID`. `MONGO_URI` atau `DATABASE_URL` minimal 1.

## 2026-07-24 — v2.1.7

### SSRF fix via SpotifyScraper (C1)
- `SpotifyScraper.ts:54` — ganti regex `parseUrl` dengan `new URL()` strict parser. Hostname harus `open.spotify.com`. Reject URL yg cuma mengandung `open.spotify.com` sebagai substring.
- `SpotifyScraper.ts:186` — `_validateUrl()` baru: protocol `https:` wajib, hostname cuma `open.spotify.com`, DNS resolve + cek setiap IP bukan private/loopback (`10.*`, `172.16-31.*`, `192.168.*`, `127.*`, `169.254.*`, `0.*`).
- `_fetchPage` panggil `_validateUrl()` sebelum fetch — defense in depth.

### VoiceCheck null safety (H1)
- `VoiceCheck.ts:28` — `engine.player.voiceChannelId` → `engine.player?.voiceChannelId`. Guard race condition kalo player lenyap antara `!engine?.player` check dan akses `voiceChannelId`.

### Alias cooldown bypass (H9) — udah dari 83b6ddb
- `messageCreate.ts` alias block udah pake `found.name` (canonical name) sebagai cooldown key sejak refactor 83b6ddb. Gak ada bypass.

### Command load failure log (M7)
- `loadCommands.ts` — restruktur try/catch: per-file error handling, bukan 1 try/catch bungkus semua. Log path file spesifik + error detail. 1 file gagal gak stop looping.

### Interaction reply silent swallow (L1)
- `interactionCreate.ts:37-41` — ganti `Logger.safe()` generic dengan inline `Logger.warn()` yg nampilin command name + method (reply/editReply) + error message.

## 2026-07-24 — v2.1.6

### Fix: AI play embed pake URL mentah, bukan judul lagu

- `messageCreate.ts:139` — ganti `queries[0]` (raw input, bisa URL) → `firstTrack?.info?.title` (judul hasil resolve Lavalink)
- Fallback ke `queries[0]` kalo resolve gagal

### Fix: AI play embed — pake NowPlayingEmbed biar konsisten dengan command play

- Ganti `EmbedBuilder().setDescription("Playing **title**")` → `NowPlayingEmbed.build(firstTrack, null)` — nampilin emoji source, artist - title, dan clickable URL

## 2026-07-23 — v2.1.5

### Fix: Queue hilang setelah restart — resume bot bengong di voice

**Root cause:** `engine.join()` panggil `state.queues.syncToPlayer(guildId)` setelah `lavalink.createPlayer()`. MongoQueueStore sudah load queue dari DB ke player, tapi syncToPlayer overwrite dengan RAM state yang kosong. Akibatnya queue player = [] → restore sukses play 1 track → queueEnd → disconnect.

**Fix:** `StateService.ts restoreGuildState` — setelah `syncFromPlayer()`, jika queue masih kosong & `saved.queue` ada isi, restore langsung dari saved state.

### Fix: Bot stuck setelah track error — Watchdog silent player

- `PlayerWatchdog.ts`: ganti `skipping replay` → panggil `advanceQueue(player)` langsung saat player silent + queue ada isi. Sebelumnya watchdog cuma log + return tiap 30s tanpa ngapa-ngapain
- `musicEvents.ts`: export `advanceQueue` biar bisa dipanggil dari watchdog

### Fix: PM2 restart wipe queue + no resume

- `StateService.ts saveState`: tambah `queue` + `nowPlaying` ke `upsertPlayerState` — sebelumnya cuma nyimpen voiceChannelId/textChannelId/position/nodeId
- `registerShutdownTasks.ts`: hapus task `destroy-players` — `player.destroy()` memicu `MongoQueueStore.delete()` yang set `queue:[]` + `nowPlaying:null` di DB, nge-wipe data yang baru disimpen
- `StateService.ts restoreGuildState`: tambah warning log kalo `first` null (queue kosong), return `false` instead of silent success
- `ecosystem.config.cjs`: `kill_timeout: 30000` — PM2 nunggu 30s sebelum SIGKILL, biar save-state 10s sempet selesai

### Fix: Bun compatibility — CommonJS → ESM exports

- 9 file di `src/bot/core/state/` + `Logger.ts`: `export =` → `export default` (Bun rejects `import` di file CommonJS)
- `ecosystem.config.cjs`: interpreter `"bun"` → `"node"` dengan `node_args: "--import tsx"` (Bun belum support `node:v8 isBuildingSnapshot` dari mongoose/bson)

## 2026-07-22

### Spotify fallback duration filter — cegah muter kompilasi 1 jam
- NEW `SearchService.ts`: `findTrackWithDuration(player, query, origTrack, clientRef?)` — loop `ytmsearch` → `ytsearch` → `scsearch`, filter encoded + not Deezer + durasi ±30% dari original
- `musicEvents.ts advanceQueue()`: Spotify re-resolution loop → `findTrackWithDuration()` — skip track kalau gak cocok durasi
- `musicEvents.ts trackError` fallback: loop manual `tracks.find()` → `findTrackWithDuration()` — cuma accept match durasi
- `musicEvents.ts retryTracks`: `Set<string>` → `Map<string, number>` — hitung retry per track. DROP di attempt ke-3, bukan infinite re-queue

### AI command — semua 19 types jalan
- `messageCreate.ts`: tambah handler `info`, `ping`, `autoplay`, `shuffle`, `loop`, `247`, `clear`, `recommend` — sebelumnya kena `default: "not supported"`
- `messageCreate.ts`: tambah handler `correct_playlist` — skip current + search keyword baru + play
- `messageCreate.ts info/ping`: ditaruh sebelum voice guard (gak perlu voice)
- `AIDJ.ts` system prompt: tambah `AUTOPLAY`, `SHUFFLE`, `LOOP`, `247`, `CLEAR`, `RECOMMEND`, `NOWPLAYING`, `VOLUME`, `INFO`, `PING`, `HELP` ke template AI
- `AIDJ.ts` parser: tambah parsing untuk 11 type baru

### Ping command — prefix + slash
- NEW `commands/info/prefix/ping.ts` — show WS ping + roundtrip, color `Colors.SUCCESS`
- NEW `commands/info/slash/ping.ts` — sama untuk slash command

### Embed disconnect saat bot di-kick
- `voiceStateUpdate.ts`: hapus guard `if (!engine.player?.voiceChannelId) return` (line 62-63) — race condition dengan `playerDisconnect` bikin embed gak terkirim
- `musicEvents.ts playerDisconnect`: revert embed redundant (voiceStateUpdate yang handle)

### Bot pindah VC manual — alone timer
- `voiceStateUpdate.ts`: tambah handler bot moved (`oldState` && `newState` && `member===botId` && channel berbeda) — cancel alone timer lama, cek humans di VC baru, start alone timer 60s kalo kosong

### Emoji source fallback (revert ke custom emoji)
- `NowPlayingEmbed.ts`: `getSourceEmoji()` revert ke `Emojis.SPOTIFY`/`Emojis.DEEZER` — custom `<:spotify:1085615172170809365>` dan `<:deezer:1085615485401448458>`

## 2026-07-21

### Load Balancing — 5 gap deep trace & fix
- **Gap 1 — `recordHtmlError` dead code**: nodeError handler sekarang deteksi HTML/proxy/503/502/gateway error → panggil `recordHtmlError()`. Setelah 2x HTML error node di-mark unhealthy, otomatis di-exclude dari `getBestNode()`.
- **Gap 2 — Search error gak kena penalty**: `searchWithRetry()` tiap error catat `recordError()` + `recordHtmlError()` kalo response HTML. Error search sekarang naikin penalty node.
- **Gap 3 — `getLeastLoadedNode()` tanpa region**: `PlayerManager.createPlayer()` kirim `vcRegion` ke `getLeastLoadedNode(vcRegion)`. Player baru di-select sesuai region user.
- **Gap 4 — Failover sebelum reconnect di health check**: urutan dibalik — reconnect dulu, baru failover kalo reconnect gagal. Cegah perpindahan player sia-sia ke node lain.
- **Gap 5 — Partial failure gak terdeteksi**: health check auto-drain node dengan penalty score >500 via `startDrain()`. Node broken-by-proxy otomatis di-skip.

### Failover & Load Balancing audit — 5 fixes
- **Duplikasi failoverFromNode**: buang duplikasi di `lavalink.ts` — panggil `FailoverManager.failoverFromNode` via re-export. Sebelumnya: 2 implementasi hampir identik di 2 file, risk of drift.
- **getLeastLoadedNode tanpa region**: tambah parameter `preferredRegion` — reconnect sekarang pilih node sesuai region kayak `createPlayer`.
- **Search tanpa retry di failover path**: `FailoverManager.ts` — ganti 4x bare `player.search()` jadi `searchWithRetry()` dengan 3 retry.
- **Stale encoded track session resume**: `lavalink.ts` resumed handler — kalo `player.play({encoded})` gagal (stale dari Lavalink cloud restart), fallback ke re-search by URI + play fresh track.
- **roundRobinIndex global leak**: `NodePenaltyService.ts` — reset index kalo jumlah connected node berubah.

### Autoplay priority — ytmsearch first untuk cloud Lavalink
- `RecommendationEngine.ts`: ganti urutan source — ytmsearch/ytsearch/scsearch duluan, YouTube Mix jadi fallback. YouTube Mix (`list=RD{videoId}`) sering gagal di Lavalink cloud karena rate limit, buang waktu 10-20 detik sia-sia.
- `RecommendationEngine.ts _searchWithRetry`: retries 2 → 3 (total 4 attempts) — cloud Lavalink butuh lebih banyak retry karena transient rate limit.
- `musicEvents.ts`: `new AutoplayEngine()` → singleton `autoplayInst` — `playedTracks` persist antar autoplay request, cegah repeat lagu.

### Autoplay repeat fix — singleton AutoplayEngine
- `musicEvents.ts`: ganti `new AutoplayEngine()` tiap track end → module-level `autoplayInst` singleton. `playedTracks` sekarang persist antar autoplay request, jadi `_isPlayed()` bener-benar cegah lagu yang udah diputer diputer lagi.
- Sebelumnya: `playedTracks` di-reset tiap ganti lagu karena instance `AutoplayEngine` baru → repeat lagu yg sama dalam 1 sesi autoplay.

### Autoplay state consistency
- `PlayerService.ts destroyEngine`: tambah `setAutoplay(guildId, false)` ke DB sebelum hapus dari memory — konsisten dengan stop path.
- `voiceStateUpdate.ts` bot-kick: tambah `setAutoplay(guildId, false)` + `setShuffle(guildId, false)` ke DB — sebelumnya cuma delete dari RAM, DB masih `true`.
- `restoreGuildState`: baca autoplay dari DB (persist across restart) — user ingin state sama sebelum restart.
- Summary: autoplay persist di restart, reset di kick manual / leave / stop.

### PlayerWatchdog double embed fix
- `PlayerWatchdog.ts` silent voice loss reconnect: tambah `markTrackStartSuppressed(guildId)` sebelum `player.play()` — cegah trackStart kirim embed 2x karena watchdog replay track yang sama.

### Autoplay recommendation stuck "No recommendations" — fix
- `RecommendationEngine.ts`: wrapper `_searchWithRetry(player, query)` — retry 2x + delay 1s buat tiap panggilan `player.search()`. Sebelumnya bare call tanpa retry, timeout langsung return [].
- `RecommendationEngine.ts _buildQuery`: strip `(feat.` / `(ft.` tanpa tutup kurung dari truncated title sebelum jadi search query.
- `RecommendationEngine.ts`: multi-source search loop (`ytmsearch` → `ytsearch` → `scsearch`) ganti nested if jadi flat loop + break on first hit.
- `RecommendationEngine.ts`: tiap kegagalan langkah (Mix, URI, search) sekarang log reason — gak silent return [] lagi.
- `play.ts` (prefix + slash): catch timeout errors log + pesan "Search timed out" instead of raw Node.js error.
- `SearchCache.ts cachedSearch`: panggil `searchWithRetry()` instead of bare `player.search()`.

## 2026-07-20

### Persistent QueueStore — QueueEngine bridge ke player.queue
- `QueueStore.ts`: tambah `setPlayerGetter()`, `syncToPlayer()`, `syncFromPlayer()`. `get()` return copy, `set()` auto-sync ke player.queue via `splice()`. `clear()` pakai `splice(0, tracks.length)` + `current = null` (lavalink Queue gak punya `clear()`)
- `PlayerService.ts`: wiring getter di module scope. `engine.join()` panggil `syncToPlayer()` setelah player dibuat — flush pre-join RAM tracks ke player.queue
- `lavalink.ts`: uncomment `MongoQueueStore` import + `queueOptions` — aktivasi lavalink's queueStore. Queue sekarang persist otomatis via lavalink internal save
- `MongoQueueStore.ts`: fix `get()` return `{current, tracks}` meski queue kosong asal ada nowPlaying
- `StateService.ts`: `saveState()` hapus `queue`/`nowPlaying` dari upsert (sekarang handle queueStore). Non-resumed restore path: `syncFromPlayer()` dulu, skip manual track add (queueStore sudah restore ke player.queue)
- `StateService.ts`: pre-emptive search `ytmsearch:` di restore path — resolve fresh track dari metadata title+author sebelum `player.play()`. Cegah `trackError` dari stale encoded Lavalink session + autoplay replacement loop

### Dashboard API — Full CRUD (1.2)
- `apiServer.ts`: tambah `DELETE/PUT /api/guild/:guildId/queue` — hapus track by index, reorder (move/swap/clear). Voice check via `requireApiSameVoice`
- `apiServer.ts`: tambah `GET/PUT /api/guild/:guildId/settings` — baca/tulis prefix, volume, autoplay, loop, shuffle, 247. PUT pake voice check kalo player aktif
- `apiServer.ts`: tambah `POST /api/guild/:guildId/search` — cari track via Lavalink, return top 10 hasil dengan metadata
- `api-base.ts`: tambah `getUserId(req)` + `requireApiSameVoice(client, engine, guildId, userId)` — throw 403 kalo user gak di VC sama bot
- `apiServer.ts POST player`: voice check via `requireApiSameVoice`

### Metrics & Observability (1.3)
- `MetricsCollector.ts`: tambah `observeCommandLatency()` + `commandLatency` gauge
- `interactionCreate.ts`, `messageCreate.ts`: command tracking — `incCommandsExecuted({command, status})` + `observeCommandLatency()` tiap eksekusi (success/fail + latency)
- `apiServer.ts`: tambah `paperplane_commands_executed_total{command}` dan `paperplane_command_latency_ms{command}` ke Prometheus endpoint
- `grafana/dashboard.json`: template Grafana dashboard dengan 9 panel — tracks played/failed, command rate & latency, guilds/connections, node penalty & players, rate limited. Siap import langsung ke Grafana
- Dashboard `MetricsPanel.tsx` + `/api/metrics` route: halaman metrics langsung di Dashboard Discord tanpa Grafana. 3 tab — Overview (9 metric cards), Lavalink Nodes (players/penalty per node), Commands (latency table). Auto-refresh 10s

### Error Recovery (1.4)
- `musicEvents.ts`: Stuck track timeout 30s — `startStuckTimer`/`clearStuckTimer` di `trackStart`/`trackEnd`/`trackError`. `playerUpdate` reset timer tiap ada progress. Auto-skip track yang stuck >30s tanpa progress
- `musicEvents.ts`: Network jitter buffer 500ms — `jitterBuffer()` delay trackError 500ms, cancel kalo player udah move on (bypassed/replaced oleh player.play baru). Cegah fallback sia-sia karena network spike
- `musicEvents.ts`: Queue replay — failed track di-push ke end of queue setelah semua fallback gagal. Bukan di-drop, jadi diretry nanti pas queue wraparound
- `lavalink.ts`: export `clearStuckTimer`/`startStuckTimer`, dipanggil di `playerUpdate` (reset) dan `playerDestroy` (cleanup)

### Per-Guild Rate Limiting (1.11)
- `api-base.ts`: tambah `guildRateLimit(maxRequests, windowMs)` — sliding window per-guild via `Map<guildId, timestamps[]>`. Cleanup tiap 1 menit. Otomatis track `rateLimitBlocked`/`rateLimitAllowed`
- `apiServer.ts`: pasang middleware di tiap endpoint — player (30/min), queue/filter/equalizer/settings (20/min), search (15/min), GET (60/min). 429 `"Too many requests"` kena exceed

### API Docs (1.9)
- NEW `src/bot/api/openapi.json` — OpenAPI 3.0 spec, 23 endpoints documented (Status, Metrics, Guild, Queue, Player, Audio, Settings, Analytics)
- `apiServer.ts`: mount Swagger UI di `/api/docs` — import dynamic `swagger-ui-express` + spec JSON
- DEP `swagger-ui-express`, `@types/swagger-ui-express`

### Testing Infrastructure (1.7)
- NEW `vitest.config.ts` — path alias `@/` → `./src/`. `npm test` = `vitest run`, `npm run test:watch` = `vitest`
- NEW `src/bot/core/utils/CooldownManager.test.ts` — 9 tests: check, set, expiry, remaining, getUses, reset single/all, independence per user/command
- NEW `src/bot/music/engine/QueueEngine.test.ts` — 12 tests: add, addMultiple, next, remove, clear, swap, move, shuffle, removeRange, getAll
- NEW `src/bot/ai/engine/CommandInterpreter.test.ts` — 14 tests: semua keyword (ID/EN/AR), play with query, correction, fallback chat
- CONVERT `src/bot/core/state/QueueLock.test.ts` — dari `node:test` ke vitest (8 tests)
- DEP `vitest`, `supertest`, `@types/supertest`

### Silent Error Handling (1.5)
- `Logger.ts`: tambah `safe(tag)` — return error handler yg log `[SilentError]` + context. Juga handle `catch {}` tanpa binding via `Logger.safe("tag")()`
- Replace `148+ silent `.catch(() => {})` + `catch {}` di engine core files (lavalink, musicEvents, PlayerService, StateService, FailoverManager, PlayerWatchdog, ready, voiceStateUpdate, interactionCreate, messageCreate, MongoQueueStore, HistoryService, SpotifyScraper, ActivityRepository, apiServer) jadi `Logger.safe("filepath")`
- Hidden bugs sekarang kelihatan di log sebagai `[WARN] [SilentError]`

### TypeScript 5 → 7 upgrade
- `tsconfig.json`: `moduleResolution: "node"` → `"node16"`, `module: "commonjs"` → `"node16"`, hapus `baseUrl`, fix `paths` (`"src/*"` → `"./src/*"`)
- Tambah `.js` extension di 9 dynamic `import()` — CJS mode cuma dynamic import yang perlu ekstensi
- `import type` dari lavalink-client: tambah `with { "resolution-mode": "require" }` (2 file)
- `lavalink.ts`: `@ts-expect-error` untuk import lavalink-client (package ESM tapi sediakan CJS exports)
- `connection.ts`, `index.ts`: cast `as any` untuk dynamic import hasil — `module:"node16"` ubah tipe import()
- Total: 11 file, bukan 260 import/146 file seperti perkiraan awal

### Sentry integration
- NEW `src/instrument.ts` — `Sentry.init()` via `SENTRY_DSN` env, auto-disable if unset
- `src/index.ts`: `import "./instrument"` paling atas + `Sentry.captureException` di `unhandledRejection` / `uncaughtException`
- `apiServer.ts`: `Sentry.setupExpressErrorHandler(app)`
- `.env.example`: tambah `SENTRY_DSN`

### API wrapper refactor
- NEW `src/lib/api-base.ts` — `createApiHandler()`, `withAuth()`, `ApiError`, `jsonResponse`, `requireSameVoice()`
- `apiServer.ts`: 18 route handler refactor — hapus `isTrusted`/`requireApiAuth`/`TRUSTED_IPS`/`API_TOKEN`, ganti `withAuth()` dari api-base. Tiap handler wrap `createApiHandler(async ...)`. File turun 663→524 lines
- 38 command files: `checkSameVoice()` → `requireSameVoice()` — 77 callers jadi 1-line `if (!await requireSameVoice(source)) return`

### Broken cycle: FailoverManager ↔ StateService ↔ lavalink
- `lavalink.ts`, `FailoverManager.ts`: `import { addRestoredGuild }` dihapus — ganti `EventBus.emit('state:addRestored', { guildId })`
- `StateService.ts`: subscriber `'state:addRestored'` panggil `addRestoredGuild`

### Activity → UserActivity model rename
- `models/Activity.ts` → `models/UserActivity.ts`: interface `IActivity` → `IUserActivity`, model `"Activity"` → `"UserActivity"`
- `ActivityRepository.ts`: import `UserActivity` dari model baru
- `ActivityService.ts`: `interface ActivityLog` → `interface UserActivityLog`

### Track error loop + autoplay cycle fix
- `lavalink.ts`: `autoSkip: true` → `autoSkip: false` — cegah race condition antara lavalink-client internal handler dengan `trackError` handler manual
- `musicEvents.ts` 5-error guard: ganti `player.stopPlaying()` (silent loop) → `player.destroy()` + kirim error embed + keluar voice. Cegah infinite cycle: autoplay → error → fallback → error → stopPlaying → autoplay → ...

### Voice check HOF
- NEW `VoiceCheck.ts`: `requireSameVoice()`, `withVoiceCheck()`, `replyError()` — handle reply error otomatis untuk slash & prefix command
- 38 command files: import `requireSameVoice` dari VoiceCheck

### deferReply — 19 slash commands no longer timeout
- `remove.ts`, `move.ts`, `jump.ts`: tambah `await` di `editReply()` — docs discord.js bilang `editReply()` return `Promise<Message>`, wajib di-await
- 19 command files: tambah `interaction.deferReply()` sebelum `editReply()` — cegah 3s timeout. Sebelumnya cuma 5 dari 24 command yang panggil `deferReply()` (lyrics, play, search, skip, stop). Sisanya pake `reply()` langsung yang bisa timeout kalo async operation >3s.
- Files: pause, resume, volume, seek, clear, remove, move, swap, jump, autoplay, equalizer, filter, loop, shuffle, queue, help, nowplaying, 247, prefix
- Queue/clear/autoplay/equalizer/loop/shuffle/247: `reply()` + `fetchReply()` → `deferReply()` + `editReply()` (editReply return Message langsung, gak perlu fetchReply)
- seek/remove/move/jump/prefix: multiple success paths → masing2 defer sebelum editReply

### Circular dependency refactor — EventBus extraction
- NEW `src/bot/music/events/EventBus.ts`: typed in-process pub/sub (~50 baris). Memecah 3 import cycle antara engine dan services.
- `musicEvents.ts`: 12 direct call ke StateService + 3 ke MetricsCollector + `HistoryService.addEntry` + `RecommendationEngine.clearPlayed` + `deletePlayerData` + `lavalink.cacheTrack`/`clearTrackCache` → semua diganti `EventBus.emit(...)`. Impor StateService/MetricsCollector/HistoryService/RecommendationEngine/PersistentPlayerStore dihapus. Impor berkurang dari 19 → 16.
- `StateService.ts`: tambah 5 EventBus subscriber (`state:save`, `state:startPositionSync`, `state:stopPositionSync`, `state:delete`, `state:clearRestored`). `restoredGuilds` Set pindah ke `StateManager.restored`.
- `HistoryService.ts`: subscriber `history:addEntry`.
- `RecommendationEngine.ts`: subscriber `recommendation:clearPlayed`.
- `PersistentPlayerStore.ts`: subscriber `persistent:deletePlayerData`.
- `lavalink.ts`: subscriber `lavalink:cacheTrack` + `lavalink:clearTrackCache`.
- `StateService.ts`, `FailoverManager.ts`, `lavalink.ts`: import `setFilter`/`setEqualizer` dari `PlayerService` langsung — cycle A & E putus.
- `musicEvents.ts`: import `destroyEngine` dari `PlayerService` langsung.
- `StateManager.ts`: tambah `restored: Set<string>`.
- `MetricsCollector.ts`: 2 EventBus subscriber (`metrics:trackPlayed`, `metrics:trackFailed`).
- Files: NEW `EventBus.ts`, MODIFIED `musicEvents.ts`, `StateService.ts`, `StateManager.ts`, `HistoryService.ts`, `RecommendationEngine.ts`, `PersistentPlayerStore.ts`, `MetricsCollector.ts`, `PlayerService.ts`, `FailoverManager.ts`, `lavalink.ts`.

### Stop command force-disconnect idle bot + 24/7 rejoin
- `slash/stop.ts`, `prefix/stop.ts`: guard `!player || (!player.playing && !player.paused && !engine.queue.size())` → `!player` — bot idle di VC (player ada, gak play, queue kosong) sekarang `stop` tetap jalan sebagai force-disconnect.
- `PlayerService.ts::stop()`: 247 ON + node mati (`!player.node?.connected`) → destroy broken player, rejoin VC via `engine.join()`, terus re-apply filter/equalizer dari state RAM. Bot stay di VC walau Lavalink error.
- `PlayerService.ts::stop()`: 247 ON + node mati — autoplay/loop/filter/equalizer tetap dipertahankan (hanya queue+nowPlaying yang cleared).
- `musicEvents.ts` `queueEnd`: tambah `deleteState()` untuk 24/7 OFF setelah semua jalur playback habis — cegah restore stale nowPlaying kalo bot restart dalam idle window 60s.
- `ecosystem.config.cjs`: tambah `interpreter: "tsx"` — compiled command files pake `@/` path alias yang cuma bisa di-resolve oleh `tsx`. `package.json` `npm start` juga `node` → `tsx src/index.ts`.
- Fix mixed modules (`dist/` + `src/` via tsx `@/` alias) → `npm start` jalan dari source langsung, gak ada duel Mongoose model.
- `ecosystem.config.cjs`: ganti `interpreter` ke `./node_modules/.bin/tsx` — tsx gak di PATH global di server.

### Lavalink down guard — autoplay/filter/equalizer/loop
- `MusicService.ts`: tambah `requireLavalink()` — return `{embeds: [error]}` atau null, reusable di command files.
- `autoplay/filter/equalizer/loop` (slash + prefix, 8 files): tambah guard `requireLavalink()` setelah voice check — kalo gak ada NodeLink connected, kirim embed "Music service is currently unavailable."
- `messageCreate.ts`: pindah guard prefix command ke setelah alias resolution — `-ap` (alias) sebelumnya bypass guard karena cek literal `commandName`.

### Load balancing — explicit node selection di createPlayer
- `PlayerManager.ts`: panggil `getLeastLoadedNode()` + spread `node:` ke `mgr.createPlayer()` — hindari `getIdealNode()` lavalink-client yang gagal kalo ada node mati di Map.
- `lavalink.ts` failover recreate (line 173): tambah `node: target.id` — pindah ke node yang udah dipilih failover, bukan auto-assign.
- `lavalink.ts` connect handler recovery (line 412): tambah `getLeastLoadedNode()` — restore player ke node paling ringan.
- Fix: node1/node2 mati (return HTML) gak lagi blokir `createPlayer()` karena `getBestNode()` cuma pilih node healthy.

### Node config parsing — non-sequential slots
- `lavalink.ts` init loop: `if (!host) break` → `continue` — `NODELINK_HOST` (node1) dikomen, loop berhenti di i=1, gak baca `NODELINK_HOST_3`/`_4`/dst. Sekarang skip slot kosong, lanjut scan sampai i=20, baca node mana aja yang ada.

### Manual kick cleanup — autoplay reset
- `voiceStateUpdate.ts` bot-leave handler: tambah cleanup `autoplay/shuffle/filter/equalizer` setelah `deleteState`, guarded by `!247`. Sebelumnya cuma `deleteState` — autoplay survive meski bot di-kick manual. Sekarang konsisten sama `destroyEngine`.

### Stale player cleanup on node reconnect — bot stuck fix
- `lavalink.ts` nodeConnect handler: destroy stale players (`!player.connected`) sebelum recovery loop. Saat NodeLink crash+restart, session resume gagal restore voice WS (`data.state?.connected = false`), tapi stale player di `lavalink.players` block recovery loop (line 351 guard) → bot di VC tapi bengong. Fix: deteksi + destroy stale player, tunggu 2s biar resumed event selesai, baru destroy — recovery loop re-create dari RAM/DB. Sebelumnya: watchdog (30s) path aja dan sering gagal karena `player.connect()` ke NodeLink fresh gak punya voice state.

### Resume position fix — hot reload akurat
- `StateService.ts` `saveState`: pake `Math.max(statePos, playerPos, lastPos)` — ambil posisi terbesar dari 3 sumber, cegah pos=0 kalo salah satu sumber 0
- `StateService.ts` `startPositionSync`: sama, pake `Math.max(statePos, playerPos, lastPos)` tiap 1 detik
- `lavalink.ts` connect handler: cek `if (player) continue` bukan `if (player?.connected)` — cegah duplicate player saat node reconnect (ghost session)

### Failover & network resilience
- `FailoverManager.ts` (baru): extract failover logic + trackCache ke file terpisah (~200 line)
- `lavalink.ts`: register `setLavalinkRef` dari FailoverManager
- `musicEvents.ts` trackError: deteksi network error (`ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`, `ECONNREFUSED`, `timeout`) → skip fallback search, langsung `stopPlaying()` + advanceQueue
- `musicEvents.ts` trackError: log error message detail pas failover gagal
- `FailoverManager.ts`: fallback search prefer YouTube source, skip Deezer

### queueEnd spam guard
- `musicEvents.ts`: `queueEndGuard` Set + 5s TTL — cegah spam queueEnd firing (dahulu 3x dalam 22ms)
- `musicEvents.ts` queueEnd: filter human count pake `.filter(m => !m.user?.bot)` + timeout 60s

### Autoplay & search improvements
- `RecommendationEngine.ts`: filter regex `/session|#\w+|@\s+\w+|version|tribute\b/i` — skip live session, hashtag, venue, cover version
- `RecommendationEngine.ts`: filter `instrumental` + `karaoke`
- `TitleResolver.ts`: tambah `instrumental` ke `COVER_PATTERNS`
- `lavalink.ts`: `defaultSearchPlatform: "ytsearch"` — NodeLink gak support `ytmusic` source
- `SearchService.ts`: `searchWithRetry` log timeout detail (retries left, error, query, node)

### Config & structure
- `constants.ts` (baru): 80+ magic numbers dikumpulin jadi 1 file config
- `MongoQueueStore.ts` (baru): MongoDB queue store — dikomen karena konflik dengan saveState dual system
- `FailoverManager.ts`: extract failover logic dari `lavalink.ts` (~200 line)

### Observability
- `apiServer.ts`: `GET /api/metrics` — Prometheus text format + `GET /api/metrics/json`
- Debug log: semua track start/end/error/stuck tambah `region=` + `restored=`
- `[VoiceJoin]` log baru — nampilin `vcRegion` + `nodeRegion`
- `[autoplay] No recommendations` log baru
- `[SearchTimeout]` log baru

### UI tweaks
- QueueEnd disconnect timer 30s → 60s + human count fix (filter bots)
- VoiceState alone check: `members.size === 1` → `humans === 0` + log "1m"
- QueueEnd disconnect message: hapus "Add more tracks..."
- Default search platform: `ytmsearch` → `ytsearch` (NodeLink compat)

### 2026-07-19

### Autoplay — filter live, session, version, hashtag
- `RecommendationEngine.ts`: tambah regex `/session|#\w+|@\s+\w+|version|tribute\b/i` — skip lagu live recording, session, hashtag, cover version

### QueueEnd timeout 30s → 60s + human count fix
- `musicEvents.ts`: queueEnd disconnect timer 30s → 60s
- `musicEvents.ts`: filter bots dari human count — `members.filter(m => !m.user?.bot)` — bot lain gak dianggap human
- `voiceStateUpdate.ts`: alone check `members.size === 1` → `humans === 0` — detek kalo cuma bot (bukan cuma bot sendiri)
- `voiceStateUpdate.ts`: log "3m" → "1m" (sesuai timer real yang udah 60s)

### Deezer error — skip fallback, cegah spam embed
- `musicEvents.ts`: deteksi `errMsg` mengandung "Deezer" → skip fallback search langsung `stopPlaying()` + advanceQueue. Sebelumnya fallback search dapet track YouTube tapi NodeLink internal pake stream Deezer → error lagi → loop double embed.

### Autoplay — filter instrumental + karaoke
- `RecommendationEngine.ts`: tambah `!titleL.includes("instrumental")` dan `!titleL.includes("karaoke")` — autoplay gak milih lagu instrumental yang gak relevan
- `TitleResolver.ts`: tambah `instrumental` ke `COVER_PATTERNS` — detek instrumental sebagai cover di semua filter

### Debug log — region, timeout, autoplay
- Semua log track start/end/error/stuck: tambah `region=` + `restored=`
- `[VoiceJoin]` log baru — nampilin `vcRegion` + `nodeRegion`
- `[autoplay] No recommendations` log baru — nampilin track source + id pas autoplay gagal
- `[SearchTimeout]` log baru — nampilin node mana yang timeout + query

### Load balancing — hapus manual node override
- `PlayerManager.ts`: hapus `getLeastLoadedNode()` — library built-in handle region + load balancing via `vcRegion`. Manual node override bertentangan dengan region matching.
- `PlayerService.ts` `engine.join()`: tambah param `vcRegion`
- `slash/search.ts`, `prefix/search.ts`: kirim `voice.rtcRegion` ke `engine.join()`

### Position resume fix — hot reload akurat
- `StateService.ts` `saveState`: pake `state.position.get(guildId)` (dari playerUpdate event) sebagai primary, fallback `player.position` — posisi lebih akurat pas shutdown
- `saveAllStates`: stop `positionSync` SEBELUM save state — cegah race condition overwrite posisi

### Load balancer — region-based node selection
- `lavalink.ts`: `region` → `regions: []` — properti official lavalink-client. Node sekarang daftar region yang didukung.
- `PlayerManager.ts`: tambah param `vcRegion` — diteruskan ke `lavalink.createPlayer()`
- `slash/play.ts`, `prefix/play.ts`, `messageCreate.ts`: kirim `voice.rtcRegion` — bot pilih node sesuai region Discord user
- `NodePenaltyService.getBestNode()` — filter node by region sudah pakai `n.options?.regions`

### Load balancer + heartbeat fix — cegah disconnect/reconnect cycle
- `lavalink.ts`:
  - `heartBeatInterval`: 1000ms → **30000ms** (official recommendation) — 1s terlalu agresif, server gak sempat respon → disconnect loop
  - Tambah `retryAmount: 5` + `retryDelay: 10000` — node auto-reconnect tanpa health check
  - Tambah `autoMove: true` — lavalink-client otomatis pindahkan player saat node disconnect
  - `requestSignalTimeoutMS`: 10s → 20s (sebelumnya)

### TrackError fix — prefer YouTube + prevent spam loop
- `SearchService.ts`: `scoreTrack` +10 untuk YouTube source — `pickBestTrack` otomatis pilih YouTube daripada Deezer/Spotify. Flow `ytmsearch:` tetap utama, cuma hasil filter preferensi berubah.
- `musicEvents.ts` trackError fallback:
  - Skip Deezer tracks di fallback search (`t.info?.sourceName !== "deezer"`) — hindari error "Deezer stream metadata missing"
  - Pre-mark `alt` trackId di `retried` — cegah spam loop (3x embed "Started Playing" untuk lagu sama)
  - Gunakan metadata dari `state.nowPlaying` (track asli) untuk query fallback, bukan metadata korup dari Deezer

### Failover fix — exact track + autoplay akurat
- `lavalink.ts` failover Path 1 & 3: prioritas `state.nowPlaying.encoded` (dari RAM) sebelum track cache/re-search — jamin failover play track SAMA persis, bukan cover/lagu beda.
- `RecommendationEngine.ts`:
  - Fallback search: tambah `official audio` keyword biar hasil lebih akurat
  - Tambah step search-by-SOURCE-URI sebelum search-by-query
  - Filter duration mismatch >40% (hindari remix/cover durasi beda jauh)

### R3 — Event-driven state persistence
- `QueueService.addTracks()` — function untuk append tracks + auto-saveState. Caller luar cukup panggil `addTracks(guildId, tracks)`, gak perlu manual saveState.
- Bug fix: 3 "already playing" paths di play.ts (slash + prefix) tidak persisten — tambah `await MusicService.saveState()` setelah `state.queues.set()`.
- Bug fix: AI play `messageCreate.ts` already-playing path — tambah `await saveState()`.
- `QueueService` udah call saveState di semua method (remove, swap, clear, shuffle, move, removeByQuery, removeRange, jumpTo). Tinggal play.ts yang bypass dgn direct RAM mutation — sekarang konsisten.

### R2 — Sisa `require()` → static import
- `index.ts`: 3 require() → import (`ShutdownManager`, `destroyPlayer`, `getLavalink`). Tidak ada circular dep.
- `StateService.ts`: `require("../services/TextChannelStore")` redundant (`getTextChannelId` sudah import di line 4). Hapus. `require("discord.js").EmbedBuilder` → `import { EmbedBuilder } from "discord.js"` di top level.
- `loadCommands.ts` + `loadEvents.ts`: 3 dynamic `require(join(...path, file))` — variable file path, must stay require(). Diberi komentar.

### R1 — TS interfaces untuk semua model
- `Guild.ts`: `IGuild extends Document` — 11 fields (guildId, prefix, volume, lastFilter, lastEqualizer, autoplay, loop, shuffle, "247", createdAt, updatedAt)
- `PlayerState.ts`: `IPlayerState extends Document` — 8 fields (guildId, voiceChannelId, textChannelId, queue, nowPlaying, position, nodeId, updatedAt)
- Schema + model pake generic `<IGuild>` / `<IPlayerState>` — typo field ketahuan compile time
- 4 model lain (Conversation, Memory, HistoryEntry, Activity) sudah typed sebelumnya — hanya verify
- `PlayerState` schema untyped (`new Schema({...})`) karena field Mixed (`queue`, `nowPlaying`) gak kompatibel dg Mongoose 9 generic — tapi model generic tetap aktif buat query return type

### Dependencies — all updated
- `discord.js` ^14.26.5 → ^14.27.0
- `dotenv` ^16.4.7 → ^17.4.2
- `express` ^4.21.0 → ^5.2.1
- `mongoose` ^8.9.0 → ^9.7.4
- `@types/node` ^22.0.0 → ^26.1.1
- `tsx` ^4.19.0 → ^4.23.1
- Typescript 5.x retained — TS 7 drops `moduleResolution=node10` and `baseUrl`, needs config overhaul

### Audit — 29 temuan (12 critical, 9 high, 8 structural)

Full audit with 5 parallel agents against lavalink-client v2.10 docs and zero-downtime best practices. See `AUDIT.md`.

### Fixed

- **C2 — `recoveringGuilds` Set never cleaned** — guilds added at recovery but never removed, permanently blocking future reconnects. Now deleted on success/failure + TTL 10min auto-expire. File: `lavalink.ts`
- **C3 — Position lost on `playerDestroy`** — when node disconnects, `player.lastPosition` was lost. Now saved to `state.position` (`PositionStore`). Recovery reconnects resume from exact position. Files: NEW `PositionStore.ts`, `StateManager.ts`, `lavalink.ts`, `musicEvents.ts`, `PlayerService.ts`
- **C4 — `playerUpdate` position granularity** — position now updated in `state.position` on every `playerUpdate` (~50ms) instead of only on `playerDestroy`. Recovery always has near-real-time position. File: `lavalink.ts`
- **C1 — Session resume playback** — `resumed` handler now calls `player.play()` to actually resume audio (was only setting `player.playing = true` which didn't start playback). Added `recoveringGuilds` guard to prevent double-recovery with `connect` handler. File: `lavalink.ts`
- **H1 — Schema mismatch Mongoose vs Prisma** — `Memory` model: Prisma `entry` → `summary` (align sama Mongoose). `"247"` vs `is247` intentional (Mongoose numeric key, Prisma identifier). Files: `prisma/schema.prisma`, `MemoryRepository.ts`
- **H2 — Compound index Activity** — ganti `guildId` index doang jadi `{guildId:1, timestamp:-1}`. `findRecentByGuild` pake sort timestamp desc sekarang efficient. File: `Activity.ts`
- **H3 — Silent catch blocks** — 7 catch blocks di `GuildRepository.ts` + 1 di `ActivityRepository.ts` sekarang log warning. Files: `GuildRepository.ts`, `ActivityRepository.ts`
- **H4 — Empty `catch {}` di engine** — 13 silent catch blocks di `lavalink.ts` (4), `musicEvents.ts` (5), `PlayerWatchdog.ts` (1), `StateService.ts` (3) sekarang log warning. Files: `lavalink.ts`, `musicEvents.ts`, `PlayerWatchdog.ts`, `StateService.ts`
- **H5 — `player.connect()` retry** — `connectWithRetry(player, guildId, retries=3)` dengan 2s backoff. Dipake di reconnect paths (connect handler, resumed handler, restore, join, watchdog). Play commands tetap `player.connect()` langsung (fail fast). Files: `lavalink.ts`, `PlayerService.ts`, `StateService.ts`, `PlayerWatchdog.ts`
- **H6 — `restoreAllStates` dari connect event** — trigger full state restore dari `nodeManager.connect` handler. Kalo Lavalink gak siap pas startup (30s window habis), connect event trigger restore lagi. File: `lavalink.ts`
- **TitleResolver — Indonesian noise + inner dash parsing** — 3 fix: (1) `(Lirik)`/`(Lirik lagu)`/`(Remastered Audio)` ditambah ke NOISE_PATTERNS, (2) ` - Topic - ` di-strip dari mana aja (bukan cuma akhir), (3) `parseInner` heuristic (shorter = artist) buat handle `Channel - Title - Artist` dan `Channel - Artist - Title`. Applicable di basic dash match + channel flip. File: `TitleResolver.ts`
- **TrackStart embed — `cleanTitle()` applied** — "Started playing" embed di `musicEvents.ts` sebelumnya pake `track.info.title`/`author` langsung tanpa `cleanTitle()`. Sekarang lewat `cleanTitle()` dulu. File: `musicEvents.ts`
- **Auto-resume fix: align dengan lavalink-client docs** — 3 perbaikan: (1) **Bulk DB fallback di connect handler dihapus** — `PlayerState.find()` await bikin `resumed` event fire duluan, lalu for-loop delete `recoveringGuilds` yang udah diset resumed handler → race condition + double play() → `replaced` loop. Bot startup restore cuma dari `ready.ts → restoreAllStates`. (2) **`restoreAllStates()` call dihapus** dari connect handler — inline recovery udah cukup buat reconnect. (3) **`addRestoredGuild()`** ditambah di inline recovery + resumed handler — cegah overlap dengan ready.ts. `updateSession(true, 300000)` tetap enabled sesuai official docs. Files: `lavalink.ts`, `StateService.ts`

- **H7 — PromptFilter: allowedContext before blockedPatterns** — "lagu coding" ketahan karena `checkPrompt()` cek blokir dulu (`\b(bantu|tolong|help)\b.*\b(coding|...)\b`) baru izin. Sekarang `allowedContext` dicek duluan: kalo ada kata musik (`lagu|musik|song|play|putar|...`), langsung return `{blocked: false}` tanpa cek blokir. File: `PromptFilter.ts`
- **H8 — console.error monkey-patch: verified intentional** — lavalink-client v2.10 `debugOptions` cuma punya `{noAudio, playerDestroy}` — gak ada opsi buat suppress internal console.error. Monkey-patch di `index.ts` tetap diperlukan; sudah ditandai verified. File: `index.ts`
- **H9 — Dead code 4 files: 3 dihapus, 1 retained** — `SongRequest.ts` + `SongRequestRepository.ts` (no imports), `RedisPlayerState.ts` (6+ no-op calls di musicEvents.ts → hapus semua + delete), `LyricsSyncManager.ts` (3 no-op `stop()` calls → hapus + delete). `MetricsCollector.ts` retained (dipakai di musicEvents, apiServer, NodePenaltyService). Files: deleted 5 files, modified `musicEvents.ts`

### Fixed
- **C8 — `require()` → static import** — 54 `require()` converted to static `import` across `lavalink.ts`, `musicEvents.ts`, `PlayerService.ts`. Plus 15 more files (apiServer, commands, events, StateService, Watchdog, PlaybackEngine, prisma, bootstrap). Only `loadCommands.ts` + `loadEvents.ts` left (dynamic paths).
- **C9 — Metrics** — added `/api/metrics` endpoint + `incTracksPlayed`/`incTracksFailed` counters wired to trackStart/trackError.
- **C10 — Watchdog double reconnect** — removed `failoverFromNode` from watchdog (health check already handles it).
- **C11 — `volumeDecrementer`** — added `playerOptions.volumeDecrementer: 0.75` + `clientBasedPositionUpdateInterval: 50` + `defaultSearchPlatform: "ytmsearch"`.
- **C12 — Auto-disconnect 30s** — queue idle timer 180s → 30s.

### Position sync
- Position sync interval 5000ms → **1000ms** — resume position error turun dari 5s ke maksimal 1s. Write cuma `updateOne` (update field, bukan insert), aman buat M0.

### Fix
- **recoveringGuilds DB fallback leak** — DB fallback path (connect handler) nambah guild ke `recoveringGuilds` tapi gak pernah dihapus setelah populate state → guild nongkrong di set sampai TTL 10 menit. Fix: delete dari recoveringGuilds setelah DB fallback selesai. File: `lavalink.ts`
- **Cover filter autoplay** — `isCover()` sekarang pake `\bcover\b` (catch all "cover" di title) + cek author `via @` (cover channel). Autoplay (`RecommendationEngine`), search (`pickBestTrack`), failover re-resolution semua kena. File: `TitleResolver.ts`, `SearchService.ts`, `RecommendationEngine.ts`
- **`isLavalinkReady()` broken** — `MusicService.ts` pake `setLavalinkManager` yang gak pernah dipanggil → `isLavalinkReady()` always false → semua music command diblokir. Fix: panggil `getLavalink()` langsung dari `lavalink.ts`. File: `MusicService.ts`
- **State reset on destroy** — `destroyEngine` sekarang reset `state.autoplay`, `state.shuffle`, `state.filter`, `state.equalizer` pas bot leave VC / player destroy (kecuali 24/7 ON). File: `PlayerService.ts`
- **`ephemeral: true` → `flags: 64`** — 24 slash command files. (discord.js v14 deprecated `ephemeral`). 
- **Button commands "Unknown Webhook"** — `autoplay.ts`, `filter.ts`, `equalizer.ts` panggil `fetchReply()` tanpa reply sebelumnya. Fix: tambah `interaction.reply()` sebelum `fetchReply`.
- **Autoplay no-humans timeout** — pas restart dengan autoplay ON, bot cek apakah ada manusia di VC. Kalo gak ada, bot tunggu 1 menit, kirim embed `"No one is in the voice channel. Leaving..."`, lalu leave (`destroyEngine`). Files: `StateService.ts`
- **TitleResolver channel flip** — `cleanTitle()` sekarang detek kalo author adalah channel name (SKY CHANNEL, Topic, VEVO, Records, dll). Kalo channel name gak cocok dengan kedua sisi dash, flip ke format `Title - Artist`. Files: `TitleResolver.ts`

### Position sync

### Embed & UI fixes
- **Cover filter** — `isCover()` detects 7 cover patterns (`| NamaArtis`, `cover by`, `versi`, `tribute`, dll). Applied to: `pickBestTrack()`, `RecommendationEngine` (autoplay), lavalink failover re-resolution.
- **NowPlayingEmbed `cleanTitle()`** — embed sekarang pake `cleanTitle()` — tampil `Artist - Title` tanpa `(Official Music Video)`, `Record Label`, dll.
- **Unavailable music embed** — `interactionCreate` + `messageCreate` error message diganti dari plain text + 🎵 → `ErrorEmbed.build()`.

### Files
- NEW: `PositionStore.ts` — RAM store for position per guild
- Modified: `lavalink.ts`, `StateManager.ts`, `PlayerService.ts`, `musicEvents.ts`, `NowPlayingEmbed.ts`, `SearchService.ts`, `TitleResolver.ts`, `RecommendationEngine.ts`, `PlayerWatchdog.ts`, `MetricsCollector.ts`, `apiServer.ts`, `interactionCreate.ts`, `messageCreate.ts`, +15 more (requires→imports)

## 2026-07-18

### 4-Layer Zero-Downtime Architecture
- **Layer 1 (Session Resume):** `nodeManager.on("resumed")` restores players from Lavalink data — instant recovery for <360s outages
- **Layer 2 (DB Fallback):** `connect` handler queries `PlayerState.find()` when RAM empty — survives restart
- **Layer 3 (Player Persistence):** `playerCreate`/`playerUpdate`/`playerDestroy` auto-sync voice/text channel IDs via `PersistentPlayerStore`
- **Layer 4 (Timer Cancel):** `cancelNodesDownTimer()` in ALL reconnect events (connect, resumed, nodeReconnect, health check)

### Fixes
- Race condition on restart: `connect` fires before `restoreAllStates` — direct `PlayerState.find()` fallback in connect handler
- `isLavalinkReady()` guard in `voiceStateUpdate.ts` — added call to skip `destroyEngine()` when Lavalink down
- `removeFromQueue()` and `shuffle()` wrapped in `withQueueLock`
- CommandInterpreter Arabic regex: `\b` → `(?:\\b|$)` for RTL text
- Test files created (50 tests via `node:test`) then removed — QueueLock (9), CommandInterpreter (37), StateService (4)

### Files
- NEW: `PersistentPlayerStore.ts` — RAM store for player voice/text channel IDs
- Modified: `lavalink.ts`, `voiceStateUpdate.ts`, `QueueService.ts`, `CommandInterpreter.ts`, `musicEvents.ts`

## 2026-07-16

### Failover & Recovery
- Node reconnect player recovery: all nodes down → reconnect restores players from RAM + replays last track
- All-nodes-down timer (60s) — fires error embed + destroys players; cancels on any reconnect
- Pluggable load balancer: `LOAD_BALANCE_STRATEGY` env (`penalty`/`roundrobin`/`leastplayers`)
- Zero-downtime improvements: trackCache, 15s health check + cooldown, `changeNode` retry, background pre-fetch, session resume 5min
- Node selection: `getLeastLoadedNode()` + `getBestNode()` with penalties
- `globalFailoverLocks` Set prevents double-failover per guild

### 24/7 Mode
- Bot stays in VC when queue empty; guards on `stop()`, `skip()`, `voiceStateUpdate`; 12-dim state matrix
- Commands: `setup/slash/247.ts`, `setup/prefix/247.ts`

### Autoplay
- YouTube Mix + fallback: `youtube.com/watch?v={id}&list=RD{id}` → `ytmsearch:{author} - {title}`
- DB persistence: `AutoplayStore` RAM + GuildRepository CRUD + restore on startup
- Fixes: `clearRestoredGuild()` immediate (was 5s delay), `saveState()` after autoplay `player.play()`

### State Persistence
- Loop/Shuffle/24/7 DB persistence — same pattern as autoplay
- Filter/Equalizer upgrade to StateManager — restore + apply to player on startup
- `state.nowPlaying` populated before `engine.join()`; survives node-offline join failure
- DB restore after 10 retries exhausted

### Misc
- Collector race fix: 12 toggle commands — removed `max: 1`, `i.update()` before DB await, DB save fire-and-forget
- `trackStart` debug log with flags (restored, isFirstRest, manual, suppr, fail, send)
- Alias `ap` for prefix autoplay
- Button timeout 30s + embed stays

## 2026-07-15 — Audit Cleanup

### Critical
- Fixed `registerShutdownTasks.ts` require path (was resolving to non-existent file)
- Fixed `prisma.ts` — lazy Proxy, only instantiates for PostgreSQL `DATABASE_URL`
- Fixed `HistoryEntry` Mongoose schema — added missing `songTitle`/`artist`/`timestamp` fields
- Fixed DB failure not stopping startup — added `process.exit(1)` on connection failure

### High
- QueueLock timeout: warning-only (was breaking mutual exclusion)
- QueueEngine + play commands + SpotifyFallback — all queue mutations wrapped in `withQueueLock`
- `restoreAllStates`: fetch before delete (was deleting old states before restoring)
- API: `validateGuildId` middleware added (NoSQL injection), `userId` hardcoded to `"dashboard"`
- ShutdownManager: timer leak fixed, graceful wait for all tasks
- CooldownManager: fixed Map mutation during iteration

### Medium
- PlayerWatchdog: concurrent reconnect via `Promise.allSettled`
- Disconnect timer: stale closure guard
- Lavalink health check: interval ID stored, cleared before re-init
- ActivityService: exponential backoff 30s→5min
- `interactionCreate`: generic error message (was leaking internals)
- AI prefix permission: check moved to after AI response
- AI embed loop: 500ms delay between sends
- TextChannelStore + PlayerService.engines + QueueLock: memory leak fixes

### Low (21 items)
- Source emoji fix, null-safety on `track.info`, `clearInterval` not `clearTimeout`, playedTracks cleanup, dead code removal, deprecated `channel` access, silent error logging, interval stacking, DB status check, unhandledRejection fix, SpotifyScraper cache pruning, equalizer `"none"` → `null`, DB state cleanup on disconnect, `pickBestTrack` duration filter, TitleResolver, Spotify title preservation, missing return after playlist, skip last track disconnect, Spotify error suppression, health check interval 1s→15s

### AI Command Execution
- AI trigger runs `runAIInterpret()` before `runAIAsk()` — supports play/skip/stop/pause/resume/queue/nowplaying/volume/help
- Double LLM call eliminated: reuses AIDJ `interpreted.reply` when type="chat"

### Spotify
- Playlist batch size 20→5 (fixes rate limit)
- Background resolve: play first track immediately, rest in batches of 5

### Lavalink Cloud
- `User-Agent: PaperplaneBot/2.0` header + `requestSignalTimeoutMS: 10000`
- Health check 60s (was 15s), cooldown 60s (was 15s)
- Load balancer: `getLeastLoadedNode()` on initial player creation
- `nodeConnect` event: listen from `nodeManager` directly (NodeManager emits "connect", not "nodeConnect")

### Misc fixes
- **Logger error warna merah** — `Logger.ts`: tambah `color("[ERROR]", "red")` — merah di dev mode
- **Skip + autoplay** — `PlayerService.ts`, `skip.ts`: skip last track + autoplay ON → destroy player, biar queueEnd fire autoplay
- **trackStart debug log** — `musicEvents.ts`: log flags (restored, isFirstRest, manual, suppr, fail, send) — diagnosa embed suppression
- **Failover restore filter/equalizer** — `lavalink.ts`: setelah changeNode/recreate, apply `state.filter`/`state.equalizer` ke player baru
- **Failover update engine.player** — `lavalink.ts`: set `getEngine(guildId).player` setelah changeNode — command gak akses player lama
- **Autoplay play error log** — `musicEvents.ts`: `.catch(() => {})` → `.catch(err => Logger.warn())` — silent error jadi keliatan

## 2026-07-13 — Audit Summary

- NodeLink failover (3 layer), heartbeat 1s, watchdog, session resuming removed
- Hybrid Prisma/Mongoose, MongoDB → Supabase migration ready
- YouTube playlist, max queue 150, `pickBestTrack`, Spotify resolver + scraper
- Queue lock in play/search/Spotify, TaskQueue rewrite, `restoreAllStates` in ready.ts
- API auth, equalizer field fix, emoji purge, ActivityService buffer cap, prefix dispatch try/catch
- AI apiKey check, PromptFilter ordering, sendTyping catch
- 23 commands total
