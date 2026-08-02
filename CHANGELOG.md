# Changelog — Paperplane

## 2026-08-02 — v3.3.5

### Strict "100% Artist+Title" Spotify Verification — Deezer Fallback, Silent Skip

- **Problem (user reports)** — Spotify links could still resolve to the wrong song:
  1. **"The Box" (Roddy Ricch)** — a `(Made Popular By) [Instrumental Version]` mixtape upload passed verification and played instead of the studio track.
  2. **"Walls Could Talk" (Halsey)** — played **"If Walls Could Talk - Topic"**, a different song by a different artist.
  Root causes: `verifySpotifyMatch` still accepted ≥0.6/≥0.75 token overlap, and `resolveSpotifyTrack` had a **best-effort fallback** that played the closest **unverified** match whenever nothing verified.
- **Fix**
  - `SpotifyResolver.ts` — `verifySpotifyMatch` is now **strict 1.0**: full symmetric token match for title **and** artist (non-latin containment unchanged). The best-effort fallback is **removed** — an unverified upload is never played.
  - New **Deezer fallback**: after all YouTube Music variants fail, `resolveSpotifyTrack` retries via `dzsearch:Artist Title`, re-verified at 1.0. Only a strict Deezer hit is played; anything that still fails is **skipped silently** (`[SpotifyResolver] No strict match on YouTube/Deezer — skipped` log, no audio).
  - Call sites updated to "skip silently, no embed": `messageCreate.ts` AI play/playlist now detects a Spotify URL → scrape + `resolveSpotifyTrack` per item (skips items that fail, silent return if nothing passes); `slash/play.ts` & `prefix/play.ts` — no-results / nothing-resolved no longer throw into an error embed (warn + return, progress embed deleted). Manual text/YouTube search (`pickBestTrack`, `TitleResolver` cover patterns, `JunkKeywords`) is **untouched**; `PlaylistService.ts` already skipped null resolutions.
- **Tests** — `SpotifyResolver.test.ts`: best-effort test replaced by a strict-null test (4 calls = 3 variants + Deezer), new Deezer-fallback-success (wrong-artist YT → correct Deezer `dzsearch:Halsey If Walls Could Talk` asserted), new Deezer-also-fails → null. **577/577 pass**, typecheck clean.

### Duet/Collab Artists Rejected by Strict Verification — Multi-Artist Author Fix

- **Problem (user report, log)** — "Lose You Now" by **Lindsey Stirling & Mako** was skipped ("No strict match on YouTube/Deezer") even though the exact song exists on YouTube Music. Root cause: `artistMatches` only compared the **primary** Spotify artist and required a **symmetric 1.0** token match — any YT/Deezer author that legitimately lists the collaborator (`"Lindsey Stirling, Mako"`, `"& Mako"`, `"ft. Mako"`) carried one extra token (`mako`) and the reverse ratio dropped below 1.0 → false reject.
- **Fix**
  - `SpotifyResolver.ts` — `artistMatches` now strips tokens belonging to the **other Spotify artists** (`artists[1..]`) from the YT/Deezer author before the strict symmetric 1.0 check. Duet/collab formats pass; unknown extras (and the wrong-artist cases like "If Walls Could Talk", "Bukan Ada Band") still fail.
  - Deezer fallback now queries the **primary artist only** (`dzsearch:Lindsey Stirling Lose You Now`) instead of joining every artist — better hit-rate, still verified at 1.0. No caller changes (all routes use the shared resolver).
- **Tests** — `SpotifyResolver.test.ts` +4: duet `,` passes, `&`/`ft.` pass, unknown-extra-artist rejected, multi-artist Deezer fallback uses `dzsearch:<primary artist> <title>`. **583/583 pass**, typecheck clean.

### Spotify Playlists >100 Tracks — "Could not extract playlist data" Fixed

- **Problem (user report)** — playlists with more than ~100 tracks failed with `Could not extract playlist data from Spotify` while smaller playlists worked. The embed endpoint always serves a fixed ~100-track payload and **ignores `?offset=`** (5 fetches returned byte-identical payloads); the regular playlist HTML page is now a ~6KB shell without track data (embed + HTML scrape both dead ends); anonymous API tokens are closed (403 / 429 QUOTA_EXCEEDED).
- **Fix** — `SpotifyScraper.ts`: single embed fetch (offset 0) + dedup — no pagination attempts, no HTML scrape fallback; `_extractFromHtml`/`_findAllItems`/`_mapTracks` removed; `scrapePlaylist`/`scrapeAlbum` share a `_scrapeCollection` helper; empty result throws the original per-type error. **Playlist 164-track case now resolves 100 tracks instead of erroring** (embed cap; full pagination would require the Web API + credentials, intentionally out of scope).
- **Tests** — `SpotifyScraper.test.ts` rewritten with mocked fetch/cache/dns: single-fetch result, dedup of repeated payloads, empty embed throws. **553/553 pass**, typecheck clean.

### Spotify→YouTube Music Resolution Hardening — Live/Cover/Artist Mismatch

- **Problem (user report)** — Spotify playlist items resolved to the wrong YouTube Music version: `คิด(แต่ไม่)ถึง` (Same Page) picked a live concert recording ("...คอนเสิร์ต") because it won the keyword match; the old `resolveSpotifyTrack` never verified the picked track — YT metadata was blindly overwritten with the Spotify title/artist.
- **Fix**
  - `JunkKeywords.ts` — new `LIVE_RE` (EN/ID/TH/KR/JP/CN: live, konser, concert, unplugged, mtv, session, performance, ไลฟ์, 라이브, ライブ, คอนเสิร์ต, 演唱会…); `STYLE_RE` extended with the same terms (also guards autoplay recommendations).
  - `SearchService.ts` — `scoreTrack` penalizes live markers (−6); `pickBestTrack` scores a non-live pool first (filter + trust branches), fallback to full pool when only live versions exist.
  - **New `SpotifyResolver.ts`** — `verifySpotifyMatch()` gate on **raw** title/author (before `pickBestTrack` cleaning): rejects live/cover markers not present in the Spotify name, symmetric token overlap (title ≥0.6, artist ≥0.75 with `- Topic`/VEVO/official/channel noise stripped), containment for non-latin scripts, ±90s duration tolerance; `buildQueryVariants()` = "Artist Title" → "Title" → "Title Artist"; `resolveSpotifyTrack()` tries each variant until verified, **best-effort fallback** (plays the closest match with a `[SpotifyResolver] Unverified fallback` warning) when nothing verifies.
  - `slash/play.ts` & `prefix/play.ts` — duplicated local `resolveSpotifyTrack` removed; both import the shared resolver (same signature, callers unchanged).
- **Tests** — `SpotifyResolver.test.ts` (18): latin/Thai/feat. match, live & cover rejection, artist mismatch ("Bukan Ada Band" vs "Ada Band"), duration tolerance, query-variant fallback chain, best-effort, empty result. **553/553 pass**, typecheck clean.

### Karaoke/Instrumental Versions Rejected from Spotify Resolution

- **Problem (user report)** — "Lay All Your Love On Me" (ABBA, from Spotify) played a karaoke version. `verifySpotifyMatch` only rejected live/cover markers, so a "Karaoke Version" upload passed verification (token overlap ≥0.6 tolerates extra tokens, "ABBA - Topic" author cleans to ABBA, duration within ±90s).
- **Fix**
  - `SpotifyResolver.ts` — verifier now rejects when any of `LIVE_RE | STYLE_RE | STYLE_ML_RE` hits the raw YT title but not the Spotify item name (symmetric), covering karaoke, instrumental, acoustic, tribute, keroncong, 翻唱, 伴奏, カラオケ, 卡拉OK, 노래방, คาราโอเกะ…; a Spotify item that is itself karaoke still passes.
  - `TitleResolver.ts` — `isCover`'s `COVER_PATTERNS` extended with the karaoke family (`karaoke`, backing track, minus one, sing-along, 伴奏, カラオケ, 卡拉OK, 노래방, คาราโอเกะ) — non-latin terms kept outside `\b` (CJK/Thai aren't word chars) — also hardening `pickBestTrack`/autoplay.
  - `SearchService.ts` — `scoreTrack` now applies the `STYLE_RE` penalty (−3) alongside `STYLE_ML_RE` (−1) so studio versions win the scoring branch even when the karaoke upload ranks first.
- **Tests** — `SpotifyResolver.test.ts` +4 (karaoke EN rejected, karaoke non-latin rejected, legit karaoke Spotify item passes, instrumental rejected); `SearchService.test.ts` +1 (karaoke version loses to studio even when first). **558/558 pass**, typecheck clean.

### Cover/Karaoke Rejection Extended to All Re-Resolution Paths

- **Problem (user report)** — after restart/failover/trackError, a Spotify-sourced song still resolved to a cover/karaoke version. The verifier (`verifySpotifyMatch`) only ran in the direct play path (`resolveSpotifyTrack`); every re-resolution path searched `ytmsearch:Artist Title` and blindly took the first result, ignoring the stored Spotify metadata.
- **Fix**
  - `SpotifyResolver.ts` — new `buildSpotifyItemFromTrack(track)` reconstructs a Spotify item from stored metadata (`spotifyUrl`/`spotify:` uri, comma-split artists, duration) and `resolveStoredSpotifyTrack(player, track, user)` runs the full verified resolution chain on it (variant loop + `verifySpotifyMatch` + best-effort fallback).
  - All re-resolution paths now go through the verifier when the stored track carries Spotify metadata: `StateService.ts` restore (session restart), `musicEvents.ts` trackStart prefetch of queued items & trackError first-attempt fallback, `FailoverManager.ts` node failover (both changeNode and destroy-recreate paths, dropping the blind `ytmsearch|ytsearch|scsearch|dzsearch` prefix loop for Spotify), `TrackValidator.ts` re-resolution, `PlaylistService.ts` playlist import (Spotify-URI tracks). Non-Spotify tracks keep their previous behavior.
- **Tests** — `SpotifyResolver.test.ts` +6: `buildSpotifyItemFromTrack` reconstruction (comma artists, open.spotify.com, non-Spotify → null), re-resolution skips a cover in first position, karaoke loses to studio, non-Spotify stored track → null. **564/564 pass**, typecheck clean.

### Instrumental Version Rejection — Resolution, Search Ranking & Re-Resolution

- **Problem** — instrumental/violin/piano covers of Spotify songs could still slip through: `VARIANT_MARKERS` only covered live/style markers, `isCover` had no instrument patterns, and `scoreTrack` never penalized instrumentals — an instrumental upload could win `pickBestTrack` or pass `verifySpotifyMatch` (token overlap tolerates extra tokens like "(Violin)").
- **Fix**
  - `JunkKeywords.ts` — new `INSTRUMENT_RE`: instrument names (violin, piano, guitar, sax, cello, flute, harp, ukulele, kalimba, recorder, trumpet, banjo, mandolin, solo) **only matched inside parentheses** + unambiguous non-Latin terms (演奏, 纯音乐, 연주, บรรเลง). Paren-scoping deliberately avoids false positives like "Piano Man" (Billy Joel) or "Solo" (Clean Bandit).
  - `SpotifyResolver.ts` — `VARIANT_MARKERS` now includes `INSTRUMENT_RE` → an instrumental YT upload no longer passes `verifySpotifyMatch` (symmetric: Spotify item that is itself instrumental still passes).
  - `TitleResolver.ts` — `COVER_PATTERNS` includes `INSTRUMENT_RE` → also hardens `pickBestTrack` filtering and autoplay recommendations.
  - `SearchService.ts` — `scoreTrack` applies `INSTRUMENT_RE` penalty (−3) → studio versions win the scoring branch when an instrumental ranks first.
- **Tests** — `SpotifyResolver.test.ts` +4 (violin rejected, violin-solo rejected, 纯音乐 rejected, "Piano Man" still passes as regression guard); `SearchService.test.ts` +1 (violin version loses to studio even when first). 569/569 pass (volume section below brings the total to **577/577**), typecheck clean.

### Per-Guild Volume Restored on Join/Recreate/Failover — Default 100%

- **Problem** — the bot never passed a volume to Lavalink when creating players, and Lavalink defaults new players to 100; `volumeDecrementer: 0.75` in the Lavalink client was irrelevant because `applyVolumeAsFilter` is false. Any guild that set a volume (e.g. 80) got reset to 100 after: bot restart (StateService restore), 24/7 rejoin (PlayerService.join), node failover (FailoverManager destroy-recreate, lavalink reconnect/resume/ensurePlayer), or a musicEvents reconnect — silent volume reset each time.
- **Fix**
  - `GuildRepository.ts` — new `getVolume(guildId)` (Prisma select `volume` / Mongo `.lean()`; falls back to **100** when unset or on DB error; logs via `Logger.warn`).
  - `Guild.ts` & `prisma/schema.prisma` — `volume` default `80` → `100` (applies to new guild rows; existing saved values keep their number).
  - `PlayerService.ts` — new `applySavedVolume(guildId, player?)`: reads `getVolume`, validates finite number, `player.setVolume(vol)` (swallows rejections, never throws) — re-exported via `MusicService.ts`.
  - Wired into every player (re)creation site: `PlayerManager.createPlayer` (fire-and-forget), `PlayerService.join`, `StateService` restore (before `player.play`), `FailoverManager` destroy-recreate, `lavalink.ts` ×3 (reconnect, node resumed, ensurePlayer), `musicEvents.ts` reconnect (247), `messageCreate.ts` AI play & correct_playlist (after `player.connect()`).
  - Fallback `?? 80` → `?? 100` in `messageCreate.ts` AI volume confirm, `slash/settings.ts`, `prefix/settings.ts`.
- **Tests** — new `GuildRepository.test.ts` (3: stored volume, fallback 100 when unset, fallback 100 on error); new `PlayerService.test.ts` (5: sets saved volume, no player → false, no `setVolume` → false, `getVolume` throws → false, non-finite → false); `messageCreate.test.ts` mock extended with `applySavedVolume`. **577/577 pass**, typecheck clean.

## 2026-08-01 — v3.3.4

### Equalizer — Shared Presets, Resume Fix, and Stop Reset

- **Shared preset module** — new `src/bot/core/constants/EQPresets.ts` consolidates 3 duplicated `EQ_PRESETS` tables (prefix/equalizer, slash/equalizer, apiServer) into a single source of truth with 8 presets: flat, bass, treble, rock, jazz, pop, edm, classical. Includes `resolveEQBands(value)` helper: string preset → bands, array → passthrough, unknown → null.
- **Resume fix** — StateService restore (373-380), PlayerService 247-rejoin (163-165), FailoverManager (2 sites) now resolve preset strings to bands via `resolveEQBands`. EQ now correctly restores after bot restart/failover/247-rejoin (previously skipped when DB stored preset name string).
- **Stop reset (full symmetry)** — command stop now clears all mode RAM + DB just like autoplay: autoplay=false, filter="none", shuffle=false, EQ="flat". Added to PlayerService.stop (247-off block), destroyEngine, and voiceStateUpdate cleanup (mirrors filter's unconditional DB reset). Dashboard stop, /stop, -stop, AI stop all apply.
- **Tests** — `EQPresets.test.ts` (9 tests: 8 presets, 15 bands each, gain bounds, resolveEQBands variants), `voiceStateUpdate.test.ts` mock extended with `setLastEqualizer`. 528 tests pass, typecheck clean.

### AI Confirmations — Reply Stuck On Previous Message & Still Narrating

- **Problem (log user)** — (1) "pause" confirmation replied with text from a PREVIOUS interaction: *"The user said 'stio' which was a typo for 'stop'... Now the system is saying..."*. Root cause: `AIEngine.ask()` writes ALL conversations (including confirmations) to `ConversationMemory`, which is **persistent in the DB** (Mongo/Prisma) — then `PromptBuilder` injects the last 10 entries into every subsequent ask → old text "sticks" into new replies. (2) The narrative summary prompt ("The user paused the music playback.") made the model mimic the narrative style.
- **Fix** — new `AIEngine.askFresh()` path + `AITaskQueue.runAIAskFresh()` (`ai:ask-fresh`): pure [system, user] messages, **no memory read & no memory write** — confirmations neither pollute conversation history nor get polluted by old history. `confirmReply` switched to `askFresh`. Summary rewritten to terse non-narrative form ("Playback paused.", "Queued 3 tracks, first: \"...\"", "Loop mode: track."). `CONFIRMATION_MODE` + explicit narration ban ("Never narrate — no 'The user…', 'The system…'"). maxTokens 48 kept.

### Reply-to-Bot — Prompt Truncated By Trigger Character (AI Didn't Know a Track Was Playing)

- **Problem (log user, reply "resume")** — replying to the bot: "resume" → AI answered "Eh, ada apa? 😄", "resume lagu" → "Lagu apa yang mau diputar? 😄". Root cause: `messageCreate.ts` used to strip `text.slice(trigger.length)` from ALL non-mention messages — including reply-to-bot messages without a trigger prefix. "resume" (trigger "seryn" = 5 chars) → "e" → fell into the chat path → AI confused.
- **Fix** — the trigger is only stripped when the message actually starts with the trigger (`text.toLowerCase().startsWith(trigger)`); replies/mentions are used in full.
- **Tests** — `messageCreate.test.ts` +2: reply "resume" → full "resume" prompt; "mona resume" → trigger still stripped → "resume". **497/497 pass**, typecheck clean.

### AI "Blank" / DB Read on Reply — Interpreter Inflections, Playback State, Anti-Narration Hardening

- **Problem (log user, reply "paused"/"resume"/"stop")** — "paused" → regex `pause\b` doesn't match past tense → falls to chat → reads memory → hallucinates "already stopped earlier (STOP)". As a result "resume" failed ("Failed to resume.") because the player was actually still PLAYING (pause was never executed). "stop" → narrative leak "The user sent 'Playback stopped.'..." — even in local code (askFresh) the model mimics a user-message shaped like a passive status.
- **Fix**
  - `CommandInterpreter.ts` — added inflections: `paused|pausing|pausein`, `stopped|stoping`, `resumed|resuming|lanjutin`, `skipped|lewatin`. ("lanjut" stays skip; "lanjutin" → resume.)
  - `persona.ts` — `PersonaContext` + `playbackState` ("playing"|"paused"|"stopped") + `queueCount`; new facts: PAUSED ("track still loaded, can be resumed") / PLAYING / "Nothing is playing" + "Queue has N tracks". This fixes "AI doesn't know a track is playing".
  - `messageCreate.ts` — helper `playbackStateOf()` + `playbackFacts()` used in `confirmReply` AND the chat path `runAIAsk`; humane pre-checks: resume while playing → pool `alreadyPlaying` ("Lagi jalan kok, gas terus aja 🔊"), pause while paused → `alreadyPaused`, resume without pause → `nothingToResume` (instead of "Failed to resume."); summaries rewritten to natural user-action form: "Stopped the music.", "Paused the music.", "Resumed the music.", "Volume set to N%.", "Skipped — queue is empty."
  - `confirmationPrompts.ts` — hardened `CONFIRMATION_MODE`: "The last message is a status summary, NOT something the user typed — do not quote it, do not narrate it." + pools `alreadyPlaying`/`alreadyPaused`/`nothingToResume`.
  - `scripts/scrub-confirmation-memory.ts` — additional patterns for the new natural summaries.
- **Tests** — interpreter inflections (+10), persona state-aware in chat path (+2), humane resume/pause pre-checks (+3), stop natural summary (+1). **504/504 pass**, typecheck clean.

### AI Quality Hardening — Anti-Regurgitation (instruction echo)

- **Problem (log user "pause song"/"resume song", 4:28 PM)** — AI replied by copying the instructions: "The user wants me to respond as Paperplane, a friendly Discord music bot..." and "The context says the last message is a status summary...". NVIDIA 550B model at `temperature: 1.0` + `maxTokens: 48` → creative mode + output truncated mid-reflective-sentence; the prompt contained long declarative sentences ("The last message is a status summary...") that got echoed verbatim.
- **Fix (defense in depth)**
  - `confirmationPrompts.ts` — `CONFIRMATION_MODE` rewritten: removed echo-able narrative sentences ("status summary", "do not quote", "never narrate"); replaced with a strict positive format: "Reply ONLY with the chat text itself... Output format: the reply text and nothing else" + few-shot.
  - `messageCreate.ts` — the confirmation path no longer injects `buildPersona` (echo material); `temperature 1.0 → 0.2`, `maxTokens 48 → 64`.
  - **Safety net** `isRegurgitation()` — echo-pattern detection (`^The user`, `^The system`, `^The context`, `^I would`, `^I'm asked|supposed`, `^As an AI`, `^You are`, `^Your reply`, `status summary`, etc.) → falls back to `fallbackPhrase(poolKey)` (natural static templates). Leaks can never reach the user.
- **Tests** — new `confirmationPrompts.test.ts`: 2 real leaks from the user's log detected, narrative variants detected, natural sentences pass, prompt mode free of echo phrases, normalize + fallback. `messageCreate.test.ts`: fallback when AI regurgitates + asserts the new params (temp 0.2, maxTokens 64). **513/513 pass**, typecheck clean.
- **Cleanup** — `scripts/scrub-confirmation-memory.ts` (one-off): removes polluted Conversation rows (user-rows matching confirmation summary patterns + assistant-rows matching narrative patterns "The user said/The system/Now I need…"). Run on the VPS: `npx tsx scripts/scrub-confirmation-memory.ts` — without it, the user's first 10 affected interactions still read dirty history.

### "lanjut" State-Aware — Skip vs Resume (not Disconnect)

- **Problem (log user, 5:35 PM)** — "seryn pause" → "Oke, dijeda dulu. Lanjut kapan-kapan!" then "lanjut" → "Disconnected from voice channel." + "Belum ada lagu di antrian. Minta satu, gas! 🎵". Root cause: the interpreter maps "lanjut" to `skip` → `PlayerService.skip()` with an empty queue and no autoplay/247 → `player.disconnect()` + `player.destroy()` (PlayerService.ts:122-129) → voiceStateUpdate sends the "Disconnected from voice channel." embed.
- **Fix** — `messageCreate.ts` case `skip` is now state-aware: `player.paused` → **resume** (summary "Resumed the music." / pool `nothingToResume` on failure); `playing` → normal skip; no player → "No track playing."
- **Tests** — `messageCreate.test.ts` +3: "lanjut" while paused → `resume` called & `skip` not; resume failure → nothingToResume pool; "lanjut" while playing → still skips to the next track. **516/516 pass**, typecheck clean.

### Last-Track Error — Silent Queue End (AllClientsFailedException)

- **Problem (Lavalink + bot logs, 11:08)** — the track "Kamaz (feat. dlb)" failed: `AllClientsFailedException` (TVHTML5 decode fail = socket connect failure, WEB/ANDROID_VR "This video requires login") — transient network issue, but the cause contains "requires login" → classified **permanent** → `findMultiSourceFallback()` found no alternative (search returns the same track) → `markBad` + `stopPlaying()` **without any message**. Worse: since this was the LAST track, `queueEnd` fired first → `nowPlaying` empty → `jitterBuffer()` misjudged "player already moved on" → cancelled ALL error handling — fallback/retry never executed. The second manual play succeeded → proof the error was transient.
- **Fix**
  - `jitterBuffer()` — reclassification: cancels only when nowPlaying holds a DIFFERENT track (already recovered) or `isStopDisconnect` (deliberate stop); nowPlaying empty without a stop → the queue ended BECAUSE of this error → proceed to the handler.
  - `trackStart` — `clearStopDisconnect` + per-guild cleanup of `permanentRetried` (247 edge case: the flag sticks because the bot never leaves the VC).
  - **Retry-once** for permanent errors (`permanentRetried`, key `${guildId}:${trackId}`) — `isFirstAttempt` pattern, no delay, bounded to 1x: if the retry succeeds the track plays without user intervention; fails again → `markBad` + `stopPlaying()` + error embed "Track failed to play after retry — skipping it." (no more silence).
- **Tests** — `isPermanentTrackError` (regex unchanged) still covers the user's exact log string. **516/516 pass**, typecheck clean.

### AI Voice Gate — Control Commands Require Bot in the Same Voice Channel

- **Problem (user report)** — user in voice, bot NOT in voice, told the AI "autoplay nyalain dong" → AI replied "Oke, autoplay nyala 🔁" and silently toggled the setting. The AI-interpreted path in `messageCreate.ts` had a single weak guard (`if (!voice)` — user-in-VC only) before the command switch: it never checked the bot's connection or channel match, unlike prefix commands which use `requireSameVoice()`. Affected: `autoplay`, `shuffle`, `loop`, `247`, `clear`, `recommend` (no player check at all) and `skip`/`stop`/`pause`/`resume`/`volume` (player check only — could control another session in a different VC). Confirmed: `-ap` correctly replied "Bot is not connected to a voice channel."
- **Fix** — `messageCreate.ts` AI path now gates the command switch with `requireSameVoice()` (single source of truth, same UX as prefix): bot not connected → "Bot is not connected to a voice channel."; different VC → "You must be in the same voice channel as the bot."; `queue`/`nowplaying` stay informational (user-in-VC only, matching prefix versions); `correct_playlist` joins voice when no player exists, same-voice check only when a player is already active.
- **Scope note** — `filter`/`equalizer` are NOT reachable via AI (no interpreter mapping, no LLM format token) — they fall back to a chat reply; no bypass exists. Follow-up (out of scope): `play`/`correct_playlist` with an existing player in another VC can still overwrite that session — same-voice check there is a candidate for later.
- **Tests** — `messageCreate.test.ts` +3: autoplay blocked when bot not connected (state not toggled), blocked on different VC, blocked when user not in voice; existing control-command mocks now carry `voiceChannelId`. **519/519 pass**, typecheck clean.

## 2026-08-01 — v3.3.3

### AI-Driven Confirmations — Bot Feels Alive (Chat Flow)

- **Problem (log user)** — AI-flow template replies felt stiff & robotic: "Queued 8 tracks.", "Playback paused.", "Queue empty." — monotonous, barely varied.
- **Fix** — `messageCreate.ts`: all AI-flow confirmations (playlist queued, pause, resume, stop, clear, shuffle, loop, autoplay, 247, recommend, queue-empty, nothing-playing, volume) are now LLM-generated: the action still executes instantly → typing indicator → `runAIAsk` with `CONFIRMATION_MODE` (one short sentence, user's language, varied, no command-name echo) + action context (track count, first track title, user name) → AI text becomes the embed description. Race timeout `AI_CONFIRM_TIMEOUT` (default 4s, env-configurable) → if AI is late/fails, fall back to a warm random phrase from the pool (`confirmationPrompts.ts`, 3 variants per action). `AIEngine.ask` & `AITaskQueue.runAIAsk` now accept `maxTokens` (~80) & `temperature` (1.0) overrides for confirmations — cheap & fast. Error embeds, NowPlayingEmbed, prefix/slash command embeds, and the Spotify scraper are **untouched** — AI only touches the final confirmation text layer.

### Queue Follow-Up — "what's in it?" No Longer Re-Queues

- **Problem (log user)** — "apa saja isinya itu?" (meaning: view the queue) ended up queuing 15 more songs. `CommandInterpreter` regex only matched `queue|q|antrian|lagu apa` → the follow-up phrase fell to the LLM → the LLM hallucinated `PLAYLIST:`.
- **Fix** — `CommandInterpreter.ts`: queue regex extended (anchored at start): `isinya apa|apa isinya|apa saja isinya|isi (antrian|queue)|daftar (lagu|antrian|queue)|list (lagu|queue)|lihat (antrian|queue)` → directly `{ type: "queue" }` without the LLM. Safe: "mainkan apa saja" stays `play`, "halo apa saja" stays `chat`. `AIDJ.ts` systemPrompt: guardrail — queue-content questions → `QUEUE`, NEVER create PLAYLIST/PLAY from such questions (+ examples).

### Changed-to Embed — Title Becomes Clickable Link

- `messageCreate.ts` case `correct_playlist`: description now `Changed to [title](url)` (uses `originalUrl || uri`), falls back to `**title**` when the URL is empty.

### Tests

- `messageCreate.test.ts` +5: changed-to link & bold fallback, pause AI-generated (summary + maxTokens override asserted), pause fallback pool when AI fails, playlist AI with track-count + first-title context. `EmbedBuilder` mock upgraded to class-style (vitest 4 rejects `mockReturnValue` + `new`). `CommandInterpreter.test.ts` +3 (7 follow-up phrases → queue, play/chat regressions), `AIDJ.test.ts` +1 (guardrail present in systemPrompt). **494/494 pass**, typecheck clean.

## 2026-08-01 — v3.3.2

### Autoplay — Cross-Script Dedupe (Romaji/Kana/Kanji & Misspelling)

- **Problem (log user, Japanese songs)** — 3 of 12 autoplay songs repeated within ~40 minutes (ヒーター ×2, It's All Right ×2 in a row, 涙は魅せない ×2). Root cause: dedupe `_trackKey` only lowercased + stripped non-alnum → `北乃きい` / `kitano kii` / `kitnao kii` (misspelling from YT Music metadata) = 3 different keys → `_isPlayed` & `_detectLoop` all passed. `_isSameTrack` only checked against the current track, not history.
- **Fix** — `RecommendationEngine.ts`: new state `playedEntries` (title/author/identifier, cap 100, parallel to `playedTracks`); helper `_isSameSong` — same identifier → same; different title (after `stripTitleVariants`) → different; author: same/includes → same, Latin↔Latin `levenshtein ≤ 2` (catches `kitano`↔`kitnao`), CJK↔CJK → different (anti false-positive, `아이유` vs `폴킴` stay different), mixed scripts → conservatively same. `_isPlayed` extended: exact-key fast path + `_isSameSong` fallback against all history entries. Call sites unchanged — `getRecommendations` already `_markPlayed`s the current track before filtering, so back-to-back duplicates are blocked too.
- **Tests** — `RecommendationEngine.test.ts` +7: Latin misspelling, cross-script, CJK different-artist anti-conflate, different title, variant title + cross-script, same identifier, `getRecommendations` integration excludes variant duplicates. **486/486 pass**, typecheck clean.

### Voice State — Alone Timer When Member Moved by Automation Server

- **Problem** — user auto-moved by an automation server (1 user + 1 bot, long queue/autoplay) → the bot does not leave. `voiceStateUpdate` only had a leave branch (`channelId === null`) and a join branch (`oldState.channelId === null`) — a move (both non-null) never triggered any timer.
- **Fix** — new "member moved" branch: old channel = bot's channel & no humans & 24/7 OFF → `startAloneTimer` (1 minute); new channel = bot's channel → `cancelAloneTimer`. `musicEvents.ts` untouched.
- **Tests** — new `voiceStateUpdate.test.ts` (7 tests, fake timers, `vi.hoisted`): moved → destroy after 60s, move back → cancel, other humans remain → no-op, 24/7 → no-op, bot not in channel → no-op, lavalink down → skip, manual-leave regression.

## 2026-08-01 — v3.3.1

### Search Platform — Back to `ytmsearch` (VPS now supports MUSIC client)

- **Reversal** — v3.2.8/v3.2.9 downgraded `ytmsearch` because the VPS Lavalink had no MUSIC client → results always empty. VPS Lavalink logs 2026-08-01 prove the condition changed: `ytmsearch:hazakura` & `ytmsearch:kie kitano hazakura` both `"Loaded playlist Search music results for: ..."` (results EXIST), `YoutubeAccessTokenTracker` visitor-id update succeeded. `ytmsearch` restored as the primary platform in 13 files (play prefix+slash, search, RecommendationEngine autoplay, musicEvents, StateService, messageCreate, PlaylistService, FailoverManager, `lavalink.ts` `defaultSearchPlatform: "ytmsearch"`); the ytsearch → scsearch → dzsearch fallback chain stays behind it.

### Track Picker — Fix Latin Query vs Kanji/Kana Results (script mismatch)

- **Problem (proof: curl `trace=true`)** — `-p kie kitano hazakura` played Deebu - Hazakura, even though YTM result #1 was 北乃きい (Kitano Kii) - 葉桜 (Hazakura). `pickBestTrack` scores query keywords (`kie`, `kitano`, `hazakura`) via substring match against title/author: the kanji track (葉桜/北乃きい) can't match romaji keywords → −8 penalty → score +2, loses to Deebu whose title is romaji "Hazakura" (+15). Duration wasn't the cause (both pass the 120–480s filter).
- **Fix** — `SearchService.pickBestTrack`: if the query has Latin (romaji) keywords but the top results are purely non-Latin (not a single `[a-z]` in title+author), substring matching is impossible → trust the node's ordering (`candidates[0]`) instead of penalizing every candidate. Normal Latin queries & non-Latin queries (Thai/Korean) keep scoring — no regression (existing non-Latin tests stay green).
- **Tests** — `SearchService.test.ts` +3: multi-keyword script mismatch (`kie kitano hazakura` → 葉桜), single Latin keyword vs top non-Latin (`hazakura` → 葉桜), Latin rerank regression (`kitano kii hazakura` → Hazakura). **472/472 pass**, typecheck clean.

### Double Embed — Skipping a Single Track Sent 2 Identical Embeds

- **Problem** — skipping a track (queue of 1) sent a skip embed AND an identical "Started playing" embed for the next track. Root cause: `player.play()` → node sends `trackEnd(reason="replaced")` → the ghost path in `musicEvents.ts` (`queueLen === 0 && player.playing`) triggered → `handleQueueEnd` deleted the `manualAdvances` flag (used by skip) → the new track's `trackStart` was not suppressed → the natural embed was sent twice.
- **Fix** — `musicEvents.ts`: (1) the ghost path is now guarded by `reasonStr !== "replaced"` (skip-replace must not trigger manual queue-end); (2) `trackStart` deletes the `manualAdvances` flag after reading it (single-use semantics, consistent with `suppressTrackStart`).

### Ops — VPS: Remove SponsorBlock Plugin

- **sponsorblock-plugin-3.0.1** errored on EVERY track start: `MissingFieldException: Field 'horizontalCardListRenderer' is required ... ExpandedContent` (YouTube innertube schema changed, plugin outdated) — only crashed the event handler (playback unaffected), and `Categories are: []` (empty) means the plugin wasn't skipping anything. Removed from `plugins/` on the VPS.

## 2026-08-01 — v3.3.0

### Non-Latin Support — Junk Filter & Recommendation (KR/CN/JP/AR/TH)

- **Problem** — user reported that songs in unique languages (Korean/Chinese/etc.) are hard to find and recommendations are messy. Root cause: all text normalization in the engine uses `/[^a-z0-9]/g` → non-Latin chars (한글, 中文, ไทย, العربية) are all discarded → key becomes `""`/`"-"` → **once 1 non-Latin song plays, ALL non-Latin songs count as played** (trackKeyOf/_trackKey), `_isSameTrack` mixes up different titles, genrePrefs never stored, keyword overlap empty. Additionally: non-Latin search queries produce no keywords (`queryKeywords` ASCII regex) → every candidate gets −8.
- **Fix A — Unicode normalization** — 12 spots in `RecommendationEngine.ts` (normAuthor, trackKeyOf, markBadTrack/markGoodTrack author, incrementGenre, authorRep/authorPenalty, `_extractKeywords`, `_isSameTrack`, `_isNearDuplicate`, `_trackKey`, `_candidateScore`, genrePrefs check) + `AutoplayEngine._trackKey`: `[^a-z0-9]` → `[^\p{L}\p{N}]/u`. Latin behavior identical (460 old tests stay green), non-Latin now produces real keys/types. `SearchService.queryKeywords`: `/[a-z0-9]{3,}/` → `/[\p{L}\p{N}]{3,}/u` → Korean/Thai/AR queries now match.
- **Fix B — multilingual patterns in `JunkKeywords.ts`** — `HARD_JUNK_RE` + lyrics-family KR/CN/JP/AR/TH/VI (`가사` already there, `歌詞`, `字幕`, `中字`, `자막`, `كلمات`, `เนื้อเพลง`, `बोल`, `lời bài hát`, `vietsub`) + editorial per language (KR `뉴스/팩트/순위/사연`, CN `新闻/故事/解说/盘点/排名`, JP `ニュース/解説/ランキング/まとめ/事実`, AR `أخبار/قصة/حقائق/شرح`, TH `ข่าว/เรื่องราว`). `SOFT_JUNK_RE` + episode markers `\d+(화|회|集|話)`, `حلقة N`, `ตอนที่ N` + Unicode hashtag `#[\p{L}\p{N}_]{3,}` (regex now `/iu`). New `STYLE_ML_RE` (翻唱/커버/カバー/ريمكس/คัฟเวอร์/etc.) used in the RecEngine autoplay filter (strict + fallback), `scoreTrack` −1, and `styleML` signal (weight 1, soft).
- **Fix C — false positive** — `/generation/i` removed from `EVENT_PATTERNS` (hit the real name "Girls' Generation" 少女時代).
- **Tests** — `RecommendationEngine.test.ts` +6 (distinct non-Latin keys without collision, Korean suffix dedupe, `밤편지 가사` junk vs clean `밤편지`, editorial in 5 languages, Unicode hashtag tier, style soft), `SearchService.test.ts` +3 (official Korean beats 가사 versions, Thai query produces keywords, 리믹스 version ranks lower). **469/469 pass** (460 + 9), typecheck clean.

## 2026-08-01 — v3.2.9

### Junk Filter — Lyrics / Editorial / Hashtag

- **Problem** — 2 junk tracks slipped through the filter (log user): 1) `FLOWER POWER Lyrics (KAN/ROM/ENG)` played via manual search even though the official audio/MV exists — root cause: `SearchService.scoreTrack` gives **+4 boost** to titles containing "lyrics" (and there was no lyrics junk pattern at all), official only +2 → fan lyric uploads win ranking. 2) `Pupupapa - Facts of Yoon Chan Young you should know | #MisogynyControversy #Allofusaredead` slipped into autoplay — `pipeSuffix` failed to catch `| #...` (needs a letter after the pipe), no hashtag/editorial patterns; repeated 2× in one session because `clearPlayed` also wiped the learned badTracks reputation.
- **Fix** — `JunkKeywords.ts`: 2 new tiers. `HARD_JUNK_RE` (weight 3, 1 hit blocks directly in autoplay): lyrics-family (`lyrics`, `lirik`, `가사`, `歌词`, `kan/rom/eng`, `engsub`) + editorial phrases (`facts about/of/on`, `you should know`, `everything about`, `behind the scenes`, `documentary`, `explained`, `top N`, `interview`, `podcast/lecture/seminar/audiobook`). `SOFT_JUNK_RE` (weight 1, needs combination): hashtag `#\w{3,}`, `how to`, `story of`, `news/update/review/reaction/ranking/recap/teaser/trailer/controversy/episode/season`. False-positive guard: "How to Save a Life", "Story of My Life", "The Story of Us", "#Beautiful" → 1 point, still pass.
- **`RecommendationEngine.ts`** — `getTriggeredSignals` + `hardJunk`/`softJunk`; `pipeSuffix` widened to `/\|\s*#?[a-z0-9]{3,}/` (catches `| #tag`); `DEFAULT_SIGNAL_WEIGHTS` + `hardJunk: 3, softJunk: 1`. `clearPlayed()` **stops deleting badTracks/authorRep** (only playedTracks) → learned junk reputation survives across sessions; bonus: `lastTrack` (co-occurrence learning) also survives.
- **`SearchService.ts`** — `scoreTrack`: lyrics `+4` → `HARD_JUNK_RE −3` / `SOFT_JUNK_RE −1`. Official audio/MV beats lyric reuploads; lyric versions stay playable if they're the only result (penalty, not hard-block). The `pickBestTrack` refilter path auto-activates because `isJunkTrack` now catches the new cases.
- **Tests** — `SearchService.test.ts` +3 (official beats lyrics; editorial+hashtag ranks lower; lyrics-only stays playable), `RecommendationEngine.test.ts` +5 (lyrics junk, editorial+hashtag junk, facts-of alone junk, hashtag alone not junk, soft phrases not junk). **460/460 pass** (452 + 8), typecheck clean.

## 2026-08-01 — v3.2.8

### Autoplay Prefetch — YouTube-style Instant Transition

- **Problem** — `getNextTrack` is computed **when the track ends** (queue end), the rec engine runs sequentially (YouTube Mix + artist search + title fallback) → 2–4 second gap between autoplay tracks. YouTube: "Up Next" is picked long in advance, gap < 1s.
- **Fix** — `AutoplayEngine.ts`: `schedulePrefetch()` hooked into `trackStart` (only when autoplay ON + queue empty + not track/playlist loop + duration > 0), timer fires **15s before the track ends** (10s floor for short tracks) → `prefetch()` computes the rec ahead of time → per-guild cache (`{track, sourceKey, at}`, 10-min TTL). `getNextTrack()` checks the cache first (sourceKey = `info.identifier` fallback author-title): **hit → instant return (< 300ms)**, cache consumed; miss → on-demand compute (old behavior, safe).
- **Safeguards moved to consumption time** — autoplay counter, loop detection, circuit breaker (`_applyGuards`) run at `getNextTrack`, not at prefetch → unused prefetches don't bump counters/skips. Strict 120–480s filter + mandatory duration (`_computeNext`) stay on the output side — odd tracks can't get through.
- **Invalidation** — `clearPrefetch` on: autoplay toggle OFF (prefix + slash commands), `state:delete`, `recommendation:clearPlayed`, `clearAutoplay`, `_disable` (circuit breaker). Last-writer-wins: different sourceKey → new prefetch replaces the old cache.
- **Other call sites get cache hits automatically** — `PlaybackEngine.skip`, `PlayerWatchdog` recovery, ghost-queue path (`handleQueueEnd` via `trackEnd`) — all use the same `AutoplayEngine` instance (`export const autoplayInst` in musicEvents).
- **Accepted misses** (on-demand fallback) — far-forward seek (timer hasn't fired), pause > 10 min (TTL). Live streams (duration 0) are never scheduled.
- **Tests** — `AutoplayEngine.test.ts` +7 (consume-cache, no extra search, miss on source change, timer at duration-15s, 10s floor, clearPrefetch, disabled no-op), `musicEvents.test.ts` +5 (trackStart schedules when autoplay on + queue empty; skips when off / queue full / track loop / duration 0; shared `registeredHandlers` map because `register()` is idempotent). **452/452 pass** (440 + 12), typecheck clean.

## 2026-07-31 — v3.2.7

### Ops — Lavalink VPS YouTube Hardening (setup notes)

`application.yml` config on Lavalink 4.2.2 + youtube-plugin 1.18.2 that resolved YouTube blocks from datacenter IPs:

- **OAuth only works on the `TV` client** — official docs: *"Only the TV client supports OAuth... Web, Android, and Music clients only support public content"*. Config: `clients: [TV, WEB, ANDROID_VR]` + `oauth: { enabled: true, refreshToken: "..." }`. Previously used `WEB/MUSIC` → warning "OAuth has been enabled without registering any OAuth-compatible clients" (token refreshed but unused). The `MUSIC` client is search-only, can't stream.
- **Remote cipher server** — youtube-plugin 1.18.2's regex cipher breaks against the new YouTube player script (`Must find sig function`, issue #225 — maintainer: *"use a remote cipher server"*). Fix: `remoteCipher: { url: "https://cipher.kikkia.dev/", userAgent: "paperplane" }` (public yt-cipher instance, 10 req/s rate limit; self-host via `kikkia/yt-cipher` for >1k players).
- **Forced IPv4 stack (phase 1)** — VPS has no IPv6 → googlevideo streams failed with `Network is unreachable`. Start: `java -Djava.net.preferIPv4Stack=true -jar Lavalink.jar`.
- **IPv6 enabled on AWS (phase 2 — solved CDN block)** — VPC/subnet + IPv6 CIDR, route `::/0` → Internet Gateway, auto-assign IPv6 on the instance; OS `net.ipv6.conf.all.accept_ra=2`. Start changed to `java -Djava.net.preferIPv6Addresses=true -jar Lavalink.jar` (preference, not force — IPv4 stays as fallback). Result: niche videos blocked on IPv4 datacenter (KAMAZ — `Connect timed out`/SYN blackhole per googlevideo node) get through via IPv6. Popular videos (blinding lights) work on both stacks. Full setup: `docs/LAVALINK_VPS_SETUP.md`.
- **Per-video CDN block (remaining risk)** — if a niche video still fails on both IPv4 and IPv6 (blocked on both stacks for that node), it can't be fixed in config — the bot-side multi-source fallback (section below) handles it.


### Error Handling — Classification, Friendly Messages, Defer Standardization (1.8)

- **`ErrorClassifier.ts` (new)** — `src/bot/core/errors/ErrorClassifier.ts`: classifies thrown errors into 3 kinds:
  - `UserError` (new class) — command-level validation errors; message shown verbatim to the user.
  - `discord` — `DiscordAPIError` (via `.code`/`.status`): friendly messages for 429 (rate limit), 403/50013 (missing permissions), 50007 (DMs blocked), 10008 (deleted message).
  - `system` — anything else; generic "Something went wrong on my side" with **no internals leaked** (DB connection strings, IPs, stack traces never reach the user).
- **Wired into both entry points** — `interactionCreate.ts` and `messageCreate.ts` (prefix commands, both paths): system/discord errors → `Logger.error` + `Sentry.captureException` (with command tag); user errors → `Logger.warn` only, no Sentry noise. Replaces the generic "An error occurred while executing this command." / "Command error." everywhere.
- **Defer standardization** — defer happens only after all guards pass, before any heavy work:
  - `prefix.ts` — `setPrefix`/`getPrefix` (DB calls) moved after `deferReply` (was: DB write before defer, risking the 3s interaction window).
  - `remove.ts` — `deferReply` moved to the top after voice guard; all `interaction.reply` paths converted to `editReply` (including the confirm-button flow via `editReply`-resolved message + `awaitMessageComponent`); `removeByQuery` (await, slow) no longer runs before defer.
  - Audited the other 14 slash commands (play, search, skip, seek, lyrics, playlist, stop, pause, resume, queue, volume, swap, shuffle, 247): all already correct (guard → defer).
- **Lyrics safe-catch verified + hardened** — audited `slash/lyrics.ts` + `prefix/lyrics.ts`: outer try/catch with `Logger.error` + friendly embed, silent inner catch for `getCurrentLyrics()` fallback to LRCLIB, `fetchReply().catch()`, `LyricsService` internal catches — all present. Two gaps fixed: prefix lyrics loading-message `channel.send` now has `.catch(Logger.safe(...))`; the two silent `catch {}` for Lavalink lyrics now `Logger.warn` (observable fallback).
- **Tests** — new `ErrorClassifier.test.ts` (6 tests: UserError, 50013, 429, unknown Discord code, system-error leak check, null input). 431 total passing.

### Play After Lavalink Restart — Stale Player Fix

- **Bug** — after a Lavalink/node restart, the first `-p`/`/play` produced no sound until the user ran `-stop` and played again. Root cause: `getPlayer()` returned the old player whose node session was gone, but client-side `player.playing` was still `true` → the play path saw "already playing" and silently queued the track instead of playing it.
- **Fix** — both `prefix/play.ts` and `slash/play.ts`: before reusing a player, check `player.node?.connected`. If the node is disconnected (stale session), destroy the player and create a fresh one (with a fresh voice connect) — no more silent first play after a Lavalink restart.

### Track Error — Permanent Error Detection + Multi-Source Fallback

- **Problem** — YouTube blocks certain niche videos from datacenter IPs (AWS/cloud) with a disguised "This video requires login" / `AllClientsFailedException` / "Video player configuration error". These errors are permanent — retrying the same track always fails, so the old flow burned 2-3 retry cycles (re-resolve → retry original → drop) before falling back.
- **`isPermanentTrackError(errMsg)`** — `musicEvents.ts` (exported, testable): detects permanent YouTube failures by pattern (`requires login`, `AllClientsFailedException`, `Video player configuration`, `Sign in to confirm you're not a bot`, `This video is unavailable`, `removed by the uploader`, `playability`). Matches against `exception.message` + `exception.cause` (Context7-verified payload shape).
- **Immediate multi-source fallback** — `findMultiSourceFallback()`: on permanent error, skips retries entirely and tries the same song on `ytsearch` → `scsearch` (SoundCloud) → `dzsearch` (Deezer), picking the first working track via `pickBestTrack` (skips same-URI duplicates, preserves source/requester metadata).
- **Immediate blacklist** — if no fallback source works, the track is `recommendation:markBad`'d (source `"error"`) in one cycle instead of three, then `stopPlaying()` → `queueEnd` → autoplay advances to a *different* track. Node-disconnected path still routes through `recoverPlayer`.
- **Tests** — 2 new tests in `musicEvents.test.ts`: permanent patterns match (6 cases incl. real `AllClientsFailedException` string), transient errors rejected (ECONNRESET/ETIMEDOUT/generic/empty). 435 total passing.

### Autoplay Stuck Fallback — Blacklist, Never Stop

- **Problem** — when a Lavalink node goes unstable, every track stalls (`trackStuck` at 15s). Each stuck fired `stopPlaying()` → `queueEnd` → autoplay recommended the *next* track, which could also stall — but worse, the same stalled track could be recommended again, looping it forever.
- **Fix** — `musicEvents.ts` `trackStuck` handler now emits `recommendation:markBad` with `source: "stuck"` before stopping the player:
  - The stalled track is blacklisted from autoplay recommendations (same path as error/skip feedback — 3 strikes makes it permanently bad).
  - `queueEnd` → autoplay continues with a *different* track — the stuck track can never be picked again. Fallback always happens; the bot never stops on its own.
  - Play path already had the full fallback chain (re-resolve with duration match → retry original → drop after 3 failures → `recoverPlayer` when node disconnects) — stuck is now symmetric with track errors.
- **Tests** — 2 new tests in `musicEvents.test.ts` via real handler registration: stuck → `stopPlaying` called + `recommendation:markBad` emitted with `source: "stuck"`; node disconnected → no unsafe stop. 436 total passing.

### Search Selection — Query-Aware Track Ranking

- **Bug** — `-p`/`/play` always took `tracks[0]` from the search result (as long as the title had no bad keyword), so YouTube's popularity ranking decided the song. `-p cyka blyat` / `-p blyatman cyka blyat` both played "Russian Village Boys x Cosmo & Skoro - Cyka" (80M views) instead of "DJ Blyatman - Cyka Blyat".
- **Fix** — `pickBestTrack(tracks, query?)` (`SearchService.ts`) now reranks results against the user's query keywords: +5 per keyword found in the title, +3 per keyword found in the author, +10 bonus when every keyword matches, −8 penalty when nothing matches. Backward compatible — without a query the old `tracks[0]` behavior is preserved (playlist URLs, direct links).
- **Wired in** — both `prefix/play.ts` + `slash/play.ts` pass the raw query (and Spotify resolve query) into `pickBestTrack`; the multi-source fallback in `musicEvents.ts` passes its author+title query too, so error fallback gets the same ranking.
- **Drop `ytmsearch:` from the regular search flow** — the VPS Lavalink has no `MUSIC` client configured (`clients: [TV, WEB, ANDROID_VR]`), so `ytmsearch:` always returned empty (1 wasted request + ~400ms per command). Plain `ytsearch:` is used first now; the dead `ytmsearch` fallback branch was removed. Re-enable `ytmsearch:` when a MUSIC client is added on Lavalink. (`resolveSpotifyTrack` keeps its `ytmsearch` → `ytsearch` attempt chain.)
- **Tests** — new `SearchService.test.ts` (4 tests: artist+title rerank, full-keyword-match preference, legacy no-query behavior, URL queries skip keyword scoring). 440 total passing (442 incl. 2 earlier-added in this release; benchmark timing flake is pre-existing).

### Search Selection — "DJ" Filter Bug (root cause of wrong tracks)

- **Root cause found** — `BAD_KEYWORDS` in `SearchService.ts` contained `"dj"`. `hasBadKeyword()` matched it against BOTH title and author, so **any track with "dj" in the artist name was filtered out** (DJ Blyatman, DJ Snake, DJ Khaled, ...). Every `-p` search for a DJ-artist returned the leftover fallback track: `-p cyka blyat` played "BIAŁAS & LANEK", "S Meme - CYKA BLYAT edition", or "Russian Village Boys - Cyka" — and even the KAMAZ "success" earlier was actually "Kamaz AMV - Namida" (the real "DJ Blyatman Kamaz" was filtered). The query-aware ranking from the previous patch never got a chance — the DJ track was removed before scoring.
- **Fix** — removed `"dj"` from `BAD_KEYWORDS`. DJ artists now survive the bad-keyword filter and win on query ranking.
- **Full search-flow audit (every search path)** — replaced `ytmsearch:` with `ytsearch:` in **12 places**: `resolveSpotifyTrack` (prefix+slash play), `/search` command (was always empty without a MUSIC client → "No results found"), reply-trigger paths in `messageCreate.ts` ×2, autoplay recommendation in `RecommendationEngine.ts` ×2, queue-end spotify re-resolve in `musicEvents.ts`, playlist import in `PlaylistService.ts` (deduped duplicate branch), state restore in `StateService.ts`, failover re-resolve loops in `FailoverManager.ts` ×2, `findTrackWithDuration`, and **`defaultSearchPlatform: "ytmsearch"` → `"ytsearch"` in `lavalink.ts`** (query without prefix was silently searching an unavailable platform). All because the VPS Lavalink has no `MUSIC` client configured — every `ytmsearch` was one wasted request + ~400ms and zero results. Revert to `ytmsearch` if a MUSIC client is ever added.
- **Verified clean** — `isCover`, `isJunkTrack`, `STYLE_RE`, `CLICKBAIT_PATTERNS`, `POST_OFFICIAL_RE` all pass "DJ Blyatman & Russian Village Boys - CYKA BLYAT (Official Music Video)" (no false positives); `/search` command is user-picks-from-list (no hidden filtering); search cache keys are per-query (correct).
- **Tests** — `SearchService.test.ts` +1 regression test: track with "DJ Blyatman" artist is NOT filtered and wins query ranking (5 tests total). Typecheck clean; 440/440 passing (benchmark timing flake passes solo).

### Search Selection — Duration Range Filter

- **Problem** — garbage search hits like "S Meme - CYKA BLYAT edition" (under 10 seconds) could win `pickBestTrack`. Search results should only surface real songs.
- **Fix** — `pickBestTrack` now filters tracks outside **2–8 minutes** (`info.length`/`durationMs`, 120s–480s) before ranking, for non-URL queries only (direct links/playlists never filtered; unknown duration passes). If every result is out of range, the full original list is used as fallback so the user never gets a hard "No results".
- **Tests** — `SearchService.test.ts` +4: short track filtered when alternatives exist, long track filtered, all-out-of-range falls back, URL queries bypass the filter (9 tests total). Typecheck clean.

### Ghost Queue — Autoplay Never Triggered (false "finished")

- **Bug** — with autoplay ON and an empty queue, the last track ended (`trackEnd reason=finished`, `queue=0`), then nothing played: ~30s of silence until the Watchdog's "silent voice loss" reconnected and replay/failover finally kicked in. The player's internal `queueEnd` (which triggers autoplay + cleanup) never fired.
- **Root cause** — dual queue state: `state.queues` (RAM, playback source) vs `player.queue.tracks` (lavalink-client mirror for persistence via MongoQueueStore). When the mirror held leftover tracks the RAM didn't know about ("ghost"), lavalink-client's internal `trackEnd` (Node.ts) shifted a ghost into `queue.current` and emitted user `trackEnd` instead of going straight to `queueEnd`; with `autoSkip` unset the ghost was never played, so internal `queueEnd` (→ `playing=false` + user `queueEnd`) never fired → zombie player, autoplay dead. Verified against lavalink-client source + docs (Context7): `player.playing` is a plain field set false only in internal `queueEnd`.
- **Fix** — `musicEvents.ts`:
  - `advanceQueue`, track-loop replay, and the autoplay play path now call `state.queues.syncToPlayer(guildId)` right before `player.play(...)` — the mirror is rewritten from RAM before every play, so a ghost can never sit in `queue.current`.
  - `trackEnd` handler: ghost detection (`queue=0 && player.playing`) → reset `player.queue.current`/`playing`/`tracks`, then run the full queue-end path (autoplay → cleanup) inline via the refactored `handleQueueEnd()` — autoplay resumes instantly instead of waiting for the Watchdog.
  - `queueEnd` listener refactored into `handleQueueEnd(player, track, payload)` (shared by both events); guard semantics preserved.
- **Tests** — `StateStores.test.ts` +3 (QueueStore mirror follows RAM on `set`, `syncToPlayer` rewrites mirror, no-op without RAM data); typecheck clean.

### Autoplay Hardening — Absolute Duration + Recommendation Fallback

- **Strict filter** — `RecommendationEngine` strict filter now also requires the absolute **2–8 minute** range (`DurationFilter.ts`, shared with search) in addition to the ±40% relative check; the old escape hatch (`origDuration < 30s` skips duration checks) no longer lets 10-second memes through. Lenient fallback additionally drops tracks under 30s.
- **Recommendation fallback** — `AutoplayEngine.getNextTrack` no longer blindly takes `recs[0]`: it picks the first of `recs[0..2]` with a valid title and in-range duration, so a bad first candidate no longer kills autoplay.
- **`DurationFilter.ts` (new)** — `MIN_DURATION_MS`/`MAX_DURATION_MS`/`isInDurationRange` moved out of `SearchService` into a dependency-free module (reads `info.length`/`durationMs`/`duration`), breaking an import cycle (`AutoplayEngine → SearchService → PlayerService → musicEvents → AutoplayEngine`).
- **Tests** — new `AutoplayEngine.test.ts` (5: first-valid pick, all-valid picks recs[0], all-out-of-range → null, empty → null, no current track → null); `SearchService.test.ts` +2 (`isInDurationRange` reads `info.duration`, unknown duration passes). 454 total passing.

### Voice Flap — False "Bot left voice" + AI-Play Wrong Track

- **Bug (from live logs)** — `[VoiceState] Bot left voice` fired while the track kept playing (position sync kept advancing): a transient Discord voice-session hiccup ("flap") triggers `voiceStateUpdate` with `channelId=null` for a split second, and the handler wiped state (`deleteState`: nowPlaying/queues/loop cleared) under a running player. The following autoplay play then failed silently (no voice), and the next track request replayed the same song.
- **Fix** — `voiceStateUpdate.ts`: "Bot left voice" now checks the player first — if `player.playing`/`paused` is still true it's a flap; cleanup is skipped and lavalink/Watchdog recovers the voice instead of wiping state.
- **AI-play path used raw `tracks[0]`** — `messageCreate.ts` AI "play X" intent took `result.tracks[0]` directly (bypassing `pickBestTrack`), so it could replay the same wrong/popular version ("CYKA BLYAT" by Russian Village Boys instead of DJ Blyatman). Now goes through `pickBestTrack(result.tracks, q)` like every other play path.
- **Play-into-dead-voice guards** — `advanceQueue` and the autoplay play path in `musicEvents.ts` now bail with a warn when `player.connected` is false (voice gone), deferring to the Watchdog recovery instead of a silent failed play.

### Autoplay — Duration Mandatory (unknown duration = non-music)

- **Bug (live)** — "Novosibirsk State University | Top 10 un..." (a lecture/presentation video, no known duration) slipped through autoplay: `isInDurationRange` passes tracks with unknown duration by design (needed for URL search queries), and both the strict/lenient filters + `AutoplayEngine` treated unknown duration as acceptable.
- **Fix** — autoplay now REQUIRES a known duration in the 2–8 minute band, at every layer: strict filter (`!!t?.info?.duration && isInDurationRange(t)`), lenient fallback (same, replacing the old `<30s bumper`), and `AutoplayEngine.getNextTrack` (`r.info?.duration >= MIN && <= MAX`). Tracks without duration (presentations, podcasts, tutorials) can never be autoplayed again.
- **Tests** — `AutoplayEngine.test.ts` +1: no-duration track skipped when a valid track follows. 440 total passing.

### Log Noise — PositionSync Silent (anomalies only)

- **Problem** — `[PositionSync]` logged every second because real-world deltas almost never equal exactly 1000ms (599–1015), flooding logs during playback.
- **Fix** — `StateService.ts` `startPositionSync` now logs only anomalies: `delta < 0` (seek/restart) or `delta > 3000` (gap/skip/lag). Normal playback is silent; the DB position flush (POSITION_FLUSH_INTERVAL) is untouched.

## 2026-07-30 — v3.2.6


### AI Humanize — Persona, Per-User Memory, Reply-to-Trigger

- **Fix amnesia bug (root cause of stiff replies)** — `AIDJ.interpret` hardcoded userId `"aidj"` and called `clearMemory` on every message, deleting ALL conversation history from the DB each time. The bot never remembered anything → every reply started from zero context.
  - `runAIInterpret(userId, prompt)` now threads the real Discord user id through `AIDJ.interpret(userId, input)` → `AIEngine.ask(userId, ...)`.
  - `clearMemory("aidj")` removed — conversation history now persists per-user.
- **Long-term memory wired in** — `MemoryService.saveMemory` (summarizes user preferences → DB) was built but never called. Now runs fire-and-forget after every successful chat reply. `PromptBuilder` injects remembered facts as a system message before history.
- **Persona** — new `src/bot/ai/config/persona.ts`: Paperplane is warm, casual, replies 100% in the user's language, greets by name occasionally, concise but not robotic. Replaces the stiff "Answer concisely" default.
- **Live context in chat** — chat system prompt now includes user display name, server name, and the currently-playing track title, so replies feel personal ("lagi dengerin X ya?").
- **Reply-to-trigger** — replying to any bot message (Discord native reply) now triggers the AI with no prefix/mention/trigger word needed. Uses `message.referencedMessage` (free, from cache) with `message.fetchReference()` fallback when uncached. Replies to non-bot messages do nothing.
- **UI polish** — chat replies use `AIEmbed` with a "Paperplane" author (dropped the ugly "Prompt: ..." footer); AI cooldown message is now casual ("Jangan spam dulu ya — tunggu X detik lagi.").
- **Tests** — `AIDJ.test.ts` updated to per-user signatures (9 tests), 4 new reply-trigger tests in `messageCreate.test.ts`, new `PromptBuilder.test.ts` (5 tests), `embeds.test.ts` AIEmbed updated.

### Node Resume Stability — Delay + Fresh Search

- **2.5s stabilisation delay** — `lavalink.ts:resumed` handler: waits 2.5s after voice reconnect before attempting playback, giving the Lavalink node time to stabilise.
- **Always re-search** — replaced stale-encoded-track playback with fresh `player.search()` from `state.nowPlaying` URI. Eliminates "Something broke when playing the track" errors caused by expired encoded tracks after node reconnect.
- **Removed error embed** — `musicEvents.ts:trackError`: silent error handling; no more per-error embeds sent to the text channel.

### Track Error Loop — Fix `node=?` Log + Prevent Same-Song Replay

Two root causes found. The `node=?` in logs was a **red herring**.

#### 1. `node=?` is a logging bug — node WAS connected

- **`lavalink-client` Node has `.id`, not `.name`** — all `player.node?.name` evaluated to `undefined`, masked by `|| "?"`. Real node identity is `player.node?.id`, which logged correctly as e.g. `node4` in other places.
- **Fix** — `musicEvents.ts:trackError` (line 464) and `trackEnd` (line 305): changed `node=${player.node?.name || "?"}` → `node=${player.node?.id || "?"}`. Now `node4` shows when connected.

#### 2. Same-song replay on track error — push-to-queue bug

- **Bug**: when a fallback (alt) track also errored, the 3-attempt retry block pushed the errored fallback back to the queue. `queueEnd` → `advanceQueue` then replayed the same song. This repeated until the 3-attempt limit dropped it.
- **Repro**: autoplay recommends track A → track A errors → fallback (re-resolved track B of same song) plays → track B errors → pushed to queue → played again → error loop.
- **Fix**: `musicEvents.ts:trackError` — before pushing to queue, check if the errored track matches `state.nowPlaying`. If it's the currently-playing track (not a queued pending track), skip the push. `player.stopPlaying()` fires naturally, `queueEnd` handles autoplay if queue is empty, or advances to the next queued track if one exists.
- **Impact**: errored currently-playing tracks are dropped cleanly instead of looping. Autoplay gets a new recommendation on the next cycle.

### Autoplay Filter — Block Keroncong/Akustik Versions

- **Keyword gap** — `COVER_PATTERNS` (`TitleResolver.ts`) and `RecommendationEngine.ts` strict filter's inline regex didn't include `keroncong`/`kroncong`/`akustik`/`acoustic`. These genre/style version tracks leaked through the recommendation pipeline.
- **Lenient fallback gap** — when strict filter emptied all candidates (common for YouTube Mix results), the lenient fallback only checked `isSameTrack` + `isPlayed` — no `isCover`, no style/version check. Every non-duplicate track passed.
- **Fix** — added `/\b(?:keroncong|kroncong|akustik|acoustic|dangdut|remix|dj\s+remix)\b/i` to `COVER_PATTERNS`. Added `keroncong|kroncong|akustik|acoustic` to both the strict inline regex and the lenient fallback filter. Lenient fallback now also checks `isCover` and blocks `version|ver\.|tribute|instrumental|karaoke|session`.
- **Impact**: keroncong/akustik tracks still appear in candidates (YouTube Mix) but are filtered out before autoplay picks them. Lenient fallback no longer bypasses all quality filters.

### Autoplay Delay — Clear ManualAdvance on Track Error

- **Bug**: after skip + track error, `manualAdvances` entry from the skip blocked `queueEnd` from firing autoplay. Player went silent until the 30s watchdog cycle kicked in.
- **Fix**: `musicEvents.ts:trackError` — `manualAdvances.delete(guildId)` before `player.stopPlaying()`. This lets `queueEnd` run its full flow (advanceQueue → autoplay) immediately instead of returning early.
- **Impact**: autoplay continues seamlessly after skip + error instead of 30s silent gap.

### Autoplay Junk Title Detection — Heuristic Scoring

- **Problem**: junk/clickbait titles kept entering autoplay — emoji titles, event videos, re-upload channels, meme channels. Caps-lock alone couldn't be filtered (legit official uploads like `DENNY CAKNAN - WIDODARI` are also all-caps).
- **`junkScore(title, author)`** — `RecommendationEngine.ts`: per-signal point system, filtered when score ≥ 3:

| Signal | Points |
|---|---|
| Emoji in title | +2 |
| Title starts with `(` / `[` | +1 |
| `//` or `\|\|` separators | +1 |
| Single pipe + lowercase lyric suffix (`\| koyo ngene...`) | +1 |
| ALL-CAPS segment 15+ chars (title) | +2 |
| ALL-CAPS author 15+ chars (meme channels like `SHAUN THE SHEEP`) | +2 |
| Clickbait keywords per match (`jangan di play`, `mau menangis`, `warning`, `galau`, `sedih banget`, `shaun the sheep`) | +2 |
| Event keywords per match (`wedding`, `anniversary`, `dies natalis`, `happy party`, `paguron`, `senenan`, `smkn`, `panaga`) | +2 |
| Text after `( Official Music Video )` marker | +2 |
| Author containing `Official MV` | +2 |
| Author with 2+ ` - ` segments | +2 |
| Re-upload channel (`kembar campursari`, `mp3 download`, `full album`) | +2 |
| `!!` / `??` | +1 |

- **Applied in both** strict filter and lenient fallback via `isJunkTrack(title, author)`.
- **Legit titles preserved** — verified by tests: `DENNY CAKNAN - WIDODARI` (0), `DINDA TERATU - KALAH WETON (Official Live Music)` (0), `Crito Mustahil ( Mung ) | #albumkalihwelasku` (0).
- **New test suite** — `RecommendationEngine.test.ts`: 12 cases covering junk flags + legit passes.

### Autoplay Optimization — Ranking, Feedback Loop, Reputation

#### A. Score-based ranking (was random shuffle)

- **Before**: `filtered.sort(() => Math.random() - 0.5)` — random pick from surviving candidates. Quality ignored.
- **After**: `_candidateScore()` ranks each candidate then picks top-N. Points: source weight (mix −1, title search 0, similar-artist search +1), duration closeness (+3 if <10% off, +1 if <25%), genre-pref match (+2), keyword overlap (+1 each), resolved `encoded` (+1), minus junk score and reputation penalties.

#### B. Error feedback loop

- Track dropped permanently (3× error) → `recommendation:markBad` event → `markBadTrack(guildId, track)` → removed from all future autoplay candidates. RAM-only, capped 100 tracks/guild.

#### C. Skip feedback

- `PlaybackEngine.skip()`: autoplay track skipped within 15s of playback → marked bad (dislike signal). Authors accumulate reputation.

#### D. Author reputation


- `authorRep` per guild: each bad track bumps its author's penalty. `_candidateScore` subtracts `rep × 3`. Catches repeat offenders (Kembar Campursari / SHAUN THE SHEEP pattern) generically, no hardcoded channel names.

#### E. Play flow unified

- `SearchService.pickBestTrack()` now also applies `isJunkTrack()` — first search result that's junk gets re-picked from non-junk candidates (user request still respected, just better result selection).

#### F. Keyword config

- New `JunkKeywords.ts`: clickbait/event/re-upload/style regex lists moved out of code. Tuning without touching logic.

### Adaptive Filter Optimization — 6-Layer Smart Filter

Rule-based adaptive learning — zero AI, zero network, zero delay. Learns from playback behavior instead of static heuristics.

#### Layer 1 — Positive feedback loop

- `trackEnd reason=finished` → `recommendation:markGood` event → `markGoodTrack()`: bumps positive author reputation, feeds genre taste, decays junk signal weights, records combo verdict. Bot now learns what users LIKE, not just what they skip.

#### Layer 2 — Adaptive signal weights

- `getTriggeredSignals(title, author)` returns triggered signals (emoji, openParen, dblSeparator, pipeSuffix, capsTitle, capsAuthor, clickbait, event, postOfficial, authorOfficial, multiDash, reupload, bangQuest) with per-pattern match counts.
- `signalWeights` Map (default = previous static points): skipped tracks bump triggered weights +0.5 (clamp max 4), fully-played tracks decay them −0.3 (clamp min 0.5). Score = Σ(weight × count).
- Persisted to cache adapter (`autoplay:signalWeights`, TTL 7d, debounced 10s save) — survives restart.

#### Layer 3 — Near-duplicate detection

- `_isNearDuplicate(a, b)`: token Jaccard similarity ≥ 0.8 (title) AND ≥ 0.5 (author). Catches variants ("Wirang (Official MV)" vs "Wirang") that exact-match dedup missed. Applied in strict + lenient filters.

#### Layer 4 — Grey-zone combo history

- `comboHistory`: per-signal-combination verdict counts (bad/good). Combo with ≥5 total marks and ≥70% bad → `isComboBad()` → filtered. Decision from history, not just threshold. Cap 200 entries.

#### Layer 5 — Anti rapid-skip

- Skip-source `markBad` events tracked per guild (60s window). 2 rapid skips → `strictBoost` 60s: junk threshold +1, Mix source weight −1 → −3. Autoplay tightens after repeated dislikes.

#### Layer 6 — Co-occurrence collaborative filter

- Global cross-guild `cooccur` map built from consecutive `history:addEntry` (3-min window): "users who played X also played Y". `_candidateScore` boosts candidates with co-occurrence (min(count,10) × 1.5). Cap 2000 edges. Cold-start safe — zero boost until data accumulates.

#### Files

- `RecommendationEngine.ts` (layers 2-6), `musicEvents.ts` (layer 1 emit), `PlaybackEngine.ts` (skip source flag), `RecommendationEngine.test.ts` (20 tests, all 6 layers covered).

### Stability & UX Fixes

- **Queue-end disconnect timeout 60s → 3m** — bot no longer leaves voice after just 1 minute of idle queue; waits up to 3 minutes before disconnecting.
- **Leave embed color ERROR → SUCCESS** — leaving voice was styled as an error; now shows success color.
- **Track error deadlock fix** — `setImmediate` advance after track errors so `advanceQueue` runs even mid-error-event; watchdog now also recovers idle players with a non-empty queue instead of just logging every 30s.
- **`recoverPlayer`** — orphaned players (node=null, e.g. after Lavalink node restart) are destroyed and recreated instead of silently failing `connectWithRetry`.

## 2026-07-30 — v3.2.5

### Position Sync Optimization — 90% DB Writes Reduction

- **RAM-only per-second update** — `StateService.ts:startPositionSync()`: position written to in-memory `state.position` every 1s (zero I/O). DB flush via `updatePlayerState` only every 10s (active) or 60s (paused), tracked per-guild via `lastPositionFlush` Map.
- **Delta log filter** — log line skipped when position delta is exactly 1000ms (normal tick). Reduces log noise ~99%.
- **Final flush on stop** — `stopPositionSync()` is now async: flushes last RAM position to DB before clearing timer. All callers in `PlayerService.ts` (destroyEngine, skip, stop) updated with `await`.
- **EventBus fire-and-forget** — handler `.catch()` added since handler is now async.
- **Impact**: 20 writes/sec → 2 writes/sec (−90%), 60 log lines/min/guild → ~0-1/min/guild (−99%).

### Search Flow: ytmsearch > ytsearch

- **ytmsearch primary** — all search/play/autoplay flows changed from `ytsearch` first to `ytmsearch` first. YouTube Music search returns richer metadata and better results for music queries.
- **ytsearch fallback** — falls back to regular YouTube search when ytmsearch returns no results, before trying scsearch/dzsearch.
- **`defaultSearchPlatform`** — `lavalink.ts` changed from `"ytsearch"` to `"ytmsearch"`.
- **Files affected** — 11 files: play.ts (slash+prefix), search.ts (slash+prefix), RecommendationEngine.ts, musicEvents.ts, StateService.ts, messageCreate.ts, PlaylistService.ts, lavalink.ts.


## 2026-07-30 — v3.2.4

### Startup Crash Fix — Unguarded `sendRawData`

### Autoplay Loop Guard — Circuit Breaker

- **Loop detection** — `AutoplayEngine.ts`: tracks last 20 recommended track keys per guild; if the same key appears 3+ times, flags as loop. Circuit breaker: 5 consecutive loop detections disables autoplay for that guild for 5 minutes. Max 500 consecutive autoplay tracks per session cap.
- **`clearAutoplay(guildId)`** — resets loop state when user adds new tracks manually.

### Position Desync Fix — Math.max Anti-Pattern

- **`StateService.ts:startPositionSync()`** — position sync now uses `player.position` as single source of truth (was `Math.max(statePos, playerPos, lastPos)` which always drifted upward). Falls back to saved state position only when player position is 0/undefined.
- **`saveState()`** — same fix, `Math.max` removed. Logs position deltas for debugging.
- **Paused freeze** — position sync skips position update when player is paused.

### Queue Validation — Centralized TrackValidator

- **`TrackValidator.ts`** (new) — shared `validateTrack()` function consolidating dead-track checks (DeadTrackService), prefetch cache lookup, Spotify fallback resolution, and re-resolution logic previously duplicated in `skip()` and `advanceQueue()`.
- **`PlaybackEngine.skip()`** — inline while-loop replaced with `validateTrack()` calls.
- **`advanceQueue()`** — re-resolution delegated to `validateTrack()`, behavior preserved.
- **`QueueEngine.add()`** — fire-and-forget dead-track validation on add; known-dead tracks are removed immediately.

### Periodic Watchdog — Health Stats, Node Checks, Freeze Recovery

- **`getWatchdogStats()`** — new export returning `{totalPlayers, activePlayers, stuckCounts, reconnectAttempts, totalErrors}`.
- **Lavalink node health** — `checkNodes()` logs connected/disconnected status per node; auto-reconnects disconnected nodes.
- **Skip-before-failover** — stuck detection now tries `player.stopPlaying()` at MAX_STUCK/2 before falling through to `failoverFromNode()` at MAX_STUCK.
- **Position freeze** — 30s of unchanged `player.position` while `player.playing` is flagged as stuck.
- **Metrics** — `EventBus.emit('metrics:watchdog', stats)` each cycle health summary.

## 2026-07-30 — v3.2.4

### Startup Crash Fix — Unguarded `sendRawData`

- **`lavalink.ts:497`** — `client.on("raw")` handler now has try-catch. Previously, unguarded `l.sendRawData(d)` threw "Lavalink Node is either not ready or not up to date" when Discord sent voice events before any node connected → uncaught exception → process crash → PM2 restart loop.

### StateRestore — Pick Available Node (Penalty-Aware)

- **`StateService.ts:225-251`** — `restoreGuildState()` no longer prefers `saved.nodeId` for node selection. Uses `getLeastLoadedNode()` (penalty-aware) instead. Prevents restored players from being placed on a node that reports `connected` but is actually broken (HTML/proxy errors), and avoids crash when the saved node hasn't connected yet.


## 2026-07-30 — v3.2.2

### Autoplay Fix — Skip Race + Null Track Info

- **Fallback track source** — `musicEvents.ts:416` & `AutoplayEngine.ts:12`: when `track?.info` is null in `queueEnd` event (lavalink-client edge case), fall back to `state.nowPlaying.get(guildId)` → `player.queue.previous[0]` before giving up. Prevents autoplay returning "No recommendations" (track="?").
- **Manual advance window increased** — `musicEvents.ts:36`: `MANUAL_ADVANCE_WINDOW_MS` 5s → 30s. Prevents race where slow Lavalink node fires `queueEnd` after the guard expires during skip.
- **Skip re-resolution** — `PlaybackEngine.ts:31-68`: `skip()` now loops through queue and skips tracks without `.encoded` data (auto-resolves via `player.search`), only plays a track with valid encoded data. Fixes silent Lavalink play-ignore causing app/track desync — embed shows new song but audio is old/corrupted track.

### Autoplay Candidate Filter — Dance Version

- **Ver. support** — `RecommendationEngine.ts:103`: filter regex now matches `ver\.` alongside `version`. Catches "Ver." / "Ver.2" / "Dance Ver." in candidate titles (e.g. `(MV Ver.2)`) previously missed by `/version\b/i`.

## 2026-07-30 — v3.2.1

### Autoplay Relevance Filter

- **Keyword overlap** — `_extractKeywords()` extracts meaningful words from original track (minus stop words). If original has ≥2 unique keywords, candidate must share at least 1 to pass. Prevents "relaxing nature" when playing K-pop.
- **YouTube Mix cap** — mix now capped at 15 tracks (was unlimited). Prevents garbage flooding the candidate pool.
- **Stop words** — common filler words (feat, official, mv, lyrics, etc.) excluded from keyword matching.

### Search Flow: ytsearch > ytmsearch > dzsearch

- **ytsearch primary** — all search flows changed from `ytmsearch` first to `ytsearch` first. ytsearch hits regular YouTube uploads which are less likely to be age/region-restricted than YouTube Music catalog entries.
- **dzsearch fallback** — Deezer search added as last resort after scsearch. If the node supports `dzsearch:`, age-restricted tracks may resolve through Deezer's catalog instead.
- **Files affected** — 10 files: play.ts (slash+prefix), FailoverManager, SearchService, StateService, musicEvents, messageCreate, RecommendationEngine, PlaylistService, SpotifyFallbackService.

### Audio Startup Latency Optimization

- **Parallel connect+resolve** — voice `connect()` starts immediately without await, track resolution runs in parallel, then `connectPromise` awaited before `player.play()`. Cuts ~500ms from startup.
- **Node keepalive** — periodic keepalive ping every 30s via `fetchPlayer()` to maintain connection health.
- **Startup latency metric** — `audioStartupLatency` gauge emitted from `trackStart` handler.

### Per-Source Latency Breakdown

- **Source resolve time** — `sourceResolveTime` gauge tracks resolution duration per source (spotify/ytmsearch/youtube/soundcloud).
- **Source play latency** — `sourcePlayLatency` gauge tracks total startup latency per source.
- **Source counters** — `sourceResolveCount` and `sourcePlayCount` counters track volume per source.

## 2026-07-30 — v3.2.0

### User Favorites & History Dashboard

- **FavoritesService.ts** — in-memory per-user favorites: add (by identifier dedup), remove (by identifier or title), list, count. Follows same pattern as PlaylistService.
- **Slash command** — `/favorite add` (adds current nowPlaying), `list` (shows up to 25), `remove <query>`.
- **Prefix command** — `-favorite add|list|remove <query>`. Aliases: `fav`, `fave`.
- **REST API** — `GET/POST /api/user/:userId/favorites`, `DELETE /api/user/:userId/favorites` (by identifier or title).
- **History API** — `GET /api/user/:userId/history` — filters Activity history by userId, returns track title/artist/timestamp/source.
- **FavoritesService.test.ts** — 9 tests: add (ok/duplicate/reject), list (empty/multiple), user isolation, remove (by identifier/title/not-found), count.

### Advanced Filter Chains


- **FilterStore** — refactored from a single string (`string`) to a collection (`string[]`). New methods: `toggle()` add/remove filter, `isActive()`, `clear()`. `set()` accepts an array, auto-dedups, filters "none".
- **PlayerService** — new `applyFilters()`: reads all active filters, groups by property family (speed/volume/eq/rotation), applies one per family, stacked. `toggleFilter()`: toggles on/off without reset. `setFilter()`: replaces a single filter. `setEqualizer()`: removed `resetFilters()`. `resetFilters()`: clears state + resets FM.
- **Filter family conflict** — speed (nightcore/vaporwave/slowmo), eq (treble/bassboost), volume (soft), rotation (8d). Within 1 family: last wins. Cross-family: stack.
- **Slash filter** — multi-toggle UI: active filters highlighted green, tap to toggle, compatible stacks. Max: 1 → unlimited collector.
- **Prefix filter** — same multi-toggle UI as slash.
- **Restore path** — StateService restore: parses comma-separated `lastFilter` → array. FailoverManager: uses `applyFilters()` for multi-filter.
- **DB** — `setLastFilter()` stores comma-separated (backward-compatible). `getLastFilter()` returns comma-separated.
- **FilterStore test** — expanded to 11 tests (toggle, isActive, clear, dedup, none filtering).


### Playlist Import/Export

- **PlaylistService.ts** — new service: `exportPlaylist()` serializes queue + nowPlaying to portable format, `savePlaylist()` stores in-memory per-user, `importPlaylist()` resolves tracks (URI direct → ytmsearch → ytsearch) and appends to queue via `withQueueLock` + `saveState()`.
- **Slash command** — `/playlist save <name>` / `load <name>` / `list` / `delete`. Shows track count, error handling for empty queues / not found.
- **Prefix command** — `-playlist save <name>` / `load <name>` / `list` / `delete`. Aliases: `pl`.
- **PlaylistService.test.ts** — 14 tests: export (empty/null/queue/nowPlaying/missing fields), save (success/empty queue), list (empty/multiple/user isolation), get (unknown/case-insensitive), delete (unknown/existing), import (no Lavalink).

## 2026-07-30 — v3.1.0

### P2 / Sprint B — Voice & State Testing (P2)

- **VoiceCheck.test.ts** — 18 tests: checkUserVoice (in VC/not/no member), checkBotVoice (engine null/player missing), checkSameVoice (same/different VC), requireSameVoice (reply/channel.send), withVoiceCheck wrapper.
- **QueueStore.test.ts** — 18 tests: CRUD + copy isolation, syncToPlayer (player.queue bridge), syncFromPlayer, clear with player queue cleanup.
- **StateStores.test.ts** — 55 tests: LoopStore (track/playlist/off), ShuffleStore (toggle), PositionStore (has/entries), FilterStore, EqualizerStore, AutoplayStore, TwentyFourSevenStore (enabled+channelId), VoiceChannelStore (entries), NowPlayingStore (size/entries).
- **CooldownManager edge cases** — 10 new tests: getUses unknown, getRemaining zero/expiry, reset non-existent, bulk 50 entries, concurrent rapid set+check, exact boundary.

### P3 / Sprint C — Integration Testing

- **apiServer.test.ts** — 21 tests: health (status/uptime/redis/memory), metrics (prometheus text), status, metrics/json, guild queue empty, nowplaying null, equalizer/filter defaults, settings read/write, search validation, guildId validation, 404 handling. Uses supertest + mock Lavalink/PlayerService/GuildRepository/redis/mongoose/Sentry.
- **interactionCreate.test.ts** — 8 tests: non-command filter, unknown command, registered command dispatch, Lavalink down guard (music blocked, non-music passes), cooldown block, error handling (deferred/not-deferred reply).
- **messageCreate.test.ts** — 9 tests: bot message filter, DM filter, prefix command dispatch, unknown prefix, non-prefix passthrough, AI trigger via mention, AI trigger via trigger word, filtered prompt block. Uses EventEmitter-based client mock + listener capture pattern.

### P4 / Sprint D — AI Engine & Edge Cases

- **PromptFilter.test.ts** — 60 tests: 11 allowed contexts (music overrides block), 23 blocked patterns (academic, coding, homework, calculus, resume), 9 allowed non-blocking, 17 edge cases (empty/whitespace/null/undefined/mixed case/special chars/emoji/numbers).
- **CommandInterpreter edge cases** — extended to 41 tests: play with spaces/mixed case/special chars/numbers/punctuation, `cari` keyword, Arabic play, prefix change variations, correction variants (`bukan`/`wrong`/Arabic), all sub-command variants, empty/whitespace/special-only/number-only, very long input, `autoplay` substring guard.
- **AIDJ.test.ts** — 28 tests: CommandInterpreter delegation, PLAY/PLAYLIST/CORRECT from AI response, all 15 command types (SKIP/STOP/PAUSE/RESUME/QUEUE/AUTOPLAY/SHUFFLE/LOOP/247/CLEAR/RECOMMEND/NOWPLAYING/VOLUME/INFO/PING/HELP), chat fallback, multiline response parsing, whitespace trimming, AI memory clear verification, ask param verification.
- **musicEvents.test.ts** — 22 tests: idle disconnect (mark/check/clear/guild isolation), stop disconnect, track start suppression, network error pattern matching (ECONNRESET/ETIMEDOUT/ENOTFOUND/timeout/aborted/Deezer), error loop detection (5 errors/15s), stuck timer lifecycle, playerUpdate reset.
- **CommandInterpreter.fuzz.test.ts** — 7 tests: all ASCII single-char inputs, random long strings, unicode mixed (Arabic/Chinese/Japanese/emoji), repeated patterns, SQL injection patterns (DROP TABLE/XSS/template injection), all play prefixes validation, all command prefix validation.

### v3.1.0 — Production Hardening

- **Bot config tests** — 5 tests: defaults (empty env), custom env vars, trigger lowercasing, DEPLOY_COMMANDS false, BOT_API_PORT fallback.
- **AI config tests** — 4 tests: defaults, AI_* env vars, OPENROUTER_* fallback, AI_* priority.
- **MetricsCollector.test.ts** — 15 tests: initial zeros, incTracksPlayed (plain/labeled), incTracksFailed, incCommandsExecuted (labeled), setGuildCount/VoiceConnections/ActivePlayers, incRateLimitBlocked/Allowed, setLavalinkNodesOnline/NodePlayers/NodePenalty/NodeLatency, incLavalinkNodeDisconnects, observeCommandLatency, incCacheHit/Miss, getMetrics memory info.
- **api-base.test.ts** — 16 tests: ApiError (status/message/name), jsonResponse (success/custom status), createApiHandler (success/ApiError/500), withAuth (exempt/localhost/remote 401/x-forwarded-for/Bearer token), globalRateLimit (allow/block/trusted bypass), getUserId (missing/header).
- **connection.test.ts** — 4 tests: isUsingPrisma false/no DATABASE_URL, true/postgresql://, true/postgres://, Prisma selected correctly.
- **Embed tests** — 27 tests: MusicModes constants (LOOP/AUTOPLAY/FILTERS), SuccessEmbed, LoadingEmbed, PingEmbed (latency fields/string API/footer sum), AIEmbed (truncation/footer), NowPlayingEmbed (source emoji/build/missing info/spotify URI/addedToQueue), QueueEmbed (empty/single/multi-page/pagination next/prev disabled).

### P5 — Performance Benchmarks

- **benchmark.test.ts** — 15 latency/growth/concurrent tests: add 10/1000 tracks, remove 500 front, shuffle 1000, next 1000, 1000 swaps, 1000 moves, clear 1000, addMultiple 500, remove 100 middle/end, QueueStore 1000 guilds, CooldownManager 10000 ops, concurrent 50 guilds add, concurrent 30 guilds shuffle. Uses `process.hrtime.bigint()` for sub-ms precision.


### SpotifyScraper — Playlist Pagination Fix

- **Root cause**: `scrapePlaylist()` used the embed endpoint (`open.spotify.com/embed/playlist/{id}?offset=N`) for pagination. Spotify doesn't support `?offset=` on embeds — every request returns the same 50 tracks. As a result, playlists >50 tracks only scraped 50 items and then cached them.
- **Fix**: Detect partial results (embed returns tracks, offset pagination fails) → fall through to HTML scrape (`open.spotify.com/playlist/{id}`) which renders the full track list in server-side `__NEXT_DATA__`. Priority: full embed > HTML scrape > partial embed > error.
- **SpotifyScraper.test.ts** — 7 tests: parseUrl (playlist/track/album, reject non-spotify/invalid/wrong path format).

### Test Rebuild — Lost Files Restored

- Rebuilt 17 test files lost when the local repo was deleted: bot config, AI config, MetricsCollector, api-base, connection, VoiceCheck, interactionCreate, messageCreate, PromptFilter (59 tests), AIDJ (11 tests), CommandInterpreter fuzz (6 tests), CommandInterpreter extended (36 tests), CooldownManager extended (17 tests), MusicModes (16 tests), embeds (10 tests), NowPlayingEmbed (8 tests), QueueEmbed (12 tests), benchmark (15 tests), musicEvents (21 tests).
- **Total**: 398 tests, 25 test files, 0 failures. Build: clean (0 tsc errors).

### Docs & Planning Sync

- **roadmap.md** — rewrite: add Completed section (Fase 0.5–1.12, P1, P5), restructure sprints A–D, add Sprint↔P mapping, mark all completed items.
- **planing.md** — add P#↔Sprint# mapping header, sync P2–P4 scope with roadmap, mark P5 done.
- **AGENTS.md** — created with compact agent instructions: exact commands, DB dual-mode, critical conventions (.js imports, require() autoload, node:assert, vi.stubEnv, Logger.safe, ShutdownManager), architecture tree, observability stack, command layout, env quirks.

## 2026-07-27 — v3.0.1

### Core Unit Tests Expansion (P1)

- **Duration.test.ts** — 15 tests: parseDuration edge cases (null/undefined/NaN/0/hours/seconds), parseTimestamp (mm:ss, hh:mm:ss, seconds alone, empty string, invalid, mixed parts).
- **Formatter.test.ts** — 9 tests: formatTrack with/without URL, missing title/author, originalUrl priority, index padding, formatTrackCompact, formatPlaylist, formatVolume bar count.
- **Logger.test.ts** — 8 tests: JSON format (info/warn/error/ready level + extra args), safe handler with/without error, pretty format [INFO] tag. Uses `vi.resetModules()` + `vi.stubEnv()` for ESM module isolation.
- **CacheAdapter.test.ts** — 15 tests: MemoryAdapter get/set/del/has/clear/size, value types (string/object/number/boolean/null), key independence, TTL expiry, expired entry detection.
- **Total test coverage** — 4 new files, 47 new tests, from 38 → 90 tests passing.

## 2026-07-26 — v3.0.0

### Backup & Rollback Runbook (Fase 1.0)

- **Backup script** — `scripts/backup.sh` (Linux) + `scripts/backup.ps1` (Windows). MongoDB dump + .env copy + auto-prune 7 days.
- **Rollback docs** — `docs/backup.md`: step-by-step `git revert` → rebuild → restart → verify. Restore-from-backup procedure.
- **Cron config** — automatic backup every 3 AM via crontab.

### Persistent Queue Store (Fase 1.1)

- **MongoQueueStore** — `lavalink.ts`: installed in `queueOptions.queueStore`. Queue persists in MongoDB via `PlayerState`, dual-system with `saveState`. Bot restart → queue doesn't get lost.

### API Rate Limiting (Fase 1.10)

- **Global IP rate limit** — `api-base.ts`: middleware `globalRateLimit()` (default 1000 req/min, config via `API_RATE_LIMIT`, trusted IPs bypass).
- **Key spoofing fix** — `guildRateLimit()` key from `guildId` → `guildId:clientIp`. Uses `x-forwarded-for` header for reverse proxy.
- **Per-guild limits** — player 30/min, queue 20/min, filter/equalizer 20/min, search 15/min, GET 60/min.
- **Config** — bot.ts + .env.example: added `API_RATE_LIMIT`.

### DB Indexing (Fase 1.12)

- **Prisma** — compound index `(guildId, timestamp desc)` on Activity/HistoryEntry, `(userId, createdAt desc)` on Conversation/Memory, `updatedAt` on PlayerState.
- **Mongoose** — `updatedAt` index on PlayerState, `timestamp` index on UserActivity.

### Spotify env vars

- **Config** — bot.ts + .env.example: `MAX_SPOTIFY=100` (max playlist tracks), `SPOTIFY_BATCH=20` (parallel resolve per batch).

### AI prompt limit (1.8 H2)

- **Truncation** — `messageCreate.ts`: prompt truncated to 1500 chars before being sent to the AI. Prevents token abuse.

### removeByQuery confirmation (1.4 H5)

- **Button confirmation** — `remove.ts` (slash + prefix): if match >3, sends embed + `ActionRow` button "Yes, Remove N Tracks" / "Cancel". Click Confirm → execute. Cancel / 30s timeout → disabled buttons.

### Fixes

- **Stop double embed** — `markStopDisconnect()` flag prevents `voiceStateUpdate.ts` from sending the "Disconnected from voice channel." embed after a manual stop.
- **removeByQuery await** — `prefix/remove.ts`: fixed missing `await` on async function.

## 2026-07-25 — v2.2.3

### Cache migration to Redis (Fase 0.7.1–0.7.2)

- **SearchCache → getAdapter** (0.7.1) — `SearchCache.ts`: removed the in-memory Map class, `cachedSearch()` now uses `getAdapter()` directly — Redis when available, MemoryAdapter fallback. TTL 1h→24h. Cache survives restart.
- **SpotifyScraper cache → getAdapter** (0.7.2) — `SpotifyScraper.ts`: removed `Map<string, CacheEntry>` + `pruneCache()`. Uses `getCached()`/`setCached()` via `CacheAdapter`. TTL 30m→24h. Prefix `spotify:`.

### DB-Backed Track Resolver (0.7.3)

- **CachedTrack model** — new `models/CachedTrack.ts`: Mongoose schema `{identifier, query, source, trackData, hitCount, expiresAt}`. TTL index 30 days, indexed by hitCount.
- **CachedTrackRepository** — new `repositories/CachedTrackRepository.ts`: `findCachedTrack()`, `upsertCachedTrack()` (upsert + inc hitCount), `pruneExpired()`.
- **Prisma schema** — `schema.prisma`: added `CachedTrack` model for PostgreSQL.
- **cachedSearch DB layer** — `SearchCache.ts`: flow Redis→DB→Lavalink. Redis miss → check MongoDB → hit → save to Redis + return. DB miss → Lavalink → save to DB + Redis.

### Pre-Fetch Batch (0.7.4)

- **schedulePreFetch** — `musicEvents.ts`: after advanceQueue successfully plays a track, resolves n+1..n+5 in the background via `Promise.allSettled`. Cache in Redis prefix `prefetch:{uri}` TTL 30m.
- **advanceQueue cache check** — before re-resolution to Lavalink, checks the prefetch cache first. Skips Lavalink when a cached encoded exists.

### SpotiFail Cache (0.7.5)

- **Persistent fallback** — `SpotifyFallbackService.ts`: `getFallbackCache()` + `setFallbackCache()`. Caches by Spotify URI + trackId. Stores mapping `fallback:spotify:{trackId}` and `fallback:spotify:{uri}` TTL 24h.
- **searchWithFallback cache** — checks the fallback cache before Lavalink search. HIT → skip search, return the cached YouTube track directly. After successful search → store to cache.

### Negative Cache — Dead Track Detection (0.7.6)

- **DeadTrackService** — new `cache/DeadTrackService.ts`: `deadFingerprint(title, author)` → SHA1 hash, `isDead()` checks attempts >=3, `markDead()` increments + stores. Cache `dead:{hash}` TTL 1h, `dead:spotify:{trackId}` TTL 6h.
- **advanceQueue integration** — `musicEvents.ts`: 3 dead-fingerprint check points: before resolve, after resolve fails, after play fails. Prevents infinite retry loops.

### Proactive Spotify Pre-Resolve (0.7.7)

- **schedulePreFetch Spotify path** — `musicEvents.ts`: preFetch detects Spotify URI → `findTrackWithDuration()` → stores to SpotiFailCache + prefetch cache. Non-Spotify via `player.search()`.

### Spotify batch overload fix (0.7.8)

- **Cap playlist** — `slash/play.ts` + `prefix/play.ts`: `MAX_SPOTIFY=50`. Source priority ytmsearch→ytsearch (scsearch dropped). Batch 5 (from 20).

### Prefix play fire-and-forget fix (0.7.9)

- **Await batch** — `prefix/play.ts`: `.then()` → `await` with `onProgress` callback. Status "Resolved X/Y tracks..." progressive, final "Added N tracks."

### RecommendationEngine autoplay fix (0.7.10)

- **Source priority: Mix first** — `RecommendationEngine.ts`: YouTube Mix (radio) becomes the primary source, not a fallback.
- **Source diversity** — similar artist search (`ytmsearch:{author}`), title search only when candidates < count.
- **Taste profile** — Redis `taste:{guildId}`: records artist preference per guild, boosts recommendations from favorite artists.

### Node Failover + Search Route Fix (v2.2.1)

- **failoverGuilds duplicate** — `musicEvents.ts`: calls `FailoverManager.isFailoverGuild()` directly, not `lavalink.isFailoverGuild()` which used an empty set. Fixes embed still being sent during failover.
- **Search skip unhealthy node** — `SearchService.ts`: `searchWithRetry()` + `findTrackWithDuration()` check `isDraining()` / `isUnhealthy()` / penalty >100 before `player.search()`. Skips straight to `searchViaHealthyNode()`. Prevents ~3s retry delay on broken nodes.

### AI & fixes

- **AI prefix change fix** — `CommandInterpreter.ts`: added type `"prefix"`, regex detects "ubah prefix / ganti prefix / set prefix". `messageCreate.ts`: handler directly calls `setPrefix()` + embed, not just display.
- **Mongoose deprecation fix** — `CachedTrackRepository.ts`: `new: true` → `returnDocument: "after"`.

### Infra & fixes

- **Idle disconnect 60s** — README update: 60s all cases.
- **Prometheus fix** — config mount path, `--add-host host.docker.internal`, `0.0.0.0`, `/api/metrics` exempt from auth.
- **Grafana provisioning** — datasource Prometheus+Loki, dashboard auto-import via Docker network.
- **Fase 0.8 CI pipeline** — `.github/workflows/ci.yml`: `typecheck` + `test` on push/PR. `npm audit fix`. Secrets rotation doc `docs/secrets-rotation.md`. `.env.example` sync (+6 missing vars).
- **Fase 0.9 test suites** — 7 new test files (harness, API, errors, concurrent, benchmark, state, failover, music-events). `createApp()` refactor from `apiServer.ts`. Total 108 tests. **Removed from git — local only.**
- **Fase 1.12 DB indexing** — Prisma: compound index `(guildId, timestamp desc)` on Activity/HistoryEntry, `(userId, createdAt desc)` on Conversation/Memory, `updatedAt` on PlayerState. Mongoose: `updatedAt` index on PlayerState, `timestamp` index on UserActivity.
- **Stop command double embed fix** — `markStopDisconnect()` flag prevents `voiceStateUpdate.ts` from sending the "Disconnected from voice channel." embed after a manual stop.

## 2026-07-25 — v2.2.2

### Foundation hardening (Fase 0.5)

- **DB disconnect shutdown** (0.5.2) — `registerShutdownTasks.ts`: +`disconnect-db` task priority `low`. Closes the Mongoose connection at shutdown before process exit.
- **Health endpoint upgrade** (0.5.3) — `/api/health` now returns `database` (Mongoose readyState), `lavalink` (connected nodes), `memory` (rss/heap).
- **Uncaught exit** (0.5.5) — `index.ts`: `process.exit(1)` after the uncaughtException handler. Prevents zombie processes.
- **Shutdown task priority** (0.5.7) — `registerShutdownTasks.ts`: +`lavalink-disconnect` task priority `normal`. NodeLink disconnects before DB.
- **Rate limiter cleanup** (0.5.8) — `api-base.ts:52`: cleanup interval 60s→15s. Prevents memory leaks in the sliding-window rate limiter.
- **Memory & event loop gauges** (0.5.10) — `MetricsCollector.ts`: RSS/heap/heapTotal + event loop lag at `/api/metrics`, updated every 10s.
- **Label cardinality fix** (0.5.11) — `MetricsCollector.ts`: `tracksFailed` label `guild`→`error_type`. Lowers cardinality from thousands of guilds to ~10 error types.
- **JSON structured logging** (0.5.5.3) — `Logger.ts`: supports `LOG_FORMAT=json` / `LOG_FORMAT=pretty`. JSON output `{"ts","level","msg"}` for Loki.

### Discord.js cache optimization (Fase 0.6)

- **makeCache** — `index.ts`: `GuildMemberManager` max 200 per guild (keeps the bot itself), `ReactionManager` 0, `PresenceManager` 0, `MessageManager` 0. Prevents unlimited cache >3GB on 1000 guilds.
- **Aggressive sweepers** — `index.ts`: `voiceStates` + `messages` purged every 10 minutes (default 1 hour), `threads` purged after >30 minutes. Spread from `Options.DefaultSweeperSettings`.
- **Partials** — `index.ts`: `[Message, Channel, Reaction]` — prevents crashes on uncached event data.
- **allowedMentions** — `index.ts`: only `{parse:["users"]}` — prevents @everyone/@here auto-replies.
- **Consistent player lifecycle** — `/search.ts`: uses `createPlayer()` instead of the raw lavalink node. Search without an active player now creates a proper player with queue + events.

### Queue end disconnect fix

- **Deferred path queue guard** — `musicEvents.ts:321`: added `(state.queues.get(player.guildId)?.length || 0) > 0` to the deferred retry path condition. Prevents the bot staying stuck in voice forever when the queue is empty. Previously `state.nowPlaying` still existed (last track) → entered deferred retry → returned without setting the disconnect timer.

### Redis cache foundation (Fase 0.7.0)

- **Redis connection singleton** (0.7.0.1) — `src/bot/cache/redis.ts`: 2 separate connections — `redisCache` (optional, retry + fallback) + `redisBus` (pub/sub, no fallback). Auto-connects at startup, graceful shutdown task priority `low`.
- **CacheAdapter interface** (0.7.0.1) — `src/bot/cache/CacheAdapter.ts`: `CacheAdapter` interface (`get`/`set`/`del`/`has`/`clear`/`size`) + `MemoryAdapter` (Map + TTL) + `RedisAdapter` (ioredis + JSON serialize + SCAN-based clear). Lazy singleton via `getAdapter()`, auto-selects Redis when available.
- **Cache hit/miss metrics** (0.7.0.4) — `MetricsCollector.ts`: counters `cacheHitCount` + `cacheMissCount` label `{cache:"..."}`. Exposed at `/api/metrics` Prometheus (`paperplane_cache_hit_total`, `paperplane_cache_miss_total`).
- **Redis health check** — `/api/health` returns `redis: {status: "connected"|"disabled"}`.
- **Rate limiter Redis backend** (0.7.0.8) — `api-base.ts`: `guildRateLimit()` uses Redis INCR+EXPIRE when available, falls back to the in-memory Map. Key prefix `paperplane:ratelimit:{guildId}`. Graceful degradation on Redis errors.
- **Config env** — `bot.ts` + `.env.example`: added `REDIS_URL`, `REDIS_PREFIX`, `REDIS_ENABLED`.
- **Docker Compose Redis** — `docker-compose.yml`: added `redis` service (redis:7-alpine, maxmemory 512mb, allkeys-lru). Data persisted in the `redis_data` volume. Joined the stack with Prometheus/Loki/Grafana.

### Documentation & license

- **README refactor** — updated stack (Express 5, discord.js v14.27, Redis), added Docker deploy + observability stack sections, updated env table.
- **License alignment** — `LICENSE.txt` was Apache 2.0 from the start, but `README.md` said MIT. Fix: `package.json` + `README.md` → Apache 2.0.

## 2026-07-24 — v2.2.1

### Search health routing + failover fix

- **SearchViaHealthyNode** — `SearchService.ts`: new `searchViaHealthyNode()`. When `player.search()` fails on a broken node, searches via the healthiest node (`node.search()` REST call, zero disruption to active playback).
- **searchWithRetry fallback** — after retries are exhausted + node penalty > 300, tries 1x search via the healthy node before throwing.
- **findTrackWithDuration fallback** — removed the `if (nodePenalty > 300)` guard. Always tries the healthy node. `searchViaHealthyNode` called with `retries=0`.
- **NodePenaltyService drain fix** — `n.options?.name || n.name` → `n.options?.id`. lavalink-client NodeLinkNode has no `.name` property → drain/unhealthy filter was completely dead, scoreSorter `getPenalty(undefined)` = 0 for all nodes. Filter + penalty scoring now accurate.
- **Auto-failover in health check** — `lavalink.ts`: when penalty > 1000 and the node is still connected, triggers `failoverFromNode()`. 60s cooldown prevents flapping.
- **Failover encoded→search priority** — `FailoverManager.ts`: searches by URI first, then encoded. Encoded tracks are node-specific, always error when moved to a different Lavalink instance.
- **QueueEnd defer disconnect** — `musicEvents.ts`: when `state.nowPlaying` is still active (failover replay), delays disconnect by 30s (max 5x retry). Prevents the bot from leaving while the background Spotify resolver hasn't finished.

## 2026-07-24 — v2.2.0

### Runtime Migration: tsx → node

- **Core .js extension** — 70 files: `../foo` → `../foo.js` via bulk regex. Module `node16` + CJS explicit .js suffix.
- **@/ alias → relative** — 52 command files: `@/bot/foo` → `../../../../bot/foo.js`. `paths` removed from tsconfig.
- **Side-effect import** — `import "./instrument"` → `"./instrument.js"`.
- **Build pipeline** — `"build": "tsc"` (standard), `"start": "node dist/index.js"`. Dev stays `tsx watch` via `npm run dev`.
- **PM2** — script `dist/index.js`, interpreter `node`, no `tsx` loader.
- **Verification** — `tsc --noEmit` 0 errors, `npm test` 38/38 passing, `npm run build` 0 errors.
- **AIEngine CJS interop fix** — `src/index.ts:113`: `const { default: AIEngine } = await import(...)` failed because CJS `module.exports` gets double-wrapped by ESM `import()`. Fix: `(await import(...)).default` to unwrap the first layer.

## 2026-07-24 — v2.1.8

### Config validation startup (0.5.1)
- `src/index.ts:40` — new `validateEnv()`: checks `DISCORD_TOKEN`, `CLIENT_ID`, `MONGO_URI`/`DATABASE_URL` at the start of `main()`. Exits with a list of missing vars + .env example.
- `DISCORD_TOKEN` and `CLIENT_ID` required. At least 1 of `MONGO_URI` or `DATABASE_URL`.

## 2026-07-24 — v2.1.7

### SSRF fix via SpotifyScraper (C1)
- `SpotifyScraper.ts:54` — replaced the `parseUrl` regex with a strict `new URL()` parser. Hostname must be `open.spotify.com`. Rejects URLs that merely contain `open.spotify.com` as a substring.
- `SpotifyScraper.ts:186` — new `_validateUrl()`: `https:` protocol required, hostname only `open.spotify.com`, DNS resolve + check every IP is not private/loopback (`10.*`, `172.16-31.*`, `192.168.*`, `127.*`, `169.254.*`, `0.*`).
- `_fetchPage` calls `_validateUrl()` before fetching — defense in depth.

### VoiceCheck null safety (H1)
- `VoiceCheck.ts:28` — `engine.player.voiceChannelId` → `engine.player?.voiceChannelId`. Guards the race condition when the player disappears between the `!engine?.player` check and the `voiceChannelId` access.

### Alias cooldown bypass (H9) — already from 83b6ddb
- `messageCreate.ts` alias block already uses `found.name` (canonical name) as the cooldown key since the 83b6ddb refactor. No bypass.

### Command load failure log (M7)
- `loadCommands.ts` — restructured try/catch: per-file error handling instead of 1 try/catch wrapping everything. Logs specific file path + error detail. 1 failed file doesn't stop the loop.

### Interaction reply silent swallow (L1)
- `interactionCreate.ts:37-41` — replaced generic `Logger.safe()` with inline `Logger.warn()` that shows the command name + method (reply/editReply) + error message.

## 2026-07-24 — v2.1.6

### Fix: AI play embed used raw URL instead of song title

- `messageCreate.ts:139` — replaced `queries[0]` (raw input, could be a URL) → `firstTrack?.info?.title` (title from Lavalink resolve result)
- Falls back to `queries[0]` when resolve fails

### Fix: AI play embed — uses NowPlayingEmbed for consistency with the play command

- Replaced `EmbedBuilder().setDescription("Playing **title**")` → `NowPlayingEmbed.build(firstTrack, null)` — shows source emoji, artist - title, and clickable URL

## 2026-07-23 — v2.1.5

### Fix: Queue lost after restart — bot resumed blank in voice

**Root cause:** `engine.join()` calls `state.queues.syncToPlayer(guildId)` after `lavalink.createPlayer()`. MongoQueueStore already loaded the queue from DB into the player, but syncToPlayer overwrote it with the empty RAM state. Result: player queue = [] → restore played 1 track → queueEnd → disconnect.

**Fix:** `StateService.ts restoreGuildState` — after `syncFromPlayer()`, if the queue is still empty & `saved.queue` has content, restore directly from the saved state.

### Fix: Bot stuck after track error — Watchdog silent player

- `PlayerWatchdog.ts`: replaced `skipping replay` → calls `advanceQueue(player)` directly when the player is silent + queue has content. Previously the watchdog only logged + returned every 30s without doing anything
- `musicEvents.ts`: exports `advanceQueue` so the watchdog can call it

### Fix: PM2 restart wiped queue + no resume

- `StateService.ts saveState`: added `queue` + `nowPlaying` to `upsertPlayerState` — previously only stored voiceChannelId/textChannelId/position/nodeId
- `registerShutdownTasks.ts`: removed the `destroy-players` task — `player.destroy()` triggers `MongoQueueStore.delete()` which sets `queue:[]` + `nowPlaying:null` in the DB, wiping the data just saved
- `StateService.ts restoreGuildState`: added a warning log when `first` is null (empty queue), returns `false` instead of silent success
- `ecosystem.config.cjs`: `kill_timeout: 30000` — PM2 waits 30s before SIGKILL so the 10s save-state can finish

### Fix: Bun compatibility — CommonJS → ESM exports

- 9 files in `src/bot/core/state/` + `Logger.ts`: `export =` → `export default` (Bun rejects `import` in CommonJS files)
- `ecosystem.config.cjs`: interpreter `"bun"` → `"node"` with `node_args: "--import tsx"` (Bun doesn't support `node:v8 isBuildingSnapshot` from mongoose/bson)

## 2026-07-22

### Spotify fallback duration filter — prevent playing 1-hour compilations
- NEW `SearchService.ts`: `findTrackWithDuration(player, query, origTrack, clientRef?)` — loops `ytmsearch` → `ytsearch` → `scsearch`, filters encoded + not Deezer + duration ±30% of the original
- `musicEvents.ts advanceQueue()`: Spotify re-resolution loop → `findTrackWithDuration()` — skips tracks that don't match the duration
- `musicEvents.ts trackError` fallback: manual `tracks.find()` loop → `findTrackWithDuration()` — only accepts duration matches
- `musicEvents.ts retryTracks`: `Set<string>` → `Map<string, number>` — counts retries per track. DROPPED at attempt 3 instead of infinite re-queue

### AI command — all 19 types working
- `messageCreate.ts`: added handlers for `info`, `ping`, `autoplay`, `shuffle`, `loop`, `247`, `clear`, `recommend` — previously hit the `default: "not supported"` path
- `messageCreate.ts`: added `correct_playlist` handler — skips current + searches new keyword + plays
- `messageCreate.ts info/ping`: placed before the voice guard (no voice needed)
- `AIDJ.ts` system prompt: added `AUTOPLAY`, `SHUFFLE`, `LOOP`, `247`, `CLEAR`, `RECOMMEND`, `NOWPLAYING`, `VOLUME`, `INFO`, `PING`, `HELP` to the AI template
- `AIDJ.ts` parser: added parsing for 11 new types

### Ping command — prefix + slash
- NEW `commands/info/prefix/ping.ts` — shows WS ping + roundtrip, color `Colors.SUCCESS`
- NEW `commands/info/slash/ping.ts` — same for slash commands

### Embed disconnect when bot is kicked
- `voiceStateUpdate.ts`: removed the guard `if (!engine.player?.voiceChannelId) return` (line 62-63) — race condition with `playerDisconnect` made the embed not get sent
- `musicEvents.ts playerDisconnect`: reverted the redundant embed (voiceStateUpdate handles it)

### Bot moved VC manually — alone timer
- `voiceStateUpdate.ts`: added a bot-moved handler (`oldState` && `newState` && `member===botId` && different channel) — cancels the old alone timer, checks humans in the new VC, starts a 60s alone timer when empty

### Emoji source fallback (revert to custom emoji)
- `NowPlayingEmbed.ts`: `getSourceEmoji()` reverted to `Emojis.SPOTIFY`/`Emojis.DEEZER` — custom `<:spotify:1085615172170809365>` and `<:deezer:1085615485401448458>`

## 2026-07-21

### Load Balancing — 5 gap deep trace & fix
- **Gap 1 — `recordHtmlError` dead code**: the nodeError handler now detects HTML/proxy/503/502/gateway errors → calls `recordHtmlError()`. After 2x HTML errors the node is marked unhealthy and auto-excluded from `getBestNode()`.
- **Gap 2 — Search errors didn't incur penalties**: `searchWithRetry()` records `recordError()` + `recordHtmlError()` (when the response is HTML) on every error. Search errors now raise the node penalty.
- **Gap 3 — `getLeastLoadedNode()` without region**: `PlayerManager.createPlayer()` sends `vcRegion` to `getLeastLoadedNode(vcRegion)`. New players are selected per the user's region.
- **Gap 4 — Failover before reconnect in health check**: order reversed — reconnect first, failover only if reconnect fails. Prevents pointless player migration to another node.
- **Gap 5 — Partial failures not detected**: health check auto-drains nodes with penalty score >500 via `startDrain()`. Broken-by-proxy nodes are auto-skipped.

### Failover & Load Balancing audit — 5 fixes
- **failoverFromNode duplicate**: removed the duplicate in `lavalink.ts` — calls `FailoverManager.failoverFromNode` via re-export. Previously: 2 nearly identical implementations in 2 files, risk of drift.
- **getLeastLoadedNode without region**: added the `preferredRegion` parameter — reconnect now picks a node per region like `createPlayer`.
- **Search without retry in failover path**: `FailoverManager.ts` — replaced 4x bare `player.search()` with `searchWithRetry()` (3 retries).
- **Stale encoded track session resume**: `lavalink.ts` resumed handler — when `player.play({encoded})` fails (stale from a Lavalink cloud restart), falls back to re-search by URI + play fresh track.
- **roundRobinIndex global leak**: `NodePenaltyService.ts` — resets the index when the number of connected nodes changes.

### Autoplay priority — ytmsearch first for cloud Lavalink
- `RecommendationEngine.ts`: reordered sources — ytmsearch/ytsearch/scsearch first, YouTube Mix becomes the fallback. YouTube Mix (`list=RD{videoId}`) often fails on cloud Lavalink due to rate limits, wasting 10-20 seconds.
- `RecommendationEngine.ts _searchWithRetry`: retries 2 → 3 (total 4 attempts) — cloud Lavalink needs more retries due to transient rate limits.
- `musicEvents.ts`: `new AutoplayEngine()` → singleton `autoplayInst` — `playedTracks` persists between autoplay requests, preventing song repeats.

### Autoplay repeat fix — singleton AutoplayEngine
- `musicEvents.ts`: replaced `new AutoplayEngine()` per track end → module-level `autoplayInst` singleton. `playedTracks` now persists between autoplay requests, so `_isPlayed()` really prevents replaying songs that were already played.
- Previously: `playedTracks` was reset on every track change because the `AutoplayEngine` instance was new → the same song repeated within 1 autoplay session.

### Autoplay state consistency
- `PlayerService.ts destroyEngine`: added `setAutoplay(guildId, false)` to DB before removing from memory — consistent with the stop path.
- `voiceStateUpdate.ts` bot-kick: added `setAutoplay(guildId, false)` + `setShuffle(guildId, false)` to DB — previously only deleted from RAM, DB still `true`.
- `restoreGuildState`: reads autoplay from DB (persists across restart) — the user wanted the state the same as before the restart.
- Summary: autoplay persists across restart, resets on manual kick / leave / stop.

### PlayerWatchdog double embed fix
- `PlayerWatchdog.ts` silent voice loss reconnect: added `markTrackStartSuppressed(guildId)` before `player.play()` — prevents trackStart from sending the embed 2x because the watchdog replays the same track.

### Autoplay recommendation stuck "No recommendations" — fix
- `RecommendationEngine.ts`: wrapper `_searchWithRetry(player, query)` — retries 2x + 1s delay for every `player.search()` call. Previously bare call without retry, timeout immediately returned [].
- `RecommendationEngine.ts _buildQuery`: strips `(feat.` / `(ft.` without closing paren from the truncated title before building the search query.
- `RecommendationEngine.ts`: multi-source search loop (`ytmsearch` → `ytsearch` → `scsearch`) — replaced nested ifs with a flat loop + break on first hit.
- `RecommendationEngine.ts`: every failed step (Mix, URI, search) now logs the reason — no more silent [] returns.
- `play.ts` (prefix + slash): catches timeout errors, logs + "Search timed out" message instead of the raw Node.js error.
- `SearchCache.ts cachedSearch`: calls `searchWithRetry()` instead of bare `player.search()`.

## 2026-07-20

### Persistent QueueStore — QueueEngine bridge to player.queue
- `QueueStore.ts`: added `setPlayerGetter()`, `syncToPlayer()`, `syncFromPlayer()`. `get()` returns a copy, `set()` auto-syncs to player.queue via `splice()`. `clear()` uses `splice(0, tracks.length)` + `current = null` (the lavalink Queue has no `clear()`)
- `PlayerService.ts`: wiring getter at module scope. `engine.join()` calls `syncToPlayer()` after the player is created — flushes pre-join RAM tracks to player.queue
- `lavalink.ts`: uncommented `MongoQueueStore` import + `queueOptions` — activates lavalink's queueStore. Queue now persists automatically via lavalink's internal save
- `MongoQueueStore.ts`: fixed `get()` to return `{current, tracks}` even when the queue is empty as long as nowPlaying exists
- `StateService.ts`: `saveState()` removed `queue`/`nowPlaying` from upsert (now handled by queueStore). Non-resumed restore path: `syncFromPlayer()` first, skip manual track add (queueStore already restored to player.queue)
- `StateService.ts`: pre-emptive `ytmsearch:` search in the restore path — resolves a fresh track from title+author metadata before `player.play()`. Prevents `trackError` from stale encoded Lavalink sessions + autoplay replacement loops

### Dashboard API — Full CRUD (1.2)
- `apiServer.ts`: added `DELETE/PUT /api/guild/:guildId/queue` — remove track by index, reorder (move/swap/clear). Voice check via `requireApiSameVoice`
- `apiServer.ts`: added `GET/PUT /api/guild/:guildId/settings` — read/write prefix, volume, autoplay, loop, shuffle, 247. PUT uses voice check when the player is active
- `apiServer.ts`: added `POST /api/guild/:guildId/search` — searches tracks via Lavalink, returns top 10 results with metadata
- `api-base.ts`: added `getUserId(req)` + `requireApiSameVoice(client, engine, guildId, userId)` — throws 403 when the user isn't in the same VC as the bot
- `apiServer.ts POST player`: voice check via `requireApiSameVoice`

### Metrics & Observability (1.3)
- `MetricsCollector.ts`: added `observeCommandLatency()` + `commandLatency` gauge
- `interactionCreate.ts`, `messageCreate.ts`: command tracking — `incCommandsExecuted({command, status})` + `observeCommandLatency()` per execution (success/fail + latency)
- `apiServer.ts`: added `paperplane_commands_executed_total{command}` and `paperplane_command_latency_ms{command}` to the Prometheus endpoint
- `grafana/dashboard.json`: Grafana dashboard template with 9 panels — tracks played/failed, command rate & latency, guilds/connections, node penalty & players, rate limited. Ready to import directly into Grafana
- Dashboard `MetricsPanel.tsx` + `/api/metrics` route: metrics page directly in the Discord Dashboard without Grafana. 3 tabs — Overview (9 metric cards), Lavalink Nodes (players/penalty per node), Commands (latency table). Auto-refresh 10s

### Error Recovery (1.4)
- `musicEvents.ts`: Stuck track timeout 30s — `startStuckTimer`/`clearStuckTimer` in `trackStart`/`trackEnd`/`trackError`. `playerUpdate` resets the timer on every progress. Auto-skips tracks stuck >30s without progress
- `musicEvents.ts`: Network jitter buffer 500ms — `jitterBuffer()` delays trackError 500ms, cancels when the player already moved on (bypassed/replaced by a new player.play). Prevents pointless fallback from network spikes
- `musicEvents.ts`: Queue replay — failed tracks are pushed to the end of the queue after all fallbacks fail. Not dropped, so they get retried on queue wraparound
- `lavalink.ts`: exports `clearStuckTimer`/`startStuckTimer`, called in `playerUpdate` (reset) and `playerDestroy` (cleanup)

### Per-Guild Rate Limiting (1.11)
- `api-base.ts`: added `guildRateLimit(maxRequests, windowMs)` — sliding window per-guild via `Map<guildId, timestamps[]>`. Cleanup every 1 minute. Auto-tracks `rateLimitBlocked`/`rateLimitAllowed`
- `apiServer.ts`: mounted middleware on every endpoint — player (30/min), queue/filter/equalizer/settings (20/min), search (15/min), GET (60/min). 429 `"Too many requests"` on exceed

### API Docs (1.9)
- NEW `src/bot/api/openapi.json` — OpenAPI 3.0 spec, 23 endpoints documented (Status, Metrics, Guild, Queue, Player, Audio, Settings, Analytics)
- `apiServer.ts`: mounted Swagger UI at `/api/docs` — dynamic import `swagger-ui-express` + spec JSON
- DEP `swagger-ui-express`, `@types/swagger-ui-express`

### Testing Infrastructure (1.7)
- NEW `vitest.config.ts` — path alias `@/` → `./src/`. `npm test` = `vitest run`, `npm run test:watch` = `vitest`
- NEW `src/bot/core/utils/CooldownManager.test.ts` — 9 tests: check, set, expiry, remaining, getUses, reset single/all, independence per user/command
- NEW `src/bot/music/engine/QueueEngine.test.ts` — 12 tests: add, addMultiple, next, remove, clear, swap, move, shuffle, removeRange, getAll
- NEW `src/bot/ai/engine/CommandInterpreter.test.ts` — 14 tests: all keywords (ID/EN/AR), play with query, correction, fallback chat
- CONVERT `src/bot/core/state/QueueLock.test.ts` — from `node:test` to vitest (8 tests)
- DEP `vitest`, `supertest`, `@types/supertest`

### Silent Error Handling (1.5)
- `Logger.ts`: added `safe(tag)` — returns an error handler that logs `[SilentError]` + context. Also handles `catch {}` without binding via `Logger.safe("tag")()`
- Replaced 148+ silent `.catch(() => {})` + `catch {}` in engine core files (lavalink, musicEvents, PlayerService, StateService, FailoverManager, PlayerWatchdog, ready, voiceStateUpdate, interactionCreate, messageCreate, MongoQueueStore, HistoryService, SpotifyScraper, ActivityRepository, apiServer) with `Logger.safe("filepath")`
- Hidden bugs now show up in logs as `[WARN] [SilentError]`

### TypeScript 5 → 7 upgrade
- `tsconfig.json`: `moduleResolution: "node"` → `"node16"`, `module: "commonjs"` → `"node16"`, removed `baseUrl`, fixed `paths` (`"src/*"` → `"./src/*"`)
- Added `.js` extension in 9 dynamic `import()` calls — in CJS mode only dynamic imports need the extension
- `import type` from lavalink-client: added `with { "resolution-mode": "require" }` (2 files)
- `lavalink.ts`: `@ts-expect-error` for the lavalink-client import (package is ESM but provides CJS exports)
- `connection.ts`, `index.ts`: cast `as any` for dynamic import results — `module:"node16"` changes the type of import()
- Total: 11 files, not the 260 imports/146 files originally estimated

### Sentry integration
- NEW `src/instrument.ts` — `Sentry.init()` via `SENTRY_DSN` env, auto-disables when unset
- `src/index.ts`: `import "./instrument"` at the very top + `Sentry.captureException` in `unhandledRejection` / `uncaughtException`
- `apiServer.ts`: `Sentry.setupExpressErrorHandler(app)`
- `.env.example`: added `SENTRY_DSN`

### API wrapper refactor
- NEW `src/lib/api-base.ts` — `createApiHandler()`, `withAuth()`, `ApiError`, `jsonResponse`, `requireSameVoice()`
- `apiServer.ts`: 18 route handler refactors — removed `isTrusted`/`requireApiAuth`/`TRUSTED_IPS`/`API_TOKEN`, replaced with `withAuth()` from api-base. Each handler wrapped in `createApiHandler(async ...)`. File dropped 663→524 lines
- 38 command files: `checkSameVoice()` → `requireSameVoice()` — 77 callers become 1-line `if (!await requireSameVoice(source)) return`

### Broken cycle: FailoverManager ↔ StateService ↔ lavalink
- `lavalink.ts`, `FailoverManager.ts`: removed `import { addRestoredGuild }` — replaced with `EventBus.emit('state:addRestored', { guildId })`
- `StateService.ts`: subscriber `'state:addRestored'` calls `addRestoredGuild`

### Activity → UserActivity model rename
- `models/Activity.ts` → `models/UserActivity.ts`: interface `IActivity` → `IUserActivity`, model `"Activity"` → `"UserActivity"`
- `ActivityRepository.ts`: imports `UserActivity` from the new model
- `ActivityService.ts`: `interface ActivityLog` → `interface UserActivityLog`

### Track error loop + autoplay cycle fix
- `lavalink.ts`: `autoSkip: true` → `autoSkip: false` — prevents a race condition between lavalink-client's internal handler and the manual `trackError` handler
- `musicEvents.ts` 5-error guard: replaced `player.stopPlaying()` (silent loop) → `player.destroy()` + error embed + leave voice. Prevents the infinite cycle: autoplay → error → fallback → error → stopPlaying → autoplay → ...

### Voice check HOF
- NEW `VoiceCheck.ts`: `requireSameVoice()`, `withVoiceCheck()`, `replyError()` — handles reply errors automatically for slash & prefix commands
- 38 command files: import `requireSameVoice` from VoiceCheck

### deferReply — 19 slash commands no longer timeout
- `remove.ts`, `move.ts`, `jump.ts`: added `await` to `editReply()` — discord.js docs say `editReply()` returns `Promise<Message>`, must be awaited
- 19 command files: added `interaction.deferReply()` before `editReply()` — prevents the 3s timeout. Previously only 5 of 24 commands called `deferReply()` (lyrics, play, search, skip, stop). The rest used `reply()` directly, which can time out when the async operation takes >3s.
- Files: pause, resume, volume, seek, clear, remove, move, swap, jump, autoplay, equalizer, filter, loop, shuffle, queue, help, nowplaying, 247, prefix
- Queue/clear/autoplay/equalizer/loop/shuffle/247: `reply()` + `fetchReply()` → `deferReply()` + `editReply()` (editReply returns Message directly, no fetchReply needed)
- seek/remove/move/jump/prefix: multiple success paths → each defers before editReply

### Circular dependency refactor — EventBus extraction
- NEW `src/bot/music/events/EventBus.ts`: typed in-process pub/sub (~50 lines). Breaks 3 import cycles between the engine and services.
- `musicEvents.ts`: 12 direct calls to StateService + 3 to MetricsCollector + `HistoryService.addEntry` + `RecommendationEngine.clearPlayed` + `deletePlayerData` + `lavalink.cacheTrack`/`clearTrackCache` → all replaced with `EventBus.emit(...)`. Imports of StateService/MetricsCollector/HistoryService/RecommendationEngine/PersistentPlayerStore removed. Imports reduced 19 → 16.
- `StateService.ts`: added 5 EventBus subscribers (`state:save`, `state:startPositionSync`, `state:stopPositionSync`, `state:delete`, `state:clearRestored`). `restoredGuilds` Set moved to `StateManager.restored`.
- `HistoryService.ts`: subscriber `history:addEntry`.
- `RecommendationEngine.ts`: subscriber `recommendation:clearPlayed`.
- `PersistentPlayerStore.ts`: subscriber `persistent:deletePlayerData`.
- `lavalink.ts`: subscribers `lavalink:cacheTrack` + `lavalink:clearTrackCache`.
- `StateService.ts`, `FailoverManager.ts`, `lavalink.ts`: import `setFilter`/`setEqualizer` from `PlayerService` directly — cycles A & E broken.
- `musicEvents.ts`: imports `destroyEngine` from `PlayerService` directly.
- `StateManager.ts`: added `restored: Set<string>`.
- `MetricsCollector.ts`: 2 EventBus subscribers (`metrics:trackPlayed`, `metrics:trackFailed`).
- Files: NEW `EventBus.ts`, MODIFIED `musicEvents.ts`, `StateService.ts`, `StateManager.ts`, `HistoryService.ts`, `RecommendationEngine.ts`, `PersistentPlayerStore.ts`, `MetricsCollector.ts`, `PlayerService.ts`, `FailoverManager.ts`, `lavalink.ts`.

### Stop command force-disconnect idle bot + 24/7 rejoin
- `slash/stop.ts`, `prefix/stop.ts`: guard `!player || (!player.playing && !player.paused && !engine.queue.size())` → `!player` — an idle bot in VC (player exists, not playing, empty queue) now has `stop` working as a force-disconnect.
- `PlayerService.ts::stop()`: 247 ON + node dead (`!player.node?.connected`) → destroys the broken player, rejoins VC via `engine.join()`, then re-applies filter/equalizer from RAM state. Bot stays in VC even when Lavalink errors.
- `PlayerService.ts::stop()`: 247 ON + node dead — autoplay/loop/filter/equalizer preserved (only queue+nowPlaying cleared).
- `musicEvents.ts` `queueEnd`: added `deleteState()` for 24/7 OFF after all playback paths are exhausted — prevents restoring a stale nowPlaying if the bot restarts within the 60s idle window.
- `ecosystem.config.cjs`: added `interpreter: "tsx"` — compiled command files use the `@/` path alias which only `tsx` can resolve. `package.json` `npm start` also `node` → `tsx src/index.ts`.
- Fixed mixed modules (`dist/` + `src/` via tsx `@/` alias) → `npm start` runs from source directly, no Mongoose model duel.
- `ecosystem.config.cjs`: changed `interpreter` to `./node_modules/.bin/tsx` — tsx isn't on the global PATH on the server.

### Lavalink down guard — autoplay/filter/equalizer/loop
- `MusicService.ts`: added `requireLavalink()` — returns `{embeds: [error]}` or null, reusable in command files.
- `autoplay/filter/equalizer/loop` (slash + prefix, 8 files): added the `requireLavalink()` guard after the voice check — when no NodeLink is connected, sends the embed "Music service is currently unavailable."
- `messageCreate.ts`: moved the prefix-command guard after alias resolution — `-ap` (alias) previously bypassed the guard because it checked the literal `commandName`.

### Load balancing — explicit node selection in createPlayer
- `PlayerManager.ts`: calls `getLeastLoadedNode()` + spreads `node:` into `mgr.createPlayer()` — avoids lavalink-client's `getIdealNode()` which fails when there's a dead node in the Map.
- `lavalink.ts` failover recreate (line 173): added `node: target.id` — moves to the node already chosen by failover, not auto-assign.
- `lavalink.ts` connect handler recovery (line 412): added `getLeastLoadedNode()` — restores the player to the lightest node.
- Fix: node1/node2 dead (returning HTML) no longer block `createPlayer()` because `getBestNode()` only picks healthy nodes.

### Node config parsing — non-sequential slots
- `lavalink.ts` init loop: `if (!host) break` → `continue` — when `NODELINK_HOST` (node1) was commented out, the loop stopped at i=1 and never read `NODELINK_HOST_3`/`_4`/etc. Now it skips empty slots and scans to i=20, reading whatever nodes exist.

### Manual kick cleanup — autoplay reset
- `voiceStateUpdate.ts` bot-leave handler: added `autoplay/shuffle/filter/equalizer` cleanup after `deleteState`, guarded by `!247`. Previously only `deleteState` — autoplay survived even after a manual kick. Now consistent with `destroyEngine`.

### Stale player cleanup on node reconnect — bot stuck fix
- `lavalink.ts` nodeConnect handler: destroys stale players (`!player.connected`) before the recovery loop. When NodeLink crashes+restarts, session resume fails to restore the voice WS (`data.state?.connected = false`), but the stale player in `lavalink.players` blocked the recovery loop (line 351 guard) → bot in VC but blank. Fix: detect + destroy the stale player, wait 2s for the resumed event to finish, then destroy — the recovery loop re-creates from RAM/DB. Previously: only the watchdog (30s) path, which often failed because `player.connect()` to a fresh NodeLink had no voice state.

### Resume position fix — accurate hot reload
- `StateService.ts` `saveState`: uses `Math.max(statePos, playerPos, lastPos)` — takes the largest of 3 sources, prevents pos=0 when one source is 0
- `StateService.ts` `startPositionSync`: same, `Math.max(statePos, playerPos, lastPos)` every 1 second
- `lavalink.ts` connect handler: checks `if (player) continue` instead of `if (player?.connected)` — prevents duplicate players on node reconnect (ghost session)

### Failover & network resilience
- `FailoverManager.ts` (new): extracted failover logic + trackCache into a separate file (~200 lines)
- `lavalink.ts`: registered `setLavalinkRef` from FailoverManager
- `musicEvents.ts` trackError: detects network errors (`ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`, `ECONNREFUSED`, `timeout`) → skips fallback search, straight to `stopPlaying()` + advanceQueue
- `musicEvents.ts` trackError: logs the detailed error message when failover fails
- `FailoverManager.ts`: fallback search prefers the YouTube source, skips Deezer

### queueEnd spam guard
- `musicEvents.ts`: `queueEndGuard` Set + 5s TTL — prevents queueEnd spam firing (previously 3x within 22ms)
- `musicEvents.ts` queueEnd: filters the human count with `.filter(m => !m.user?.bot)` + 60s timeout

### Autoplay & search improvements
- `RecommendationEngine.ts`: filter regex `/session|#\w+|@\s+\w+|version|tribute\b/i` — skips live sessions, hashtags, venues, cover versions
- `RecommendationEngine.ts`: filters `instrumental` + `karaoke`
- `TitleResolver.ts`: added `instrumental` to `COVER_PATTERNS`
- `lavalink.ts`: `defaultSearchPlatform: "ytsearch"` — NodeLink doesn't support the `ytmusic` source
- `SearchService.ts`: `searchWithRetry` logs timeout details (retries left, error, query, node)

### Config & structure
- `constants.ts` (new): 80+ magic numbers collected into 1 config file
- `MongoQueueStore.ts` (new): MongoDB queue store — commented out due to conflict with the saveState dual system
- `FailoverManager.ts`: extracted failover logic from `lavalink.ts` (~200 lines)

### Observability
- `apiServer.ts`: `GET /api/metrics` — Prometheus text format + `GET /api/metrics/json`
- Debug logs: all track start/end/error/stuck added `region=` + `restored=`
- New `[VoiceJoin]` log — shows `vcRegion` + `nodeRegion`
- New `[autoplay] No recommendations` log
- New `[SearchTimeout]` log

### UI tweaks
- QueueEnd disconnect timer 30s → 60s + human count fix (filters bots)
- VoiceState alone check: `members.size === 1` → `humans === 0` + log "1m"
- QueueEnd disconnect message: removed "Add more tracks..."
- Default search platform: `ytmsearch` → `ytsearch` (NodeLink compat)

### 2026-07-19

### Autoplay — filter live, session, version, hashtag
- `RecommendationEngine.ts`: added regex `/session|#\w+|@\s+\w+|version|tribute\b/i` — skips live recordings, sessions, hashtags, cover versions

### QueueEnd timeout 30s → 60s + human count fix
- `musicEvents.ts`: queueEnd disconnect timer 30s → 60s
- `musicEvents.ts`: filters bots from the human count — `members.filter(m => !m.user?.bot)` — other bots aren't counted as humans
- `voiceStateUpdate.ts`: alone check `members.size === 1` → `humans === 0` — detects when only bots remain (not just the bot alone)
- `voiceStateUpdate.ts`: log "3m" → "1m" (matches the real 60s timer)

### Deezer error — skip fallback, prevent embed spam
- `musicEvents.ts`: detects when `errMsg` contains "Deezer" → skips fallback search, straight `stopPlaying()` + advanceQueue. Previously the fallback search got a YouTube track but NodeLink internally streamed Deezer → errored again → double-embed loop.

### Autoplay — filter instrumental + karaoke
- `RecommendationEngine.ts`: added `!titleL.includes("instrumental")` and `!titleL.includes("karaoke")` — autoplay no longer picks irrelevant instrumental songs
- `TitleResolver.ts`: added `instrumental` to `COVER_PATTERNS` — detects instrumentals as covers in all filters

### Debug log — region, timeout, autoplay
- All track start/end/error/stuck logs: added `region=` + `restored=`
- New `[VoiceJoin]` log — shows `vcRegion` + `nodeRegion`
- New `[autoplay] No recommendations` log — shows track source + id when autoplay fails
- New `[SearchTimeout]` log — shows which node timed out + query

### Load balancing — remove manual node override
- `PlayerManager.ts`: removed `getLeastLoadedNode()` — the library built-in handles region + load balancing via `vcRegion`. The manual node override conflicted with region matching.
- `PlayerService.ts` `engine.join()`: added the `vcRegion` param
- `slash/search.ts`, `prefix/search.ts`: send `voice.rtcRegion` to `engine.join()`

### Position resume fix — accurate hot reload
- `StateService.ts` `saveState`: uses `state.position.get(guildId)` (from the playerUpdate event) as primary, `player.position` fallback — more accurate position at shutdown
- `saveAllStates`: stops `positionSync` BEFORE saving state — prevents a race condition overwriting the position

### Load balancer — region-based node selection
- `lavalink.ts`: `region` → `regions: []` — official lavalink-client property. Nodes now list the regions they support.
- `PlayerManager.ts`: added the `vcRegion` param — passed through to `lavalink.createPlayer()`
- `slash/play.ts`, `prefix/play.ts`, `messageCreate.ts`: send `voice.rtcRegion` — the bot picks the node per the user's Discord region
- `NodePenaltyService.getBestNode()` — region filter already uses `n.options?.regions`

### Load balancer + heartbeat fix — prevent disconnect/reconnect cycle
- `lavalink.ts`:
  - `heartBeatInterval`: 1000ms → **30000ms** (official recommendation) — 1s was too aggressive, the server couldn't respond in time → disconnect loop
  - Added `retryAmount: 5` + `retryDelay: 10000` — node auto-reconnects without the health check
  - Added `autoMove: true` — lavalink-client automatically moves players when a node disconnects
  - `requestSignalTimeoutMS`: 10s → 20s (previously)

### TrackError fix — prefer YouTube + prevent spam loop
- `SearchService.ts`: `scoreTrack` +10 for the YouTube source — `pickBestTrack` automatically picks YouTube over Deezer/Spotify. The `ytmsearch:` flow stays primary, only the result-filter preference changed.
- `musicEvents.ts` trackError fallback:
  - Skips Deezer tracks in the fallback search (`t.info?.sourceName !== "deezer"`) — avoids "Deezer stream metadata missing" errors
  - Pre-marks the `alt` trackId in `retried` — prevents the spam loop (3x "Started Playing" embeds for the same song)
  - Uses metadata from `state.nowPlaying` (the original track) for the fallback query, not the corrupted Deezer metadata

### Failover fix — exact track + accurate autoplay
- `lavalink.ts` failover Path 1 & 3: `state.nowPlaying.encoded` (from RAM) takes priority over track cache/re-search — guarantees failover plays the SAME exact track, not a cover or different song.
- `RecommendationEngine.ts`:
  - Fallback search: added the `official audio` keyword for more accurate results
  - Added a search-by-SOURCE-URI step before search-by-query
  - Filters duration mismatch >40% (avoids remixes/covers with very different durations)

### R3 — Event-driven state persistence
- `QueueService.addTracks()` — function to append tracks + auto-saveState. External callers just call `addTracks(guildId, tracks)`, no manual saveState needed.
- Bug fix: 3 "already playing" paths in play.ts (slash + prefix) were not persistent — added `await MusicService.saveState()` after `state.queues.set()`.
- Bug fix: AI play `messageCreate.ts` already-playing path — added `await saveState()`.
- `QueueService` already calls saveState in all methods (remove, swap, clear, shuffle, move, removeByQuery, removeRange, jumpTo). Only play.ts bypassed it with direct RAM mutation — now consistent.

### R2 — Remaining `require()` → static import
- `index.ts`: 3 require() → import (`ShutdownManager`, `destroyPlayer`, `getLavalink`). No circular deps.
- `StateService.ts`: redundant `require("../services/TextChannelStore")` (`getTextChannelId` already imported at line 4). Removed. `require("discord.js").EmbedBuilder` → `import { EmbedBuilder } from "discord.js"` at the top level.
- `loadCommands.ts` + `loadEvents.ts`: 3 dynamic `require(join(...path, file))` — variable file paths, must stay require(). Commented.

### R1 — TS interfaces for all models
- `Guild.ts`: `IGuild extends Document` — 11 fields (guildId, prefix, volume, lastFilter, lastEqualizer, autoplay, loop, shuffle, "247", createdAt, updatedAt)
- `PlayerState.ts`: `IPlayerState extends Document` — 8 fields (guildId, voiceChannelId, textChannelId, queue, nowPlaying, position, nodeId, updatedAt)
- Schema + model use the generic `<IGuild>` / `<IPlayerState>` — field typos caught at compile time
- 4 other models (Conversation, Memory, HistoryEntry, Activity) were already typed — only verified
- `PlayerState` schema untyped (`new Schema({...})`) because Mixed fields (`queue`, `nowPlaying`) aren't compatible with Mongoose 9 generics — but the generic model stays active for query return types

### Dependencies — all updated
- `discord.js` ^14.26.5 → ^14.27.0
- `dotenv` ^16.4.7 → ^17.4.2
- `express` ^4.21.0 → ^5.2.1
- `mongoose` ^8.9.0 → ^9.7.4
- `@types/node` ^22.0.0 → ^26.1.1
- `tsx` ^4.19.0 → ^4.23.1
- Typescript 5.x retained — TS 7 drops `moduleResolution=node10` and `baseUrl`, needs a config overhaul

### Audit — 29 findings (12 critical, 9 high, 8 structural)

Full audit with 5 parallel agents against lavalink-client v2.10 docs and zero-downtime best practices. See `AUDIT.md`.

### Fixed

- **C2 — `recoveringGuilds` Set never cleaned** — guilds added at recovery but never removed, permanently blocking future reconnects. Now deleted on success/failure + TTL 10min auto-expire. File: `lavalink.ts`
- **C3 — Position lost on `playerDestroy`** — when a node disconnects, `player.lastPosition` was lost. Now saved to `state.position` (`PositionStore`). Recovery reconnects resume from the exact position. Files: NEW `PositionStore.ts`, `StateManager.ts`, `lavalink.ts`, `musicEvents.ts`, `PlayerService.ts`
- **C4 — `playerUpdate` position granularity** — position now updated in `state.position` on every `playerUpdate` (~50ms) instead of only on `playerDestroy`. Recovery always has near-real-time position. File: `lavalink.ts`
- **C1 — Session resume playback** — the `resumed` handler now calls `player.play()` to actually resume audio (was only setting `player.playing = true`, which didn't start playback). Added a `recoveringGuilds` guard to prevent double-recovery with the `connect` handler. File: `lavalink.ts`
- **H1 — Schema mismatch Mongoose vs Prisma** — `Memory` model: Prisma `entry` → `summary` (aligned with Mongoose). `"247"` vs `is247` intentional (Mongoose numeric key, Prisma identifier). Files: `prisma/schema.prisma`, `MemoryRepository.ts`
- **H2 — Compound index Activity** — replaced the `guildId`-only index with `{guildId:1, timestamp:-1}`. `findRecentByGuild` with a timestamp desc sort is now efficient. File: `Activity.ts`
- **H3 — Silent catch blocks** — 7 catch blocks in `GuildRepository.ts` + 1 in `ActivityRepository.ts` now log warnings. Files: `GuildRepository.ts`, `ActivityRepository.ts`
- **H4 — Empty `catch {}` in engine** — 13 silent catch blocks in `lavalink.ts` (4), `musicEvents.ts` (5), `PlayerWatchdog.ts` (1), `StateService.ts` (3) now log warnings. Files: `lavalink.ts`, `musicEvents.ts`, `PlayerWatchdog.ts`, `StateService.ts`
- **H5 — `player.connect()` retry** — `connectWithRetry(player, guildId, retries=3)` with 2s backoff. Used in reconnect paths (connect handler, resumed handler, restore, join, watchdog). Play commands keep `player.connect()` direct (fail fast). Files: `lavalink.ts`, `PlayerService.ts`, `StateService.ts`, `PlayerWatchdog.ts`
- **H6 — `restoreAllStates` from connect event** — full state restore triggered from the `nodeManager.connect` handler. When Lavalink isn't ready at startup (30s window elapsed), the connect event triggers restore again. File: `lavalink.ts`
- **TitleResolver — Indonesian noise + inner dash parsing** — 3 fixes: (1) `(Lirik)`/`(Lirik lagu)`/`(Remastered Audio)` added to NOISE_PATTERNS, (2) ` - Topic - ` stripped from anywhere (not just the end), (3) `parseInner` heuristic (shorter = artist) to handle `Channel - Title - Artist` and `Channel - Artist - Title`. Applicable to basic dash match + channel flip. File: `TitleResolver.ts`
- **TrackStart embed — `cleanTitle()` applied** — the "Started playing" embed in `musicEvents.ts` previously used `track.info.title`/`author` directly without `cleanTitle()`. Now goes through `cleanTitle()` first. File: `musicEvents.ts`
- **Auto-resume fix: aligned with lavalink-client docs** — 3 fixes: (1) **Bulk DB fallback in the connect handler removed** — awaiting `PlayerState.find()` made the `resumed` event fire first, then the for-loop deleted `recoveringGuilds` entries already set by the resumed handler → race condition + double play() → `replaced` loop. Bot startup restore only from `ready.ts → restoreAllStates`. (2) **`restoreAllStates()` call removed** from the connect handler — inline recovery is enough for reconnects. (3) **`addRestoredGuild()`** added to inline recovery + resumed handler — prevents overlap with ready.ts. `updateSession(true, 300000)` stays enabled per official docs. Files: `lavalink.ts`, `StateService.ts`

- **H7 — PromptFilter: allowedContext before blockedPatterns** — "lagu coding" was blocked because `checkPrompt()` checked blocked patterns first (`\b(bantu|tolong|help)\b.*\b(coding|...)\b`) before allowing. Now `allowedContext` is checked first: when there's a music word (`lagu|musik|song|play|putar|...`), immediately returns `{blocked: false}` without the blocked check. File: `PromptFilter.ts`
- **H8 — console.error monkey-patch: verified intentional** — lavalink-client v2.10 `debugOptions` only has `{noAudio, playerDestroy}` — no option to suppress the internal console.error. The monkey-patch in `index.ts` stays necessary; marked verified. File: `index.ts`
- **H9 — Dead code 4 files: 3 deleted, 1 retained** — `SongRequest.ts` + `SongRequestRepository.ts` (no imports), `RedisPlayerState.ts` (6+ no-op calls in musicEvents.ts → removed all + deleted), `LyricsSyncManager.ts` (3 no-op `stop()` calls → removed + deleted). `MetricsCollector.ts` retained (used in musicEvents, apiServer, NodePenaltyService). Files: deleted 5 files, modified `musicEvents.ts`

### Fixed
- **C8 — `require()` → static import** — 54 `require()` converted to static `import` across `lavalink.ts`, `musicEvents.ts`, `PlayerService.ts`. Plus 15 more files (apiServer, commands, events, StateService, Watchdog, PlaybackEngine, prisma, bootstrap). Only `loadCommands.ts` + `loadEvents.ts` left (dynamic paths).
- **C9 — Metrics** — added the `/api/metrics` endpoint + `incTracksPlayed`/`incTracksFailed` counters wired to trackStart/trackError.
- **C10 — Watchdog double reconnect** — removed `failoverFromNode` from the watchdog (the health check already handles it).
- **C11 — `volumeDecrementer`** — added `playerOptions.volumeDecrementer: 0.75` + `clientBasedPositionUpdateInterval: 50` + `defaultSearchPlatform: "ytmsearch"`.
- **C12 — Auto-disconnect 30s** — queue idle timer 180s → 30s.

### Position sync
- Position sync interval 5000ms → **1000ms** — resume position error dropped from 5s to max 1s. Write is only `updateOne` (updates a field, not insert), safe for M0.

### Fix
- **recoveringGuilds DB fallback leak** — the DB fallback path (connect handler) added guilds to `recoveringGuilds` but never removed them after populating state → guilds lingered in the set until the 10-minute TTL. Fix: delete from recoveringGuilds after the DB fallback finishes. File: `lavalink.ts`
- **Cover filter autoplay** — `isCover()` now uses `\bcover\b` (catches all "cover" in the title) + checks author `via @` (cover channels). Autoplay (`RecommendationEngine`), search (`pickBestTrack`), failover re-resolution all affected. File: `TitleResolver.ts`, `SearchService.ts`, `RecommendationEngine.ts`
- **`isLavalinkReady()` broken** — `MusicService.ts` used `setLavalinkManager` which was never called → `isLavalinkReady()` always false → all music commands blocked. Fix: calls `getLavalink()` directly from `lavalink.ts`. File: `MusicService.ts`
- **State reset on destroy** — `destroyEngine` now resets `state.autoplay`, `state.shuffle`, `state.filter`, `state.equalizer` when the bot leaves VC / player destroyed (except 24/7 ON). File: `PlayerService.ts`
- **`ephemeral: true` → `flags: 64`** — 24 slash command files. (discord.js v14 deprecated `ephemeral`).
- **Button commands "Unknown Webhook"** — `autoplay.ts`, `filter.ts`, `equalizer.ts` called `fetchReply()` without a prior reply. Fix: added `interaction.reply()` before `fetchReply`.
- **Autoplay no-humans timeout** — on restart with autoplay ON, the bot checks whether any human is in the VC. When there's none, the bot waits 1 minute, sends the embed `"No one is in the voice channel. Leaving..."`, then leaves (`destroyEngine`). Files: `StateService.ts`
- **TitleResolver channel flip** — `cleanTitle()` now detects when the author is a channel name (SKY CHANNEL, Topic, VEVO, Records, etc.). When the channel name doesn't match either side of the dash, flips to the `Title - Artist` format. Files: `TitleResolver.ts`

### Position sync

### Embed & UI fixes
- **Cover filter** — `isCover()` detects 7 cover patterns (`| NamaArtis`, `cover by`, `versi`, `tribute`, etc.). Applied to: `pickBestTrack()`, `RecommendationEngine` (autoplay), lavalink failover re-resolution.
- **NowPlayingEmbed `cleanTitle()`** — the embed now uses `cleanTitle()` — shows `Artist - Title` without `(Official Music Video)`, `Record Label`, etc.
- **Unavailable music embed** — `interactionCreate` + `messageCreate` error messages changed from plain text + 🎵 → `ErrorEmbed.build()`.

### Files
- NEW: `PositionStore.ts` — RAM store for position per guild
- Modified: `lavalink.ts`, `StateManager.ts`, `PlayerService.ts`, `musicEvents.ts`, `NowPlayingEmbed.ts`, `SearchService.ts`, `TitleResolver.ts`, `RecommendationEngine.ts`, `PlayerWatchdog.ts`, `MetricsCollector.ts`, `apiServer.ts`, `interactionCreate.ts`, `messageCreate.ts`, +15 more (requires→imports)

## 2026-07-18

### 4-Layer Zero-Downtime Architecture
- **Layer 1 (Session Resume):** `nodeManager.on("resumed")` restores players from Lavalink data — instant recovery for <360s outages
- **Layer 2 (DB Fallback):** the `connect` handler queries `PlayerState.find()` when RAM is empty — survives restart
- **Layer 3 (Player Persistence):** `playerCreate`/`playerUpdate`/`playerDestroy` auto-sync voice/text channel IDs via `PersistentPlayerStore`
- **Layer 4 (Timer Cancel):** `cancelNodesDownTimer()` in ALL reconnect events (connect, resumed, nodeReconnect, health check)

### Fixes
- Race condition on restart: `connect` fires before `restoreAllStates` — direct `PlayerState.find()` fallback in the connect handler
- `isLavalinkReady()` guard in `voiceStateUpdate.ts` — added a call to skip `destroyEngine()` when Lavalink is down
- `removeFromQueue()` and `shuffle()` wrapped in `withQueueLock`
- CommandInterpreter Arabic regex: `\b` → `(?:\\b|$)` for RTL text
- Test files created (50 tests via `node:test`) then removed — QueueLock (9), CommandInterpreter (37), StateService (4)

### Files
- NEW: `PersistentPlayerStore.ts` — RAM store for player voice/text channel IDs
- Modified: `lavalink.ts`, `voiceStateUpdate.ts`, `QueueService.ts`, `CommandInterpreter.ts`, `musicEvents.ts`

## 2026-07-16

### Failover & Recovery
- Node reconnect player recovery: all nodes down → reconnect restores players from RAM + replays the last track
- All-nodes-down timer (60s) — fires an error embed + destroys players; cancels on any reconnect
- Pluggable load balancer: `LOAD_BALANCE_STRATEGY` env (`penalty`/`roundrobin`/`leastplayers`)
- Zero-downtime improvements: trackCache, 15s health check + cooldown, `changeNode` retry, background pre-fetch, session resume 5min
- Node selection: `getLeastLoadedNode()` + `getBestNode()` with penalties
- `globalFailoverLocks` Set prevents double-failover per guild

### 24/7 Mode
- Bot stays in VC when the queue is empty; guards on `stop()`, `skip()`, `voiceStateUpdate`; 12-dim state matrix
- Commands: `setup/slash/247.ts`, `setup/prefix/247.ts`

### Autoplay
- YouTube Mix + fallback: `youtube.com/watch?v={id}&list=RD{id}` → `ytmsearch:{author} - {title}`
- DB persistence: `AutoplayStore` RAM + GuildRepository CRUD + restore on startup
- Fixes: `clearRestoredGuild()` immediate (was 5s delay), `saveState()` after autoplay `player.play()`

### State Persistence
- Loop/Shuffle/24/7 DB persistence — same pattern as autoplay
- Filter/Equalizer upgraded to StateManager — restored + applied to the player on startup
- `state.nowPlaying` populated before `engine.join()`; survives node-offline join failure
- DB restore after 10 retries exhausted

### Misc
- Collector race fix: 12 toggle commands — removed `max: 1`, `i.update()` before the DB await, DB save fire-and-forget
- `trackStart` debug log with flags (restored, isFirstRest, manual, suppr, fail, send)
- Alias `ap` for prefix autoplay
- Button timeout 30s + embed stays

## 2026-07-15 — Audit Cleanup

### Critical
- Fixed `registerShutdownTasks.ts` require path (was resolving to a non-existent file)
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
- AI prefix permission: check moved to after the AI response
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
- `nodeConnect` event: listened from `nodeManager` directly (NodeManager emits "connect", not "nodeConnect")

### Misc fixes
- **Logger error color red** — `Logger.ts`: added `color("[ERROR]", "red")` — red in dev mode
- **Skip + autoplay** — `PlayerService.ts`, `skip.ts`: skipping the last track + autoplay ON → destroy player so queueEnd fires autoplay
- **trackStart debug log** — `musicEvents.ts`: logs flags (restored, isFirstRest, manual, suppr, fail, send) — diagnoses embed suppression
- **Failover restore filter/equalizer** — `lavalink.ts`: after changeNode/recreate, applies `state.filter`/`state.equalizer` to the new player
- **Failover update engine.player** — `lavalink.ts`: sets `getEngine(guildId).player` after changeNode — commands no longer access the old player
- **Autoplay play error log** — `musicEvents.ts`: `.catch(() => {})` → `.catch(err => Logger.warn())` — silent errors now visible

## 2026-07-13 — Audit Summary

- NodeLink failover (3 layers), heartbeat 1s, watchdog, session resuming removed
- Hybrid Prisma/Mongoose, MongoDB → Supabase migration ready
- YouTube playlist, max queue 150, `pickBestTrack`, Spotify resolver + scraper
- Queue lock in play/search/Spotify, TaskQueue rewrite, `restoreAllStates` in ready.ts
- API auth, equalizer field fix, emoji purge, ActivityService buffer cap, prefix dispatch try/catch
- AI apiKey check, PromptFilter ordering, sendTyping catch
- 23 commands total

