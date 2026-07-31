import * as EventBus from "../events/EventBus.js";
import { isCover } from "../services/TitleResolver.js";
import { getAdapter } from "../../cache/CacheAdapter.js";
import Logger from "../../core/utils/Logger.js";
import { CLICKBAIT_PATTERNS, EVENT_PATTERNS, REUPLOAD_RE, POST_OFFICIAL_RE, AUTHOR_OFFICIAL_RE, STYLE_RE } from "./JunkKeywords.js";

const GENRE_PREFIX = "taste:";
const TASTE_TTL = 7 * 86400000;
const JUNK_TITLE_THRESHOLD = 3;
const BAD_TRACK_CAP = 100;
const AUTHOR_REP_CAP = 20;

const badTracks = new Map<string, Set<string>>();
const authorRep = new Map<string, Map<string, number>>();

function trackKeyOf(track: any): string {
  const norm = (s: any) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = norm(track?.info?.author || "");
  const t = norm(track?.info?.title || "");
  return a ? `${a}-${t}` : t;
}

export function markBadTrack(guildId: string, track: any): void {
  const key = trackKeyOf(track);
  if (!key) return;
  if (!badTracks.has(guildId)) badTracks.set(guildId, new Set());
  const set = badTracks.get(guildId)!;
  set.add(key);
  if (set.size > BAD_TRACK_CAP) { const first = set.values().next().value; if (first) set.delete(first); }
  const author = (track?.info?.author || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  if (author) {
    if (!authorRep.has(guildId)) authorRep.set(guildId, new Map());
    const rep = authorRep.get(guildId)!;
    rep.set(author, (rep.get(author) || 0) + 1);
    if (rep.size > AUTHOR_REP_CAP) { const first = rep.keys().next().value; if (first) rep.delete(first); }
  }
}

function clearBadTrack(guildId: string): void {
  badTracks.delete(guildId);
  authorRep.delete(guildId);
}

function isBadTrack(guildId: string, track: any): boolean {
  return badTracks.get(guildId)?.has(trackKeyOf(track)) || false;
}

function authorPenalty(guildId: string, author: string): number {
  if (!author) return 0;
  const k = author.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  return authorRep.get(guildId)?.get(k) || 0;
}

function junkScore(title: string, author?: string): number {
  const t = title || "";
  const a = author || "";
  let score = 0;
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(t)) score += 2;
  if (/^\s*[(\[]/.test(t) && /[)\]]/.test(t)) score += 1;
  if (/\/\/|\|\||\|[^|]*\|/.test(t)) score += 1;
  if (/\|\s*[a-z]{3,}/i.test(t)) score += 1;
  if (/\b[A-Z][A-Z\s-]{14,}\b/.test(t)) score += 2;
  if (/\b[A-Z][A-Z\s-]{14,}\b/.test(a)) score += 2;
  for (const re of CLICKBAIT_PATTERNS) if (re.test(t) || re.test(a)) score += 2;
  for (const re of EVENT_PATTERNS) if (re.test(t) || re.test(a)) score += 2;
  if (POST_OFFICIAL_RE.test(t)) score += 2;
  if (AUTHOR_OFFICIAL_RE.test(a)) score += 2;
  if ((a.match(/(?:^|\s)-\s/g) || []).length >= 2) score += 2;
  if (REUPLOAD_RE.test(t)) score += 2;
  if (/!{2,}|\?{2,}/.test(t)) score += 1;
  return score;
}

export function isJunkTrack(title: string, author?: string): boolean {
  return junkScore(title, author) >= JUNK_TITLE_THRESHOLD;
}

export function isJunkTitle(title: string): boolean {
  return isJunkTrack(title);
}

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

  _extractKeywords(track: any): Set<string> {
    const stopWords = new Set([
      "the","a","an","in","on","at","to","for","of","with","and","or","is",
      "are","was","were","be","been","being","have","has","had","do","does",
      "did","will","would","can","could","shall","should","may","might",
      "feat","ft","featuring","official","mv","m/v","video","audio",
      "lyrics","lyric","hd","hq","4k","1080p","2160p","new","remix","mix",
      "edit","version","song","music","track","album","single",
    ]);
    const words = new Set<string>();
    const add = (s: string) => {
      for (const raw of (s || "").toLowerCase().split(/[\s,()[\]]+/)) {
        const w = raw.replace(/[^a-z0-9가-힣]/g, "").trim();
        if (w && w.length > 1 && !stopWords.has(w)) words.add(w);
      }
    };
    add(track.info?.author);
    add(track.info?.title);
    return words;
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

  clearPlayed(guildId: string): void {
    this.playedTracks.delete(guildId);
    clearBadTrack(guildId);
  }

  _candidateScore(t: any, track: any, genrePrefs: Set<string>, origDuration: number, origKeywords: Set<string>, sourceW: number, guildId: string): number {
    let s = sourceW;
    const d = t?.info?.duration || 0;
    if (origDuration && d) {
      const ratio = Math.abs(d - origDuration) / origDuration;
      if (ratio < 0.1) s += 3;
      else if (ratio < 0.25) s += 1;
    }
    const ta = (t?.info?.author || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
    if (genrePrefs.has(ta)) s += 2;
    const candKw = this._extractKeywords(t);
    for (const k of origKeywords) if (candKw.has(k)) s += 1;
    s -= junkScore(t?.info?.title || "", t?.info?.author);
    if (isBadTrack(guildId, t)) s -= 100;
    s -= authorPenalty(guildId, t?.info?.author) * 3;
    if (t?.encoded) s += 1;
    return s;
  }

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

      const candidates: { t: any; w: number }[] = [];
      const seen = new Set<string>();

      // 1. Primary: YouTube Mix (radio) — cap at top N to avoid garbage flooding.
      //    Mix is the biggest junk source — rank its candidates low.
      const MAX_MIX = 15;
      const mixTracks = await this._getYouTubeMix(player, track);
      for (const t of mixTracks.slice(0, MAX_MIX)) {
        const k = this._trackKey(t);
        if (!seen.has(k)) { seen.add(k); candidates.push({ t, w: -1 }); }
      }

      // 2. Similar artist search — diverse recommendations, highest priority
      const author = (track.info.author || "").replace(/^Various\s*$/i, "").trim();
      if (author && author !== "Unknown Artist") {
        const r = await this._searchWithRetry(player, { query: `ytmsearch:${author}` }).catch(() => null);
        if (r?.tracks?.length) {
          for (const t of r.tracks) {
            const k = this._trackKey(t);
            if (!seen.has(k)) { seen.add(k); candidates.push({ t, w: 1 }); }
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
              if (!seen.has(k)) { seen.add(k); candidates.push({ t, w: 0 }); }
            }
          }
        }
      }

      const genrePrefs = await this._getGenrePrefs(guildId);
      const origDuration = track?.info?.duration || 0;
      const origKeywords = this._extractKeywords(track);
      const score = (t: any, w: number) => this._candidateScore(t, track, genrePrefs, origDuration, origKeywords, w, guildId);

      const filtered = candidates.filter(({ t }) => {
        const titleL = (t?.info?.title || "").toLowerCase();
        const ta = (t?.info?.author || "").toLowerCase();
        const candKeywords = this._extractKeywords(t);
        const hasOverlap = !origKeywords.size || origKeywords.size < 2 ||
          [...origKeywords].some(k => candKeywords.has(k));
        return !this._isSameTrack(t, track) &&
        !this._isPlayed(guildId, t) &&
        !isBadTrack(guildId, t) &&
        !isCover(t?.info?.title || "", t?.info?.author) &&
        !isJunkTrack(t?.info?.title || "", t?.info?.author) &&
        !titleL.includes("instrumental") && !titleL.includes("karaoke") &&
        !STYLE_RE.test(titleL) &&
        (origDuration < 30000 || !t?.info?.duration || Math.abs(t.info.duration - origDuration) / origDuration < 0.4) &&
        (!genrePrefs.size || genrePrefs.has(ta.replace(/[^a-z0-9]/g, "").slice(0, 20))) &&
        hasOverlap;
      });

      if (!filtered.length) {
        const fallback = candidates.filter(({ t }) => {
          const tl = (t?.info?.title || "").toLowerCase();
          return !this._isSameTrack(t, track) && !this._isPlayed(guildId, t) &&
            !isBadTrack(guildId, t) &&
            !isCover(t?.info?.title || "", t?.info?.author) &&
            !isJunkTrack(t?.info?.title || "", t?.info?.author) &&
            !STYLE_RE.test(tl);
        });
        for (const { t } of fallback) this._markPlayed(guildId, t);
        Logger.info(`[RecEngine] Strict filter empty, fallback to lenient (${fallback.length} tracks)`);
        return fallback
          .map(({ t, w }) => ({ t, s: score(t, w) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, count)
          .map(({ t }) => t);
      }

      for (const { t } of filtered) this._markPlayed(guildId, t);
      return filtered
        .map(({ t, w }) => ({ t, s: score(t, w) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, count)
        .map(({ t }) => t);
    } catch { return []; }
  }
}

EventBus.on('recommendation:clearPlayed', (p: any) => { if (p?.guildId) new RecommendationEngine().clearPlayed(p.guildId); });
EventBus.on('recommendation:markBad', (p: any) => { if (p?.guildId && p?.track) markBadTrack(p.guildId, p.track); });

export { markBadTrack as markBad };
export default RecommendationEngine;
