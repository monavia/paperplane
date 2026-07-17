import { LavalinkManager, NodeType } from "lavalink-client";
import Logger from "../../core/utils/Logger";
import { saveSpotifyMeta, applySpotifyMeta } from "../services/TitleResolver";

let lavalink: LavalinkManager | null = null;
let clientRef: any = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
const lastReconnectAttempt = new Map<string, number>();
const failoverGuilds = new Set<string>();
const recoveringGuilds = new Set<string>();
let allNodesDownTimer: NodeJS.Timeout | null = null;
const trackCache = new Map<string, { encoded: string; ts: number }>(); // guildId → {encoded, timestamp}

const TRACK_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const TRACK_CACHE_PRUNE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function cacheTrack(guildId: string, track: any): void {
  if (track?.encoded) trackCache.set(guildId, { encoded: track.encoded, ts: Date.now() });
}
export function getCachedTrack(guildId: string): string | null {
  const entry = trackCache.get(guildId);
  if (!entry) return null;
  if (Date.now() - entry.ts > TRACK_CACHE_TTL_MS) {
    trackCache.delete(guildId);
    return null;
  }
  return entry.encoded;
}
export function clearTrackCache(guildId: string): void {
  trackCache.delete(guildId);
}

function pruneTrackCache(): void {
  const now = Date.now();
  for (const [guildId, entry] of trackCache.entries()) {
    if (now - entry.ts > TRACK_CACHE_TTL_MS) trackCache.delete(guildId);
  }
}

function cancelNodesDownTimer(): void {
  if (allNodesDownTimer) { clearTimeout(allNodesDownTimer); allNodesDownTimer = null; }
}

export function isFailoverGuild(guildId: string): boolean {
  return failoverGuilds.has(guildId);
}
export function clearFailoverGuild(guildId: string): void {
  failoverGuilds.delete(guildId);
}

const globalFailoverLocks = new Set<string>();

export async function failoverFromNode(nodeId: string) {
  if (!lavalink?.nodeManager) return;
  const state = require("../../core/state/StateManager");
  const { getTextChannelId } = require("../services/TextChannelStore");
  const failoverLocks = new Set<string>();

  for (const [guildId, player] of lavalink.players) {
    if (player.node?.id !== nodeId) continue;
    if (failoverLocks.has(guildId)) continue;
    failoverLocks.add(guildId);
    if (globalFailoverLocks.has(guildId)) continue;
    globalFailoverLocks.add(guildId);
    failoverGuilds.add(guildId);

    // Find a healthy target node using NodePenaltyService scoring
    const { getBestNode, recordDisconnect } = require("./NodePenaltyService");
    recordDisconnect(nodeId);
    const target = getBestNode(lavalink);
    if (!target || target.id === nodeId) {
      Logger.warn(`[NodeLink] Failover: no healthy nodes for guild ${guildId}`);
      continue;
    }

    // Double-check target is actually usable (connected + has sessionId)
    if (!target.sessionId) {
      Logger.warn(`[NodeLink] Failover: target ${target.id} seems connected but no session yet — skipping failover for ${guildId}`);
      continue;
    }

    try {
      await player.changeNode(target.id, false);
      Logger.info(`[NodeLink] Failover: moved player ${guildId} to ${target.id}`);
      const curTrack = state.nowPlaying.get(guildId);
      if (curTrack && !player.playing) {
        const cached = getCachedTrack(guildId);
        if (cached) {
          await (player.play as any)({ encoded: cached, position: player.position || 0 }).catch(() => {});
        } else if (curTrack.info?.uri) {
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
        const { getEngine } = require("../services/PlayerService");
        getEngine(guildId).player = player;
        const savedFilter = state.filter.get(guildId);
        if (savedFilter && savedFilter !== "none") {
          const { setFilter } = require("../services/MusicService");
          setFilter(guildId, savedFilter, "system", "System").catch(() => {});
        }
        const savedBands = state.equalizer.get(guildId);
        if (savedBands) {
          const { setEqualizer } = require("../services/MusicService");
          setEqualizer(guildId, savedBands, "system", "System").catch(() => {});
        }
      }
    } catch {
      Logger.warn(`[NodeLink] Failover: changeNode failed for ${guildId} — retrying with destroy`);
      try {
        // Retry with destroyAfterDisconnect=true for cleaner transition
        await player.changeNode(target.id, true);
        Logger.info(`[NodeLink] Failover: retry changeNode succeeded for ${guildId} to ${target.id}`);
      } catch {
        Logger.warn(`[NodeLink] Failover: changeNode retry failed for ${guildId} — recreating player`);
        try {
          const savedPos = player.position || 0;
          const track = state.nowPlaying.get(guildId);
          const vcId = player.voiceChannelId;
          if (!vcId) continue;
          await player.destroy().catch(() => {});
          const newPlayer = lavalink.createPlayer({
            guildId,
            voiceChannelId: vcId,
            textChannelId: getTextChannelId(guildId) || "",
            selfDeaf: true,
            selfMute: false,
          });
          await newPlayer.connect();
          const cached = getCachedTrack(guildId);
          if (cached) {
            await (newPlayer.play as any)({ encoded: cached, position: savedPos }).catch(() => {});
          } else if (track?.info?.uri) {
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
          const { getEngine } = require("../services/PlayerService");
          getEngine(guildId).player = newPlayer;
          const savedFilter = state.filter.get(guildId);
          if (savedFilter && savedFilter !== "none") {
            const { setFilter } = require("../services/MusicService");
            setFilter(guildId, savedFilter, "system", "System").catch(() => {});
          }
          const savedBands = state.equalizer.get(guildId);
          if (savedBands) {
            const { setEqualizer } = require("../services/MusicService");
            setEqualizer(guildId, savedBands, "system", "System").catch(() => {});
          }
          Logger.info(`[NodeLink] Failover: recreated player ${guildId} (auto node)`);
        } catch (err2: any) { Logger.warn(`[NodeLink] Failover: recreate failed for ${guildId}: ${err2.message}`); }
      }
    }
    globalFailoverLocks.delete(guildId);
  }
}

function handleAllNodesDown(): void {
  allNodesDownTimer = null;
  Logger.error(`[NodeLink] All nodes down for 60s — cleaning up players`);
  try {
    const state = require("../../core/state/StateManager");
    for (const [guildId] of state.nowPlaying.entries()) {
      const player = lavalink?.players.get(guildId);
      if (!player) continue;
      try {
        const { getTextChannelId } = require("../services/TextChannelStore");
        const chId = getTextChannelId(guildId);
        if (chId && clientRef) {
          const ch = clientRef.channels.cache.get(chId);
          if (ch) {
            const { EmbedBuilder } = require("discord.js");
            ch.send({ embeds: [new EmbedBuilder().setDescription("Music system is experiencing issues. Please try again later.").setColor(0xFF0000)] }).catch(() => {});
          }
        }
        player.destroy().catch(() => {});
      } catch {}
    }
  } catch {}
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
      requestSignalTimeoutMS: 10000,
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
    httpHeaders: {
      "User-Agent": "PaperplaneBot/2.0",
    },
  });

  const l: any = lavalink;

  l.on("nodeError", async (node: any, err: any) => {
    try {
      Logger.warn(`[NodeLink] Node ${node.options?.id || "?"} (${node.options?.region || "?"}) error: ${err?.message || err}`);
      const { recordError } = require("./NodePenaltyService");
      recordError(node.options?.id || node.id, err?.message || String(err));
      if (lavalink?.nodeManager) await failoverFromNode(node.id);
    } catch (e: any) { Logger.error(`[NodeLink] nodeError handler error: ${e.message}`); }
  });

  l.on("nodeDisconnect", async (node: any) => {
    try {
      Logger.warn(`[NodeLink] Node ${node.id} (${node.options?.region || "?"}) disconnected`);
      if (lavalink?.nodeManager) await failoverFromNode(node.id);

      // Try reconnecting (once per 15s)
      const last = lastReconnectAttempt.get(node.id) || 0;
      if (Date.now() - last >= 15000 && node.connect) {
        lastReconnectAttempt.set(node.id, Date.now());
        Logger.info(`[NodeLink] Reconnecting ${node.id} (${node.options?.region || "?"})...`);
        try { await node.connect(); Logger.info(`[NodeLink] Node ${node.id} reconnected`); } catch (err2: any) { Logger.warn(`[NodeLink] Reconnect failed for ${node.id}: ${err2?.message || err2}`); }
      }

      // Start 60s timer if ALL nodes are down
      if (allNodesDownTimer) return;
      const hasConnected = lavalink?.nodeManager && Array.from(lavalink.nodeManager.nodes.values()).some((n: any) => n.connected);
      if (!hasConnected) {
        allNodesDownTimer = setTimeout(() => handleAllNodesDown(), 60000);
        Logger.info(`[NodeLink] All nodes down — leaving in 60s if no node reconnects`);
      }
    } catch (e: any) { Logger.error(`[NodeLink] nodeDisconnect handler error: ${e.message}`); }
  });

  l.on("nodeReconnect", (node: any) => {
    Logger.info(`[NodeLink] Node ${node.id} (${node.options?.region || "?"}) reconnecting`);
  });

  l.nodeManager?.on("connect", async (node: any) => {
    Logger.ready(`[NodeLink] Node ${node.id} (${node.options?.region || "?"}) connected`);
    cancelNodesDownTimer();
    // Enable session resume for seamless voice handoff (5min timeout)
    try { node.updateSession?.(true, 300_000); } catch {} 

    try {
      const state = require("../../core/state/StateManager");
      const { getTextChannelId } = require("../services/TextChannelStore");
      const { getEngine } = require("../services/PlayerService");

      for (const [guildId, nowPlaying] of state.nowPlaying.entries()) {
        if (!nowPlaying) continue;
        if (lavalink?.players.get(guildId)?.connected) continue;
        if (recoveringGuilds.has(guildId)) continue;
        recoveringGuilds.add(guildId);

        const vcData = state.voiceChannels.get(guildId);
        if (!vcData?.voiceChannelId) continue;

        Logger.info(`[NodeLink] Restoring player for ${guildId} after reconnect`);
        try {
          const player = lavalink!.createPlayer({
            guildId,
            voiceChannelId: vcData.voiceChannelId,
            textChannelId: getTextChannelId(guildId) || vcData.textChannelId || "",
            selfDeaf: true,
            selfMute: false,
          });
          await player.connect();
          getEngine(guildId).player = player;

          const queue = state.queues.get(guildId) || [];
          const first = queue.shift() || nowPlaying;
          state.nowPlaying.set(guildId, first);
          cacheTrack(guildId, first);
          await player.play({ track: first, clientTrack: first, position: 0 }).catch(() => {});
          Logger.info(`[NodeLink] Restored player ${guildId}`);
        } catch (err: any) {
          Logger.warn(`[NodeLink] Restore failed for ${guildId}: ${err.message}`);
        }
      }
    } catch (e: any) {
      Logger.warn(`[NodeLink] Recovery handler error: ${e.message}`);
    }
  });

  // Enable SponsorBlock on player creation
  l.on("playerCreate", (player: any) => {
    player.setSponsorBlock(["sponsor", "intro", "outro", "selfpromo", "interaction", "preview", "music_offtopic"]).catch(() => {});
  });

  l.on("trackStart", () => {});
  l.on("queueEnd", () => {});

  await l.init({ id: client.user?.id || "" }).catch(() => {});

  // Periodic track cache prune (TTL cleanup)
  setInterval(pruneTrackCache, TRACK_CACHE_PRUNE_INTERVAL_MS);

  // Periodic node health check — reconnect disconnected nodes + failover players every 15s
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
        try { await Promise.race([node.connect(), connectTimeout]); if (node.connected) Logger.info(`[NodeLink] Health check: node ${node.id} (${(node.options as any)?.region || "?"}) reconnected`); } catch (err: any) {
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

export function getLeastLoadedNode(): string | null {
  if (!lavalink?.nodeManager) return null;
  const { getBestNode } = require("./NodePenaltyService");
  const best = getBestNode(lavalink);
  return best?.id || null;
}
