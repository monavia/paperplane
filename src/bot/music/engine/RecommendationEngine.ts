import * as EventBus from "../events/EventBus";
import { isCover } from "../services/TitleResolver";
import Logger from "../../core/utils/Logger";

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
    // Fix truncated titles: "feat." tanpa tutup kurung
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

  async getRecommendations(player: any, track: any, guildId: string, count: number = 5): Promise<any[]> {
    if (!track?.info) return [];
    try {
      let candidates: any[] = [];

      // 1. Multi-source search pake judul (paling reliable buat cloud Lavalink)
      const query = this._buildQuery(track.info);
      if (query) {
        const searches = [
          `ytmsearch:${query}`,
          `ytsearch:${query}`,
          `scsearch:${query}`,
        ];
        for (const sq of searches) {
          const r = await this._searchWithRetry(player, { query: sq }).catch(() => null);
          if (r?.tracks?.length) { candidates = r.tracks; break; }
        }
      }

      // 2. Fallback: YouTube Mix (radio) — sering gagal di cloud Lavalink
      if (!candidates.length) {
        candidates = await this._getYouTubeMix(player, track);
      }

      // 3. Fallback: search by source URI
      if (!candidates.length && track.info?.uri && track.info.sourceName === "youtube") {
        const result = await this._searchWithRetry(player, { query: track.info.uri }).catch(() => null);
        if (result?.tracks?.length) candidates = result.tracks;
      }

      if (!candidates.length) {
        Logger.info(`[RecEngine] No candidates from any source for "${this._buildQuery(track.info)}"`);
        return [];
      }
      const origDuration = track?.info?.duration || 0;
      const filtered = candidates.filter((t: any) => {
        const titleL = (t?.info?.title || "").toLowerCase();
        return !this._isSameTrack(t, track) &&
        !this._isPlayed(guildId, t) &&
        !isCover(t?.info?.title || "", t?.info?.author) &&
        !titleL.includes("instrumental") &&
        !titleL.includes("karaoke") &&
        !/session|#\w+|@\s+\w+|version|tribute\b/i.test(titleL) &&
        (origDuration < 30000 || !t?.info?.duration || Math.abs(t.info.duration - origDuration) / origDuration < 0.4);
      });
      for (const t of filtered) this._markPlayed(guildId, t);
      return filtered.sort(() => Math.random() - 0.5).slice(0, count);
    } catch { return []; }
  }
}

EventBus.on('recommendation:clearPlayed', (p: any) => { if (p?.guildId) new RecommendationEngine().clearPlayed(p.guildId); });

export default RecommendationEngine;
