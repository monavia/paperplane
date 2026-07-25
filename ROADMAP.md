# ROADMAP — Paperplane Single Node

**Mulai:** 2026-07-20 | **Update prioritas:** 2026-07-25 — 78 tests across 9 suites. 0.9.1–0.9.5 done. | **Status:** Fase 0 ✅, Patch v2.1.6 ✅, v2.2.0 ✅, v2.2.1 ✅, **v2.2.2 ✅ (released)**, **v2.2.3 ✅ (not pushed)**, Fase 0.5 ✅, Fase 0.5.5 ✅, Fase 0.6 ✅, Fase 0.7.0–0.7.10 ✅, **Fase 0.8 ✅**, Fase 0.9 🟡 (0.9.1–0.9.5 ✅), Fase 1 🟡.

---

## Fase 0: Foundation ✅ (Selesai)

Apa yang sudah dikerjakan dan stabil:

| Area | Status |
|---|---|
| TS 5→7 upgrade (`moduleResolution`, `baseUrl`, 12 error fix) | ✅ |
| EventBus — putus 12 circular dependencies | ✅ |
| API wrapper (`createApiHandler`, `withAuth`, `jsonResponse`) | ✅ |
| Voice check HOF (`requireSameVoice`, `withVoiceCheck`) | ✅ |
| Activity → UserActivity model rename | ✅ |
| Sentry + error tracking | ✅ |
| Cooldown per-tier (music 5s, info 3s, AI 10s) | ✅ |
| Error loop fix (`autoSkip: false`, 5-error guard destroy) | ✅ |

---

<!-- Fase 0.5 dipindah ke setelah Patch v2.1.6 -->

## Patch v2.1.6: Security & Stability Hotfix 🔴🔴 (1.5 jam — SEBELUM Fase 0.6)

**Alasan:** Celah keamanan kritis (SSRF) dan potensi crash yang dieksploitasi/dialami **sekarang**, tidak terkait skalabilitas. Fix independen, gak blocking fase lain, harus release duluan.

| # | Task | Detail | File | Effort |
|---|------|--------|------|--------|
| v2.1.6.1 | ✅ **SSRF via SpotifyScraper** — C1 | URL validation: ganti regex `parseUrl` dengan `URL` parser strict. Allowlist cuma `open.spotify.com`. Reject private/loopback IP sebelum fetch. Tambah timeout + abort ke semua fetch. | `src/bot/music/engine/SpotifyScraper.ts` | 1 jam |
| v2.1.6.2 | ✅ **VoiceCheck null safety** — H1 | `engine.player.voiceChannelId` → `engine?.player?.voiceChannelId` dengan optional chain. Cegah runtime error kalo player tanpa voiceChannelId. | `src/bot/core/utils/VoiceCheck.ts:28` | 5 menit |
| v2.1.6.3 | ✅ **Alias cooldown bypass** — H9 (udah dari 83b6ddb) | Prefix alias (`play` ↔ `p`) pake canonical command name sebagai cooldown key, gak ada bypass. | `src/bot/events/messageCreate.ts:44-60` | 15 menit |
| v2.1.6.4 | ✅ **Command load failure log** — M7 | Tambah file path + error detail di `loadDir` warning, bukan cuma directory name. | `src/bot/core/bootstrap/loadCommands.ts:30` | 5 menit |
| v2.1.6.5 | ✅ **Interaction reply silent swallow** — L1 | Log warning kalo `interaction.reply()` dan `interaction.editReply()` keduanya gagal. | `src/bot/events/interactionCreate.ts:37-41` | 5 menit |

### Dependency & effort

| Task | Effort | Dependencies |
|------|--------|-------------|
| v2.1.6.1 SSRF fix | 1 jam | — |
| v2.1.6.2 VoiceCheck | 5 menit | — |
| v2.1.6.3 Cooldown alias | 15 menit | — |
| v2.1.6.4 Load failure log | 5 menit | ✅ |
| v2.1.6.5 Reply swallow | 5 menit | ✅ |

---

## Patch v2.2.0: Runtime Migration tsx → node 🔴🔴 (30 menit)

**Alasan:** Lepas dependency `tsx` runtime. Cold start 200ms → ~50ms. Build pipeline jadi standar (`tsc` → `node`). Semua perubahan mekanis — 0 baris logika diubah.

| # | Task | Detail | File |
|---|------|--------|------|
| v2.2.0.1 | ✅ **Core: tambah .js extension** | 73 file depth 0-3: `../foo` → `../foo.js` via bulk regex | 73 file |
| v2.2.0.2 | ✅ **Commands: @/ → relative** | 52 file depth 4: `@/X` → `../../../../X.js` via bulk regex | 52 file |
| v2.2.0.3 | ✅ **Side-effect: instrument.js** | `import "./instrument"` → `"./instrument.js"` | `src/index.ts` |
| v2.2.0.4 | ✅ **tsconfig: hapus paths** | Hapus `paths: {"@/*"}` dari compilerOptions | `tsconfig.json` |
| v2.2.0.5 | ✅ **package.json scripts** | `start` → `node dist/index.js`, `deploy` → `npm run build && pm2 restart` | `package.json` |
| v2.2.0.6 | ✅ **PM2 config** | Hapus `tsx` loader, script → `dist/index.js` | `ecosystem.config.cjs` |
| v2.2.0.7 | ✅ **Build & fix errors** | `npm run build`, fix sampai 0 error | — |

### Dependency & effort

| Task | Effort | Dependencies |
|------|--------|-------------|
| v2.2.0.1 Core .js | 5 menit | ✅ |
| v2.2.0.2 Commands @/ | 5 menit | ✅ |
| v2.2.0.3 Side-effect | 1 menit | ✅ |
| v2.2.0.4 tsconfig | 1 menit | ✅ |
| v2.2.0.5 package.json | 2 menit | ✅ |
| v2.2.0.6 PM2 | 2 menit | ✅ |
| v2.2.0.7 Build & fix | 15 menit | ✅ |

---

## Patch v2.2.1: Node Failover + Search Route Fix 🔴 (15 menit)

**Masalah:** `failoverGuilds` terpecah antara `FailoverManager.ts` dan `lavalink.ts` — embed tetap terkirim saat failover karena `musicEvents.ts` cek set yang salah. `searchWithRetry` retry 3x di node mati sebelum fallback ke node sehat.

| # | Task | Detail | File |
|---|------|--------|------|
| v2.2.1.1 | **Fix failoverGuilds duplikat** | Hapus set duplikat di `lavalink.ts`, export dari `FailoverManager` | `lavalink.ts`, `musicEvents.ts` |
| v2.2.1.2 | **Search route: skip ke healthy node langsung** | Cek penalty >200 sebelum `player.search()`, langsung ke `searchViaHealthyNode()` | `SearchService.ts` |

### Dependency & effort

| Task | Effort | Dependencies |
|------|--------|-------------|
| v2.2.1.1 | 5 menit | ✅ |
| v2.2.1.2 | 5 menit | ✅ |

---

## Fase 0.5: Foundation Hardening ✅

Semua task independen — gak butuh Redis.

| # | Task | Detail | File |
|---|------|--------|------|
| 0.5.1 | ✅ **Config validation startup** | Cek `DISCORD_TOKEN`, `CLIENT_ID`, `MONGO_URI`/`DATABASE_URL` di `main()` sebelum login. Exit dgn pesan jelas kalo ada yg missing. | `src/index.ts` |
| 0.5.2 | ✅ **DB disconnect di shutdown** | Tambah task `disconnect-db` priority `low` di `registerShutdownTasks`. Panggil `mongoose.disconnect()` / `prisma.$disconnect()`. | `src/core/bootstrap/registerShutdownTasks.ts` |
| 0.5.3 | ✅ **Health endpoint upgrade** | `/api/health` sekarang include DB readyState, Lavalink connected nodes, memory RSS. | `src/bot/api/apiServer.ts` |
| 0.5.5 | ✅ **Uncaught exit** | Tambah `process.exit(1)` setelah log + Sentry di `uncaughtException` handler. | `src/index.ts` |
| 0.5.6 | ✅ **Logger.safe context** (udah include err.message) | `Logger.safe()` udah include `err?.message`. | `src/bot/core/utils/Logger.ts` |
| 0.5.7 | ✅ **Shutdown extend** | Tambah task `lavalink-disconnect` priority `normal` di `registerShutdownTasks`. | `src/core/bootstrap/registerShutdownTasks.ts` |
| 0.5.8 | ✅ **Rate limiter cleanup** | `guildRateLimit()` cleanup interval 60s → 15s. | `src/lib/api-base.ts` |
| 0.5.10 | ✅ **Memory & event loop monitor** | Tambah `process.memoryUsage()` (RSS, heap, heapUsed) + event loop lag ke `/api/metrics`. | `src/bot/telemetry/MetricsCollector.ts` |
| 0.5.11 | ✅ **Label cardinality fix** | `tracksFailed` ganti label dari `guild` ke `error_type` aja. | `src/bot/telemetry/MetricsCollector.ts` |

### Catatan
- **0.5.4 + 0.5.12** → pindah ke **Fase 0.5.5** (Observability).
- **0.5.13** → pindah subtask **0.7.3.x** (melekat dengan CachedTrack schema).
- **0.5.14** → ⚪ opsional. Dicatat, gak dijadwal. Eksekusi kalo ada laporan abuse.

### Dependency & effort

| Task | Effort | Dependencies |
|------|--------|-------------|
| 0.5.1 Config validation | 30 menit | ✅ |
| 0.5.2 DB disconnect | 15 menit | — |
| 0.5.3 Health upgrade | 30 menit | — |
| 0.5.5 Uncaught exit | 5 menit | — |
| 0.5.6 Logger.safe context | 5 menit | — |
| 0.5.7 Shutdown extend | 15 menit | 0.5.2 |
| 0.5.8 Rate limiter cleanup | 5 menit | — |
| 0.5.10 Memory & event loop | 15 menit | 0.5.3 |
| 0.5.11 Label cardinality fix | 15 menit | — |

---

## Fase 0.5.5: Observability ✅ (Grafana + Loki + Prometheus)

Semua tuntas — stack berjalan di Docker di VPS. Grafana :4000, Loki :3100, Prometheus :9090.

| # | Task | Detail | Status |
|---|------|--------|--------|
| 0.5.5.1 | Prometheus exporter verify | `curl http://localhost:3001/api/metrics` — valid Prometheus format. | ✅ |
| 0.5.5.2 | Docker compose stack | `docker-compose.yml` + `prometheus/` + `loki/` + `grafana/` | ✅ |
| 0.5.5.3 | Structured logging (JSON) | `LOG_FORMAT=json` / `LOG_FORMAT=pretty` | ✅ |
| 0.5.5.4 | Disconnect rate metric | Counter `lavalinkNodeDisconnects{node="..."}` | ✅ |
| 0.5.5.5 | Grafana dashboard | 16-panel dashboard (`grafana/dashboards/paperplane-overview.json`) | ✅ |

---

## Fase 0.6: Discord.js Client Optimization ✅ (1 jam)

**Masalah:** `new Client({intents})` tanpa `makeCache`, `sweepers`, atau `partials`. Semua cache unlimited (`Collection` default). **1000+ guilds → estimasi >3GB RAM** cuma buat cached members/messages/reactions yang gak pernah dipake — sebelum bot logic apa pun. Semua bot besar (Rythm, Hydra, FredBoat) configure ini dari awal.

| # | Task | Detail | File | Status |
|---|------|--------|------|--------|
| 0.6.1 | **makeCache limits** | `GuildMemberManager: {maxSize:200, keepOverLimit: member => member.id === client.user.id}`, `ReactionManager: 0`, `PresenceManager: 0`, `MessageManager: 0` (kecuali butuh). | `src/index.ts` | ✅ |
| 0.6.2 | **Sweeper config** | `sweepers` agresif: voiceStates + messages sweep tiap 10m (default 1j), threads sweep >30m. Spread dari `Options.DefaultSweeperSettings`. | `src/index.ts` | ✅ |
| 0.6.3 | **Partials** | Tambah `partials: [Partials.Message, Partials.Channel, Partials.Reaction]`. | `src/index.ts` | ✅ |
| 0.6.4 | **allowedMentions** | `allowedMentions: { parse: ['users'], repliedUser: true }`. | `src/index.ts` | ✅ |
| 0.6.5 | **Cek dampak** | Bandingkan RSS memory before/after. | — | 🟡 skip |
| 0.6.6 | **Consistent player lifecycle** — C6 | `/search.ts` bypass `PlayerManager.createPlayer()`. Fix: pake `getPlayer()` + `createPlayer()`. | `src/bot/commands/music/slash/search.ts` | ✅ |
| 0.6.7 | **Extract musicEvents.register** | complexity debt — skip. | — | ⚪ skip |

### Dependency & effort

| Task | Effort | Dependencies |
|------|--------|-------------|
| 0.6.1 makeCache | 15 menit | — |
| 0.6.2 Sweepers | 15 menit | — |
| 0.6.3 Partials | 5 menit | — |
| 0.6.4 allowedMentions | 5 menit | — |
| 0.6.5 Dampak check | 30 menit | 0.6.1–0.6.4 |
| 0.6.6 Player lifecycle | 15 menit | — |
| 0.6.7 Extract musicEvents | 2 jam | — |

---

## Fase 0.7.0: Redis Connection Foundation ✅

Semua tuntas. Redis running di VPS via Docker. Rate limiter Redis dengan fallback in-memory.

| # | Task | Status |
|---|------|--------|
| 0.7.0.1 | 2 koneksi model (`redis.ts`) + CacheAdapter interface + RedisAdapter + MemoryAdapter | ✅ |
| 0.7.0.2 | CacheAdapter settle + getAdapter() singleton — Redis auto-fallback | ✅ |
| 0.7.0.3 | Eviction policy `maxmemory 512mb allkeys-lru` via Docker compose | ✅ |
| 0.7.0.4 | Cache hit/miss counters di MetricsCollector + Prometheus output | ✅ |
| 0.7.0.5 | (ditunda — melekat tiap swap cache di 0.7.1–0.7.7) | ⏳ |
| 0.7.0.6 | (ditunda — dikerjain setelah swap pertama) | ⏳ |
| 0.7.0.7 | (ditunda) | ⏳ |
| 0.7.0.8 | Rate limiter Redis INCR+EXPIRE dengan fallback in-memory | ✅ |

---

## Fase 0.7: Cache Implementation 🔴🔴 (Kritis — sisa 7 hari)

> **Driver:** 1000+ concurrent guilds, semua cache in-memory → restart wipe semua + 0 cross-guild dedup. Setiap guild yg play lagu populer kena Lavalink resolve — dengan 1000 guild, resolve yang sama bisa terjadi 1000x per hari.
> **Prasyarat:** Fase 0.7.0 (Redis Connection Foundation) wajib selesai dulu.

### 0.7.1–0.7.7 Swap Cache ke Redis 🔴

**Foundation siap:** `CacheAdapter.ts` ✅, `redis.ts` ✅, `ioredis@5` ✅. Tinggal swap tiap cache satu per satu.

| Cache | Lokasi | TTL | Prefix | Prioritas |
|-------|--------|-----|--------|-----------|
| **SearchCache** | `SearchCache.ts` | 24 jam | `search:` | 🥇 |
| **SpotifyScraper** | `SpotifyScraper.ts` | 24 jam | `spotify:` | 🥇 |
| trackCache x2 | `lavalink.ts` + `FailoverManager.ts` | 24 jam | `track_encoded:` | 🥈 |
| prefixCache | `GuildRepository.ts` | 5 menit | `guild:prefix:` | 🥉 |
| CooldownManager | `CooldownManager.ts` | 1 jam | `cooldown:` | 🥉 |
| ConversationMemory | `ConversationMemory.ts` | 30 menit | `conversation:` | 🥉 |
| TextChannelStore | `TextChannelStore.ts` | 24 jam | `guild:textchannel:` | 🥉 |

**Konfigurasi:**
```env
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=paperplane:
```

> **Redis harus lokal** — latency <1ms. Udah running di VPS via Docker.

### 0.7.2 Global Search Cache (query-based, cross-guild)

Sekarang: `SearchCache` key = query, tapi per-instance. Guild A & B search lagu sama → 2 Lavalink calls.

Pindah ke Redis → key `search:{source}:{query}` — global. Guild kedua langsung hit.

**Dampak:** Lagu populer (top 40, trending) cukup 1x resolve per 24 jam terlepas dari jumlah guild.

### 0.7.3 DB-Backed Track Resolver

MongoDB model + Prisma model baru: `CachedTrack`
```
identifier (query/URI) → trackData + hitCount + expiresAt
```

Flow:
```
play/queue → cek Redis → MISS → cek DB → MISS → Lavalink → simpan ke DB + Redis
```

HitCount untuk prioritaskan popular cache eviction kalau disk penuh.

### 0.7.4 Pre-Fetch Batch

Sekarang: `advanceQueue` pre-fetch 1 track ke depan.

Ubah: resolve track n+1 sampai n+5 background via `Promise.allSettled`. Cache hasilnya di Redis. advanceQueue berikutnya ambil dari cache, skip Lavalink.

### 0.7.5 SpotiFail Cache — Persistent Fallback Mapping 🔴

**Masalah:** Spotify track gagal → fallback ke YouTube → mapping **tidak disimpan**. Guild B play lagu yang sama 5 menit kemudian → kena error yang sama + fallback search lagi.

Cache hasil fallback tersimpan persistent (Redis + DB), cross-guild.

| Key | Value | TTL |
|-----|-------|-----|
| `fallback:spotify:{trackId}` | `{ youtubeQuery, encoded, title, author, thumbnail }` | 24 jam |
| `fallback:spotify:{uri}` | Sama, lookup by full URI | 24 jam |

Flow:
```
play Spotify URI
  → cek fallback cache: "fallback:spotify:xxx"
  → HIT → skip NodeLink, langsung play YouTube cached version
  → MISS → coba NodeLink Spotify → GAGAL
    → fallback search → findTrackWithDuration → YouTube match
    → simpan ke fallback cache + DB
    → PLAY
```

### 0.7.6 Negative Cache — Dead Track Detection 🟡

**Masalah:** Track yang **memang gak bisa di-resolve dari sumber mana pun** bikin infinite retry loop (3x attempt × every play request). Gak ada mekanisme "skip forever."

| Key | Value | TTL |
|-----|-------|-----|
| `dead:{fingerprint}` | `{ title, author, attempts: 3, lastAttempt }` | 1 jam |
| `dead:spotify:{trackId}` | `{ reason, attempts }` | 6 jam (Spotify-specific lebih lama) |

**Fingerprint:** hash dari `title + author` — cross-source detection. Track gagal di YouTube, SoundCloud, dan Spotify → skip dari queue mana pun.

Flow:
```
play/queue track
  → cek negative cache: "dead:{fingerprint}"
  → HIT (attempts >3) → skip track entirely, log "Track permanently failed"
  → MISS → play normal → GAGAL lagi
    → increment attempts in negative cache
    → attempts >= 3? → set TTL 1 jam ("cool down")
```

### 0.7.7 Proactive Spotify Pre-Resolve 🟡

**Masalah:** Fallback cuma terjadi **setelah** error — user nunggu ~2-3s extra. Kalo resolved track udah siap duluan, transisi mulus tanpa delay.

Saat track di-queue (bukan saat diputar), cek kalo URI-nya Spotify → resolve langsung ke YouTube di background:

```
queue.add(track)
  → check: track.info.uri is Spotify?
  → YES → background: findTrackWithDuration() → YouTube match
    → simpan ke SpotiFailCache (0.7.5) + inject encoded ke track object
  → NO → skip (pre-fetch batch 0.7.4 handle non-Spotify)
```

Integrasi dengan `advanceQueue`: pas lagi resolve encoded untuk non-Spotify tracks (existing logic di advanceQueue), paralel juga resolve Spotify→YouTube mapping.

| Task | Detail | Priority |
|---|---|---|
| 0.7.1 Redis adapter + swap all caches | ~500 baris, 10-12 file | **Kritis** |
| 0.7.2 Global search cache | extend SearchCache ke Redis | **Kritis** |
| 0.7.3 DB track resolver | Model + resolver function | **Tinggi** |
| 0.7.4 Pre-fetch batch | Ubah advanceQueue | Sedang |
| 0.7.5 SpotiFail Cache | Fallback mapping persistent, cegah error berulang | 🔴 **Kritis** |
| 0.7.6 Negative cache | Dead track detection, skip infinite retry | 🟡 **Tinggi** |
| 0.7.7 Proactive pre-resolve | Resolve Spotify→YouTube pas di-queue, zero delay fallback | 🟡 **Tinggi** |
| 0.7.8 | **Spotify batch overload** — H3 | BATCH=20 saat ini, per-track 3 Lavalink queries. Playlist 100 tracks = 300 queries parallel. Fix: limit concurrency per source, source priority (ytmsearch dulu), max playlist 50 tracks. | 🟡 **Tinggi** | 1 jam |
| 0.7.9 | **Prefix play fire-and-forget** — H4 | `prefix/play.ts` panggil `resolveSpotifyBatch()` via `.then()` — user dapat "Added N" sebelum resolve selesai. Fix: await batch + progressive status. | 🟡 **Tinggi** | 30 menit |
| 0.7.10 | **Fix RecommendationEngine — autoplay bukan re-search** | Skrg recommendation cuma `"Author - Title"` → search ulang lagu yg sama. 3 sub-task. | 🟡 **Tinggi** | 5 jam |

> **0.7.10.1 Genre/keyword extraction** — Extract genre dari track metadata. Prioritaskan YouTube Mix (radio) via `list=RD{id}`, jangan stop di source pertama kalo cuma 1 track. *(2 jam)*
>
> **0.7.10.2 Source diversity** — Mix hasil: 1 track dari text search + 1 dari mix radio + 1 dari similar artist (`ytsearch:{author}` filtered). Jangan cuma pake source pertama. *(1 jam)*
>
> **0.7.10.3 Taste profile per-guild** — Cache genre preference dari track history. Boost genre yg sering diputar di rekomendasi berikutnya. In-memory dulu (Redis via Fase 0.7.1 nanti). *(2 jam)*
> **0.7.10.4 Benchmark autoplay** — Catat current behavior sebelum refactor: % repeat lagu, % new discovery, avg skip rate. Jadi improvement 0.7.10.1–3 terukur. *(30 menit)*

---

## Fase 0.8: Infrastructure ✅

Semua tuntas.

| # | Task | Detail | File | Status |
|---|------|--------|------|--------|
| 0.8.1 | **CI pipeline** | GitHub Actions: `tsc --noEmit` + `npm test` on push + PR. Matrix Node 22/24/26. (No lint — ESLint belum di-setup di bot.) | `.github/workflows/ci.yml` | ✅ |
| 0.8.2 | **npm audit fix** | `npm audit fix` selesai. 4 vuln remaining semua di `prisma` (devDep) → `@prisma/dev` internal tooling — not exploitable at runtime. Prisma 7.9.0 latest, upstream belum fix. | `package-lock.json` | ✅ |
| 0.8.3 | **Secrets rotation** | Dokumen prosedur ganti Discord token / AI key / Redis password tanpa downtime. `.env.example` sync — tambah vars: `AI_QUEUE_*`, `AI_MEMORY_*`, `LOAD_BALANCE_STRATEGY`, `LOG_FORMAT`, `MAX_QUEUE`. | `docs/secrets-rotation.md`, `.env.example` | ✅ |

---

## Fase 0.9: Reliability & Testing 🟡 (2-3 hari)

**Masalah:** 4 test suite existing cuma unit test isolated utils. Gak ada test yang verifikasi bot jalan di 1000+ guilds. Gak ada benchmark baseline — target "<1GB RAM di 1000 guilds" gak bisa diukur improvement-nya.

| # | Task | Detail | File | Effort |
|---|------|--------|------|--------|
| 0.9.1 | **Integration test harness** | `createApp()` diekstrak dari `apiServer.ts`. Test `GET /api/health`, `/api/metrics`, `/api/guilds`, `/api/guild/:id/equalizer`, `/api/guild/:id/queue`, `POST /api/guild/:id/player`. Mock semua dep berat (mongoose, redis, lavalink, discord.js, guild repo, sentry) via `vi.mock()`. | `src/test/harness.ts`, `src/test/api.test.ts` | ✅ |
| 0.9.2 | **Error scenario tests** | 7 tests: Redis unavailable, DB disconnected/connected (getter), Lavalink null/available, PlayerService throw → 500, rate limit 30/60s → 429. | `src/test/errors.test.ts` | ✅ |
| 0.9.3 | **Concurrent guild test** | 11 tests: 100 guilds (add/next/remove/shuffle), same-guild contention (10 concurrent add, mixed add/remove/clear), race scenarios (advanceQueue+add, clear+add), 200 guilds stress + contamination check. | `src/test/concurrent.test.ts` | ✅ |
| 0.9.4 | **Benchmark baseline** | 82 KB/guild (queue 50), ~192 KB/guild (queue 160). Target <1GB di 1000 ✅ — bahkan 5000 guilds masih ~480 MB. | `BENCHMARK.md`, `src/test/benchmark.test.ts` | ✅ |

| 0.9.5 | **Test StateService restore/backup** | 10 tests: saveState (skip, call upsert), deleteState (clear stores + deleteOne), start/stopPositionSync, restoreGuildState (already restored, no guild, no voice, join fails), restoreAllStates (no states), restored set helpers. | `src/test/state.test.ts` | ✅ |
| 0.9.6 | **Test FailoverManager** | 17 tests: set helpers, connectWithRetry (success/retry/fail), track cache (set/get/clear/prune), failoverFromNode (null lavalink, no players, no healthy target, no session, changeNode success, changeNode fail→destroy, lock duplicate, Spotify resolve). Found bug: `globalFailoverLocks` leaks when `continue` skips cleanup. | `src/test/failover.test.ts` | ✅ |
| 0.9.7 | **Test musicEvents track lifecycle** | Test trackStart, trackEnd, trackError, queueEnd, stuckTimer. 80 cyclomatic — regression gak terdeteksi tanpa test. | `src/test/music-events.test.ts` (baru) | 4 jam |

> **Note:** 0.9.1 (harness) ✅ — prasyarat buat 0.9.2, 0.9.3, 0.9.5–0.9.7. 0.9.4 bisa jalan independen.

---

## Fase 1: Production Hardening 🟡 (Prioritas — 1-2 minggu)

Lapisan stabilitas dan observasi sebelum scale.

### 1.0 Upgrade/Downgrade Runbook 🔴 (1 jam — SEBELUM 1.1)

**Masalah:** Kalo Fase 1.x rusak di production, gak ada rollback plan. Bot 1000+ guilds — setiap detik downtime = user frustration.

| Task | Detail | Effort |
|------|--------|--------|
| DB backup procedure | Script backup MongoDB + Prisma sebelum upgrade. Cron job auto-backup. | 30 menit |
| Rollback step-by-step | Dokumen: `git revert`, deploy ulang, restore queue from backup, verify playback. | 30 menit |

### 1.1 Persistent Queue Store (MongoDB/Postgres)

**Masalah:** Queue hanya di RAM. Restart bot → queue hilang.

| Task | Detail |
|---|---|
| `MongoQueueStore.ts` | Sudah ada (50 baris, implements `QueueStoreManager`), belum di-import. Konflik dengan saveState dual-system. |
| **Solusi:** | QueueStore hanya untuk queue persistence. saveState tetap untuk position/nowPlaying. Dua sistem berjalan paralel — queueStore simpan queue, saveState simpan state player. |

### 1.2 Dashboard API → Full CRUD ✅

| Task | Detail | Priority | Status |
|---|---|---|---|
| Queue management | GET/DELETE/PUT `/api/guild/:guildId/queue` | Tinggi | ✅ |
| Playback control | POST `/api/guild/:guildId/player` | — | ✅ |
| Guild settings | GET/PUT `/api/guild/:guildId/settings` | Sedang | ✅ |
| Search endpoint | POST `/api/guild/:guildId/search` | Rendah | ✅ |
| Voice check | `requireApiSameVoice()` di POST/PUT/DELETE mutation | — | ✅ |

### 1.3 Metrics & Observability ✅

| Task | Detail | Status |
|------|--------|--------|
| `/api/metrics` ke Prometheus | Format Prometheus | ✅ |
| Dashboard metrics page | Halaman `/metrics` di Dashboard Discord (Recharts) — gantikan Grafana | ✅ |
| Command usage tracking | Per-command success/fail/latency di every dispatch | ✅ |
| Lavalink health dashboard | Panel node penalty + players di halaman Metrics | ✅ |
| **Audio startup latency** | Delta antara `user play` ↔ `trackStart event`. Ukur pake EventBus `metrics:trackStartLatency` di musicEvents.ts. | ❌ Baru |
| **Per-source breakdown** | Data `tracksPlayed by source` udah ada di `MetricsCollector.ts:152` (label `source`). Tinggal query + tampilkan di dashboard panel. | ❌ Baru |

### 1.4 Error Recovery

| Task | Detail | Priority |
|---|---|---|
| Queue replay on reconnect | Track yang gagal di-restore masuk ke queue, bukan drop | Sedang |
| Stuck track timeout | Auto-skip track yang stuck >30s (`startStuckTimer` di `musicEvents.ts:130`) | ✅ |
| Network jitter buffer | Buffer 500ms sebelum trackError diproses | Rendah |
| **removeByQuery confirmation** — H5 | `QueueService.removeByQuery()` hapus semua match tanpa konfirmasi. Jika >3 match, minta konfirmasi sebelum delete. | Sedang |
| **Autoplay infinite loop guard** — M3 | Stop autoplay setelah N siklus kosong (0 track from recommendations). Exponential backoff. | Rendah |

### 1.5 Command Permission Hierarchy

**Masalah:** Semua user bisa akses semua command asal same voice. Ga ada owner-only, admin, atau DJ role check. **Audit menemukan 6 gap tambahan.**

| Task | Detail | File | Priority |
|------|--------|------|----------|
| Owner-only commands | Proteksi eval, reload, broadcast, debug via `process.env.OWNER_IDS`. Cek di `interactionCreate.ts` + `messageCreate.ts` sebelum execute. | `src/bot/events/` | **Tinggi** |
| DJ role per-guild — C2 | Cek member punya role DJ untuk skip/stop/clear/remove/shuffle/move/swap/jump. Simpan config DJ role ID di DB (Guild model). | `GuildRepository.ts` + command handlers | **Tinggi** |
| Admin gate for settings | Hanya admin (manage server permission) bisa ubah prefix, 247, autoplay. | `messageCreate.ts`, `apiServer.ts` | Sedang |
| **API auth hardening** — C3/C4 | `requireApiSameVoice()` skip kalo `!userId`. Fix: selalu validasi `x-discord-user-id`, fetch Discord member, cek `ManageGuild` untuk prefix. Hapus `if (!userId) return`. | `src/lib/api-base.ts:98` | **Tinggi** |
| **Prefix input sanitization** — C7 | Prefix `substring(0,3)` tanpa validasi karakter. Validasi `/^[\w!\-+=@#$%^&*]{1,3}$/`. Escape prefix sebelum regex. | `src/bot/commands/setup/slash/prefix.ts`, `src/bot/events/messageCreate.ts` | Sedang |
| **AI command permission map** — H8 | Mapping: play/stop/skip → voice check. Toggle-only (autoplay/shuffle/247) → no voice check needed. | `src/bot/events/messageCreate.ts` | Rendah |
| **DJ check by ID not name** — L4 | DJ detection API endpoint pake `.includes("dj")` di role name. Ganti ke role ID config. | `src/bot/api/apiServer.ts:507` | Rendah |
| **Command classification** — C2 ext | Daftar command per tier: User (play/queue/np/help), DJ (skip/stop/clear/remove/move/swap/jump/volume), Admin (prefix/247/autoplay/shuffle/loop). | All command handlers | **Tinggi** |

### 1.6 State Consistency Audit

**Masalah:** Queue, nowPlaying, position, dan actual Lavalink player state bisa mismatch. Ga ada periodic reconciliation.

| Task | Detail | File | Priority |
|------|--------|------|----------|
| Queue vs player mismatch | Periodik cek: queue ada tracks tapi player kosong → play next. Player jalan tapi queue kosong → stop. | `PlayerWatchdog.ts` | **Tinggi** |
| Orphaned player cleanup | Guild udah ga ada di cache/telah diban/bot kicked → destroy engine. | `PlayerWatchdog.ts` | Sedang |
| Position desync detect | Bandingkan `state.position` vs `player.position` vs DB `PlayerState.position`. Koreksi kalo beda >5s. | `StateService.ts` | Rendah |
| **Unified queue validation** — C5 | Extract `validateQueueIndex(guildId, index)` utility. Tambah guard `if queue empty` di semua command sebelum index operation. | `src/bot/commands/music/slash/remove.ts`, `move.ts`, `swap.ts`, `jump.ts` | Sedang |
| **Enable periodic watchdog** | `PlayerWatchdog.checkPlayer()` sekarang cuma dipanggil pas event. Tambah `setInterval` per player (default 60s). Skip idle guilds. Dengan 1000 guilds, 33 check/detik — perlu configurable interval. | `PlayerWatchdog.ts` | Sedang |

### 1.7 Command Deploy Lifecycle

**Masalah:** Slash commands di-deploy tiap startup (`index.ts:68`). Restart berulang → kena Discord rate limit.

| Task | Detail | File | Priority |
|------|--------|------|----------|
| Deploy only on change | Simpan hash command list. Bandingkan tiap startup. Skip deploy kalo sama. | `src/index.ts` | Sedang |
| Per-guild deploy for testing | Register command ke guild tertentu (dev guild) instead of global buat testing. | `loadCommands.ts` | Rendah |
| **Extract MUSIC_COMMANDS** — M9 | Daftar hardcoded di 2 tempat (`interactionCreate.ts:15`, `messageCreate.ts:40`). Pindah ke constant. | `src/bot/core/constants/` (baru) | Rendah |

### 1.12 Database Indexing Audit 🟡 (2 jam)

**Masalah:** Semua query by `guildId` — `PlayerState`, `Guild`, `Activity`, `CachedTrack` (0.7.3) — tanpa index = COLLSCAN di 1000+ guilds.

| Task | Detail | Priority |
|------|--------|----------|
| MongoDB indexes | Tambah index `{guildId:1}` di PlayerState, Guild, Activity. `{identifier:1}` di CachedTrack. TTL index `{playedAt:1}` di Activity. | **Tinggi** |
| Prisma indexes | Sama, update `schema.prisma` + generate migration. | **Tinggi** |
| Compound indexes | `{guildId, playedAt:-1}` untuk activity listing. `{userId, createdAt:-1}` untuk playlist query (3.2). | Sedang |

### 1.8 API Error Classification

**Masalah:** Semua command error → `"An error occurred"`. User ga tau apa yg salah, developer susah debug.

| Task | Detail | File | Priority |
|------|--------|------|----------|
| Error type classification | Bedakan: user error (Missing Permissions, Invalid Input) vs system error (DB down, Lavalink timeout) vs Discord API error (429, 403). | `interactionCreate.ts`, `messageCreate.ts` | Sedang |
| User-friendly error messages | User error → kasih tau solusi (contoh: "Bot needs 'Speak' permission in your voice channel"). System error → "Please try again later" + Sentry. | command handlers | Sedang |
| **AI prompt length limit** — H2 | Tambah `maxLength(1500)` + truncation sebelum AI call. Cegah token abuse. | `src/bot/events/messageCreate.ts` | Sedang |
| **PII redaction in logs** — M5 | Query user di-log via `query.slice(0,60)`. Tambah strip non-printable chars. | `src/bot/commands/music/slash/play.ts`, `prefix/play.ts` | Rendah |
| **Standardize deferReply timing** — L2 | Beberapa command defer sebelum guard pass. Standardisasi: defer hanya setelah semua guard lulus. | All command handlers | Rendah |

### 1.9 Missing Music Features 🟡 (3-4 hari)

**Masalah:** Beberapa fitur standar bot musik besar (Rythm, Hydra, FredBoat) belum ada.

| # | Task | Detail | File | Priority |
|---|------|--------|------|----------|
| 1.9.1 | **Queue history command** | `!history` — liat N track sebelumnya. lavalink-client punya `player.queue.previous` di track, tinggal expose. Format embed sama kayak `!queue`. | `src/bot/commands/music/` | **Tinggi** |
| 1.9.2 | **Song request channel** | Guild config: set channel. Semua pesan di channel itu di-interpret sebagai permintaan lagu (link atau search query). Auto-play. | `src/bot/events/messageCreate.ts` + `GuildRepository.ts` | **Tinggi** |
| 1.9.3 | **Vote-skip** | Bedain admin skip (langsung) vs vote skip (butuh N votes, configurable). 1.5 admin skip doang. | command handlers | Sedang |
| 1.9.4 | **Stage channel support** | Detek kalo user di StageChannel, join sebagai speaker (butuh `Speak` permission). Fix voiceStateUpdate handler biar gak reject stage channel. | `src/bot/events/voiceStateUpdate.ts` | Sedang |
| 1.9.5 | **Audio normalization** | `player.filterManager.setVolumeNormalization(true)` — level volume antar track konsisten. lavalink-client 1 baris. | `PlaybackEngine.ts` | Rendah |
| 1.9.6 | **Crossfade** | Config ms crossfade (default 0). overlap antar tracks. `player.setVolume` fade out 2s → next track fade in 2s. | `PlaybackEngine.ts` + `GuildRepository.ts` | Rendah |
| 1.9.7 | **Intro/outro per guild** | Guild config `introTrack` / `outroTrack`. Putar pas join/leave VC. Dedicated player timeout. | `GuildRepository.ts` + `voiceStateUpdate.ts` | Rendah |
| 1.9.8 | **Announce track on VC join** | Guild config `announceChannel`. User join VC → embed "Now Playing: X — request by Y". | `src/bot/events/voiceStateUpdate.ts` | Rendah |

> **⚠️ Prioritas diturunkan —** Fitur ini penting buat UX tapi gak ngaruh ke stabilitas di 1000+ guilds. Scaling (0.7 Cache, 1.10 Rate Limit) harus duluan.

### 1.10 API Rate Limiting 🟡 (1-2 hari)

**Masalah:** Bot API (`:3001`) nggak punya rate limiting. Dashboard polling + 1000 guilds bisa flood tak sengaja. Juga gak ada proteksi dari abuse kalo endpoint terekspos.

| # | Task | Detail | File | Priority |
|---|------|--------|------|----------|
| 1.10.1 | **Rate limit middleware** | `guildRateLimit()` udah ada di `api-base.ts` — wrapper tiap route. Default: 100 req/min/guild. Config via env `API_RATE_LIMIT`. | `src/lib/api-base.ts` | **Tinggi** |
| 1.10.2 | **Dashboard polling throttle** | Dashboard poll `/api/guild/:id/nowplaying` + `/api/guild/:id/queue`. Rate limit dashboard user lebih longgar (300 req/min). Bedain via `User-Agent` atau `Referer`. | `src/lib/api-base.ts` | Sedang |
| 1.10.3 | **Global rate limit** | Per-IP rate limit total (1000 req/min). Proteksi dari DDoS atau loop tak sengaja. | `src/bot/api/apiServer.ts` | Sedang |
| 1.10.4 | **Rate limiter key spoofing** — C8 | `guildRateLimit()` key by `guildId` — attacker bisa burn rate limit guild lain. Fix: key by `guildId:ip`. Tambah global per-IP limit. | `src/lib/api-base.ts` | Sedang |

---

### 1.11 Basic Sharding 🔴 (1-2 hari — wajib sebelum 2500 guilds)

**Masalah:** Bot di 1000+ guilds. Discord API **wajib** sharding di 2500 guilds — login bakal ditolak. Saat ini `new Client()` langsung tanpa `ShardingManager`. Juga lavalink-client `sendToShard` ngirim ke `guild.shard` yang cuma ada di single-process mode.

**Ini bukan clustering.** Hanya sharding dasar biar bot bisa login di >2500 guilds. Masih single-process tapi multiple WS connections.

| # | Task | Detail | File | Priority |
|---|------|--------|------|----------|
| 1.11.1 | **ShardingManager setup** | Buat entry point `src/shard.ts`. Pindahin `main()` ke bot file. `ShardingManager` handle spawning. `totalShards: 'auto'`. | `src/shard.ts` (baru) + `src/index.ts` (restructure) | **Kritis** |
| 1.11.2 | **sendToShard fix** | `lavalink.ts` `sendToShard` — skrg `guild.shard.send(payload)`. Di multi-process sharding, ini harus `client.shard.broadcastEval(...)`. | `src/bot/music/engine/lavalink.ts` | **Kritis** |
| 1.11.3 | **Cross-shard command cache** | Slash/prefix commands di-cache per-process. Pake Redis atau `broadcastEval` biar semua shard punya command list yg sama. | `src/bot/core/bootstrap/loadCommands.ts` | **Tinggi** |
| 1.11.4 | **Memory impact test** | Catat RSS per shard. Target: <500MB per shard di 500 guilds/shard. Adjust `shardCount` kalo perlu. | — | Sedang |
| 1.11.5 | **Pre-sharding audit — RAM state inventory** | Identifikasi semua RAM state per process: StateManager, QueueService, CooldownManager, TextChannelStore, dll. Tanpa ini, sharding cuma mindahin masalah data loss ke N process. Tiap state perlu strategy: Redis (shared) atau discard-on-restart. | All state files | **Kritis** |
| 1.11.6 | **Lavalink resumeKey** | Set `resumeKey` + `resumeTimeout` di Lavalink config. Voice connections survive shard restart tanpa disconnect. | `src/bot/music/engine/lavalink.ts` + `lavalink-config` | **Kritis** |
| 1.11.7 | **PM2 config for sharded bot** | Update `ecosystem.config.cjs` — N process (1 per shard) + entry point `src/shard.ts`. `pm2 reload` jadi rolling restart per shard. | `ecosystem.config.cjs` | **Tinggi** |

> **Catatan:** Sharding di sini masih **internal sharding** (bisa single process) atau **multi-process ringan** via ShardingManager. Controller penuh + worker ownership tetap di Fase 4.

---



## Fase 3: Advanced Features ⚪ (Difokuskan — hanya yang esensial)

> **⚠️ Prioritas diturunkan —** Bot di 1000+ guilds butuh scaling & reliability dulu (Fase 0.6, 0.7, 1.10, 1.11). Fitur baru cuma nambah beban tanpa nilai tambah kalo bot sering down.
>
> Hanya kerjakan item Fase 3 yang **esensial**: 3.2 Playlist (diminta user), 3.3 Moderation (kontrol guild). Sisanya (3.1 AI, 3.4 Dashboard, 3.5, 3.6, 3.7, 3.8) ditunda sampai Fase 4 stabil.
>
> Activity timeline ✅ ada di `ActivityService.ts` + `/api/activities/:guildId`.
> Playlist & DJ roles belum ada model DB sama sekali — mulai dari 0.

### 3.1 AI & Personalization

**Sekarang:** `RecommendationEngine` rule-based (random mix, keyword filter). `AIDJ` intent parser kaku.
**Target:** Collaborative filtering, personalized recs per user, AI DJ persona.

| Task | Detail | Priority |
|------|--------|----------|
| **Collaborative filtering** | "Users who played X also played Y" — analytic dari history semua guild. Simpan similarity score di Redis/DB. | Sedang |
| **Auto-generated playlists** | Weekly top tracks, genre mix, late-night chill — generated otomatis dari listening pattern. | Rendah |
| **AI DJ persona** | AIDJ bukan cuma intent parser, tapi punya personality + small talk. Ubah system prompt jadi karakter DJ. | Rendah |
| Voice activity detection | Auto-pause saat user detected bicara di VC (butuh voice recognition). | Rendah |

### 3.2 Playlist System

**Masalah:** Tidak ada model playlist di DB. Pengguna ga bisa save/load playlist.

| Task | Detail | File | Priority |
|------|--------|------|----------|
| **MongoDB model** | `Playlist` (name, guildId, userId, createdAt, updatedAt) + `PlaylistTrack` (playlistId, trackData, position, addedAt) | `src/bot/database/models/` | **Tinggi** |
| **Prisma model** | Sama, tambah di `schema.prisma` + generate. Dual DB support. | `prisma/schema.prisma` | **Tinggi** |
| **CRUD API** | `POST /api/playlist`, `GET /api/playlist/:id`, `PUT /api/playlist/:id`, `DELETE /api/playlist/:id` | `src/bot/api/apiServer.ts` | **Tinggi** |
| **Slash/prefix commands** | `/playlist create`, `/playlist add`, `/playlist remove`, `/playlist load` | `src/bot/commands/music/` | Sedang |
| **Import from Spotify/YouTube** | Parse public playlist URL → fetch tracks → simpan ke playlist lokal | `SpotifyScraper.ts` + baru | Rendah |
| **Cross-server share** | Share playlist link → guild lain bisa load playlist yang sama | Rendah |
| **Collaborative** | Multiple user bisa add ke playlist yang sama (edit permission) | Rendah |
| **User-owned playlists** | Playlist dimiliki user, bukan guild. Bisa di-load di guild mana aja. Model tambah field `ownerType: 'user' | 'guild'`. Hydra/Rythm punya. | 3-4 hari |

> **Catatan:** User-owned playlist butuh model User (butuh 3.8 dulu). Bisa dikerjain bareng 3.8.1–3.8.3.

### 3.3 Moderation & Admin

**Masalah:** Pengguna bisa spam queue, request lagu yang ga diinginkan, ga ada kontrol admin.

| Task | Detail | Priority |
|------|--------|----------|
| **Track blacklist** | Simpan `{guildId, trackId/query}` di DB. Filter di play/search command. | **Tinggi** |
| **Track blacklist regex** | Pattern matching (not exact). Blokir judul/kata kunci: `"blacklist regex: (sped up|nightcore|live)"`. Hydra punya. | Sedang |
| **Queue cap per user** | `MAX_USER_QUEUE` config per guild. Cek di play/queue before add. | **Tinggi** |
| **Queue cap per source** | Batasi rasio YouTube/Spotify/SoundCloud dalam queue. Cegah spam 1 sumber. FredBoat punya. | Sedang |
| **Vote skip** | Mode: admin skip (langsung) vs vote skip (butuh N vote). Config per guild. | Sedang |
| **Custom command aliases** | Guild config: `{"p": "play", "s": "skip"}`. Resolve di prefix handler. | Rendah |

### 3.4 Real-time Dashboard

**Masalah:** Dashboard polling API tiap N detik. Ga real-time, boros resource.

| Task | Detail | Priority |
|------|--------|----------|
| **WebSocket push** | Queue update, now playing change, track error → push ke dashboard via WS. Redis pub/sub → WS server → dashboard. | **Tinggi** |
| **Dashboard notifications** | In-app notif: queue kosong, track error, maintenance. | Sedang |

### 3.5 Lavalink Cluster Orchestration

| Task | Detail | Priority |
|------|--------|----------|
| Dynamic node registration | Bot auto-detect Lavalink nodes via Redis registry | Sedang |
| Region-based routing | Pilih node terdekat dengan Discord VC region (sudah partial di `NodePenaltyService`) | Sedang |
| Auto-scaling nodes | Spawn Lavalink node saat worker baru naik | Rendah |
| Rolling upgrade | Upgrade Lavalink node tanpa downtime (drain → upgrade → join) | Rendah |

### 3.6 Social & Gamification

| Task | Detail | Priority |
|------|--------|----------|
| **Leaderboards** | Top tracks, top users, most active guilds. API + dashboard display. | Rendah |
| **Music trivia** | Guess the song from lyrics excerpt. Timer, score, leaderboard. | Rendah |
| **Song announcements** | Configurable channel: "X is now playing Y" — termasuk yang lewat dashboard. | Rendah |

### 3.7 Monetization (Opsional)

| Task | Detail | Priority |
|------|--------|----------|
| **Premium / Subscription** | Model `Subscription`, `Transaction`. Integrasi payment gateway. **Repo terpisah.** | Rendah |
| **Feature gating** | Free: 1 node, max 100 guilds. Premium: multi-node, priority queue. | Rendah |

> **Catatan:** Playlist, blacklist, dan queue cap — effort rendah, impact tinggi buat pengguna.
> Premium sebaiknya di repo terpisah karena butuh payment infra + compliance.

### 3.8 Cross-Guild User Features 🔵 (3-5 hari)

**Masalah:** Semua data terikat ke guild. User pindah guild → history, favorites, config ilang. Rythm/Hydra punya user account lintas guild.

| # | Task | Detail | File | Priority |
|---|------|--------|------|----------|
| 3.8.1 | **User model** | `User` (discordId, username, createdAt, updatedAt) + indeks. MongoDB + Prisma. | `src/bot/database/models/User.ts` + `prisma/schema.prisma` | **Tinggi** |
| 3.8.2 | **User favorites** | `UserFavorite` (userId, trackId, title, artist, source, addedAt). Command `/fav add`, `/fav list`, `/fav remove`. | `src/bot/commands/music/` | Sedang |
| 3.8.3 | **Listen history per user** | `UserHistory` (userId, trackId, guildId, timestamp). Command `/history` (beda dengan 1.10.1 queue history). | `src/bot/commands/music/` | Rendah |
| 3.8.4 | **User config** | Default volume, preferred source, default playlist. Override guild config. | `src/bot/commands/setup/` | Rendah |

---

## Fase 4: Controller + Clustering + Finishing ⚪ (Fase terakhir — 2-3 bulan)

> Semua item yang scaling-related tapi bukan prerequisite langsung: Discord Controller, multi-worker ownership, RPC, Lavalink node pool, optimistic locking.
>
> **Prasyarat:** Fase 1.11 (Basic Sharding) + Fase 0.7 (Redis cache) wajib selesai.
>
> **⚠️ Jangan mulai sebelum Fase 1.11 —** Basic sharding adalah fondasi. Controller di sini adalah **peningkatan** dari ShardingManager bawaan discord.js, bukan pengganti.

### 4.1 Discord Controller — Gateway Layer

Pisah gateway dari bot process. Shard manager jadi standalone service.

```
Discord WS ──► Shard Controller ──► Redis pub/sub ──► Workers
```

| Task | Detail | Priority |
|------|--------|----------|
| Pisah Gateway dari Bot | Shard controller sebagai service terpisah, handle N shard. Kirim event ke Redis pub/sub. | **Tinggi** |
| Event routing | Gateway event → pub/sub → worker sesuai ownership (voice state → worker pemilik guild). | **Tinggi** |
| Voice state sync | User pindah VC → voice state update masuk ke shard controller → Redis → worker baru ambil alih. | **Tinggi** |
| Shard rebalancing | Worker scale 2→4 → shard redistribute. Controller kirim signal ke shard manager. Zero-downtime. | Sedang |
| **Controller resiliency** | Controller restart → semua shard disconnect. Implement session resume: identical resume keys + gateway reconnect. Tanpa ini, controller restart = 1000+ guilds disconnect. | **Kritis** |

### 4.2 Guild Ownership & Player Migration

**Masalah inti multi-node:** Siapa pemilik player guild X? Kalau worker pemilik mati, gimana rescue?

```
Redis: player:owner:{guildId} → workerId
Worker heartbeat: worker:{id}:heartbeat (TTL 10s)
Controller detect dead worker → reassign guilds ke worker hidup
```

| Task | Detail | Priority |
|------|--------|----------|
| Consistent hashing | Deterministic `guildId % workerCount` buat assign guild ke worker. Redis registry `worker:{id}:guilds`. | **Kritis** |
| Ownership registry | Redis key `player:owner:{guildId}` → workerId. Set pas player create, clear pas destroy. | **Kritis** |
| Heartbeat + dead worker detect | Worker tulis `worker:{id}:heartbeat` every 5s (TTL 10s). Controller/worker lain detect expiry. | **Kritis** |
| Player migration protocol | Dead worker detected → assign guilds ke worker lain. Worker baru: cek DB PlayerState, restore player di Lavalink, set ownership, resume playback. | **Tinggi** |
| Graceful drain (shutdown) | Worker stop: set `draining=true` → finish current track → save state → release ownership → exit. | **Tinggi** |

### 4.3 Internal RPC / Cross-Worker API

**Masalah:** Dashboard API request ke Worker A untuk guild yang dimiliki Worker B.

```
Worker A receives GET /api/guild/123/queue
  → cek ownership di Redis: guild 123 → Worker B
  → forward request ke Worker B via Redis stream
  → Worker B proses, kirim response balik
  → Worker A balas ke client
```

| Task | Detail | Priority |
|------|--------|----------|
| Request/response stream | Redis stream pair: `rpc:req:{id}` + `rpc:res:{id}`. Requestor subscribe, worker proses, balas. Timeout handler. | **Kritis** |
| RPC client helper | `rpcCall(workerId, method, params)` → await response. Dipake di `apiServer.ts` pas tau ownership bukan milik lokal. | **Tinggi** |
| RPC endpoint registry | Tiap worker register method yg bisa dipanggil: `getQueue`, `getNowPlaying`, `play`, `skip`, dll. | Sedang |

### 4.4 Lavalink Node Pool

**Masalah:** 2 worker kirim audio ke node yang sama → konflik player state.

| Task | Detail | Priority |
|------|--------|----------|
| Node reservation | Redis `lavalink:node:{id}` → `{allocatedTo, players:[]}`. Worker borrow node, release setelah selesai. | **Tinggi** |
| Node pool coordinator | Controller manage pool: kasih node ke worker baru, revoke dari worker mati. | Sedang |
| Player → Node affinity | Player guild 123 pake node X sepanjang sesi. Jangan pindah-pindah node kecuali failover. | Sedang |

### 4.5 Optimistic Locking DB

**Masalah:** 2 worker update `PlayerState` guild yang sama → race condition, data korup.

| Task | Detail | Priority |
|------|--------|----------|
| Version field | Setiap model punya `version` field. Update pake `findOneAndUpdate({guildId, version: N}, {$set: ..., $inc: {version: 1}})`. Kalau gagal → retry. | **Tinggi** |
| Conflict resolution | Last-write-wins buat non-critical field (position). Owner-only buat critical (player state). | Sedang |
| **Retry circuit breaker** | Version conflict bisa infinite retry kalo DB latency spike. Exponential backoff + max 3 attempts. After that, fallback ke last-write-wins. | Sedang |

### 4.6 Aggregated Metrics

**Masalah:** `GET /api/metrics` cuma data worker sendiri. Ga kelihatan health global.

| Task | Detail | Priority |
|------|--------|----------|
| Worker → Redis metrics push | Tiap 15s: total guilds, players, tracks played, error count, memory RSS. | Sedang |
| Controller global endpoint | `GET /api/metrics/global` → aggregate semua worker dari Redis. | Sedang |

### 4.7 Canary / Staged Deploy

**Masalah:** Deploy baru ke semua worker langsung → kalau ada bug, semua pengguna kena.

| Task | Detail | Priority |
|------|--------|----------|
| Staged rollout | Deploy ke 1 worker dulu. Pantau error rate via aggregated metrics. Kalau ok → rollout bertahap. | Sedang |
| Auto-rollback | Deteksi spike error rate dalam 5 menit setelah deploy → rollback worker ke version sebelumnya. | Rendah |

### 4.8 Polish & Testing

Dikerjain setelah semua fitur stabil. Bukan fitur baru — polish, testing, docs.

| Area | Task | Detail | Effort |
|------|------|--------|--------|
| **Testing** | Coverage | 4 test suites → target 80%+ coverage core logic (queue, search, state, failover) | 4-5 hari |
| **Testing** | Music engine tests | Tes PlaybackEngine, FailoverManager, PlayerService, StateService, lavalink, musicEvents — 9 circular cycles, zero test. | 2 hari |
| **Testing** | API endpoint tests | `supertest` + test server. Coverage semua route: /health, /queue, /player, /settings, /metrics. | 2 hari |
| **Docs** | User guide | Command list, setup guide, FAQ. Di repo README atau Wiki. | 1 hari |
| **Docs** | Self-hosting guide | .env explanation, docker-compose, NodeLink setup, troubleshooting. | 1 hari |
| **Security** | Audit | `npm audit` fix, dependency review, check for leaked tokens/ secrets in git history. | 1 hari |
| **Security** | Input validation | Audit semua endpoint API + command handler: guildId, userId, query length. | 1 hari |
| **Ops** | Resource caps | Konfigurasi batas: max guilds per instance, max queue length per guild (token: 150), max track length (token: 24h). | 2 jam |
| **Ops** | DB migration strategy | Dokumen rollback plan buat Prisma migration. Script rollback + test di staging. | 1 hari |
| **Ops** | Secret rotation | Prosedur ganti Discord token / API keys tanpa downtime. Zero-downtime deploy. | 4 jam |
| **Backup** | Auto DB backup | Cron job: MongoDB dump / Prisma pg_dump ke S3/GCS. TTL 30 hari. | 1 hari |
| **Backup** | Recovery runbook | Dokumen step-by-step restore dari backup. Test restore di staging. | 1 hari |
| **i18n** | Bot messages | Dashboard udah i18n (en/id/th). Bot reply (embed, error) juga multilingual. | 2-3 hari |
| **Hygiene** | Dead code cleanup | Hapus commented code, unused imports, stale branches. | 1 hari |
| **Docker** | Full containerize | `Dockerfile` + `docker-compose.yml` untuk bot + Redis. Ganti PM2 → `docker compose up -d`. Satu command jalan semua server, portabel lintas VPS. | 1 hari |
| **Docker** | Image CI | Build & push Docker image ke registry (Docker Hub / GHCR) otomatis di CI. Rollback cukup deploy image lama. | 1 hari |

---

## Priority Matrix

| Fase | Effort | Impact | Ketergantungan |
|---|---|---|---|
| **Patch v2.1.6 Security Hotfix** | 1.5 jam | **🔴🔴 KRITIS** (SSRF, crash, cooldown bypass) | — |
| **0.5 Foundation Hardening** (minus 0.5.9) | ~2.5 jam | **🟡 Tinggi** (stabilitas startup) | — |
| **0.6.1–0.6.4 Client optimization** | 40 menit | **🔴🔴 KRITIS** (RAM >3GB di 1000 guilds) | — |
| **0.6.5 Dampak check** | 30 menit | Sedang (verifikasi) | 0.6.1–0.6.4 |
| **0.6.6 Player lifecycle** | 15 menit | Rendah (konsistensi) | — |
| **0.6.7 Extract musicEvents** | 2 jam | **🔴 KRITIS** (blocking 0.7.8–0.7.10) | — |
| **0.7.0.pre Redis Setup** | 30 menit | **🔴 Wajib** (prasyarat 0.7.0) | — |
| **0.7.0 Redis Foundation** | 1 hari | **🔴🔴 KRITIS** (prasyarat semua cache) | 0.7.0.pre |
| **0.7.0.6–7 Cutover + test** | 1.5 jam | **🔴 Wajib** (safety net Redis) | 0.7.0.5 |
| **0.7.0.8 Rate limiter Redis** (ex-0.5.9) | 1 jam | 🟡 Sedang (cross-shard rate limit) | 0.7.0 |
| **0.7 Cache Implementation** | 6 hari | **🔴🔴 KRITIS** (performance 1000 guilds) | 0.7.0 |
| **0.7.8 Spotify batch** | 1 jam | **🟡 Tinggi** (Lavalink overload) | 0.6.7 |
| **0.7.9 Prefix play await** | 30 menit | 🟡 Sedang (UX inconsistency) | — |
| **0.7.10 Rec engine fix** | 5.5 jam | 🟡 Sedang (quality — bukan search ulang) | 0.6.7 |
| **0.8 Infrastructure** | 2 jam | **🟡 Sedang** (CI + audit) | — |
| **0.9 Reliability & Testing** | 2-3 hari | **🟡 Tinggi** (cegah regression) | — |
| **0.9.5 StateService test** | 2 jam | **🔴 Tinggi** (jantung persistence) | 0.9.1 |
| **0.9.6 FailoverManager test** | 3 jam | **🔴 Tinggi** (hot path, zero test) | 0.9.1 |
| **0.9.7 musicEvents test** | 4 jam | **🔴🔴 KRITIS** (80 complexity, zero test) | 0.9.1 |
| **1.0 Upgrade/downgrade runbook** | 1 jam | **🔴 Wajib** (sebelum Fase 1 dimulai) | — |
| **1.1 QueueStore** | 2 hari | **Tinggi** (data loss) | — |
| **1.2 Dashboard API** | ✅ selesai | Sedang | — |
| **1.3 Dashboard Metrics** | ✅ selesai | Sedang | — |
| **1.4 Error recovery** | 2 hari | **Tinggi** (user experience) | — |
| **1.5 Permission hierarchy** | 2-3 jam | **🔴 Tinggi** (keamanan — 6 gap) | — |
| **1.6 State consistency audit** | 2-3 jam | **Tinggi** (keandalan) | 1.4 |
| **1.12 Database indexing audit** | 2 jam | 🟡 Sedang (performance) | — |
| **1.7 Command deploy lifecycle** | 30 menit | Sedang (efisiensi) | — |
| **1.8 API error classification** | 1.5 jam | Sedang (UX/debug) | — |
| **1.9 Music features** | 3-4 hari | Rendah (fitur — scale first) | — |
| **1.10 API Rate Limiting** | 1-2 hari | **Tinggi** (proteksi API abuse) | — |
| **1.11 Basic Sharding** | 1-2 hari | **🔴 Wajib** (sebelum 2500 guilds) | — |
| **1.11.5 Pre-sharding audit** | 1 jam | **🔴 Wajib** (RAM state inventory) | 1.11.1–1.11.3 |
| **1.11.6 Lavalink resumeKey** | 15 menit | **🔴 Wajib** (voice survive restart) | 1.11.1 |
| **1.11.7 PM2 sharded config** | 30 menit | **🟡 Tinggi** (ops scaling) | 1.11.1 |
| **3.2 Playlist System** | 1 minggu | Sedang (diminta user) | 3.8 |
| **3.3 Moderation & Admin** | 1 minggu | Sedang (kontrol guild) | — |
| **3.1, 3.4–3.8 Other features** | 4+ minggu | **Rendah** (ditunda) | Fase 4 |
| **4 Controller + Clustering** | 2-3 bulan | **Sedang** (opsional scaling) | 1.11, 0.7 |
| **4.1.5 Controller resiliency** | 1 jam | 🟡 Sedang (restart safety) | 4.1 |
| **4.5.3 Retry circuit breaker** | 30 menit | 🟡 Sedang (stability) | 4.5 |
| **4.8 Polish & Testing** | 2-3 minggu | Rendah (polish) | Fase 0-3 |

---

## Rules of Engagement

1. **Satu task per giliran kerja** — selesaikan, test, baru lanjut
2. **Setiap perubahan wajib cross-check** dengan `tsc --noEmit` + test (jika ada)
3. **No dependency without justification** — Redis sebelum worker = justified. Redis cuma buat queue = overkill (MongoDB cukup)
4. **Setiap fase validated dulu** sebelum ke fase berikutnya
5. **Dashboard metrics page wajib sebelum Fase 4 (Controller)** — tanpa observasi, multi-worker = blind flying

---

## Koreksi (2026-07-23 — audit ROADMAP vs codebase)

Item yang sudah diperbaiki langsung di ROADMAP:

| Lokasi | Sebelum | Sesudah |
|--------|---------|---------|
| **Fase 1.1** | "Sudah ada, masih dikomen" | "Sudah ada (50 baris, implements `QueueStoreManager`), belum di-import" |
| **Fase 1.4** Stuck track | Tertulis "Sedang" (pending) | ✅ — `startStuckTimer()` di `musicEvents.ts:130` |
| **Priority Matrix** | `1.3 Grafana` | `1.3 Dashboard Metrics` |
| **Rule #5** | "Grafana dashboard wajib" | "Dashboard metrics page wajib" |
| **Priority Matrix** | entry 1.5 + update 2.1 dependency | Ditambahkan |
| **Fase 0.6** | — | Discord.js Client Optimization — gap dari audit vs bot besar (makeCache, sweepers, partials, allowedMentions). |
| **Fase 1.9** | — | Missing Music Features — queue history, song request channel, vote-skip, stage support, crossfade, normalization, intro/outro. |
| **Fase 3.3** | single DJ role + exact blacklist | Ditambah: regex blacklist, queue cap per source. |
| **Fase 3.2** | guild-only playlist | Ditambah user-owned playlist (cross-guild). |
| **Fase 3.8** | — | Cross-Guild User Features — user model, favorites, listen history, user config. |
| **Fase 4** | "Testing" coverage generic | Ditambah: music engine tests (specific), API endpoint tests, resource caps, migration strategy, secret rotation. |
| **Priority Matrix** | — | + entry 0.6.x, 1.9, 1.10, 3.8, update 3.2 dependency, update effort 4 (1-2→2-3 minggu). |

**Revisi prioritas (2026-07-23 — koreksi asumsi guild count <100 → 1000+):**

| Perubahan | Alasan |
|-----------|--------|
| **Fase 0.5** ">100 guilds" → ">1000 guilds" | Bot udah 1000+ |
| **Fase 0.5.5–0.5.9** 5 point baru | Gap dari audit code langsung: zombie process, silent error tanpa konteks, shutdown incomplete, rate limiter Map bloat + cross-shard |
| **Fase 0.6** 🔴→🔴🔴 KRITIS, RAM estimate >500MB→>3GB | Unlimited cache di 1000 guilds = bocor massive |
| **Cache Layer** dipindah Fase 1.10→ **Fase 0.7.0** (Foundation) + **Fase 0.7** (Implementation) | Redis hardening dipisah jadi fase terpisah — wajib duluan sebelum implementasi cache |
| **Fase 1.10** Cache Layer hapus → diganti **API Rate Limiting** | Rate limiting penting di 1000+ guilds |
| **Fase 1.9** Prioritas diturunkan | Fitur baru gak nambah stabilitas |
| **Fase 2** dihapus → dipindah ke **Fase 4** | Controller + clustering bukan prioritas sekarang |
| **Fase 1.11 Basic Sharding** baru | Wajib sebelum 2500 guilds — pisah dari controller/clustering |
| **Fase 4** diperluas: Controller + Clustering + Finishing | Semua item scaling lanjutan digabung |
| **Fase 3** ⚪ prioritas minimal, hanya 3.2 Playlist + 3.3 Moderation | Sisanya ditunda sampe Fase 4 stabil |
| **Rule #5** referensi Fase 2 → Fase 4 | Konsisten dengan pemindahan |
| **Priority Matrix** direwrite total | Urutan baru: 0.6→0.7.0→0.7→0.8→0.5→1... |
| **Fase 0.8 Infrastructure** — Docker + Redis + CI + audit | Docker dulu (0.8.1), baru Redis via Docker (0.8.2). Fase 4.8 nanti full containerize bot. |
| **Fase 0.9 Reliability & Testing** — 4 item (integration test, error scenario, concurrent, benchmark) | Baru — tanpa test, regression gak terdeteksi |
| **Fase 0.7.0.pre** (baru) | Docker + Redis dipisah dari Fase 0.8 jadi fase pre-wajib sebelum 0.7.0 |
| **Fase 0.8** — dihapus Docker/Redis | Sekarang 3 item: CI, audit, secrets. Docker/Redis pindah ke 0.7.0.pre |
| **Fase 0.5.10–0.5.12** — 3 metrics gap | Memory+event loop, label cardinality fix, Lavalink disconnect rate |
| **Fase 0.7.0.4** — extend | Cache hit ratio explicit — kalo gak tau hit ratio, cache buta |
| **Fase 1.3** — extend | Audio startup latency (UX metric utama) + per-source breakdown (data udah ada) |
| **Fase 0.7.5–0.7.7** | SpotiFail Cache, Negative Cache, Proactive Pre-Resolve |
| **Fase 0.7.0** (was 0.7.8) | Redis Hardening dipisah jadi fase foundation sendiri |

**Revisi 2026-07-24 — Urutan ulang + Security audit:**

| Perubahan | Alasan |
|-----------|--------|
| **Fase 0.5** dipindah ke setelah Patch v2.1.6 | 11 dari 12 task independen, gak butuh Redis — bisa dikerjain sekarang tanpa nunggu Redis |
| **0.5.9** dipisah dari Fase 0.5 → ditunda sampai 0.7.0 selesai | Satu-satunya task di 0.5 yang butuh Redis |
| **Priority Matrix** diurutkan ulang | Sesuai urutan eksekusi baru |
| **Patch v2.1.6** judul: "SEBELUM Fase 0.6" dihapus | Sekarang sebelum Fase 0.5 |

**Revisi 2026-07-24 — Security audit (+31 gaps, Opsi A):**

| Perubahan | Alasan |
|-----------|--------|
| **Patch v2.1.6** baru (sebelum Fase 0.6) | C1 SSRF, H1 VoiceCheck null, H9 alias cooldown bypass, M7 load log, L1 reply swallow — kritis & dieksploitasi sekarang |
| **Fase 0.6.6** baru — Player lifecycle | C6 — search.ts bypass createPlayer |
| **Fase 0.7.8–0.7.9** baru — Spotify batch optimization | H3 Lavalink overload, H4 prefix play fire-and-forget |
| **Fase 0.7.10** baru — Rec engine fix | RecommendationEngine cuma re-search `"Author - Title"`, bukan rekomendasi. 3 sub-task. |
| **Fase 1.4** +2 item | H5 removeByQuery confirmation, M3 autoplay loop guard |
| **Fase 1.5** +6 item | C2 DJ role, C3/C4 API auth, C7 prefix sanitization, H8 AI perm map, L4 DJ by ID, command classification tier |
| **Fase 1.6** +1 item | C5 unified queue validation |
| **Fase 1.7** +1 item | M9 extract MUSIC_COMMANDS constant |
| **Fase 1.8** +3 item | H2 AI prompt limit, M5 PII redaction, L2 defer timing |
| **Fase 1.10** +1 item | C8 rate limiter key spoofing |
| **Priority Matrix** | +Patch v2.1.6, +0.6.6, +0.7.8/0.7.9, update 1.5/1.8 effort |

**Revisi 2026-07-24 — Master dev review (complexity analysis + test gap):**

| Perubahan | Alasan |
|-----------|--------|
| **Fase 0.5.13** baru — MongoDB migration strategy | Schema CachedTrack di 0.7.3 butuh migration plan |
| **Fase 0.5.14** baru — AI per-user token budget | Cost protection, abuse prevention |
| **Fase 0.6.7** baru — Extract musicEvents.register | 80 cyclomatic, 195 cognitive — blocking semua modifikasi 0.7.8–0.7.10 |
| **Fase 0.7.0.6** baru — Cutover checklist & rollback script | Redis production safety |
| **Fase 0.7.0.7** baru — Integration test Redis down → fallback | Fallback path never tested |
| **Fase 0.9.5–0.9.7** baru — Test StateService, FailoverManager, musicEvents | 3 critical paths, zero test, complexity 40/80/11 |
| **Fase 1.11.5** baru — Pre-sharding audit RAM state inventory | Tanpa ini sharding cuma mindahin data loss |
| **Fase 0.7.10.4** baru — Benchmark autoplay | Catat current behavior before refactor |
| **Priority Matrix** — +0.6.7, +0.7.0.6–7, +0.9.5–7, +1.11.5 |

**Revisi 2026-07-24 — Fase 1–4 final review (master dev):**

| Perubahan | Alasan |
|-----------|--------|
| **Fase 1.0** baru — Upgrade/downgrade runbook | Rollback plan wajib sebelum Fase 1 dimulai |
| **Fase 1.6** — Enable periodic watchdog | `checkPlayer()` cuma di event, gak periodic |
| **Fase 1.11.6** baru — Lavalink resumeKey | Voice connections putus pas shard restart tanpa ini |
| **Fase 1.11.7** baru — PM2 sharded config | `ecosystem.config.cjs` perlu N process per shard |
| **Fase 1.12** baru — Database indexing audit | Semua query by guildId tanpa index = COLLSCAN |
| **Fase 4.1** — Controller resiliency | Controller restart = 1000+ guilds disconnect |
| **Fase 4.5.3** baru — Retry circuit breaker | Version conflict infinite retry loop |
| **Fase 4.8** — Hapus benchmark (duplicate 0.9.4) | Redundan |
| **Priority Matrix** — +1.0, +1.11.6–7, +1.12, +4.1.5, +4.5.3 |

**Revisi 2026-07-24 — 0.5.9 pindah ke 0.7.0.8:**

| Perubahan | Alasan |
|-----------|--------|
| **0.5.9** hapus dari Fase 0.5 → jadi **0.7.0.8** | Rate limiter Redis tematik lebih cocok di Redis Foundation. 0.5 sekarang 100% independen — gak ada task yg butuh Redis. |

**Keakuratan setelah koreksi:** 100% match real codebase + real guild count (1000+).
