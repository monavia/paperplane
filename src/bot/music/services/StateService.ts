import Logger from "../../core/utils/Logger.js";
import PlayerState from "../../database/models/PlayerState.js";
import { getEngine, destroyEngine } from "./PlayerService.js";
import { getTextChannelId, setTextChannelId } from "./TextChannelStore.js";
import state from "../../core/state/StateManager.js";
import { withQueueLock } from "../../core/state/QueueLock.js";
import * as lavalink from "../engine/lavalink.js";
import { isUsingPrisma } from "../../database/connection.js";
import { getAutoplay, getLoop, getShuffle, get247, getLastFilter, getLastEqualizer } from "../../database/repositories/GuildRepository.js";
import { setFilter, setEqualizer } from "./PlayerService.js";
import * as EventBus from "../events/EventBus.js";
import { EmbedBuilder } from "discord.js";

let restoreRetryTimer: NodeJS.Timeout | null = null;
let uncachedRetries = 0;

export function isRestoredGuild(guildId: string): boolean {
  return state.restored.has(guildId);
}
export function addRestoredGuild(guildId: string): void {
  state.restored.add(guildId);
}
export function clearRestoredGuild(guildId: string): void {
  state.restored.delete(guildId);
}

// Hybrid helpers
let _prisma: any = null;
async function getPrisma() {
  if (!_prisma) _prisma = (await import("../../database/prisma.js")).default;
  return _prisma;
}

function usePg() { return isUsingPrisma(); }

async function upsertPlayerState(guildId: string, data: any) {
  if (usePg()) {
    const p = await getPrisma();
    return p.playerState.upsert({
      where: { guildId },
      update: data,
      create: { guildId, ...data },
    });
  }
  return PlayerState.findOneAndUpdate({ guildId }, data, { upsert: true });
}

async function deletePlayerState(guildId: string) {
  if (usePg()) {
    const p = await getPrisma();
    await p.playerState.delete({ where: { guildId } }).catch(Logger.safe("bot/music/services/StateService.ts"));
  } else {
    await PlayerState.deleteOne({ guildId }).catch(Logger.safe("bot/music/services/StateService.ts"));
  }
}

async function deleteOldPlayerStates(cutoff: Date) {
  if (usePg()) {
    const p = await getPrisma();
    await p.playerState.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  } else {
    await PlayerState.deleteMany({ updatedAt: { $lt: cutoff } }).catch(Logger.safe("bot/music/services/StateService.ts"));
  }
}

async function findRecentPlayerStates(cutoff: Date) {
  if (usePg()) {
    const p = await getPrisma();
    return p.playerState.findMany({ where: { updatedAt: { gte: cutoff } } });
  }
  return PlayerState.find({ updatedAt: { $gte: cutoff } });
}

async function updatePlayerState(guildId: string, data: any) {
  if (usePg()) {
    const p = await getPrisma();
    await p.playerState.updateMany({ where: { guildId }, data }).catch(Logger.safe("bot/music/services/StateService.ts"));
  } else {
    await PlayerState.updateOne({ guildId }, { $set: data }).catch(Logger.safe("bot/music/services/StateService.ts"));
  }
}

const positionSyncTimers = new Map<string, any>();

export function startPositionSync(guildId: string): void {
  if (positionSyncTimers.has(guildId)) return;
  const timer = setInterval(async () => {
    try {
      const engine = getEngine(guildId);
      const player = engine.player;
      if (!player?.playing) return;
      const pos = Math.max(state.position.get(guildId) || 0, player.position || 0, player.lastPosition || 0);
      await updatePlayerState(guildId, { position: pos, nodeId: player.node?.id || null, updatedAt: new Date() });
    } catch { Logger.warn(`[StateRestore] positionSync failed for ${guildId}`); }
  }, 1000);
  positionSyncTimers.set(guildId, timer);
}

export function stopPositionSync(guildId: string): void {
  const timer = positionSyncTimers.get(guildId);
  if (timer) {
    clearInterval(timer);
    positionSyncTimers.delete(guildId);
  }
}

async function saveState(guildId: string) {
  try {
    const engine = getEngine(guildId);
    const player = engine.player;
    if (!player) return;

    const voiceChannelId = player.voiceChannelId;
    if (!voiceChannelId) return;

    const nowPlaying = state.nowPlaying.get(guildId) || engine.getCurrentTrack();
    const queue = engine.queue.getAll();

    const textChannelId = getTextChannelId(guildId);
    const statePos = state.position.get(guildId) || 0;
    const playerPos = player.position || 0;
    const lastPos = player.lastPosition || 0;
    const pos = Math.max(statePos, playerPos, lastPos);

      Logger.info(`[StateSave] guild=${guildId} title="${(nowPlaying?.info?.title || "").slice(0,40)}" pos=${pos} statePos=${statePos} playerPos=${playerPos} lastPos=${lastPos} playing=${player.playing} region=${player.node?.options?.regions?.[0] || "?"}`);
      await upsertPlayerState(guildId, {
        voiceChannelId,
        textChannelId,
        queue: state.queues.get(guildId) || [],
        nowPlaying: state.nowPlaying.get(guildId) || engine.getCurrentTrack(),
        position: pos,
        nodeId: player.node?.id || null,
        updatedAt: new Date(),
      });
  } catch (err: any) {
    Logger.error(`Failed to save player state for ${guildId}:`, err.message);
  }
}

async function saveAllStates(): Promise<number> {
  const manager = lavalink.get();
  if (!manager?.players) return 0;
  let saved = 0;
  const guildIds = Array.from(manager.players.keys()) as string[];
  for (const guildId of guildIds) {
    stopPositionSync(guildId);
    try { await saveState(guildId); saved++; }
    catch (err: any) { Logger.error(`Failed to save state for guild ${guildId}:`, err.message); }
  }
  return saved;
}

async function deleteState(guildId: string) {
  stopPositionSync(guildId);
  await deletePlayerState(guildId);
  state.loop.delete(guildId);
  state.nowPlaying.delete(guildId);
  state.queues.clear(guildId);
}

function isLavalinkReady(): boolean {
  const manager = lavalink.get();
  if (!manager) return false;
  try {
    const nodes = manager.nodeManager?.nodes;
    if (!nodes || nodes.size === 0) return false;
    return Array.from(nodes.values()).some((n: any) => n.connected);
  } catch { return false; }
}

async function restoreGuildState(client: any, saved: any): Promise<boolean> {
  if (state.restored.has(saved.guildId)) return true;

  const guild = client.guilds.cache.get(saved.guildId);
  if (!guild) return false;

  const voiceChannel = guild.channels.cache.get(saved.voiceChannelId);
  if (!voiceChannel?.isVoiceBased()) return false;

  if (saved.textChannelId) setTextChannelId(saved.guildId, saved.textChannelId);

  const engine = getEngine(saved.guildId);
  state.autoplay.set(saved.guildId, await getAutoplay(saved.guildId));
  state.loop.set(saved.guildId, await getLoop(saved.guildId) as "off" | "track" | "playlist");
  state.shuffle.set(saved.guildId, await getShuffle(saved.guildId));
  state.twentyFourSeven.set(saved.guildId, await get247(saved.guildId), "");
  state.filter.set(saved.guildId, await getLastFilter(saved.guildId));
  state.equalizer.set(saved.guildId, await getLastEqualizer(saved.guildId));
  // Populate nowPlaying BEFORE engine.join so nodeConnect recovery can find it if join fails
  if (saved.nowPlaying) state.nowPlaying.set(saved.guildId, saved.nowPlaying);
  let player = await engine.join(saved.voiceChannelId, saved.textChannelId);
  if (!player) return false;

  // Wait for voice connection to establish (max 5s)
  let voiceRetries = 0;
  while (!player.connected && voiceRetries < 10) {
    await new Promise(r => setTimeout(r, 500));
    voiceRetries++;
  }
  if (!player.connected) {
    Logger.warn(`[StateRestore] Voice connection not ready for ${saved.guildId} after ${voiceRetries * 500}ms`);
  }

  // Ensure player is on a healthy node (failover support)
  const manager = lavalink.get();
  const allNodes = manager?.nodeManager?.nodes ? Array.from(manager.nodeManager.nodes.values()) : [];
  const healthyNodes = allNodes.filter((n: any) => n.connected);
  const playerNodeHealthy = player.node?.connected;

  if (!playerNodeHealthy && healthyNodes.length) {
    let target: any = saved.nodeId ? healthyNodes.find((n: any) => n.id === saved.nodeId) : null;
    if (!target) target = healthyNodes[0];

    try {
      await player.changeNode(target.id);
      Logger.info(`[StateRestore] Moved player ${saved.guildId} to healthy node ${target.id}`);
    } catch {
      Logger.warn(`[StateRestore] changeNode failed — recreating player on ${target.id}`);
      try {
        await player.destroy().catch(Logger.safe("bot/music/services/StateService.ts"));
        player = manager!.createPlayer({
          guildId: saved.guildId,
          voiceChannelId: saved.voiceChannelId,
          textChannelId: saved.textChannelId || "",
          selfDeaf: true,
          selfMute: false,
          node: target.id,
        });
        await lavalink.connectWithRetry(player, saved.guildId);
        engine.player = player;
        Logger.info(`[StateRestore] Recreated player ${saved.guildId} on ${target.id}`);
      } catch {
        return false;
      }
    }
  }

  const node = engine.player?.node;
  if (!node?.connected) return false;

  let resumedTrackActive = false;
  try {
    const remote = await node.fetchPlayer(saved.guildId);
    resumedTrackActive = remote?.track?.encoded != null;
  } catch { Logger.warn(`[StateRestore] fetchPlayer failed for ${saved.guildId}`); }

  if (resumedTrackActive) {
    if (saved.queue?.length) {
      for (const t of saved.queue) engine.queue.add(t);
    }
    Logger.info(`Resume active for ${saved.guildId}, restored ${engine.queue.size()} queued tracks`);
    state.nowPlaying.set(saved.guildId, player.queue.current || saved.nowPlaying);
    state.restored.add(saved.guildId);
    // Check if humans in VC, leave after 1m if autoplay ON and nobody
    if (state.autoplay.get(saved.guildId)) {
      const vc = guild.channels.cache.get(saved.voiceChannelId);
      const hasHumans = vc?.members?.some((m: any) => !m.user?.bot);
      if (!hasHumans) {
        Logger.info(`[StateRestore] No humans in VC (resumed) for ${saved.guildId} — will leave in 1m`);
          setTimeout(async () => {
            const stillHasHumans = guild.channels.cache.get(saved.voiceChannelId)?.members?.some((m: any) => !m.user?.bot);
            if (!stillHasHumans) {
              const tcId = getTextChannelId(saved.guildId);
              if (tcId) {
                const ch = client.channels.cache.get(tcId);
                if (ch) {
                  ch.send({ embeds: [new EmbedBuilder().setDescription("No one is in the voice channel. Leaving...").setColor(0xFF0000)] }).catch(Logger.safe("bot/music/services/StateService.ts"));
                }
              }
              destroyEngine(saved.guildId);
            }
          }, 60000);
      }
    }
    return true;
  }

  // Queue already restored to player.queue by MongoQueueStore via engine.join
  // BUT: engine.join() calls syncToPlayer() which may have overwritten player.queue with empty RAM state
  // Fix: restore from saved.state if player queue is still empty
  state.queues.syncFromPlayer(saved.guildId);
  if (!state.queues.get(saved.guildId)?.length && saved.queue?.length) {
    state.queues.set(saved.guildId, saved.queue);
  }

  let first: any = null;
  try {
    await withQueueLock(saved.guildId, async () => {
      first = state.nowPlaying.get(saved.guildId) || player.queue.current || engine.queue.next();
      if (!first) {
        Logger.warn(`[StateRestore] guild=${saved.guildId} no tracks to play — queue empty`);
        return;
      }

      // Pre-emptive search: stale encoded from previous Lavalink session causes trackError.
      // Resolve fresh track from metadata so the first play never fails.
      const trackTitle = first.info?.title || "";
      const trackAuthor = first.info?.author || "";
      if (trackTitle || trackAuthor) {
        const q = `${trackAuthor} ${trackTitle}`.trim();
        const search = await player.search({ query: `ytmsearch:${q}` }, { id: "system" }).catch(() => null);
        if (search?.tracks?.length) {
          const fresh = search.tracks[0];
          // Preserve original URI for display (e.g. Spotify URL)
          if (first.info?.uri && !/^spotify:/i.test(first.info.uri) && !/open\.spotify\.com/i.test(first.info.uri)) {
            fresh.info.uri = first.info.uri;
          }
          first = fresh;
          state.nowPlaying.set(saved.guildId, first);
        }
      }

      const pos = (saved.position || 0) > 0 && first?.info?.duration ? Math.min(saved.position, first.info.duration - 1000) : 0;
      const region = player.node?.options?.regions?.[0] || saved.nodeId || "?";
      Logger.info(`[StateRestore] guild=${saved.guildId} title="${(first?.info?.title || "").slice(0,40)}" restorePos=${saved.position} cappedPos=${pos} duration=${first?.info?.duration || 0} encoded=${!!first?.encoded} region=${region}`);
      state.restored.add(saved.guildId);
      try {
        await player.play({ track: first, clientTrack: first, position: pos });
        Logger.info(`[StateRestore] Play OK guild=${saved.guildId} pos=${pos} region=${region}`);
      } catch (err: any) {
        Logger.error(`[StateRestore] Play FAILED guild=${saved.guildId} pos=${pos} err="${err.message}"`);
        throw err;
      }
    });
    if (first) {
      // Apply saved filter/equalizer
      const savedFilter = state.filter.get(saved.guildId);
      if (savedFilter && savedFilter !== "none") {
        setFilter(saved.guildId, savedFilter, "system", "System").catch(Logger.safe("bot/music/services/StateService.ts"));
      }
      const savedBands = state.equalizer.get(saved.guildId);
      if (savedBands) {
        const presetName = typeof savedBands === "string" ? savedBands : null;
        const bands = presetName ? null : savedBands;
        if (bands) {
          setEqualizer(saved.guildId, bands, "system", "System").catch(Logger.safe("bot/music/services/StateService.ts"));
        }
      }
      // Autoplay restore: check if humans in VC, leave after 1m if nobody
      if (state.autoplay.get(saved.guildId)) {
        const vc = guild.channels.cache.get(saved.voiceChannelId);
        const hasHumans = vc?.members?.some((m: any) => !m.user?.bot);
        if (!hasHumans) {
          Logger.info(`[StateRestore] No humans in VC for ${saved.guildId} — will leave in 1m`);
          setTimeout(async () => {
            const stillHasHumans = guild.channels.cache.get(saved.voiceChannelId)?.members?.some((m: any) => !m.user?.bot);
            if (!stillHasHumans) {
              destroyEngine(saved.guildId);
            }
          }, 60000);
        }
      }
      Logger.info(`Restored playback for ${saved.guildId}`);
      return true;
    }
  } catch (err: any) {
    Logger.error(`Restore playback failed for ${saved.guildId}:`, err.message);
  }
  return false;
}

async function restoreAllStates(client: any, retryCount = 0) {
  const MAX_RETRIES = 10;
  const RETRY_DELAY = 3000;

  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

    const states = await findRecentPlayerStates(tenMinAgo);
    if (!states.length) {
      // No recent states — clean up old ones
      await deleteOldPlayerStates(tenMinAgo);
      return;
    }

    if (!isLavalinkReady()) {
      if (retryCount < MAX_RETRIES) {
        Logger.warn(`[StateRestore] Lavalink not ready, retry ${retryCount + 1}/${MAX_RETRIES} in ${RETRY_DELAY}ms...`);
        restoreRetryTimer = setTimeout(() => { restoreAllStates(client, retryCount + 1); }, RETRY_DELAY);
      } else {
        Logger.error(`[StateRestore] Lavalink still not ready after ${MAX_RETRIES} retries, giving up`);
        // Populate state.nowPlaying from saved states so nodeConnect recovery can find them
        for (const saved of states) {
          if (saved.nowPlaying) state.nowPlaying.set(saved.guildId, saved.nowPlaying);
        }
      }
      return;
    }

    if (restoreRetryTimer) { clearTimeout(restoreRetryTimer); restoreRetryTimer = null; }

    Logger.info(`[StateRestore] Restoring ${states.length} player state(s)...`);

    let restored = 0;
    const uncachedGuilds: any[] = [];

    for (const saved of states) {
      try {
        const success = await restoreGuildState(client, saved);
        if (success) { restored++; }
        else {
          const guild = client.guilds.cache.get(saved.guildId);
          if (!guild) { uncachedGuilds.push(saved); }
          else { await deletePlayerState(saved.guildId); }
        }
      } catch (err: any) {
        Logger.error(`[StateRestore] Failed for guild ${saved.guildId}:`, err.message);
      }
    }

    Logger.info(`[StateRestore] Restored ${restored}/${states.length} player(s) from saved state`);

    // Clean up old states AFTER successful restore
    await deleteOldPlayerStates(tenMinAgo);

    if (uncachedGuilds.length) {
      Logger.info(`[StateRestore] ${uncachedGuilds.length} guild(s) not yet cached — scheduling retry in 12s`);
      if (uncachedRetries < 3) {
        uncachedRetries++;
        setTimeout(async () => {
          try {
            for (const saved of uncachedGuilds) {
              try {
                const ok = await restoreGuildState(client, saved);
                if (ok) Logger.info(`[StateRestore] Deferred restore succeeded for ${saved.guildId}`);
                else {
                  const guild = client.guilds.cache.get(saved.guildId);
                  if (!guild) { }
                  else await deletePlayerState(saved.guildId);
                }
              } catch (err: any) { Logger.error(`[StateRestore] Deferred restore failed for ${saved.guildId}:`, err.message); }
            }
          } finally { uncachedRetries = 0; }
        }, 12000);
      } else {
        Logger.warn(`[StateRestore] ${uncachedGuilds.length} guild(s) still uncached after ${uncachedRetries} retries — giving up`);
        for (const saved of uncachedGuilds) {
          const guild = client.guilds.cache.get(saved.guildId);
          if (!guild) { await deletePlayerState(saved.guildId); }
        }
        uncachedRetries = 0;
      }
    }
  } catch (err: any) {
    Logger.error("Failed to restore player states:", err.message);
  }
}

EventBus.on('state:save', (p: any) => { if (p?.guildId) saveState(p.guildId).catch(Logger.safe("bot/music/services/StateService.ts")); });
EventBus.on('state:startPositionSync', (p: any) => { if (p?.guildId) startPositionSync(p.guildId); });
EventBus.on('state:stopPositionSync', (p: any) => { if (p?.guildId) stopPositionSync(p.guildId); });
EventBus.on('state:delete', (p: any) => { if (p?.guildId) deleteState(p.guildId).catch(Logger.safe("bot/music/services/StateService.ts")); });
EventBus.on('state:clearRestored', (p: any) => { if (p?.guildId) clearRestoredGuild(p.guildId); });
EventBus.on('state:addRestored', (p: any) => { if (p?.guildId) addRestoredGuild(p.guildId); });

export { saveState, saveAllStates, deleteState, restoreAllStates, restoreGuildState };
