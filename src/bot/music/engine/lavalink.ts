import { LavalinkManager, NodeType } from "lavalink-client";
import { EmbedBuilder } from "discord.js";
import Logger from "../../core/utils/Logger";
import state from "../../core/state/StateManager";
import { saveSpotifyMeta, applySpotifyMeta } from "../services/TitleResolver";
import { getPlayerData, setPlayerData } from "../services/PersistentPlayerStore";
import { pickBestTrack } from "../services/SearchService";
import { getTextChannelId } from "../services/TextChannelStore";
import PlayerState from "../../database/models/PlayerState";
import { getEngine } from "../services/PlayerService";
import { setFilter, setEqualizer } from "../services/MusicService";
import { getBestNode, recordDisconnect, recordError } from "./NodePenaltyService";
import { addRestoredGuild } from "../services/StateService";
import { setLavalinkRef } from "./FailoverManager";
// import MongoQueueStore from "../services/MongoQueueStore"; // R5 — pending: queueStore intended to replace saveState, not coexist

let lavalink: LavalinkManager | null = null;
let clientRef: any = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
const lastReconnectAttempt = new Map<string, number>();
const failoverGuilds = new Set<string>();
const recoveringGuilds = new Set<string>();
const recoveringGuildsTimestamps = new Map<string, number>();
const RECOVERING_GUILDS_TTL_MS = 10 * 60 * 1000; // 10min
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

export async function connectWithRetry(player: any, guildId: string, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await player.connect();
      return;
    } catch (err: any) {
      if (i < retries - 1) {
        Logger.warn(`[NodeLink] connect failed for ${guildId} (${i + 1}/${retries}): ${err?.message}, retrying in 2s`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

const globalFailoverLocks = new Set<string>();

export async function failoverFromNode(nodeId: string) {
  if (!lavalink?.nodeManager) return;
  

  

  const failoverLocks = new Set<string>();

  for (const [guildId, player] of lavalink.players) {
    if (player.node?.id !== nodeId) continue;
    if (failoverLocks.has(guildId)) continue;
    failoverLocks.add(guildId);
    if (globalFailoverLocks.has(guildId)) continue;
    globalFailoverLocks.add(guildId);
    failoverGuilds.add(guildId);

    // Find a healthy target node using NodePenaltyService scoring
    

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
      Logger.info(`[NodeLink] Failover: moved player ${guildId} from node=${nodeId} region=${player.node?.options?.regions?.[0] || "?"} → node=${target.id} region=${target.options?.regions?.[0] || "?"}`);
      const curTrack = state.nowPlaying.get(guildId);
      if (curTrack && !player.playing) {
        const encoded = curTrack?.encoded || getCachedTrack(guildId);
        if (encoded) {
          await (player.play as any)({ encoded, position: player.position || 0 }).catch(() => {});
        } else if (curTrack.info?.uri) {
          const uri = curTrack.info.uri;
          const isSpotify = /^spotify:(track|album|playlist):/.test(uri) || /open\.spotify\.com/i.test(uri);
          const savedMeta = saveSpotifyMeta(curTrack);
          let resolved: any = null;
          if (isSpotify) {
            const q = `${curTrack.info.author || ""} ${curTrack.info.title || ""}`.trim();
            for (const prefix of ["ytmsearch", "ytsearch", "scsearch"]) {
              const search = await player.search({ query: `${prefix}:${q}` }, { id: "system" }).catch(() => null);
              if (search?.tracks?.length) { resolved = pickBestTrack(search.tracks); if (resolved) break; }
            }
          } else {
            const search = await player.search({ query: uri }, { id: "system" }).catch(() => null);
            resolved = search?.tracks?.length ? pickBestTrack(search.tracks) : null;
          }
          if (resolved) {
            applySpotifyMeta(resolved, savedMeta);
            await player.play({ track: resolved, clientTrack: resolved, position: player.position || 0 }).catch(() => {});
          }
        }
        

        getEngine(guildId).player = player;
        const savedFilter = state.filter.get(guildId);
        if (savedFilter && savedFilter !== "none") {
          

          setFilter(guildId, savedFilter, "system", "System").catch(() => {});
        }
        const savedBands = state.equalizer.get(guildId);
        if (savedBands) {
          

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
          const encoded = track?.encoded || getCachedTrack(guildId);
          if (encoded) {
            await (newPlayer.play as any)({ encoded, position: savedPos }).catch(() => {});
          } else if (track?.info?.uri) {
            const uri = track.info.uri;
            const isSpotify = /^spotify:(track|album|playlist):/.test(uri) || /open\.spotify\.com/i.test(uri);
            const savedMeta = saveSpotifyMeta(track);
            let resolved: any = track;
            if (isSpotify) {
              const q = `${track.info.author || ""} ${track.info.title || ""}`.trim();
              for (const prefix of ["ytmsearch", "ytsearch", "scsearch"]) {
                const search = await newPlayer.search({ query: `${prefix}:${q}` }, { id: "system" }).catch(() => null);
              if (search?.tracks?.length) { resolved = pickBestTrack(search.tracks); if (resolved) break; }
            }
          } else {
            const search = await newPlayer.search({ query: uri }, { id: "system" }).catch(() => null);
            if (search?.tracks?.length) resolved = pickBestTrack(search.tracks);
            }
            applySpotifyMeta(resolved, savedMeta);
            await newPlayer.play({ track: resolved, clientTrack: resolved, position: savedPos });
          }
          

          getEngine(guildId).player = newPlayer;
          const savedFilter = state.filter.get(guildId);
          if (savedFilter && savedFilter !== "none") {
            

            setFilter(guildId, savedFilter, "system", "System").catch(() => {});
          }
          const savedBands = state.equalizer.get(guildId);
          if (savedBands) {
            

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
    

    for (const [guildId] of state.nowPlaying.entries()) {
      const player = lavalink?.players.get(guildId);
      if (!player) continue;
      try {
        

        const chId = getTextChannelId(guildId);
        if (chId && clientRef) {
          const ch = clientRef.channels.cache.get(chId);
          if (ch) {
            

            ch.send({ embeds: [new EmbedBuilder().setDescription("Music system is experiencing issues. Please try again later.").setColor(0xFF0000)] }).catch(() => {});
          }
        }
        player.destroy().catch(() => {});
      } catch { Logger.warn(`[NodeLink] Failed to destroy player for ${guildId}`); }
    }
  } catch { Logger.error("[NodeLink] handleAllNodesDown crashed"); }
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
      regions: (process.env[`NODELINK_REGION${i > 1 ? `_${i}` : ""}`] || "asia").split(",").map((r: string) => r.trim()).filter(Boolean),
      nodeType: NodeType.NodeLink,
      closeOnError: false,
      heartBeatInterval: 30000,
      requestSignalTimeoutMS: 20000,
      retryAmount: 5,
      retryDelay: 10000,
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
    autoMove: true,
    client: { id: client.user?.id || "" },
    httpHeaders: {
      "User-Agent": "PaperplaneBot/2.0",
    },
    // queueOptions: { queueStore: new MongoQueueStore(), maxPreviousTracks: 10 }, // R5 — pending: conflicts with saveState dual system
    playerOptions: {
      volumeDecrementer: 0.75,
      clientBasedPositionUpdateInterval: 50,
      defaultSearchPlatform: "ytsearch",
      applyVolumeAsFilter: false,
    },
  });

  setLavalinkRef(lavalink, client);

  const l: any = lavalink;

  l.on("nodeError", async (node: any, err: any) => {
    try {
      Logger.warn(`[NodeLink] Node ${node.options?.id || "?"} (${node.options?.regions?.[0] || "?"}) error: ${err?.message || err}`);
      

      recordError(node.options?.id || node.id, err?.message || String(err));
      if (lavalink?.nodeManager) await failoverFromNode(node.id);
    } catch (e: any) { Logger.error(`[NodeLink] nodeError handler error: ${e.message}`); }
  });

  l.on("nodeDisconnect", async (node: any) => {
    try {
      Logger.warn(`[NodeLink] Node ${node.id} (${node.options?.regions?.[0] || "?"}) disconnected`);
      if (lavalink?.nodeManager) await failoverFromNode(node.id);

      // Try reconnecting (once per 15s)
      const last = lastReconnectAttempt.get(node.id) || 0;
      if (Date.now() - last >= 15000 && node.connect) {
        lastReconnectAttempt.set(node.id, Date.now());
        Logger.info(`[NodeLink] Reconnecting ${node.id} (${node.options?.regions?.[0] || "?"})...`);
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
    Logger.info(`[NodeLink] Node ${node.id} (${node.options?.regions?.[0] || "?"}) reconnecting`);
    cancelNodesDownTimer(); // early cancel — reconnect started
  });

  l.nodeManager?.on("connect", async (node: any) => {
    Logger.ready(`[NodeLink] Node ${node.id} (${node.options?.regions?.[0] || "?"}) connected`);
    cancelNodesDownTimer();
    // Enable session resume per lavalink-client docs — restores <360s outage instantly from Lavalink data
    try { node.updateSession?.(true, 300_000); } catch { Logger.warn(`[NodeLink] updateSession failed for ${node.id}`); }

    // Destroy stale players for this node — node reconnected but voice WS wasn't restored
    // (session resume can't restore what a fresh NodeLink never had)
    if (lavalink) {
      const staleGuilds: string[] = [];
      for (const [guildId, p] of lavalink.players) {
        if (p.node?.id === node.id && !p.connected) staleGuilds.push(guildId);
      }
      if (staleGuilds.length) {
        // Brief wait for resumed event to process any successful session restores first
        await new Promise(r => setTimeout(r, 2000));
        for (const guildId of staleGuilds) {
          try { const p = lavalink.players.get(guildId); if (p && p.node?.id === node.id && !p.connected) await p.destroy().catch(() => {}); } catch {}
        }
        Logger.info(`[NodeLink] Destroyed ${staleGuilds.length} stale player(s), attempting recovery from RAM/DB`);
      }
    }

    try {
      for (const [guildId, nowPlaying] of state.nowPlaying.entries()) {
        if (!nowPlaying) continue;
        if (lavalink?.players.get(guildId)) continue;
        if (recoveringGuilds.has(guildId)) continue;
        recoveringGuilds.add(guildId);
        recoveringGuildsTimestamps.set(guildId, Date.now());

        // Try RAM stores first, then DB
        const storeData = getPlayerData(guildId);
        const vcData = state.voiceChannels.get(guildId);
        let vcId = storeData?.voiceChannelId || vcData?.voiceChannelId;
        let tcId = getTextChannelId(guildId) || storeData?.textChannelId || vcData?.textChannelId || "";
        let dbNowPlaying = nowPlaying;
        let dbPosition = state.position.get(guildId);

        // Layer 2: DB Fallback — when RAM stores empty (>360s outage)
        if (!vcId) {
          try {
            

            const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
            const dbState = await PlayerState.findOne({
              guildId,
              updatedAt: { $gte: tenMinAgo },
            }).lean().catch(() => null);
            if (dbState?.voiceChannelId) {
              vcId = dbState.voiceChannelId;
              tcId = dbState.textChannelId || tcId;
              if (dbState.nowPlaying && !state.nowPlaying.get(guildId)) {
                state.nowPlaying.set(guildId, dbState.nowPlaying);
                dbNowPlaying = dbState.nowPlaying;
              }
              if (dbState.position) dbPosition = dbState.position;
              if (dbState.queue?.length && !state.queues.get(guildId)?.length) {
                state.queues.set(guildId, dbState.queue);
              }
              Logger.info(`[NodeLink] DB fallback found player data for ${guildId}`);
            }
          } catch { Logger.warn(`[NodeLink] DB fallback for ${guildId} unavailable`); }
        }

        if (!vcId) { recoveringGuilds.delete(guildId); recoveringGuildsTimestamps.delete(guildId); continue; }

        Logger.info(`[NodeLink] Restoring player for ${guildId} after reconnect`);
        try {
          const player = lavalink!.createPlayer({
            guildId,
            voiceChannelId: vcId,
            textChannelId: getTextChannelId(guildId) || storeData?.textChannelId || vcData?.textChannelId || "",
            selfDeaf: true,
            selfMute: false,
          });
          await connectWithRetry(player, guildId);
          getEngine(guildId).player = player;

          const queue = state.queues.get(guildId) || [];
          const first = queue.shift() || dbNowPlaying;
          state.nowPlaying.set(guildId, first);
          cacheTrack(guildId, first);
          await player.play({ track: first, clientTrack: first, position: dbPosition }).catch(() => {});
          Logger.info(`[DBUG-restore] guild=${guildId} voice=${vcId} track=${first.info?.title} pos=${dbPosition} filter=${state.filter.get(guildId) || "none"} eq=${state.equalizer.get(guildId) ? "set" : "none"} ok=true`);
          addRestoredGuild(guildId);
          recoveringGuilds.delete(guildId);
          recoveringGuildsTimestamps.delete(guildId);
        } catch (err: any) {
          Logger.warn(`[NodeLink] Restore failed for ${guildId}: ${err.message}`);
          recoveringGuilds.delete(guildId);
          recoveringGuildsTimestamps.delete(guildId);
        }
      }
    } catch (e: any) {
      Logger.warn(`[NodeLink] Recovery handler error: ${e.message}`);
    }
  });

  // Layer 1: Session Resume — instant restore from Lavalink data
  l.nodeManager?.on("resumed", async (node: any, _payload: any, fetchedPlayers: any[]) => {
    Logger.ready(`[NodeLink] Node ${node.id} resumed — restoring ${fetchedPlayers.length} players`);
    cancelNodesDownTimer();
    for (const data of fetchedPlayers) {
      if (!data?.guildId || !data.state?.connected) continue;
      if (recoveringGuilds.has(data.guildId)) continue;
      recoveringGuilds.add(data.guildId);
      recoveringGuildsTimestamps.set(data.guildId, Date.now());
      const storeData = getPlayerData(data.guildId);
      if (!storeData) { recoveringGuilds.delete(data.guildId); recoveringGuildsTimestamps.delete(data.guildId); continue; }
      try {
        const player = l.createPlayer({
          guildId: data.guildId,
          voiceChannelId: storeData.voiceChannelId,
          textChannelId: storeData.textChannelId || "",
          selfDeaf: true,
          selfMute: false,
          node: node.id,
        });
        await connectWithRetry(player, data.guildId);
        if (data.filters) player.filterManager.data = data.filters;
        if (data.track) player.queue.current = l.utils.buildTrack(data.track, player.queue.current?.requester || clientRef.user);
        player.paused = data.paused;
        player.playing = !data.paused && !!data.track;
        player.lastPosition = data.state.position || 0;
        player.lastPositionChange = Date.now();
        // Actually resume playback — property changes alone don't start audio
        if (data.track && !data.paused) {
          await player.play({ encoded: data.track, position: data.state.position || 0 }).catch(() => {});
          Logger.ready(`[NodeLink] Resumed playback for ${data.guildId} at pos ${data.state.position || 0}`);
        }
        addRestoredGuild(data.guildId);
        recoveringGuilds.delete(data.guildId);
        recoveringGuildsTimestamps.delete(data.guildId);
      } catch (err: any) {
        Logger.warn(`[NodeLink] Resume failed for ${data.guildId}: ${err.message}`);
        recoveringGuilds.delete(data.guildId);
        recoveringGuildsTimestamps.delete(data.guildId);
      }
    }
  });

  l.on("playerCreate", (player: any) => {
    player.setSponsorBlock(["sponsor", "intro", "outro", "selfpromo", "interaction", "preview", "music_offtopic"]).catch(() => {});
    setPlayerData(player.guildId, { voiceChannelId: player.voiceChannelId || "", textChannelId: player.textChannelId || "" });
  });

  // Layer 3: Player Persistence — keep voiceChannelId + position up-to-date in RAM
  l.on("playerUpdate", (_old: any, player: any) => {
    if (player.voiceChannelId) {
      setPlayerData(player.guildId, {
        voiceChannelId: player.voiceChannelId,
        textChannelId: player.textChannelId || "",
      });
    }
    

    state.position.set(player.guildId, player.lastPosition || player.position || 0);
  });

  l.on("playerDestroy", (player: any) => {
    // Save last position before player is gone — used for recovery (C3)
    

    const pos = player.lastPosition || player.position || 0;
    if (pos > 0) state.position.set(player.guildId, pos);
  });

  l.on("trackStart", () => {});
  l.on("queueEnd", () => {});

  await l.init({ id: client.user?.id || "" }).catch(() => {});

  // Periodic track cache prune (TTL cleanup)
  setInterval(pruneTrackCache, TRACK_CACHE_PRUNE_INTERVAL_MS);

  // Periodic recovering guilds cleanup — stale entries expire after TTL
  setInterval(() => {
    const now = Date.now();
    for (const [guildId, ts] of recoveringGuildsTimestamps) {
      if (now - ts > RECOVERING_GUILDS_TTL_MS) {
        recoveringGuilds.delete(guildId);
        recoveringGuildsTimestamps.delete(guildId);
        Logger.info(`[NodeLink] Expired stale recoveringGuilds entry for ${guildId}`);
      }
    }
  }, TRACK_CACHE_PRUNE_INTERVAL_MS);

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
        Logger.info(`[NodeLink] Health check: reconnecting ${node.id} (${(node.options as any)?.regions?.[0] || "?"})...`);
        const connectTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000));
        try { await Promise.race([node.connect(), connectTimeout]); if (node.connected) { cancelNodesDownTimer(); Logger.info(`[NodeLink] Health check: node ${node.id} (${(node.options as any)?.regions?.[0] || "?"}) reconnected`); } } catch (err: any) {
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
  
  const best = getBestNode(lavalink);
  return best?.id || null;
}
