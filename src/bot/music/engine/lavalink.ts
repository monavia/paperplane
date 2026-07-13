import { LavalinkManager } from "lavalink-client";
import Logger from "../../core/utils/Logger";

let lavalink: LavalinkManager | null = null;
let clientRef: any = null;
const lastReconnectAttempt = new Map<string, number>();

export async function init(client: any): Promise<boolean> {
  clientRef = client;

  const nodes: any[] = [];
  for (let i = 1; i <= 20; i++) {
    const host = process.env[`LAVALINK_HOST${i > 1 ? `_${i}` : ""}`];
    if (!host) break;
    nodes.push({
      id: `node${i}`,
      host,
      port: parseInt(process.env[`LAVALINK_PORT${i > 1 ? `_${i}` : ""}`] || "2333"),
      authorization: process.env[`LAVALINK_PASSWORD${i > 1 ? `_${i}` : ""}`] || "youshallnotpass",
      secure: process.env[`LAVALINK_SECURE${i > 1 ? `_${i}` : ""}`] === "true",
      region: process.env[`LAVALINK_REGION${i > 1 ? `_${i}` : ""}`] || "asia",
      closeOnError: false,
    });
  }

  if (!nodes.length) {
    Logger.error("[Lavalink] No nodes configured");
    return false;
  }

  lavalink = new LavalinkManager({
    nodes,
    sendToShard: (guildId, payload) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild) guild.shard.send(payload);
    },
    autoSkip: true,
    client: { id: client.user?.id || "" },
  });

  const l: any = lavalink;

  l.on("nodeError", (node: any, err: any) => {
    Logger.warn(`[Lavalink] Node ${node.id} error: ${err?.message || err}`);
  });

  l.on("nodeDisconnect", async (node: any) => {
    Logger.warn(`[Lavalink] Node ${node.id} disconnected — failing over players`);
    if (!lavalink?.nodeManager) return;
    const nodes = Array.from(lavalink.nodeManager.nodes.values());
    const healthy = nodes.filter((n: any) => n.connected && n.id !== node.id);
    const self = nodes.find((n: any) => n.id === node.id);
    const state = require("../../core/state/StateManager");
    const { getTextChannelId } = require("../services/TextChannelStore");

    // If no healthy nodes, try reconnecting this node (once per 5 min)
    if (!healthy.length && self?.connect) {
      const last = lastReconnectAttempt.get(node.id) || 0;
      if (Date.now() - last >= 60000) {
        lastReconnectAttempt.set(node.id, Date.now());
        Logger.info(`[Lavalink] No healthy nodes, reconnecting ${node.id}...`);
        try { self.connect(); } catch (err: any) {
          Logger.error(`[Lavalink] Reconnect failed for ${node.id}: ${err.message}`);
        }
      }
    }

    for (const [guildId, player] of lavalink.players) {
      if (player.node?.id !== node.id) continue;
      if (!healthy.length) continue;
      const target = healthy[0];
      const nowPlaying = state.nowPlaying.get(guildId);

      try {
        await player.changeNode(target.id);
        Logger.info(`[Lavalink] Moved player ${guildId} to ${target.id}`);
      } catch (err1: any) {
        Logger.warn(`[Lavalink] changeNode failed for ${guildId}: ${err1.message} — recreating player`);
        try {
          await player.destroy().catch(() => {});
          const vcId = player.voiceChannelId;
          if (!vcId) continue;
          const newPlayer = lavalink.createPlayer({
            guildId,
            voiceChannelId: vcId,
            textChannelId: getTextChannelId(guildId) || "",
            selfDeaf: true,
            selfMute: false,
            node: target.id,
          });
          await newPlayer.connect();
          if (nowPlaying?.encoded) {
            state.nowPlaying.set(guildId, nowPlaying);
            await newPlayer.play({ track: nowPlaying, clientTrack: nowPlaying });
          }
          Logger.info(`[Lavalink] Recreated player ${guildId} on ${target.id}`);
        } catch (err2: any) {
          Logger.error(`[Lavalink] Full failover failed for ${guildId}: ${err2.message}`);
        }
      }
    }
  });

  l.on("nodeReconnect", (node: any) => {
    Logger.info(`[Lavalink] Node ${node.id} reconnecting`);
  });

  l.on("trackStart", () => {});
  l.on("queueEnd", () => {});

  await l.init({ id: client.user?.id || "" }).catch(() => {});
  Logger.info("[Lavalink] Connected");

  // Periodic node health check — reconnect disconnected nodes every 30s (max once per 5 min per node)
  setInterval(() => {
    if (!lavalink?.nodeManager) return;
    const nodes = Array.from(lavalink.nodeManager.nodes.values());
    const now = Date.now();
    for (const node of nodes) {
      if (!node.connected && node.connect) {
        const last = lastReconnectAttempt.get(node.id) || 0;
        if (now - last < 60000) continue;
        lastReconnectAttempt.set(node.id, now);
        Logger.info(`[Lavalink] Health check: reconnecting ${node.id}...`);
        try { node.connect(); } catch (err: any) {
          Logger.error(`[Lavalink] Health reconnect failed for ${node.id}: ${err.message}`);
        }
      }
    }
  }, 30000);

  client.on("raw", (d: any) => l.sendRawData(d));
  return true;
}

export function get(): LavalinkManager | null {
  return lavalink;
}

export function getClient(): any {
  return clientRef;
}

export function getConnectedNodes(): string[] {
  const l: any = lavalink;
  if (!l?.nodeManager) return [];
  return Array.from(l.nodeManager.nodes.values())
    .filter((n: any) => n.connected)
    .map((n: any) => n.id);
}
