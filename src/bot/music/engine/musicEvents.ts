import * as lavalink from "./lavalink";
import { destroyEngine } from "../services/MusicService";
import state from "../../core/state/StateManager";
import { withQueueLock } from "../../core/state/QueueLock";
import Logger from "../../core/utils/Logger";
import { EmbedBuilder } from "discord.js";
import Colors from "../../core/constants/Colors";
import { getSourceEmoji } from "../../ui/embeds/NowPlayingEmbed";
import { getTextChannelId } from "../services/TextChannelStore";
import { clearVoiceJoinTime } from "./PlayerManager";
import lyricsMessages from "../../core/state/LyricsMessageStore";
import * as HistoryService from "../services/HistoryService";
import { getPrefix } from "../../database/repositories/GuildRepository";
import botConfig from "../../config/bot";
import { saveState, startPositionSync, stopPositionSync, deleteState, isRestoredGuild, clearRestoredGuild } from "../services/StateService";
import { cleanTitle, saveSpotifyMeta, applySpotifyMeta } from "../services/TitleResolver";
import AutoplayEngine from "./AutoplayEngine";
import RecommendationEngine from "./RecommendationEngine";
import { deletePlayerData } from "../services/PersistentPlayerStore";
import { incTracksPlayed, incTracksFailed } from "../../telemetry/MetricsCollector";
import metrics from "../../telemetry/MetricsCollector";


const disconnectTimers = new Map<string, any>();
const errorTimestamps = new Map<string, number[]>();
const retryTracks = new Map<string, Set<string>>();

// Per-guild timestamp: set by manual advance (skip) to prevent queueEnd from
// double-advancing.  Consumed in queueEnd (if recent) — NOT cleared in trackStart
// because trackStart fires BEFORE queueEnd in Lavalink's event order, so clearing
// there would remove the flag before queueEnd checks it.
const manualAdvances = new Map<string, number>();
const MANUAL_ADVANCE_WINDOW_MS = 5000;
const idleDisconnects = new Set<string>();
let startupPhase = true;
setTimeout(() => { startupPhase = false; }, 15000);
const restoredGuilds = new Set<string>();
export function markIdleDisconnect(guildId: string): void { idleDisconnects.add(guildId); }
export function isIdleDisconnect(guildId: string): boolean { return idleDisconnects.has(guildId); }
export function clearIdleDisconnect(guildId: string): void { idleDisconnects.delete(guildId); }

function markManualAdvance(guildId: string): void {
  manualAdvances.set(guildId, Date.now());
}

// Set by play commands to suppress the duplicate trackStart embed
const suppressTrackStart = new Set<string>();
function markTrackStartSuppressed(guildId: string): void {
  suppressTrackStart.add(guildId);
}

let clientRef: any = null;

function clearDisconnectTimer(guildId: string): void {
  const timer = disconnectTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(guildId);
  }
}

function getGuildName(guildId: string): string {
  const guild = clientRef?.guilds?.cache?.get(guildId);
  return guild?.name || "Unknown";
}

let registered = false;

async function advanceQueue(player: any): Promise<any> {
  const guildId = player.guildId;
  return withQueueLock(guildId, async () => {
    while (true) {
      const queue = state.queues.get(guildId) || [];
      if (!queue.length) break;

      let next = queue.shift();
      state.queues.set(guildId, queue);

      if (!next.encoded && next.info?.uri) {
        try {
          const uri = next.info.uri;
          const isSpotify = /^spotify:(track|album|playlist):/.test(uri) || /open\.spotify\.com/i.test(uri);
          const savedMeta = saveSpotifyMeta(next);
          if (isSpotify) {
            const q = `${next.info.author || ""} ${next.info.title || ""}`.trim();
            for (const prefix of ["ytmsearch", "ytsearch", "scsearch"]) {
              const res = await player.search({ query: `${prefix}:${q}` }, clientRef?.user).catch(() => null);
              if (res?.tracks?.length) {
                Object.assign(next, res.tracks[0]);
                applySpotifyMeta(next, savedMeta);
                break;
              }
            }
          } else {
            const res = await player.search({ query: uri }, clientRef?.user).catch(() => null);
            if (res?.tracks?.length) {
              Object.assign(next, res.tracks[0]);
            }
          }
        } catch { Logger.warn(`[advanceQueue] Re-resolution failed for ${guildId}`); }
      }

      if (!next.encoded) {
        Logger.warn(`[advanceQueue] guild=${guildId} skipping track without encoded data`);
        continue;
      }

      state.nowPlaying.set(guildId, next);
      try {
        await player.play({ track: next, clientTrack: next });
        
        await saveState(guildId);
        const remaining = state.queues.get(guildId) || [];
        Logger.info(`[advanceQueue] guild=${guildId} now playing: ${next.info?.title || "?"} (queue=${remaining.length} left)`);

        if (state.loop.get(guildId) === "playlist") {
          const q = state.queues.get(guildId) || [];
          q.push(next);
          state.queues.set(guildId, q);
        }
        return next;
      } catch (err: any) {
        Logger.error(`[advanceQueue] guild=${guildId} failed to play "${next.info?.title || "?"}": ${err?.message} — skipping to next`);
      }
    }
    return null;
  });
}

function register(client: any): void {
  if (registered) return;
  registered = true;
  clientRef = client;
  const l = lavalink.get();
  if (!l) return;

  l.on("trackStart", (player: any, track: any) => {
    metrics.tracksPlayed.inc({ guild: player.guildId, source: track?.info?.source || 'unknown' });
    const prevLyrics = lyricsMessages.get(player.guildId);
    if (prevLyrics && clientRef) {
      const ch = clientRef.channels.cache.get(prevLyrics.channelId);
      if (ch) {
        (ch as any).messages.fetch(prevLyrics.messageId).then((m: any) => m.delete().catch(() => {})).catch(() => {});
      }
    }
    lyricsMessages.delete(player.guildId);
    state.nowPlaying.set(player.guildId, track);
    lavalink.cacheTrack(player.guildId, track);

    
    startPositionSync(player.guildId);

    if (player.voiceChannelId) {
      const textChannelId = getTextChannelId(player.guildId);
      if (textChannelId) {
        state.voiceChannels.set(player.guildId, player.voiceChannelId, textChannelId);
      }
    }

    const req = track.info?.requester || track.requester;
    const userId = typeof req === "object" ? (req.id || req.userId) : (req || "unknown");
    HistoryService.addEntry(player.guildId, userId, track).catch(() => {});

    const timer = disconnectTimers.get(player.guildId);
    if (timer) {
      clearTimeout(timer);
      disconnectTimers.delete(player.guildId);
    }

    
    const restored = isRestoredGuild(player.guildId);
    if (restored) {
      restoredGuilds.add(player.guildId);
      
      clearRestoredGuild(player.guildId);
    }
    const isManualAdvance = manualAdvances.has(player.guildId);
    const suppress = suppressTrackStart.has(player.guildId);
    if (suppress) suppressTrackStart.delete(player.guildId);
    const isFailover = lavalink.isFailoverGuild?.(player.guildId);
    if (isFailover) { lavalink.clearFailoverGuild(player.guildId); }
    // Only suppress for first track after restore (not all tracks during startup)
    const isFirstRestored = restoredGuilds.has(player.guildId);
    if (isFirstRestored) restoredGuilds.delete(player.guildId);
    const shouldSendEmbed = !isFirstRestored && !isManualAdvance && !suppress && !isFailover;
    const textChannelId2 = getTextChannelId(player.guildId);
    Logger.info(`[DBUG-trackStart] guild=${player.guildId} track=${track?.info?.title?.slice(0, 40) || "?"} restored=${restored} isFirstRest=${isFirstRestored} manual=${isManualAdvance} suppr=${suppress} fail=${isFailover} send=${shouldSendEmbed} ch=${textChannelId2 || "none"} region=${player.node?.options?.regions?.[0] || "?"}`);
    incTracksPlayed();
    if (textChannelId2 && shouldSendEmbed) {
      const channel = client.channels.cache.get(textChannelId2);
      if (channel) {
        const cleaned = cleanTitle(track.info.title || "", track.info.author || "");
        const title = cleaned.title;
        const author = cleaned.author;
        const url = track.info.originalUrl || track.info.uri || "";
        const source = track.info.source || "youtube";
        const emoji = getSourceEmoji(source, track.info?.spotifyUrl);
        const embed = new EmbedBuilder()
          .setDescription(`${emoji} Started playing [${author} - ${title}](${url})`)
          .setColor(Colors.NOWPLAYING);
        channel.send({ embeds: [embed] }).catch((err: any) => Logger.error(`[trackStart] Failed to send embed: ${err.message}`));
      } else {
        Logger.warn(`[trackStart] Channel ${textChannelId2} not found in cache`);
      }
    }
    // Pre-fetch next track — resolve in background, cache encoded
    Promise.resolve().then(async () => {
      try {
        const q = state.queues.get(player.guildId);
        if (!q?.length) return;
        const next = q[0];
        if (next?.encoded) return;
        if (!next?.info?.uri) return;
        const uri = next.info.uri;
        const isSpotify = /open\.spotify\.com/i.test(uri) || /^spotify:/.test(uri);
        const search = await player.search({ query: isSpotify ? `ytmsearch:${next.info.author || ""} ${next.info.title || ""}` : uri }, { id: "system" }).catch(() => null);
        if (search?.tracks?.[0]?.encoded) {
          next.encoded = search.tracks[0].encoded;
          
          applySpotifyMeta(search.tracks[0], saveSpotifyMeta(next));
        }
      } catch { Logger.warn("[trackStart] Track re-resolution failed"); }
    });
  });

  l.on("trackEnd", (player: any, _track: any, reason: any) => {
    const reasonStr = typeof reason === "object" ? reason?.reason : reason;
    const queueLen = state.queues.get(player.guildId)?.length || 0;
    Logger.info(`[trackEnd] guild=${player.guildId}/${getGuildName(player.guildId)} reason=${reasonStr} queue=${queueLen} playing=${player.playing} node=${player.node?.name || "?"} restored=${isRestoredGuild(player.guildId)}`);
  });

const queueEndGuard = new Set<string>();

  l.on("queueEnd", async (player: any, track: any, payload: any) => {
    if (queueEndGuard.has(player.guildId)) return;
    queueEndGuard.add(player.guildId);
    setTimeout(() => queueEndGuard.delete(player.guildId), 5000);
    try {
      if (!player.node?.connected) {
        Logger.info(`[queueEnd] guild=${player.guildId} node disconnected, skipping disconnect timer`);
        return;
      }

      const guildName = player.guildId ? getGuildName(player.guildId) : "?";
      const reason = typeof payload === "object" ? payload?.reason : payload;
      
      const manualMark = manualAdvances.get(player.guildId);
      if (manualMark && Date.now() - manualMark < MANUAL_ADVANCE_WINDOW_MS) {
        manualAdvances.delete(player.guildId);
        return;
      }
      manualAdvances.delete(player.guildId);

      const loopMode = state.loop.get(player.guildId);
      if (loopMode === "track" && track?.encoded) {
        state.nowPlaying.set(player.guildId, track);
        try {
          await player.play({ track, clientTrack: track });
          
          await saveState(player.guildId);
          Logger.info(`[queueEnd] guild=${player.guildId} track-loop: replaying "${track.info?.title || "?"}"`);
          return;
        } catch (err: any) {
          Logger.error(`[queueEnd] guild=${player.guildId} track-loop replay failed: ${err?.message} — falling back to queue`);
        }
      }

      const played = await advanceQueue(player);
      if (played) return;

      if (!player.playing && !player.paused) {
      try {
        if (state.autoplay.get(player.guildId)) {
          
          const autoplay = new AutoplayEngine();
          const autoTrack = await autoplay.getNextTrack(player, track, player.guildId);
          if (autoTrack) {
            state.nowPlaying.set(player.guildId, autoTrack);
            await player.play({ track: autoTrack, clientTrack: autoTrack }).catch((err: any) => Logger.warn(`[autoplay] Play failed: ${err.message}`));
            
            await saveState(player.guildId).catch(() => {});
            return;
          }
          Logger.warn(`[autoplay] No recommendations for guild=${player.guildId} track="${track?.info?.title?.slice(0,40) || "?"}" source=${track?.info?.sourceName || "?"} id=${track?.info?.identifier || "?"}`);
        }
      } catch { Logger.warn(`[queueEnd] Autoplay handler failed for ${player.guildId}`); }

      state.nowPlaying.delete(player.guildId);
      errorTimestamps.delete(player.guildId);
      retryTracks.delete(player.guildId);
      
      new RecommendationEngine().clearPlayed(player.guildId);
      const prevLyrics = lyricsMessages.get(player.guildId);
      if (prevLyrics && clientRef) {
        const ch = clientRef.channels.cache.get(prevLyrics.channelId);
        if (ch) {
          (ch as any).messages.fetch(prevLyrics.messageId).then((m: any) => m.delete().catch(() => {})).catch(() => {});
        }
      }
      lyricsMessages.delete(player.guildId);

      if (state.twentyFourSeven.isEnabled(player.guildId)) {
        return;
      }

      deleteState(player.guildId).catch(() => {});

      const voiceChannel = clientRef?.channels?.cache?.get(player.voiceChannelId);
      const members = voiceChannel?.members?.filter((m: any) => !m.user?.bot) || new Map();
      const humanCount = members.size;
      const timeout = 60000;
      const timeoutLabel = "60s";

      Logger.info(`[queueEnd] guild=${player.guildId}/${guildName} humans=${humanCount} total=${voiceChannel?.members?.size || 1} timeout=${timeoutLabel}`);

      
      stopPositionSync(player.guildId);

      const timerId = setTimeout(() => {
        // Check if the player is still the active one (not destroyed/recreated)
        const currentPlayer = lavalink.get()?.players?.get(player.guildId);
        if (currentPlayer && currentPlayer !== player) {
          // Player was recreated — don't touch the new session
          disconnectTimers.delete(player.guildId);
          return;
        }

        const textChannelId = getTextChannelId(player.guildId);
        if (textChannelId) {
          const channel = clientRef?.channels?.cache?.get(textChannelId);
          if (channel) {
            const embed = new EmbedBuilder()
              .setDescription(`Leaving voice channel due to inactivity.`)
              .setColor(Colors.ERROR);
            (channel as any).send({ embeds: [embed] }).catch(() => {});
          }
        }
        markIdleDisconnect(player.guildId);
        clearVoiceJoinTime(player.guildId);
        lavalink.clearTrackCache(player.guildId);
        
        deleteState(player.guildId).catch(() => {});
        player.disconnect();
        player.destroy();
        state.queues.clear(player.guildId);
        disconnectTimers.delete(player.guildId);
      }, timeout);

      disconnectTimers.set(player.guildId, timerId);
      } else {
      }
    } catch (err: any) {
      Logger.error(`[queueEnd] guild=${player.guildId} handler crashed: ${err?.message}`);
    }
  });

  l.on("trackError", async (player: any, track: any, payload: any) => {
    try {
      incTracksFailed();
      const errMsg = payload?.error || payload?.exception?.message || "Unknown";
      const trackId = track?.info?.uri || track?.info?.title || "unknown";
      const queueLen = state.queues.get(player.guildId)?.length || 0;
      Logger.error(`[trackError] guild=${player.guildId}/${getGuildName(player.guildId)} err="${errMsg}" track="${track?.info?.title || "?"}" queue=${queueLen} node=${player.node?.name || "?"} restored=${isRestoredGuild(player.guildId)}`);
      metrics.tracksFailed.inc({ guild: player.guildId, error_type: errMsg.substring(0, 50) });

      const now = Date.now();
      const guildErrors = errorTimestamps.get(player.guildId) || [];
      const recent = guildErrors.filter((t: any) => now - t < 15000);
      recent.push(now);
      errorTimestamps.set(player.guildId, recent);
      if (recent.length >= 5) {
        Logger.error(`[trackError] guild=${player.guildId} 5+ errors in 15s — stopping playback (queue=${queueLen} abandoned if not resumed)`);
        errorTimestamps.delete(player.guildId);
        retryTracks.delete(player.guildId);
        player.stopPlaying().catch(() => {});
        return;
      }

      const retried = retryTracks.get(player.guildId) || new Set<string>();
      const isFirstAttempt = !retried.has(trackId);
      const isDeezerError = /deezer/i.test(errMsg);
      const isNetworkError = /econnreset|enotfound|econnrefused|etimedout|timeout|aborted/i.test(errMsg);
      let alt: any = null;
      if (isDeezerError || isNetworkError) {
        retried.add(trackId);
        retryTracks.set(player.guildId, retried);
        Logger.info(`[trackError] ${isDeezerError ? "Deezer" : "Network"} error — skipping fallback search for "${track?.info?.title?.slice(0,30) || "?"}"`);
      } else if (isFirstAttempt) {
        retried.add(trackId);
        retryTracks.set(player.guildId, retried);

        const savedMeta = saveSpotifyMeta(track);
        const orig = state.nowPlaying.get(player.guildId);
        const title = orig?.info?.title || track?.info?.title || "";
        const author = orig?.info?.author || "";
        const q = author ? `${author} ${title}` : title;
        if (q) {
          for (const prefix of ["ytsearch", "ytmsearch", "scsearch"]) {
            try {
              const res = await player.search({ query: `${prefix}:${q}` }, clientRef?.user);
              const found = res?.tracks?.find((t: any) => t.encoded && t.encoded !== track?.encoded && t.info?.sourceName !== "deezer");
              if (found) {
                if (!found.info) found.info = {};
                found.info.source = track?.info?.source || (prefix === "scsearch" ? "soundcloud" : "youtube");
                found.info.originalUrl = found.info.uri;
                found.info.requester = track?.info?.requester;
                applySpotifyMeta(found, savedMeta);
                const altId = found.info?.uri || found.info?.title || "";
                if (altId) retried.add(altId);
                alt = found;
                Logger.info(`[trackError] Source fallback via ${prefix}: "${q}"`);
                break;
              }
            } catch { Logger.warn(`[trackError] Source search failed: ${prefix}:${q}`); }
          }
        }
      }

      await withQueueLock(player.guildId, async () => {
        if (alt) {
          await player.play({ track: alt, clientTrack: alt });
          return;
        }

        if (isFirstAttempt) {
          Logger.info(`[trackError] No fallback source, retrying original: ${track?.info?.title || "?"}`);
          try {
            await player.play({ track, clientTrack: track });
          } catch {
            player.stopPlaying().catch(() => {});
          }
          return;
        }

        retried.delete(trackId);
        const textChannelId = getTextChannelId(player.guildId);
        if (textChannelId) {
          const channel = clientRef?.channels?.cache?.get(textChannelId);
          if (channel) {
            const title = track?.info?.title || "Unknown";
            const author = track?.info?.author || "Unknown";
            const url = track?.info?.originalUrl || track?.info?.uri || "";
            const embed = new EmbedBuilder()
              .setDescription(`Error: [${author} - ${title}](${url}) — ${errMsg}\nSkipping to next track...`)
              .setColor(Colors.ERROR);
            (channel as any).send({ embeds: [embed] }).catch(() => {});
          }
        }

        if (player.node?.connected) {
          player.stopPlaying().catch(() => {});
        }
      });
    } catch (err: any) {
      Logger.error(`[trackError] guild=${player.guildId} handler crashed: ${err?.message}`);
    }
  });

  l.on("trackStuck", (player: any, track: any, payload: any) => {
    try {
      Logger.warn(`[trackStuck] guild=${player.guildId}/${getGuildName(player.guildId)} threshold=${payload?.thresholdMs || 0}ms restored=${isRestoredGuild(player.guildId)} track="${track?.info?.title || "?"}"`);
      if (player.node?.connected) {
        player.stopPlaying().catch(() => {});
      }
    } catch (err: any) {
      Logger.error(`[trackStuck] guild=${player.guildId} handler crashed: ${err?.message}`);
    }
  });

  l.on("playerDisconnect", async (player: any) => {
    try {
      const guildId = player.guildId;
      const is247 = state.twentyFourSeven.isEnabled(guildId);

      
      stopPositionSync(guildId);

      const prevLyrics = lyricsMessages.get(guildId);
      if (prevLyrics && clientRef) {
        const ch = clientRef.channels.cache.get(prevLyrics.channelId);
        if (ch) {
          (ch as any).messages.fetch(prevLyrics.messageId).then((m: any) => m.delete().catch(() => {})).catch(() => {});
        }
      }
      lyricsMessages.delete(guildId);
      retryTracks.delete(guildId);
      errorTimestamps.delete(guildId);

      if (!is247) {
        state.voiceChannels.delete(guildId);
        await destroyEngine(guildId).catch(() => {});
        
        deletePlayerData(guildId);
      }

      state.position.delete(guildId);
      state.nowPlaying.delete(guildId);
      state.queues.clear(guildId);
      state.loop.delete(guildId);
      lavalink.clearTrackCache(guildId);
      
      new RecommendationEngine().clearPlayed(guildId);
      const timer = disconnectTimers.get(guildId);
      if (timer) {
        clearTimeout(timer);
        disconnectTimers.delete(guildId);
      }

      if (is247) {
        const savedChannelId = state.twentyFourSeven.getChannelId(guildId);
        if (!savedChannelId) return;

        const guild = clientRef?.guilds?.cache?.get(guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(savedChannelId);
        if (!channel) {
          state.twentyFourSeven.delete(guildId);
          return;
        }

        const textChannels = guild.channels.cache.filter((ch: any) => ch.type === 0);
        const lastTextChannel = textChannels.first();
        if (lastTextChannel) {
          const prefix = (await getPrefix(guildId)) || botConfig.prefix;
          const embed = new EmbedBuilder()
            .setDescription(`🔴 **24/7 Mode Active**\n\nBot was disconnected from voice channel.\n24/7 mode is still active, bot will reconnect automatically.\n\nTo disable 24/7 mode:\n• Type: \`${prefix}247\`\n• Or: \`/247\``)
            .setColor(Colors.ERROR);
          lastTextChannel.send({ embeds: [embed] }).catch(() => {});
        }

        try {
          const l = lavalink.get();
          if (l) {
            const newPlayer = l.createPlayer({
              guildId,
              voiceChannelId: savedChannelId,
              selfDeaf: true,
              selfMute: false,
            });
            await newPlayer.connect();
          }
        } catch { Logger.warn(`[playerDisconnect] Reconnect failed for ${guildId}`); }
      }
    } catch (err: any) {
      Logger.error(`[playerDisconnect] guild=${player.guildId} handler crashed: ${err?.message}`);
    }
  });
}

export { register, clearDisconnectTimer, markManualAdvance, markTrackStartSuppressed };
