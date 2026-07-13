import Logger from "../../core/utils/Logger";

const STUCK_TIMEOUT_MS = 15000;
const CHECK_INTERVAL_MS = 30000;

function startWatchdog(manager: any, clientRef: any): void {
  if (!manager) return;

  setInterval(async () => {
    const players = manager.players;
    if (!players?.size) return;

    for (const [guildId, player] of players) {
      try {
        await checkPlayer(guildId, player, clientRef);
      } catch (err: any) {
      }
    }
  }, CHECK_INTERVAL_MS);

  Logger.info("[Watchdog] Player watchdog started (30s interval)");
}

async function checkPlayer(guildId: string, player: any, clientRef: any): Promise<void> {
  const current = player.queue?.current;

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

  if (player.voiceChannelId && !player.connected) {
    Logger.info(`[Watchdog] Player ${guildId} disconnected, attempting reconnect`);
    try {
      await player.connect();
    } catch (err: any) {
      Logger.warn(`[Watchdog] Reconnect failed for ${guildId}: ${err.message}`);
    }
    return;
  }

  if (player.playing && player.node?.fetchPlayer) {
    try {
      const remote = await player.node.fetchPlayer(guildId);
      if (!remote || !remote.track?.encoded) {
        Logger.warn(`[Watchdog] Player ${guildId} silent voice loss (server player=${!!remote}, track=${!!remote?.track?.encoded}) — advancing`);
        await player.stopPlaying().catch(() => {});
        return;
      }
    } catch (err: any) {
    }
  }

  if (player.playing && current && !player.paused) {
    const position = player.lastPosition || 0;
    const lastChange = player.lastPositionChange || 0;
    const now = Date.now();

    if (lastChange > 0 && now - lastChange > STUCK_TIMEOUT_MS) {
      const title = current.info?.title || "unknown";
      Logger.warn(`[Watchdog] Player ${guildId} stuck on "${title}" (position ${Math.round(position / 1000)}s, no update for ${Math.round((now - lastChange) / 1000)}s)`);
      await player.stopPlaying().catch(() => {});
      Logger.info(`[Watchdog] Stopped stuck player for ${guildId} (queueEnd will advance)`);
    }
  }
}

export { startWatchdog };
