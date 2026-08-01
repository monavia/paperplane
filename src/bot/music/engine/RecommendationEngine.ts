import * as EventBus from "../events/EventBus.js";
import { isCover } from "../services/TitleResolver.js";
import { getAdapter } from "../../cache/CacheAdapter.js";
import Logger from "../../core/utils/Logger.js";
import { CLICKBAIT_PATTERNS, EVENT_PATTERNS, REUPLOAD_RE, POST_OFFICIAL_RE, AUTHOR_OFFICIAL_RE, STYLE_RE, STYLE_ML_RE, HARD_JUNK_RE, SOFT_JUNK_RE } from "./JunkKeywords.js";
import { isInDurationRange } from "../services/DurationFilter.js";

const GENRE_PREFIX = "taste:";
const TASTE_TTL = 7 * 86400000;
const JUNK_TITLE_THRESHOLD = 3;
const BAD_TRACK_CAP = 100;
const AUTHOR_REP_CAP = 20;
const COMBO_CAP = 200;
const COOCCUR_EDGE_CAP = 2000;
const RAPID_SKIP_WINDOW_MS = 60000;
const STRICT_BOOST_MS = 60000;
const COOCCUR_WINDOW_MS = 3 * 60000;
const SIGNAL_WEIGHTS_KEY = "autoplay:signalWeights";
const SIGNAL_WEIGHTS_TTL = 7 * 86400000;
const SIGNAL_WEIGHTS_SAVE_DELAY_MS = 10000;

const DEFAULT_SIGNAL_WEIGHTS: Record<string, number> = {
  emoji: 2, openParen: 1, dblSeparator: 1, pipeSuffix: 1,
  capsTitle: 2, capsAuthor: 2, clickbait: 2, event: 2,
  postOfficial: 2, authorOfficial: 2, multiDash: 2, reupload: 2,
  bangQuest: 1, hardJunk: 3, softJunk: 1, styleML: 1,
};

const playedTracks = new Map<string, Set<string>>();
const VARIANT_PAREN_RE = /[([][^()\]]*(?:official|remix|radio\s*edit|lyrics?|lyric\s*video|slowed|sped\s*up|cover|karaoke|instrumental|audio|video|mv|4k|hd|720p|1080p)[^()\]]*[)\]]/gi;
const VARIANT_DASH_RE = /[-\u2013\u2014]\s*(?:official(?:\s*(?:music\s*)?(?:video|audio)|\s*lyrics?)?|lyric\s*video|remix|radio\s*edit|slowed(?:\s*\+?\s*reverb)?|sped\s*up|cover|karaoke|instrumental|mv|4k|hd|720p|1080p)\s*$/i;
const stripTitleVariants = (s: string) => s.replace(VARIANT_PAREN_RE, "").replace(VARIANT_DASH_RE, "").trim();
const AUTHOR_SUFFIX_RE = /[-–—]\s*topic\s*$|\s*official\s*$/i;
const normAuthor = (s: any) => (s || "").toLowerCase().replace(AUTHOR_SUFFIX_RE, "").replace(/[^\p{L}\p{N}]/gu, "");
const badTracks = new Map<string, Set<string>>();
const authorRep = new Map<string, Map<string, number>>();
const goodAuthorRep = new Map<string, Map<string, number>>();
const signalWeights = new Map<string, number>(Object.entries(DEFAULT_SIGNAL_WEIGHTS));
const comboHistory = new Map<string, { bad: number; good: number }>();
const rapidSkips = new Map<string, number[]>();
const strictBoost = new Map<string, { until: number }>();
const cooccur = new Map<string, Map<string, number>>();
const lastTrack = new Map<string, { key: string; at: number }>();
let signalWeightsLoaded = false;
let signalWeightsSaveTimer: any = null;

function trackKeyOf(track: any): string {
  const norm = (s: any) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
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
  const author = (track?.info?.author || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 20);
  if (author) {
    if (!authorRep.has(guildId)) authorRep.set(guildId, new Map());
    const rep = authorRep.get(guildId)!;
    rep.set(author, (rep.get(author) || 0) + 1);
    if (rep.size > AUTHOR_REP_CAP) { const first = rep.keys().next().value; if (first) rep.delete(first); }
  }
  const signals = getTriggeredSignals(track?.info?.title || "", track?.info?.author);
  if (signals.size) {
    for (const s of signals.keys()) signalWeights.set(s, Math.min(4, (signalWeights.get(s) || 0) + 0.5));
    scheduleSignalWeightSave();
    const comboKey = [...signals.keys()].sort().join("|");
    const combo = comboHistory.get(comboKey) || { bad: 0, good: 0 };
    combo.bad++;
    comboHistory.set(comboKey, combo);
    if (comboHistory.size > COMBO_CAP) { const first = comboHistory.keys().next().value; if (first !== undefined) comboHistory.delete(first); }
  }
}

export function markGoodTrack(guildId: string, track: any): void {
  const signals = getTriggeredSignals(track?.info?.title || "", track?.info?.author);
  if (signals.size) {
    for (const s of signals.keys()) signalWeights.set(s, Math.max(0.5, (signalWeights.get(s) || 0) - 0.3));
    scheduleSignalWeightSave();
    const comboKey = [...signals.keys()].sort().join("|");
    const combo = comboHistory.get(comboKey) || { bad: 0, good: 0 };
    combo.good++;
    comboHistory.set(comboKey, combo);
    if (comboHistory.size > COMBO_CAP) { const first = comboHistory.keys().next().value; if (first !== undefined) comboHistory.delete(first); }
  }
  const author = (track?.info?.author || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 20);
  if (author) {
    if (!goodAuthorRep.has(guildId)) goodAuthorRep.set(guildId, new Map());
    const rep = goodAuthorRep.get(guildId)!;
    rep.set(author, (rep.get(author) || 0) + 1);
    if (rep.size > AUTHOR_REP_CAP) { const first = rep.keys().next().value; if (first) rep.delete(first); }
  }
  incrementGenre(guildId, track?.info?.author).catch(() => {});
}

async function incrementGenre(guildId: string, author: string): Promise<void> {
  if (!author) return;
  try {
    const adapter = getAdapter();
    const key = `${GENRE_PREFIX}${guildId}`;
    const taste = await adapter.get<Record<string, number>>(key) || {};
    const genre = author.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 20);
    if (genre) { taste[genre] = (taste[genre] || 0) + 1; await adapter.set(key, taste, TASTE_TTL); }
  } catch {}
}

function isBadTrack(guildId: string, track: any): boolean {
  return badTracks.get(guildId)?.has(trackKeyOf(track)) || false;
}

function authorPenalty(guildId: string, author: string): number {
  if (!author) return 0;
  const k = author.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 20);
  return authorRep.get(guildId)?.get(k) || 0;
}

function getTriggeredSignals(title: string, author?: string): Map<string, number> {
  const t = title || "";
  const a = author || "";
  const signals = new Map<string, number>();
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(t)) signals.set("emoji", 1);
  if (/^\s*[(\[]/.test(t) && /[)\]]/.test(t)) signals.set("openParen", 1);
  if (/\/\/|\|\||\|[^|]*\|/.test(t)) signals.set("dblSeparator", 1);
  if (/\|\s*#?[a-z0-9]{3,}/i.test(t)) signals.set("pipeSuffix", 1);
  if (HARD_JUNK_RE.test(t)) signals.set("hardJunk", 1);
  if (SOFT_JUNK_RE.test(t)) signals.set("softJunk", 1);
  if (STYLE_ML_RE.test(t)) signals.set("styleML", 1);
  if (/\b[A-Z][A-Z\s-]{14,}\b/.test(t)) signals.set("capsTitle", 1);
  if (/\b[A-Z][A-Z\s-]{14,}\b/.test(a)) signals.set("capsAuthor", 1);
  let clickbaitCount = 0;
  for (const re of CLICKBAIT_PATTERNS) if (re.test(t) || re.test(a)) clickbaitCount++;
  if (clickbaitCount) signals.set("clickbait", clickbaitCount);
  let eventCount = 0;
  for (const re of EVENT_PATTERNS) if (re.test(t) || re.test(a)) eventCount++;
  if (eventCount) signals.set("event", eventCount);
  if (POST_OFFICIAL_RE.test(t)) signals.set("postOfficial", 1);
  if (AUTHOR_OFFICIAL_RE.test(a)) signals.set("authorOfficial", 1);
  if ((a.match(/(?:^|\s)-\s/g) || []).length >= 2) signals.set("multiDash", 1);
  if (REUPLOAD_RE.test(t)) signals.set("reupload", 1);
  if (/!{2,}|\?{2,}/.test(t)) signals.set("bangQuest", 1);
  return signals;
}

async function loadSignalWeights(): Promise<void> {
  if (signalWeightsLoaded) return;
  signalWeightsLoaded = true;
  try {
    const saved = await getAdapter().get<Record<string, number>>(SIGNAL_WEIGHTS_KEY);
    if (saved) {
      for (const [k, v] of Object.entries(saved)) {
        if (k in DEFAULT_SIGNAL_WEIGHTS) signalWeights.set(k, v);
      }
    }
  } catch {}
}

function ensureWeightsLoaded(): void {
  if (!signalWeightsLoaded) loadSignalWeights().catch(() => {});
}

function scheduleSignalWeightSave(): void {
  if (signalWeightsSaveTimer) clearTimeout(signalWeightsSaveTimer);
  signalWeightsSaveTimer = setTimeout(() => {
    signalWeightsSaveTimer = null;
    getAdapter().set(SIGNAL_WEIGHTS_KEY, Object.fromEntries(signalWeights), SIGNAL_WEIGHTS_TTL).catch(() => {});
  }, SIGNAL_WEIGHTS_SAVE_DELAY_MS);
}

function junkScore(title: string, author?: string): number {
  ensureWeightsLoaded();
  let score = 0;
  for (const [s, count] of getTriggeredSignals(title, author)) score += (signalWeights.get(s) || 0) * count;
  return score;
}

export function isJunkTrack(title: string, author?: string, thresholdOffset = 0): boolean {
  return junkScore(title, author) >= JUNK_TITLE_THRESHOLD + thresholdOffset;
}

export function isJunkTitle(title: string): boolean {
  return isJunkTrack(title);
}

function isComboBad(guildId: string, track: any): boolean {
  const signals = getTriggeredSignals(track?.info?.title || "", track?.info?.author);
  if (!signals.size) return false;
  const h = comboHistory.get([...signals.keys()].sort().join("|"));
  if (!h) return false;
  const total = h.bad + h.good;
  return total >= 5 && h.bad / total >= 0.7;
}

function noteMarkBad(guildId: string): void {
  const now = Date.now();
  const list = (rapidSkips.get(guildId) || []).filter(ts => now - ts < RAPID_SKIP_WINDOW_MS);
  list.push(now);
  rapidSkips.set(guildId, list);
  if (list.length >= 2) strictBoost.set(guildId, { until: now + STRICT_BOOST_MS });
}

function isStrictBoostActive(guildId: string): boolean {
  const boost = strictBoost.get(guildId);
  return !!boost && boost.until > Date.now();
}

class RecommendationEngine {
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
        const w = raw.replace(/[^\p{L}\p{N}]/gu, "").trim();
        if (w && w.length > 1 && !stopWords.has(w)) words.add(w);
      }
    };
    add(track.info?.author);
    add(track.info?.title);
    return words;
  }

  _isSameTrack(a: any, b: any): boolean {
    if (!a?.info || !b?.info) return false;
    const norm = (s: any) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const at = norm(stripTitleVariants(a.info.title));
    const bt = norm(stripTitleVariants(b.info.title));
    if (at !== bt) return false;
    const aa = normAuthor(a.info.author);
    const ba = normAuthor(b.info.author);
    return aa === ba || (!!aa && !!ba && (aa.includes(ba) || ba.includes(aa)));
  }

  _isNearDuplicate(a: any, b: any): boolean {
    if (!a?.info || !b?.info) return false;
    const tokens = (s: any) => new Set<string>((s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean));
    const jaccard = (x: Set<string>, y: Set<string>): number => {
      if (!x.size && !y.size) return 0;
      let inter = 0;
      for (const w of x) if (y.has(w)) inter++;
      const union = x.size + y.size - inter;
      return union ? inter / union : 0;
    };
    return jaccard(tokens(a.info.title), tokens(b.info.title)) >= 0.8 &&
      jaccard(tokens(a.info.author), tokens(b.info.author)) >= 0.5;
  }

  _trackKey(track: any): string {
    const norm = (s: any) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    return `${norm(track?.info?.author || "")}-${norm(stripTitleVariants(track?.info?.title || ""))}`;
  }

  _isPlayed(guildId: string, track: any): boolean {
    return playedTracks.get(guildId)?.has(this._trackKey(track)) || false;
  }

  _markPlayed(guildId: string, track: any): void {
    if (!playedTracks.has(guildId)) playedTracks.set(guildId, new Set());
    const played = playedTracks.get(guildId)!;
    played.add(this._trackKey(track));
    if (played.size > 100) { const first = played.values().next().value; if (first) played.delete(first); }
  }

  clearPlayed(guildId: string): void {
    playedTracks.delete(guildId);
  }

  _candidateScore(t: any, track: any, genrePrefs: Set<string>, origDuration: number, origKeywords: Set<string>, sourceW: number, guildId: string): number {
    let s = sourceW;
    const d = t?.info?.duration || 0;
    if (origDuration && d) {
      const ratio = Math.abs(d - origDuration) / origDuration;
      if (ratio < 0.1) s += 3;
      else if (ratio < 0.25) s += 1;
    }
    const ta = (t?.info?.author || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 20);
    if (genrePrefs.has(ta)) s += 2;
    const candKw = this._extractKeywords(t);
    for (const k of origKeywords) if (candKw.has(k)) s += 1;
    s -= junkScore(t?.info?.title || "", t?.info?.author);
    if (isBadTrack(guildId, t)) s -= 100;
    s -= authorPenalty(guildId, t?.info?.author) * 3;
    if (t?.encoded) s += 1;
    const tk = trackKeyOf(t);
    const origKey = trackKeyOf(track);
    if (tk && origKey) {
      const c1 = cooccur.get(origKey)?.get(tk) || 0;
      const c2 = cooccur.get(tk)?.get(origKey) || 0;
      s += Math.min(Math.max(c1, c2), 10) * 1.5;
    }
    return s;
  }

  async _incrementGenre(guildId: string, author: string): Promise<void> {
    return incrementGenre(guildId, author);
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
      this._markPlayed(guildId, track);
      this._incrementGenre(guildId, track.info.author).catch(() => {});

      const candidates: { t: any; w: number }[] = [];
      const seen = new Set<string>();

      // 1. Primary: YouTube Mix (radio) — cap at top N to avoid garbage flooding.
      //    Mix is the biggest junk source — rank its candidates low.
      const MAX_MIX = 15;
      const mixTracks = await this._getYouTubeMix(player, track);
      const mixW = isStrictBoostActive(guildId) ? -3 : -1;
      for (const t of mixTracks.slice(0, MAX_MIX)) {
        const k = this._trackKey(t);
        if (!seen.has(k)) { seen.add(k); candidates.push({ t, w: mixW }); }
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
      const strictActive = isStrictBoostActive(guildId);
      const score = (t: any, w: number) => this._candidateScore(t, track, genrePrefs, origDuration, origKeywords, w, guildId);

      const filtered = candidates.filter(({ t }) => {
        const titleL = (t?.info?.title || "").toLowerCase();
        const ta = (t?.info?.author || "").toLowerCase();
        const candKeywords = this._extractKeywords(t);
        const hasOverlap = !origKeywords.size || origKeywords.size < 2 ||
          [...origKeywords].some(k => candKeywords.has(k));
        return !this._isSameTrack(t, track) &&
        !this._isNearDuplicate(t, track) &&
        !this._isPlayed(guildId, t) &&
        !isBadTrack(guildId, t) &&
        !isComboBad(guildId, t) &&
        !isCover(t?.info?.title || "", t?.info?.author) &&
        !isJunkTrack(t?.info?.title || "", t?.info?.author, strictActive ? 1 : 0) &&
        !titleL.includes("instrumental") && !titleL.includes("karaoke") &&
        !STYLE_RE.test(titleL) && !STYLE_ML_RE.test(titleL) &&
        !!t?.info?.duration && isInDurationRange(t) &&
        (origDuration < 30000 || !t?.info?.duration || Math.abs(t.info.duration - origDuration) / origDuration < 0.4) &&
        (!genrePrefs.size || genrePrefs.has(ta.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 20))) &&
        hasOverlap;
      });

      if (!filtered.length) {
        const fallback = candidates.filter(({ t }) => {
          const tl = (t?.info?.title || "").toLowerCase();
          return !this._isSameTrack(t, track) && !this._isNearDuplicate(t, track) && !this._isPlayed(guildId, t) &&
            !isBadTrack(guildId, t) &&
            !isComboBad(guildId, t) &&
            !isCover(t?.info?.title || "", t?.info?.author) &&
            !isJunkTrack(t?.info?.title || "", t?.info?.author) &&
            !STYLE_RE.test(tl) && !STYLE_ML_RE.test(tl) &&
            !!t?.info?.duration && isInDurationRange(t);
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
EventBus.on('recommendation:markBad', (p: any) => {
  if (p?.guildId && p?.track) {
    markBadTrack(p.guildId, p.track);
    if (p?.source === "skip") noteMarkBad(p.guildId);
  }
});
EventBus.on('recommendation:markGood', (p: any) => { if (p?.guildId && p?.track) markGoodTrack(p.guildId, p.track); });
EventBus.on('history:addEntry', (p: any) => {
  if (!p?.guildId || !p?.track) return;
  const now = Date.now();
  const key = trackKeyOf(p.track);
  if (!key) return;
  const prev = lastTrack.get(p.guildId);
  if (prev && prev.key && prev.key !== key && now - prev.at < COOCCUR_WINDOW_MS) {
    if (!cooccur.has(prev.key)) cooccur.set(prev.key, new Map());
    if (!cooccur.has(key)) cooccur.set(key, new Map());
    cooccur.get(prev.key)!.set(key, (cooccur.get(prev.key)!.get(key) || 0) + 1);
    cooccur.get(key)!.set(prev.key, (cooccur.get(key)!.get(prev.key) || 0) + 1);
    let total = 0;
    for (const inner of cooccur.values()) total += inner.size;
    if (total > COOCCUR_EDGE_CAP) {
      const first = cooccur.keys().next().value;
      if (first !== undefined) cooccur.delete(first);
    }
  }
  lastTrack.set(p.guildId, { key, at: now });
});

export { markBadTrack as markBad, isComboBad, isStrictBoostActive };
export function cooccurCount(prevKey: string, key: string): number {
  return cooccur.get(prevKey)?.get(key) || 0;
}
export default RecommendationEngine;
