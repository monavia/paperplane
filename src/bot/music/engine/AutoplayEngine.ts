import RecommendationEngine, { stripTitleVariants, normAuthor } from "./RecommendationEngine.js";
import Logger from "../../core/utils/Logger.js";
import { MIN_DURATION_MS, MAX_DURATION_MS } from "../services/DurationFilter.js";

const PREFETCH_TTL_MS = 10 * 60 * 1000;
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
  private prefetchCache: Map<string, { track: any; sourceKey: string; at: number }> = new Map();
  private prefetchTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private prefetching: Set<string> = new Set();

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
    return `${normAuthor(track?.info?.author || "")}-${stripTitleVariants(track?.info?.title || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")}`;
  }

  private _sourceKey(track: any): string {
    return track?.info?.identifier || this._trackKey(track);
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
    this.clearPrefetch(guildId);
  }

  private async _computeNext(player: any, currentTrack: any, guildId: string): Promise<any> {
    let track = currentTrack;
    if (!track?.info) track = player.queue.previous?.[0] || null;
    if (!track?.info) return null;
    const recs = await this.recEngine.getRecommendations(player, currentTrack, guildId, 3);
    if (!recs.length) return null;
    // recs[0] bisa gagal/ganda/out-of-range (lenient fallback) — cari kandidat valid pertama.
    // Durasi WAJIB ada + dalam 2–8 menit: track tanpa durasi = video non-musik (presentasi, podcast).
    return recs.find((r: any) => r?.info?.title && r.info?.duration >= MIN_DURATION_MS && r.info?.duration <= MAX_DURATION_MS) || null;
  }

  // Safeguard terpusat: counter autoplay, loop detect, circuit breaker.
  // Hanya dijalankan saat KONSUMSI (getNextTrack), bukan saat prefetch —
  // supaya skip/disable counter tidak bertambah untuk prefetch yang tidak terpakai.
  private _applyGuards(track: any, guildId: string): any {
    const count = (this.autoplayTrackCount.get(guildId) || 0) + 1;
    this.autoplayTrackCount.set(guildId, count);
    if (count >= MAX_CONSECUTIVE_AUTOPLAY) {
      this._disable(guildId, `Reached ${MAX_CONSECUTIVE_AUTOPLAY} consecutive autoplay tracks`);
      return null;
    }

    const key = this._trackKey(track);
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

    return track;
  }

  async getNextTrack(player: any, currentTrack: any, guildId: string): Promise<any> {
    let track = currentTrack;
    if (!track?.info) track = player.queue.previous?.[0] || null;
    if (!track?.info) return null;

    if (this._isDisabled(guildId)) return null;

    // Seed track ke history supaya loop-detect bekerja dari awal (hindar repeat seed).
    const seedKey = this._trackKey(track);
    let keys = this.recentAutoplay.get(guildId);
    if (!keys) { keys = []; this.recentAutoplay.set(guildId, keys); }
    if (!keys.includes(seedKey)) keys.push(seedKey);

    // Prefetch hit: rec sudah dihitung saat lagu masih berjalan → return instan
    // (YouTube-style: gap < 300ms). Cache dibuang setelah dipakai.
    const cached = this.prefetchCache.get(guildId);
    if (cached && cached.sourceKey === this._sourceKey(track) && Date.now() - cached.at < PREFETCH_TTL_MS) {
      this.prefetchCache.delete(guildId);
      Logger.info(`[Autoplay] prefetch hit guild=${guildId} (stored ${Date.now() - cached.at}ms ago)`);
      return this._applyGuards(cached.track, guildId);
    }
    this.prefetchCache.delete(guildId);

    try {
      const next = await this._computeNext(player, currentTrack, guildId);
      if (!next) return null;
      return this._applyGuards(next, guildId);
    } catch {
      return null;
    }
  }

  // Hitung rec lagu berikutnya DI AWAL (15s sebelum lagu selesai), cache hasilnya.
  // Side-effect rec engine (_markPlayed pada candidates) jalan di sini — konsumsi tidak search ulang.
  async prefetch(player: any, sourceTrack: any, guildId: string): Promise<void> {
    if (this._isDisabled(guildId)) return;
    if (this.prefetching.has(guildId)) return;
    this.prefetching.add(guildId);
    try {
      const next = await this._computeNext(player, sourceTrack, guildId);
      if (next) {
        this.prefetchCache.set(guildId, { track: next, sourceKey: this._sourceKey(sourceTrack), at: Date.now() });
        Logger.info(`[Autoplay] prefetch stored guild=${guildId} next="${next?.info?.title?.slice(0, 40) || "?"}"`);
      } else {
        Logger.info(`[Autoplay] prefetch empty guild=${guildId} (no valid rec)`);
      }
    } catch (err: any) {
      Logger.warn(`[Autoplay] prefetch failed guild=${guildId}: ${err?.message?.slice(0, 60) || err}`);
    } finally {
      this.prefetching.delete(guildId);
    }
  }

  // Jadwalkan prefetch ~15s sebelum lagu selesai. Floor 10s untuk lagu pendek.
  schedulePrefetch(player: any, sourceTrack: any, guildId: string, durationMs: number): void {
    const existing = this.prefetchTimers.get(guildId);
    if (existing) clearTimeout(existing);
    const delay = Math.max(10000, durationMs - 15000);
    const timer = setTimeout(() => {
      this.prefetchTimers.delete(guildId);
      this.prefetch(player, sourceTrack, guildId).catch(() => {});
    }, delay);
    this.prefetchTimers.set(guildId, timer);
  }

  clearPrefetch(guildId: string): void {
    const t = this.prefetchTimers.get(guildId);
    if (t) { clearTimeout(t); this.prefetchTimers.delete(guildId); }
    this.prefetchCache.delete(guildId);
    this.prefetching.delete(guildId);
  }

  clearAutoplay(guildId: string): void {
    this.clearPrefetch(guildId);
    this.recentAutoplay.delete(guildId);
    this.autoplayConsecutiveSkips.delete(guildId);
    this.disableAutoplayUntil.delete(guildId);
    this.autoplayTrackCount.delete(guildId);
  }
}

export default AutoplayEngine;
