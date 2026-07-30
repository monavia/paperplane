import RecommendationEngine from "./RecommendationEngine.js";
import Logger from "../../core/utils/Logger.js";

const MAX_AUTOPLAY_HISTORY = 20;
const MAX_CONSECUTIVE_AUTOPLAY = 500;
const MAX_CONSECUTIVE_SKIPS = 5;
const DISABLE_DURATION_MS = 5 * 60 * 1000;
const LOOP_THRESHOLD = 3;

class AutoplayEngine {
  recEngine: RecommendationEngine;

  private recentAutoplay: Map<string, string[]> = new Map();
  private autoplayConsecutiveSkips: Map<string, number> = new Map();
  private disableAutoplayUntil: Map<string, number> = new Map();
  private autoplayTrackCount: Map<string, number> = new Map();

  constructor() {
    this.recEngine = new RecommendationEngine();
  }

  private _isDisabled(guildId: string): boolean {
    const until = this.disableAutoplayUntil.get(guildId);
    if (!until) return false;
    if (Date.now() < until) return true;
    this.disableAutoplayUntil.delete(guildId);
    return false;
  }

  private _trackKey(track: any): string {
    const norm = (s: any) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${norm(track?.info?.author || "")}-${norm(track?.info?.title || "")}`;
  }

  private _detectLoop(guildId: string, key: string): boolean {
    let keys = this.recentAutoplay.get(guildId);
    if (!keys) { keys = []; this.recentAutoplay.set(guildId, keys); }
    keys.push(key);
    if (keys.length > MAX_AUTOPLAY_HISTORY) keys.shift();
    const count = keys.filter(k => k === key).length;
    return count >= LOOP_THRESHOLD;
  }

  private _disable(guildId: string, reason: string): void {
    Logger.warn(`[Autoplay] ${reason} — disabling autoplay for guild=${guildId} 5min`);
    this.disableAutoplayUntil.set(guildId, Date.now() + DISABLE_DURATION_MS);
    this.autoplayConsecutiveSkips.delete(guildId);
    this.autoplayTrackCount.delete(guildId);
    this.recentAutoplay.delete(guildId);
  }

  async getNextTrack(player: any, currentTrack: any, guildId: string): Promise<any> {
    let track = currentTrack;
    if (!track?.info) track = player.queue.previous?.[0] || null;
    if (!track?.info) return null;

    if (this._isDisabled(guildId)) return null;

    try {
      const recs = await this.recEngine.getRecommendations(player, currentTrack, guildId, 3);
      if (!recs.length) return null;

      const nextTrack = recs[0];

      const count = (this.autoplayTrackCount.get(guildId) || 0) + 1;
      this.autoplayTrackCount.set(guildId, count);
      if (count >= MAX_CONSECUTIVE_AUTOPLAY) {
        this._disable(guildId, `Reached ${MAX_CONSECUTIVE_AUTOPLAY} consecutive autoplay tracks`);
        return null;
      }

      const key = this._trackKey(nextTrack);
      const isLoop = this._detectLoop(guildId, key);

      if (isLoop) {
        const skips = (this.autoplayConsecutiveSkips.get(guildId) || 0) + 1;
        this.autoplayConsecutiveSkips.set(guildId, skips);
        if (skips >= MAX_CONSECUTIVE_SKIPS) {
          this._disable(guildId, `Loop circuit breaker tripped (${skips}x)`);
          return null;
        }
        Logger.warn(`[Autoplay] Loop guild=${guildId} key="${key}" skip=${skips}/${MAX_CONSECUTIVE_SKIPS}`);
      } else {
        this.autoplayConsecutiveSkips.set(guildId, 0);
      }

      return nextTrack;
    } catch {
      return null;
    }
  }

  clearAutoplay(guildId: string): void {
    this.recentAutoplay.delete(guildId);
    this.autoplayConsecutiveSkips.delete(guildId);
    this.disableAutoplayUntil.delete(guildId);
    this.autoplayTrackCount.delete(guildId);
  }
}

export default AutoplayEngine;
