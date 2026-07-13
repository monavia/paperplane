class RecommendationEngine {
  private playedTracks: Map<string, Set<string>> = new Map();

  _buildQuery(info: any): string {
    const author = (info.author || "").replace(/^Various\s*$/i, "").trim();
    if (author && author !== "Unknown Artist" && author !== "Unknown") return `${author} official audio`;
    return (info.title || "").trim();
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
    const query = this._buildQuery(track.info);
    if (!query) return [];
    try {
      const result = await player.search({ query: `ytsearch:${query}` });
      if (!result?.tracks?.length) return [];
      const filtered = result.tracks.filter((t: any) => !this._isSameTrack(t, track) && !this._isPlayed(guildId, t));
      for (const t of filtered) this._markPlayed(guildId, t);
      return filtered.sort(() => Math.random() - 0.5).slice(0, count);
    } catch { return []; }
  }
}

export default RecommendationEngine;
