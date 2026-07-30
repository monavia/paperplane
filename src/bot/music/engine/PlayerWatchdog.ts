import Logger from "../../core/utils/Logger.js";
import { destroyEngine } from "../services/PlayerService.js";
import { failoverFromNode, connectWithRetry } from "./lavalink.js";
import { markTrackStartSuppressed, advanceQueue } from "./musicEvents.js";
import state from "../../core/state/StateManager.js";
import * as EventBus from "../events/EventBus.js";
import AutoplayEngine from "./AutoplayEngine.js";

const autoplayInst = new AutoplayEngine();

const STUCK_TIMEOUT_MS = 15000;
const CHECK_INTERVAL_MS = 30000;
const MAX_STUCK = 3;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BACKOFF_MS = 5000;
const POSITION_FREEZE_MS = 30000;

const stuckCounts = new Map<string, number>();
const reconnectAttempts = new Map<string, number>();
const skipAttempted = new Set<string>();
const lastPositions = new Map<string, number>();
const positionFreezeTimestamps = new Map<string, number>();
let totalErrors = 0;
let managerRef: any = null;

export interface WatchdogStats {
  totalPlayers: number;
  activePlayers: number;
  stuckCounts: Record<string, number>;
  reconnectAttempts: Record<string, number>;
  totalErrors: number;
}

function startWatchdog(manager: any, clientRef: any): void {
  if (!manager) return;
  managerRef = manager;

  setInterval(async () => {
    const players = manager.players;
    if (!players?.size) {
      emitMetrics(manager);
      return;
    }

    const checks: Promise<void>[] = [];
    for (const [guildId, player] of players) {
      checks.push(
        checkPlayer(guildId, player, clientRef).catch((err: any) => {
          totalErrors++;
          Logger.safe("bot/music/engine/PlayerWatchdog.ts")(err);
        }),
      );
    }
    await Promise.allSettled(checks);

    await checkNodes(manager).catch((err: any) => {
      totalErrors++;
      Logger.safe("bot/music/engine/PlayerWatchdog.ts")(err);
    });

    emitMetrics(manager);
  }, CHECK_INTERVAL_MS);

  Logger.info("[Watchdog] Player watchdog started (30s interval)");
}

async function checkPlayer(guildId: string, player: any, clientRef: any): Promise<void> {
  const current = player.queue?.current;
  const node = player.node;

  const guild = clientRef?.guilds?.cache?.get(guildId);
  if (!guild) {
    Logger.info(`[Watchdog] Guild ${guildId} not found, destroying player`);
    await destroyEngine(guildId).catch(Logger.safe("bot/music/engine/PlayerWatchdog.ts"));
    stuckCounts.delete(guildId);
    reconnectAttempts.delete(guildId);
    skipAttempted.delete(guildId);
    return;
  }

  if (player.voiceChannelId) {
    const vc = guild.channels.cache.get(player.voiceChannelId);
    if (!vc || !vc.isVoiceBased()) {
      Logger.info(`[Watchdog] Voice channel ${player.voiceChannelId} gone for guild ${guildId}, destroying player`);
      await destroyEngine(guildId).catch(Logger.safe("bot/music/engine/PlayerWatchdog.ts"));
      stuckCounts.delete(guildId);
      reconnectAttempts.delete(guildId);
      skipAttempted.delete(guildId);
      return;
    }
  }

  // Voice disconnected — try reconnect with backoff
  if (player.voiceChannelId && !player.connected) {
    if (node && !node.connected) {
      Logger.warn(`[Watchdog] Node ${node.id} not connected, skipping voice reconnect for ${guildId}`);
      return;
    }

    const attempts = (reconnectAttempts.get(guildId) || 0) + 1;
    reconnectAttempts.set(guildId, attempts);

    if (attempts > MAX_RECONNECT_ATTEMPTS) {
      Logger.error(`[Watchdog] Player ${guildId} failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts — destroying player`);
      reconnectAttempts.delete(guildId);
      stuckCounts.delete(guildId);
      skipAttempted.delete(guildId);
      await destroyEngine(guildId).catch(Logger.safe("bot/music/engine/PlayerWatchdog.ts"));
      return;
    }

    const backoff = RECONNECT_BACKOFF_MS * attempts;
    Logger.info(`[Watchdog] Player ${guildId} disconnected, attempting reconnect (${attempts}/${MAX_RECONNECT_ATTEMPTS}) after ${backoff}ms`);

    new Promise(r => setTimeout(r, backoff))
      .then(() => player.connect())
      .then(() => { reconnectAttempts.delete(guildId); })
      .catch((err: any) => {
        Logger.error(`[Watchdog] Player ${guildId} reconnect failed (attempt ${attempts}): ${err.message}`);
        totalErrors++;
      });
    return;
  }

  // Check for server-side player loss
  if (player.playing && node?.fetchPlayer) {
    try {
      const remote = await node.fetchPlayer(guildId);
      if (!remote || !remote.track?.encoded) {
        const q = state.queues.get(guildId);
        if (q?.length) {
          Logger.info(`[Watchdog] Player ${guildId} silent — queue has ${q.length} tracks, advancing queue`);
          try { await advanceQueue(player); } catch { player.stopPlaying().catch(Logger.safe("bot/music/engine/PlayerWatchdog.ts")); }
          return;
        }
        Logger.warn(`[Watchdog] Player ${guildId} silent voice loss — reconnecting voice`);
        try {
          await connectWithRetry(player, guildId);
          await new Promise(r => setTimeout(r, 500));
          if (current?.encoded) {
            markTrackStartSuppressed(guildId);
            await player.play({ track: current, clientTrack: current, position: player.position || 0 });
          }
          else { await player.stopPlaying().catch(Logger.safe("bot/music/engine/PlayerWatchdog.ts")); }
        } catch {
          await player.stopPlaying().catch(Logger.safe("bot/music/engine/PlayerWatchdog.ts"));
        }
        return;
      }
    } catch { Logger.warn(`[Watchdog] fetchPlayer failed for ${guildId}`); }
  }

  // Stuck + position freeze detection
  if (player.playing && current && !player.paused) {
    const lastChange = player.lastPositionChange || 0;
    const now = Date.now();
    let stuck = false;

    // Existing lastPositionChange-based stuck check (15s)
    if (lastChange > 0 && now - lastChange > STUCK_TIMEOUT_MS) {
      stuck = true;
    }

    // Position freeze detection (30s of unchanged position)
    if (!stuck) {
      const pos = player.position || 0;
      const lastPos = lastPositions.get(guildId);
      if (lastPos !== undefined && pos > 0 && pos === lastPos) {
        const freezeStart = positionFreezeTimestamps.get(guildId) || now;
        if (now - freezeStart >= POSITION_FREEZE_MS) {
          stuck = true;
        }
      } else {
        lastPositions.set(guildId, pos);
        positionFreezeTimestamps.set(guildId, now);
      }
    }

    if (stuck) {
      const count = (stuckCounts.get(guildId) || 0) + 1;
      stuckCounts.set(guildId, count);
      const title = current.info?.title || "unknown";

      if (count >= MAX_STUCK) {
        if (skipAttempted.has(guildId)) {
          Logger.warn(`[Watchdog] Player ${guildId} stuck ${count}x — triggering failover from ${node?.id || "?"}`);
          if (node?.id) {
            await failoverFromNode(node.id).catch((err: any) => { totalErrors++; Logger.safe("bot/music/engine/PlayerWatchdog.ts")(err); });
          }
          stuckCounts.delete(guildId);
          skipAttempted.delete(guildId);
        } else {
          Logger.warn(`[Watchdog] Player ${guildId} stuck ${count}x (max) — skipping before failover`);
          await player.stopPlaying().catch((err: any) => { totalErrors++; Logger.safe("bot/music/engine/PlayerWatchdog.ts")(err); });
          skipAttempted.add(guildId);
        }
      } else {
        Logger.warn(`[Watchdog] Player ${guildId} stuck on "${title}" (${count}/${MAX_STUCK}) — stopping`);
        await player.stopPlaying().catch((err: any) => { totalErrors++; Logger.safe("bot/music/engine/PlayerWatchdog.ts")(err); });
        if (count >= Math.floor(MAX_STUCK / 2)) {
          skipAttempted.add(guildId);
        }
      }
    } else if (lastChange > 0) {
      stuckCounts.delete(guildId);
      skipAttempted.delete(guildId);
    }
  }

  // Idle player with pending tracks — advance queue
  if (!player.playing && !player.paused) {
    const qLen = state.queues.get(guildId)?.length || 0;
    if (qLen > 0 || state.autoplay.get(guildId)) {
      if (player.node?.connected) {
        Logger.info(`[Watchdog] Player ${guildId} idle with ${qLen} queued — advancing`);
        try {
          const played = await advanceQueue(player);
          if (!played && state.autoplay.get(guildId)) {
            const source = state.nowPlaying.get(guildId) || player.queue.previous?.[0];
            if (source?.info) {
              const auto = await autoplayInst.getNextTrack(player, source, guildId);
              if (auto) { state.nowPlaying.set(guildId, auto); await player.play({ track: auto, clientTrack: auto }); return; }
            }
          }
          if (!played) { player.stopPlaying().catch(Logger.safe("bot/music/engine/PlayerWatchdog.ts")); }
        } catch { player.stopPlaying().catch(Logger.safe("bot/music/engine/PlayerWatchdog.ts")); }
      } else {
        Logger.info(`[Watchdog] Player ${guildId} idle — node disconnected, recovering`);
        try {
          await connectWithRetry(player, guildId);
          await new Promise(r => setTimeout(r, 2000));
          if (player.node?.connected) {
            const played = await advanceQueue(player);
            if (!played && state.autoplay.get(guildId)) {
              const source = state.nowPlaying.get(guildId) || player.queue.previous?.[0];
              if (source?.info) {
                const auto = await autoplayInst.getNextTrack(player, source, guildId);
                if (auto) { state.nowPlaying.set(guildId, auto); await player.play({ track: auto, clientTrack: auto }); return; }
              }
            }
            if (!played) { player.stopPlaying().catch(Logger.safe("bot/music/engine/PlayerWatchdog.ts")); }
          } else {
            Logger.warn(`[Watchdog] Player ${guildId} still has no connected node`);
          }
        } catch {
          Logger.warn(`[Watchdog] Player ${guildId} recover failed — leaving for next cycle`);
        }
      }
    }
  }
}

async function checkNodes(manager: any): Promise<void> {
  const nodes = manager?.nodeManager?.nodes;
  if (!nodes) return;

  for (const [nodeId, node] of nodes) {
    if (node.connected) {
      Logger.info(`[Watchdog] Node ${nodeId}: connected`);
    } else {
      Logger.warn(`[Watchdog] Node ${nodeId}: disconnected`);
      if (node.connect) {
        Logger.info(`[Watchdog] Reconnecting node ${nodeId}...`);
        try {
          await node.connect();
          Logger.info(`[Watchdog] Node ${nodeId} reconnected`);
        } catch (err: any) {
          Logger.error(`[Watchdog] Node ${nodeId} reconnect failed: ${err?.message || err}`);
          totalErrors++;
        }
      }
    }
  }
}

function emitMetrics(manager: any): void {
  const stats = buildStats(manager);
  EventBus.emit("metrics:watchdog", stats);
  Logger.info(
    `[Watchdog] Health summary: ${stats.totalPlayers} players, ${stats.activePlayers} active, ` +
    `${Object.keys(stats.stuckCounts).length} stuck, ${Object.keys(stats.reconnectAttempts).length} reconnecting, ${stats.totalErrors} errors`,
  );
}

function buildStats(manager: any): WatchdogStats {
  let activePlayers = 0;
  if (manager?.players) {
    for (const [, p] of manager.players) {
      if (p.playing) activePlayers++;
    }
  }
  return {
    totalPlayers: manager?.players?.size || 0,
    activePlayers,
    stuckCounts: Object.fromEntries(stuckCounts),
    reconnectAttempts: Object.fromEntries(reconnectAttempts),
    totalErrors,
  };
}

export function getWatchdogStats(): WatchdogStats {
  return buildStats(managerRef);
}

export { startWatchdog };
