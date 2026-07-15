import Logger from "../../core/utils/Logger";
import PlayerState from "../../database/models/PlayerState";
import { getEngine, destroyEngine } from "./PlayerService";
import { getTextChannelId, setTextChannelId } from "./TextChannelStore";
import state from "../../core/state/StateManager";
import { withQueueLock } from "../../core/state/QueueLock";
import * as lavalink from "../engine/lavalink";
import { isUsingPrisma } from "../../database/connection";

const restoredGuilds = new Set<string>();
let restoreRetryTimer: NodeJS.Timeout | null = null;
let uncachedRetries = 0;

export function isRestoredGuild(guildId: string): boolean {
  return restoredGuilds.has(guildId);
}
export function clearRestoredGuild(guildId: string): void {
  restoredGuilds.delete(guildId);
}

// Hybrid helpers
let _prisma: any = null;
async function getPrisma() {
  if (!_prisma) _prisma = (await import("../../database/prisma")).default;
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
    await p.playerState.delete({ where: { guildId } }).catch(() => {});
  } else {
    await PlayerState.deleteOne({ guildId }).catch(() => {});
  }
}

async function deleteOldPlayerStates(cutoff: Date) {
  if (usePg()) {
    const p = await getPrisma();
    await p.playerState.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  } else {
    await PlayerState.deleteMany({ updatedAt: { $lt: cutoff } }).catch(() => {});
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
    await p.playerState.updateMany({ where: { guildId }, data }).catch(() => {});
  } else {
    await PlayerState.updateOne({ guildId }, { $set: data }).catch(() => {});
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
      await updatePlayerState(guildId, { position: player.position || 0, nodeId: player.node?.id || null, updatedAt: new Date() });
    } catch {}
  }, 5000);
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

      await upsertPlayerState(guildId, {
        voiceChannelId,
        textChannelId,
        queue: queue.map((t: any) => JSON.parse(JSON.stringify(t))),
        nowPlaying: nowPlaying ? JSON.parse(JSON.stringify(nowPlaying)) : null,
        position: player.position || 0,
        nodeId: player.node?.id || null,
        updatedAt: new Date(),
      });
  } catch (err: any) {
    Logger.error(`Failed to save player state for ${guildId}:`, err.message);
  }
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

async function saveAllStates(): Promise<number> {
  const manager = lavalink.get();
  if (!manager?.players) return 0;
  let saved = 0;
  const guildIds = Array.from(manager.players.keys()) as string[];
  for (const guildId of guildIds) {
    try { await saveState(guildId); saved++; }
    catch (err: any) { Logger.error(`Failed to save state for guild ${guildId}:`, err.message); }
  }
  return saved;
}

async function restoreGuildState(client: any, saved: any): Promise<boolean> {
  if (restoredGuilds.has(saved.guildId)) return true;

  const guild = client.guilds.cache.get(saved.guildId);
  if (!guild) return false;

  const voiceChannel = guild.channels.cache.get(saved.voiceChannelId);
  if (!voiceChannel?.isVoiceBased()) return false;

  if (saved.textChannelId) setTextChannelId(saved.guildId, saved.textChannelId);

  const engine = getEngine(saved.guildId);
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
  const lavalink = require("../engine/lavalink");
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
        await player.destroy().catch(() => {});
        player = manager.createPlayer({
          guildId: saved.guildId,
          voiceChannelId: saved.voiceChannelId,
          textChannelId: saved.textChannelId || "",
          selfDeaf: true,
          selfMute: false,
          node: target.id,
        });
        await player.connect();
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
  } catch {}

  if (resumedTrackActive) {
    if (saved.queue?.length) {
      for (const t of saved.queue) engine.queue.add(t);
    }
    Logger.info(`Resume active for ${saved.guildId}, restored ${engine.queue.size()} queued tracks`);
    state.nowPlaying.set(saved.guildId, player.queue.current || saved.nowPlaying);
    restoredGuilds.add(saved.guildId);
    return true;
  }

  const tracks = [];
  if (saved.nowPlaying) tracks.push(saved.nowPlaying);
  if (saved.queue?.length) tracks.push(...saved.queue);

  for (const track of tracks) engine.queue.add(track);

  let first: any = null;
  try {
    await withQueueLock(saved.guildId, async () => {
      first = engine.queue.next();
      if (!first) return;
      state.nowPlaying.set(saved.guildId, first);
      const pos = (saved.position || 0) > 0 && first?.info?.duration ? Math.min(saved.position, first.info.duration - 1000) : 0;
      await player.play({ track: first, clientTrack: first, position: pos });
    });
    if (first) {
      restoredGuilds.add(saved.guildId);
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

export { saveState, saveAllStates, deleteState, restoreAllStates, restoreGuildState };
