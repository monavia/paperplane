import RecommendationEngine from "./RecommendationEngine.js";

class AutoplayEngine {
  recEngine: RecommendationEngine;

  constructor() {
    this.recEngine = new RecommendationEngine();
  }

  async getNextTrack(player: any, currentTrack: any, _guildId: string): Promise<any> {
    if (!currentTrack?.info) return null;
    try {
      const recs = await this.recEngine.getRecommendations(player, currentTrack, _guildId, 3);
      if (!recs.length) return null;
      return recs[0];
    } catch {
      return null;
    }
  }
}

export default AutoplayEngine;
