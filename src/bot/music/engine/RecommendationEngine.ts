import { isCover } from "../services/TitleResolver";

class RecommendationEngine {
  private playedTracks: Map<string, Set<string>> = new Map();

  _buildQuery(info: any): string {
    const author = (info.author || "").replace(/^Various\s*$/i, "").trim();
    if (author && author !== "Unknown Artist" && author !== "Unknown") return `${author} - ${info.title}`.trim();
    return (info.title || "").trim();
  }

  async _getYouTubeMix(player: any, track: any): Promise<any[]> {
    const videoId = track?.info?.identifier;
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return [];
    if (track?.info?.sourceName && track.info.sourceName !== "youtube") return [];
    const result = await player.search({ query: `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}` }).catch(() => null);
    if (result?.loadType !== "playlist" || !result?.tracks?.length) return [];
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

      // 1. YouTube Mix (radio) — rekomendasi algoritma YouTube
      candidates = await this._getYouTubeMix(player, track);

      // 2. Fallback: search by source URI (preserves exact track when available)
      if (!candidates.length && track.info?.uri && track.info.sourceName === "youtube") {
        const result = await player.search({ query: track.info.uri });
        if (result?.tracks?.length) candidates = result.tracks;
      }

      // 3. Fallback: ytmsearch pake judul spesifik
      if (!candidates.length) {
        const query = this._buildQuery(track.info);
        if (!query) return [];
        const result = await player.search({ query: `ytmsearch:${query} official audio` });
        if (!result?.tracks?.length) {
          const r2 = await player.search({ query: `ytsearch:${query}` });
          if (!r2?.tracks?.length) {
            const r3 = await player.search({ query: `scsearch:${query}` });
            candidates = r3?.tracks || [];
          } else candidates = r2.tracks;
        } else candidates = result.tracks;
        if (!candidates.length) {
          const query2 = this._buildQuery(track.info);
          const fallback = await player.search({ query: `ytmsearch:${query2}` }).catch(() => null);
          if (fallback?.tracks?.length) candidates = fallback.tracks;
        }
      }

      if (!candidates.length) return [];
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

export default RecommendationEngine;
