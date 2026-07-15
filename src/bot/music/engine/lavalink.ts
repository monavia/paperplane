import { LavalinkManager, NodeType } from "lavalink-client";
import Logger from "../../core/utils/Logger";
import { saveSpotifyMeta, applySpotifyMeta } from "../services/TitleResolver";

let lavalink: LavalinkManager | null = null;
let clientRef: any = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
const lastReconnectAttempt = new Map<string, number>();
const failoverGuilds = new Set<string>();

export function isFailoverGuild(guildId: string): boolean {
  return failoverGuilds.has(guildId);
}
export function clearFailoverGuild(guildId: string): void {
  failoverGuilds.delete(guildId);
}

export async function failoverFromNode(nodeId: string) {
  if (!lavalink?.nodeManager) return;
  const state = require("../../core/state/StateManager");
  const { getTextChannelId } = require("../services/TextChannelStore");
  const failoverLocks = new Set<string>();

  for (const [guildId, player] of lavalink.players) {
    if (player.node?.id !== nodeId) continue;
    if (failoverLocks.has(guildId)) continue;
    failoverLocks.add(guildId);
    failoverGuilds.add(guildId);

    // Find a healthy target node now (not cached from before loop)
    const nodes = Array.from(lavalink.nodeManager.nodes.values());
    const healthy = nodes.filter((n: any) => n.connected && n.id !== nodeId);
    if (!healthy.length) {
      Logger.warn(`[NodeLink] Failover: no healthy nodes for guild ${guildId}`);
      continue;
    }
    // Pick least-loaded node
    const playerCounts = new Map<string, number>();
    for (const [, p] of lavalink.players) {
      const nid = p.node?.id;
      if (nid) playerCounts.set(nid, (playerCounts.get(nid) || 0) + 1);
    }
    const target = healthy.sort((a: any, b: any) => (playerCounts.get(a.id) || 0) - (playerCounts.get(b.id) || 0))[0];

    // Double-check target is actually usable (connected + has sessionId)
    if (!target.sessionId) {
      Logger.warn(`[NodeLink] Failover: target ${target.id} seems connected but no session yet — skipping failover for ${guildId}`);
      continue;
    }

    try {
      await player.changeNode(target.id, false);
      Logger.info(`[NodeLink] Failover: moved player ${guildId} to ${target.id}`);
      // Re-resolve current track — old encoded may not work on new node
      const curTrack = state.nowPlaying.get(guildId);
      if (curTrack?.info?.uri && !player.playing) {
        const uri = curTrack.info.uri;
        const isSpotify = /^spotify:(track|album|playlist):/.test(uri) || /open\.spotify\.com/i.test(uri);
        const savedMeta = saveSpotifyMeta(curTrack);
        let resolved: any = null;
        if (isSpotify) {
          const q = `${curTrack.info.author || ""} ${curTrack.info.title || ""}`.trim();
          for (const prefix of ["ytmsearch", "ytsearch", "scsearch"]) {
            const search = await player.search({ query: `${prefix}:${q}` }, { id: "system" }).catch(() => null);
            if (search?.tracks?.[0]) { resolved = search.tracks[0]; break; }
          }
        } else {
          const search = await player.search({ query: uri }, { id: "system" }).catch(() => null);
          resolved = search?.tracks?.[0];
        }
        if (resolved) {
          applySpotifyMeta(resolved, savedMeta);
          await player.play({ track: resolved, clientTrack: resolved, position: player.position || 0 }).catch(() => {});
        }
      }
    } catch {
      Logger.warn(`[NodeLink] Failover: changeNode failed for ${guildId} — recreating on ${target.id}`);
      try {
        const savedPos = player.position || 0;
        const track = state.nowPlaying.get(guildId);
        const vcId = player.voiceChannelId;
        if (!vcId) continue;
        const newPlayer = lavalink.createPlayer({ guildId, voiceChannelId: vcId, textChannelId: getTextChannelId(guildId) || "", selfDeaf: true, selfMute: false });
        await newPlayer.connect();
        if (track?.info?.uri) {
          const uri = track.info.uri;
          const isSpotify = /^spotify:(track|album|playlist):/.test(uri) || /open\.spotify\.com/i.test(uri);
          const savedMeta = saveSpotifyMeta(track);
          let resolved: any = track;
          if (isSpotify) {
            const q = `${track.info.author || ""} ${track.info.title || ""}`.trim();
            for (const prefix of ["ytmsearch", "ytsearch", "scsearch"]) {
              const search = await newPlayer.search({ query: `${prefix}:${q}` }, { id: "system" }).catch(() => null);
              if (search?.tracks?.[0]) { resolved = search.tracks[0]; break; }
            }
          } else {
            const search = await newPlayer.search({ query: uri }, { id: "system" }).catch(() => null);
            if (search?.tracks?.[0]) resolved = search.tracks[0];
          }
          applySpotifyMeta(resolved, savedMeta);
          await newPlayer.play({ track: resolved, clientTrack: resolved, position: savedPos });
        }
        Logger.info(`[NodeLink] Failover: recreated player ${guildId} (auto node)`);
      } catch (err2: any) { Logger.warn(`[NodeLink] Failover: recreate failed for ${guildId}: ${err2.message}`); }
    }
  }
}

export async function init(client: any): Promise<boolean> {
  clientRef = client;

  const nodes: any[] = [];
  for (let i = 1; i <= 20; i++) {
    const host = process.env[`NODELINK_HOST${i > 1 ? `_${i}` : ""}`];
    if (!host) break;
    nodes.push({
      id: `node${i}`,
      host,
      port: parseInt(process.env[`NODELINK_PORT${i > 1 ? `_${i}` : ""}`] || "2333"),
      authorization: process.env[`NODELINK_PASSWORD${i > 1 ? `_${i}` : ""}`] || "youshallnotpass",
      secure: process.env[`NODELINK_SECURE${i > 1 ? `_${i}` : ""}`] === "true",
      region: process.env[`NODELINK_REGION${i > 1 ? `_${i}` : ""}`] || "asia",
      nodeType: NodeType.NodeLink,
      closeOnError: false,
      heartBeatInterval: 1000,
    });
  }

  if (!nodes.length) {
    Logger.error("[NodeLink] No nodes configured");
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

  l.on("nodeError", async (node: any, err: any) => {
    try {
      Logger.warn(`[NodeLink] Node ${node.options?.id || "?"} (${node.options?.region || "?"}) error: ${err?.message || err}`);
      if (lavalink?.nodeManager) await failoverFromNode(node.id);
    } catch (e: any) { Logger.error(`[NodeLink] nodeError handler error: ${e.message}`); }
  });

  l.on("nodeDisconnect", async (node: any) => {
    try {
      Logger.warn(`[NodeLink] Node ${node.id} (${node.options?.region || "?"}) disconnected`);
      if (lavalink?.nodeManager) await failoverFromNode(node.id);

      // Try reconnecting (once per 60s)
      const last = lastReconnectAttempt.get(node.id) || 0;
      if (Date.now() - last >= 60000 && node.connect) {
        lastReconnectAttempt.set(node.id, Date.now());
        Logger.info(`[NodeLink] Reconnecting ${node.id} (${node.options?.region || "?"})...`);
        try { await node.connect(); Logger.info(`[NodeLink] Node ${node.id} reconnected`); } catch (err2: any) { Logger.warn(`[NodeLink] Reconnect failed for ${node.id}: ${err2?.message || err2}`); }
      }
    } catch (e: any) { Logger.error(`[NodeLink] nodeDisconnect handler error: ${e.message}`); }
  });

  l.on("nodeReconnect", (node: any) => {
    Logger.info(`[NodeLink] Node ${node.id} (${node.options?.region || "?"}) reconnecting`);
  });

  // Enable SponsorBlock on player creation
  l.on("playerCreate", (player: any) => {
    player.setSponsorBlock(["sponsor", "intro", "outro", "selfpromo", "interaction", "preview", "music_offtopic"]).catch(() => {});
  });

  l.on("trackStart", () => {});
  l.on("queueEnd", () => {});

  await l.init({ id: client.user?.id || "" }).catch(() => {});
  if (lavalink?.nodeManager) {
    const nodes = Array.from(lavalink.nodeManager.nodes.values());
    for (const n of nodes) {
      if (n.connected) Logger.info(`[NodeLink] Node ${n.id} (${(n.options as any)?.region || "?"}) connected`);
    }
  }

  // Periodic node health check — reconnect disconnected nodes + failover players every 30s
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  healthCheckInterval = setInterval(async () => {
    if (!lavalink?.nodeManager) return;
    const nodes = Array.from(lavalink.nodeManager.nodes.values());
    const now = Date.now();

    for (const node of nodes) {
      if (!node.connected && node.connect) {
        // Backup failover (events might not fire)
        await failoverFromNode(node.id);

        const last = lastReconnectAttempt.get(node.id) || 0;
        if (now - last < 15000) continue;
        lastReconnectAttempt.set(node.id, now);
        Logger.info(`[NodeLink] Health check: reconnecting ${node.id} (${(node.options as any)?.region || "?"})...`);
        const connectTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000));
        try { await Promise.race([node.connect(), connectTimeout]); if (node.connected && node.sessionId) Logger.info(`[NodeLink] Node ${node.id} (${(node.options as any)?.region || "?"}) reconnected`); } catch (err: any) {
          Logger.warn(`[NodeLink] Health reconnect failed for ${node.id}: ${err?.message || "timeout"}`);
        }
      }
    }
  }, 15000);

  client.on("raw", (d: any) => l.sendRawData(d));
  return true;
}

export function cleanup(): void {
  if (healthCheckInterval) { clearInterval(healthCheckInterval); healthCheckInterval = null; }
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
