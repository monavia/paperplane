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

      // 2. Fallback: ytmsearch pake judul spesifik
      if (!candidates.length) {
        const query = this._buildQuery(track.info);
        if (!query) return [];
        let result = await player.search({ query: `ytmsearch:${query}` });
        if (!result?.tracks?.length) result = await player.search({ query: `ytsearch:${query}` });
        if (!result?.tracks?.length) result = await player.search({ query: `scsearch:${query}` });
        candidates = result?.tracks || [];
      }

      if (!candidates.length) return [];
      const filtered = candidates.filter((t: any) => !this._isSameTrack(t, track) && !this._isPlayed(guildId, t));
      for (const t of filtered) this._markPlayed(guildId, t);
      return filtered.sort(() => Math.random() - 0.5).slice(0, count);
    } catch { return []; }
  }
}

export default RecommendationEngine;
