import * as EventBus from "../events/EventBus.js";
import { isCover } from "../services/TitleResolver.js";
import { getAdapter } from "../../cache/CacheAdapter.js";
import Logger from "../../core/utils/Logger.js";

const GENRE_PREFIX = "taste:";
const TASTE_TTL = 7 * 86400000;

class RecommendationEngine {
  private playedTracks: Map<string, Set<string>> = new Map();

  async _searchWithRetry(player: any, query: any, retries = 3): Promise<any> {
    for (let i = 0; i <= retries; i++) {
      try {
        return await player.search(query, { id: "system" });
      } catch (err: any) {
        if (i < retries) {
          Logger.warn(`[RecEngine] search retry ${i+1}/${retries}: ${err?.message?.slice(0,60)}`);
          await new Promise(r => setTimeout(r, 1000));
        } else throw err;
      }
    }
  }

  _buildQuery(info: any): string {
    let author = (info.author || "").replace(/^Various\s*$/i, "").trim();
    let title = (info.title || "").trim();
    if (/\(feat\.?\s*$/i.test(title)) title = title.replace(/\(\s*feat\.?\s*$/i, "");
    if (/\(ft\.?\s*$/i.test(title)) title = title.replace(/\(\s*ft\.?\s*$/i, "");
    if (author && author !== "Unknown Artist" && author !== "Unknown") return `${author} - ${title}`.trim();
    return title;
  }

  async _getYouTubeMix(player: any, track: any): Promise<any[]> {
    const videoId = track?.info?.identifier;
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) { Logger.info(`[RecEngine] Mix skip: no valid videoId`); return []; }
    if (track?.info?.sourceName && track.info.sourceName !== "youtube") { Logger.info(`[RecEngine] Mix skip: source=${track.info.sourceName}`); return []; }
    const result = await this._searchWithRetry(player, { query: `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}` }).catch(() => null);
    if (!result) { Logger.info(`[RecEngine] Mix failed for ${videoId}`); return []; }
    if (result?.loadType !== "playlist" || !result?.tracks?.length) {
      Logger.info(`[RecEngine] Mix returned loadType=${result?.loadType} tracks=${result?.tracks?.length}`);
      return [];
    }
    return result.tracks;
  }

  _isSameTrack(a: any, b: any): boolean {
    if (!a?.info || !b?.info) return false;
    const norm = (s: any) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return norm(a.info.title) === norm(b.info.title) && norm(a.info.author) === norm(b.info.author);
  }

  _trackKey(track: any): string {
    const norm = (s: any) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${norm(track?.info?.author || "")}-${norm(track?.info?.title || "")}`;
  }

  _isPlayed(guildId: string, track: any): boolean {
    return this.playedTracks.get(guildId)?.has(this._trackKey(track)) || false;
  }

  _markPlayed(guildId: string, track: any): void {
    if (!this.playedTracks.has(guildId)) this.playedTracks.set(guildId, new Set());
    const played = this.playedTracks.get(guildId)!;
    played.add(this._trackKey(track));
    if (played.size > 100) { const first = played.values().next().value; if (first) played.delete(first); }
  }

  clearPlayed(guildId: string): void { this.playedTracks.delete(guildId); }

  async _incrementGenre(guildId: string, author: string): Promise<void> {
    if (!author) return;
    try {
      const adapter = getAdapter();
      const key = `${GENRE_PREFIX}${guildId}`;
      const taste = await adapter.get<Record<string, number>>(key) || {};
      const genre = author.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
      if (genre) { taste[genre] = (taste[genre] || 0) + 1; await adapter.set(key, taste, TASTE_TTL); }
    } catch {}
  }

  async _getGenrePrefs(guildId: string): Promise<Set<string>> {
    try {
      const taste = await getAdapter().get<Record<string, number>>(`${GENRE_PREFIX}${guildId}`);
      if (!taste) return new Set();
      const top = Object.entries(taste).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
      return new Set(top);
    } catch { return new Set(); }
  }

  async getRecommendations(player: any, track: any, guildId: string, count: number = 5): Promise<any[]> {
    if (!track?.info) return [];
    try {
      this._incrementGenre(guildId, track.info.author).catch(() => {});

      const candidates: any[] = [];
      const seen = new Set<string>();

      // 1. Primary: YouTube Mix (radio) — real recommendations
      const mixTracks = await this._getYouTubeMix(player, track);
      for (const t of mixTracks) {
        const k = this._trackKey(t);
        if (!seen.has(k)) { seen.add(k); candidates.push(t); }
      }

      // 2. Similar artist search — diverse recommendations
      const author = (track.info.author || "").replace(/^Various\s*$/i, "").trim();
      if (author && author !== "Unknown Artist") {
        const r = await this._searchWithRetry(player, { query: `ytmsearch:${author}` }).catch(() => null);
        if (r?.tracks?.length) {
          for (const t of r.tracks) {
            const k = this._trackKey(t);
            if (!seen.has(k)) { seen.add(k); candidates.push(t); }
          }
        }
      }

      // 3. Only if still low on candidates: search by title
      if (candidates.length < count) {
        const query = this._buildQuery(track.info);
        if (query) {
          const r = await this._searchWithRetry(player, { query: `ytmsearch:${query}` }).catch(() => null);
          if (r?.tracks?.length) {
            for (const t of r.tracks) {
              const k = this._trackKey(t);
              if (!seen.has(k)) { seen.add(k); candidates.push(t); }
            }
          }
        }
      }

      // 4. Try genre-boost: boost tracks from preferred genres
      const genrePrefs = await this._getGenrePrefs(guildId);
      const origDuration = track?.info?.duration || 0;
      const filtered = candidates.filter((t: any) => {
        const titleL = (t?.info?.title || "").toLowerCase();
        const ta = (t?.info?.author || "").toLowerCase();
        return !this._isSameTrack(t, track) &&
        !this._isPlayed(guildId, t) &&
        !isCover(t?.info?.title || "", t?.info?.author) &&
        !titleL.includes("instrumental") && !titleL.includes("karaoke") &&
        !/session|#\w+|@\s+\w+|version|tribute\b/i.test(titleL) &&
        (origDuration < 30000 || !t?.info?.duration || Math.abs(t.info.duration - origDuration) / origDuration < 0.4) &&
        (!genrePrefs.size || genrePrefs.has(ta.replace(/[^a-z0-9]/g, "").slice(0, 20)));
      });

      if (!filtered.length) {
        const fallback = candidates.filter((t: any) => !this._isSameTrack(t, track) && !this._isPlayed(guildId, t));
        for (const t of fallback) this._markPlayed(guildId, t);
        Logger.info(`[RecEngine] Strict filter empty, fallback to lenient (${fallback.length} tracks)`);
        return fallback.sort(() => Math.random() - 0.5).slice(0, count);
      }

      for (const t of filtered) this._markPlayed(guildId, t);
      return filtered.sort(() => Math.random() - 0.5).slice(0, count);
    } catch { return []; }
  }
}

EventBus.on('recommendation:clearPlayed', (p: any) => { if (p?.guildId) new RecommendationEngine().clearPlayed(p.guildId); });

export default RecommendationEngine;
