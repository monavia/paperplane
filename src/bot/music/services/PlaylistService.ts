import Logger from "../../core/utils/Logger.js";
import state from "../../core/state/StateManager.js";
import { withQueueLock } from "../../core/state/QueueLock.js";
import { saveState } from "./StateService.js";
import { getEngine } from "./PlayerService.js";
import { get } from "../engine/lavalink.js";

export interface PortableTrack {
  title: string;
  author: string;
  uri: string | null;
  identifier: string | null;
  duration: number;
  sourceName: string;
}

export interface StoredPlaylist {
  name: string;
  guildId: string;
  userId: string;
  tracks: PortableTrack[];
  createdAt: number;
}

const playlists = new Map<string, StoredPlaylist>();

function key(userId: string, name: string): string {
  return `${userId}:${name.toLowerCase().trim()}`;
}

function toPortable(track: any): PortableTrack {
  const info = track?.info || track || {};
  return {
    title: info.title || "Unknown",
    author: info.author || info.artist || "",
    uri: info.uri || info.originalUrl || null,
    identifier: info.identifier || null,
    duration: info.duration || 0,
    sourceName: info.sourceName || info.source || "unknown",
  };
}

export function exportPlaylist(guildId: string): { name: string; tracks: PortableTrack[]; current: PortableTrack | null } | null {
  const queue = state.queues.get(guildId);
  if (!queue?.length && !state.nowPlaying.get(guildId)) return null;

  const tracks = queue.map(toPortable);
  const np = state.nowPlaying.get(guildId);
  const current = np ? toPortable(np) : null;
  return { name: `queue-${guildId.slice(0, 8)}`, tracks, current };
}

export function savePlaylist(userId: string, guildId: string, name: string): StoredPlaylist | null {
  const exported = exportPlaylist(guildId);
  if (!exported) return null;

  const pl: StoredPlaylist = {
    name: name.trim(),
    guildId,
    userId,
    tracks: exported.tracks,
    createdAt: Date.now(),
  };
  playlists.set(key(userId, name), pl);
  Logger.info(`[Playlist] Saved "${name}" (${pl.tracks.length} tracks) for user ${userId}`);
  return pl;
}

export function listPlaylists(userId: string): { name: string; trackCount: number }[] {
  const result: { name: string; trackCount: number }[] = [];
  for (const [k, v] of playlists) {
    if (k.startsWith(`${userId}:`)) {
      result.push({ name: v.name, trackCount: v.tracks.length });
    }
  }
  return result;
}

export function getPlaylist(userId: string, name: string): StoredPlaylist | null {
  return playlists.get(key(userId, name)) || null;
}

export function deletePlaylist(userId: string, name: string): boolean {
  return playlists.delete(key(userId, name));
}

export async function importPlaylist(guildId: string, tracks: PortableTrack[], userId: string): Promise<number> {
  let added = 0;
  const lavalink = get();
  const engine = getEngine(guildId);
  const player = engine?.player;

  if (!lavalink || !player) {
    Logger.warn(`[Playlist] import failed: no Lavalink player for ${guildId}`);
    return 0;
  }

  for (const pt of tracks) {
    try {
      let resolved: any = null;

      // Fast path: try URI direct resolve
      if (pt.uri) {
        try {
          const result = await player.search({ query: pt.uri }, { id: userId });
          if (result?.tracks?.[0]) resolved = result.tracks[0];
        } catch {}
      }

      // Fallback: search by title + author
      if (!resolved) {
        const query = `${pt.author} ${pt.title}`.trim();
        try {
          const result = await player.search({ query: `ytmsearch:${query}` }, { id: userId });
          if (result?.tracks?.[0]) resolved = result.tracks[0];
        } catch {}
      }
      if (!resolved) {
        try {
          const result = await player.search({ query: `ytsearch:${query}` }, { id: userId });
          if (result?.tracks?.[0]) resolved = result.tracks[0];
        } catch {}
      }

      if (!resolved) continue;

      await withQueueLock(guildId, async () => {
        const q = state.queues.get(guildId) || [];
        state.queues.set(guildId, [...q, resolved]);
        await saveState(guildId);
      });
      added++;
    } catch (err: any) {
      Logger.warn(`[Playlist] Failed to resolve track "${pt.title}": ${err.message}`);
    }
  }

  Logger.info(`[Playlist] Imported ${added}/${tracks.length} tracks for guild ${guildId}`);
  return added;
}
