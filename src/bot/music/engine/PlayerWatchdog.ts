import Logger from "../../core/utils/Logger";

const STUCK_TIMEOUT_MS = 15000;
const CHECK_INTERVAL_MS = 30000;
const MAX_STUCK = 3;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BACKOFF_MS = 5000;

const stuckCounts = new Map<string, number>();
const reconnectAttempts = new Map<string, number>();

function startWatchdog(manager: any, clientRef: any): void {
  if (!manager) return;

  setInterval(async () => {
    const players = manager.players;
    if (!players?.size) return;

    for (const [guildId, player] of players) {
      try {
        await checkPlayer(guildId, player, clientRef);
      } catch {}
    }
  }, CHECK_INTERVAL_MS);

  Logger.info("[Watchdog] Player watchdog started (30s interval)");
}

async function checkPlayer(guildId: string, player: any, clientRef: any): Promise<void> {
  const current = player.queue?.current;
  const node = player.node;

  const guild = clientRef?.guilds?.cache?.get(guildId);
  if (!guild) {
    Logger.info(`[Watchdog] Guild ${guildId} not found, destroying player`);
    await player.destroy().catch(() => {});
    return;
  }

  if (player.voiceChannelId) {
    const vc = guild.channels.cache.get(player.voiceChannelId);
    if (!vc || !vc.isVoiceBased()) {
      Logger.info(`[Watchdog] Voice channel ${player.voiceChannelId} gone for guild ${guildId}, destroying player`);
      await player.destroy().catch(() => {});
      return;
    }
  }

  // Internet glitch recovery — node disconnected
  if (node && !node.connected) {
    Logger.warn(`[Watchdog] Node ${node.id} disconnected for guild ${guildId} — triggering failover`);
    const { failoverFromNode } = require("./lavalink");
    await failoverFromNode(node.id).catch(() => {});
    return;
  }

  // Voice disconnected — try reconnect with backoff
  if (player.voiceChannelId && !player.connected) {
    // Check node health first
    if (node && !node.connected) {
      Logger.warn(`[Watchdog] Node ${node.id} not connected, skipping voice reconnect for ${guildId}`);
      return;
    }

    const attempts = (reconnectAttempts.get(guildId) || 0) + 1;
    reconnectAttempts.set(guildId, attempts);

    if (attempts > MAX_RECONNECT_ATTEMPTS) {
      Logger.error(`[Watchdog] Player ${guildId} failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts — destroying player`);
      reconnectAttempts.delete(guildId);
      await player.destroy().catch(() => {});
      return;
    }

    const backoff = RECONNECT_BACKOFF_MS * attempts;
    Logger.info(`[Watchdog] Player ${guildId} disconnected, attempting reconnect (${attempts}/${MAX_RECONNECT_ATTEMPTS}) after ${backoff}ms`);
    
    await new Promise(r => setTimeout(r, backoff));
    
    try { 
      await player.connect(); 
      reconnectAttempts.delete(guildId); // success - reset counter
    } catch (err: any) {
      Logger.error(`[Watchdog] Player ${guildId} reconnect failed (attempt ${attempts}): ${err.message}`);
    }
    return;
  }

  // Check for server-side player loss
  if (player.playing && node?.fetchPlayer) {
    try {
      const remote = await node.fetchPlayer(guildId);
      if (!remote || !remote.track?.encoded) {
        Logger.warn(`[Watchdog] Player ${guildId} silent voice loss — reconnecting voice`);
        try {
          await player.connect();
          await new Promise(r => setTimeout(r, 500));
          if (current?.encoded) await player.play({ track: current, clientTrack: current, position: player.position || 0 });
          else { await player.stopPlaying().catch(() => {}); }
        } catch {
          await player.stopPlaying().catch(() => {});
        }
        return;
      }
    } catch {}
  }

  // Stuck detection
  if (player.playing && current && !player.paused) {
    const lastChange = player.lastPositionChange || 0;
    const now = Date.now();

    if (lastChange > 0 && now - lastChange > STUCK_TIMEOUT_MS) {
      const count = (stuckCounts.get(guildId) || 0) + 1;
      stuckCounts.set(guildId, count);
      const title = current.info?.title || "unknown";

      if (count >= MAX_STUCK && node?.id) {
        Logger.warn(`[Watchdog] Player ${guildId} stuck ${count}x — triggering failover from ${node.id}`);
        const { failoverFromNode } = require("./lavalink");
        await failoverFromNode(node.id).catch(() => {});
        stuckCounts.delete(guildId);
      } else {
        Logger.warn(`[Watchdog] Player ${guildId} stuck on "${title}" (${count}/${MAX_STUCK}) — stopping`);
        await player.stopPlaying().catch(() => {});
      }
    } else if (lastChange > 0) {
      stuckCounts.delete(guildId);
    }
  }
}

export { startWatchdog };
