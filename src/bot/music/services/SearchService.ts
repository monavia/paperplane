import Logger from "../../core/utils/Logger.js";
import { cleanTitle, isCover } from "./TitleResolver.js";
import { getBestNode, getPenalty, recordError, recordHtmlError, isDraining, isUnhealthy } from "../engine/NodePenaltyService.js";
import { get } from "../engine/lavalink.js";
import { isJunkTrack } from "../engine/RecommendationEngine.js";
import { HARD_JUNK_RE, SOFT_JUNK_RE, STYLE_ML_RE } from "../engine/JunkKeywords.js";

const BAD_KEYWORDS = [
  "remix", "cover", "live", "karaoke", "nightcore", "slowed", "sped up",
  "reverb", "bass boosted", "8d", "viral", "tiktok", "joget",
  "versi", "tribute", "instrumental",
];

const BAD_WORDS_RE = BAD_KEYWORDS.map((kw) => new RegExp("\\b" + kw.replace(/ /g, "\\s") + "\\b", "i"));

function hasBadKeyword(title: string, author?: string): boolean {
  return BAD_WORDS_RE.some((re) => re.test(title)) || isCover(title, author);
}

const PREFERRED_SOURCES = new Set(["youtube", "ytmusic", "youtubemusic"]);

function scoreTrack(track: any): number {
  const title = (track.info?.title || "").toLowerCase();
  const author = (track.info?.author || "").toLowerCase();
  let score = 0;

  if (PREFERRED_SOURCES.has(track.info?.sourceName)) score += 10;
  if (HARD_JUNK_RE.test(title)) score -= 3;
  if (SOFT_JUNK_RE.test(title)) score -= 1;
  if (STYLE_ML_RE.test(title)) score -= 1;
  if (title.includes("official") || author.includes("vevo")) score += 2;

  return score;
}

const QUERY_STOPWORDS = new Set(["feat", "ft", "the", "and", "with"]);

function queryKeywords(query?: string): string[] {
  if (!query || /:\/\//.test(query)) return [];
  return (query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter((w) => !QUERY_STOPWORDS.has(w));
}

function scoreQuery(track: any, keywords: string[]): number {
  if (!keywords.length) return 0;
  const title = (track.info?.title || "").toLowerCase();
  const author = (track.info?.author || "").toLowerCase();
  let score = 0;
  let matched = 0;
  for (const kw of keywords) {
    const inTitle = title.includes(kw);
    const inAuthor = author.includes(kw);
    if (inTitle) score += 5;
    if (inAuthor) score += 3;
    if (inTitle || inAuthor) matched++;
  }
  if (matched === keywords.length) score += 10;
  if (matched === 0) score -= 8;
  return score;
}

import { isInDurationRange } from "./DurationFilter.js";
export { MIN_DURATION_MS, MAX_DURATION_MS, isInDurationRange } from "./DurationFilter.js";

export function pickBestTrack(tracks: any[], query?: string): any {
  if (!tracks?.length) return null;
  const keywords = queryKeywords(query);
  const isUrl = !!query && /:\/\//.test(query);
  const pool = !isUrl ? tracks.filter(isInDurationRange) : tracks;
  const candidates = pool.length ? pool : tracks;

  if (candidates.length === 1) {
    const cleaned = cleanTitle(candidates[0].info?.title || "", candidates[0].info?.author || "");
    candidates[0].info.title = cleaned.title;
    candidates[0].info.author = cleaned.author;
    return candidates[0];
  }

  const first = candidates[0];
  const firstTitle = (first.info?.title || "").toLowerCase();

  let best = first;
  if (hasBadKeyword(firstTitle, first.info?.author) || isJunkTrack(first.info?.title || "", first.info?.author)) {
    const filtered = candidates.filter((t) => !hasBadKeyword((t.info?.title || "").toLowerCase(), t.info?.author) && !isJunkTrack(t.info?.title || "", t.info?.author));
    if (filtered.length) {
      const scored = filtered.map((t: any) => ({ track: t, score: scoreTrack(t) + scoreQuery(t, keywords) }));
      scored.sort((a, b) => b.score - a.score);
      best = scored[0].track;
    }
  } else if (keywords.length) {
    const firstLowerAuthor = (first.info?.author || "").toLowerCase();
    const queryHasAscii = keywords.some((kw) => /[a-z]/.test(kw));
    const firstHasAscii = /[a-z]/.test(firstTitle + firstLowerAuthor);
    if (queryHasAscii && !firstHasAscii) {
      // Query latin (romaji) tapi hasil teratas murni non-latin (kanji/kana) —
      // substring match tak bisa mencocokkan; percaya urutan node (YTM).
      best = candidates[0];
    } else {
      const scored = candidates.map((t: any) => ({ track: t, score: scoreTrack(t) + scoreQuery(t, keywords) }));
      scored.sort((a, b) => b.score - a.score);
      best = scored[0].track;
    }
  }

  const cleaned = cleanTitle(best.info?.title || "", best.info?.author || "");
  best.info.title = cleaned.title;
  best.info.author = cleaned.author;
  return best;
}

async function searchViaHealthyNode(query: any, user: any, retries = 1): Promise<any | null> {
  const lavalink = get();
  if (!lavalink?.nodeManager) return null;
  const best = getBestNode(lavalink);
  if (!best?.connected) return null;
  for (let i = 0; i <= retries; i++) {
    try {
      return await best.search(query, user);
    } catch {
      if (i < retries) await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

export async function searchWithRetry(player: any, query: any, user: any, _retries = 2): Promise<any> {
  const nodeName = player.node?.id || "?";
  const nodePenalty = getPenalty(nodeName);
  if (isDraining(nodeName) || isUnhealthy(nodeName) || nodePenalty > 100) {
    const fallback = await searchViaHealthyNode(query, user);
    if (fallback) {
      Logger.info(`[SearchRoute] Skipped unhealthy node: ${nodeName} penalty=${nodePenalty}`);
      return fallback;
    }
  }
  try {
    const result = await player.search(query, user);
    return result;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const qStr = typeof query === "object" ? (query.query || query.q || JSON.stringify(query)) : String(query);
    Logger.warn(`[SearchTimeout] retriesLeft=${_retries} err="${errMsg.slice(0,60)}" query="${qStr.slice(0,60)}" node=${nodeName}`);
    recordError(nodeName, errMsg);
    if (/html|proxy|cloudflare|503|502|gateway/i.test(errMsg)) recordHtmlError(nodeName);
    if (_retries > 0) return searchWithRetry(player, query, user, _retries - 1);
    const finalPenalty = getPenalty(nodeName);
    if (finalPenalty > 300) {
      const fallback = await searchViaHealthyNode(query, user);
      if (fallback) {
        Logger.info(`[SearchRoute] Fallback via healthy node for "${qStr.slice(0,40)}" (player node=${nodeName} penalty=${finalPenalty})`);
        return fallback;
      }
    }
    throw err;
  }
}

export async function findTrackWithDuration(
  player: any,
  query: string,
  origTrack: any,
  clientRef?: any
): Promise<any | null> {
  const origDur = origTrack.info?.length || origTrack.info?.durationMs || 0;
  const n = player.node?.id || "?";
  if (isDraining(n) || isUnhealthy(n) || getPenalty(n) > 100) {
    const fallback = await searchViaHealthyNode({ query: `ytmsearch:${query}` }, clientRef, 0);
    if (fallback?.tracks?.length) {
      return fallback.tracks.find((t: any) => !t.info?.sourceName?.includes("deezer")) || fallback.tracks[0];
    }
  }
  for (const prefix of ["ytmsearch", "ytsearch", "scsearch", "dzsearch"]) {
    let res = null;
    try {
      res = await player.search({ query: `${prefix}:${query}` }, clientRef);
    } catch {
      res = await searchViaHealthyNode({ query: `${prefix}:${query}` }, clientRef, 0);
    }
    if (!res) continue;
    const found = (res.tracks || []).find((t: any) => {
      if (!t.encoded) return false;
      if (t.info?.sourceName === "deezer") return false;
      const fDur = t.info?.length || t.info?.durationMs || 0;
      if (origDur && fDur && Math.abs(fDur - origDur) / origDur > 0.3) return false;
      return true;
    });
    if (found) return found;
  }
  return null;
}
