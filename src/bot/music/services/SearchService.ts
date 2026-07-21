import Logger from "../../core/utils/Logger";
import { cleanTitle, isCover } from "./TitleResolver";
import { recordError, recordHtmlError } from "../engine/NodePenaltyService";

const BAD_KEYWORDS = [
  "remix", "cover", "live", "karaoke", "nightcore", "slowed", "sped up",
  "reverb", "bass boosted", "8d", "viral", "tiktok", "joget", "dj",
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
  if (title.includes("lyrics") || title.includes("lyric")) score += 4;
  if (title.includes("official") || author.includes("vevo")) score += 2;

  return score;
}

export function pickBestTrack(tracks: any[]): any {
  if (!tracks?.length) return null;
  if (tracks.length === 1) {
    const cleaned = cleanTitle(tracks[0].info?.title || "", tracks[0].info?.author || "");
    tracks[0].info.title = cleaned.title;
    tracks[0].info.author = cleaned.author;
    return tracks[0];
  }

  const first = tracks[0];
  const firstTitle = (first.info?.title || "").toLowerCase();

  let best = first;
  if (hasBadKeyword(firstTitle, first.info?.author)) {
    const filtered = tracks.filter((t) => !hasBadKeyword((t.info?.title || "").toLowerCase(), t.info?.author));
    if (filtered.length) {
      const scored = filtered.map((t: any) => ({ track: t, score: scoreTrack(t) }));
      scored.sort((a, b) => b.score - a.score);
      best = scored[0].track;
    }
  }

  const cleaned = cleanTitle(best.info?.title || "", best.info?.author || "");
  best.info.title = cleaned.title;
  best.info.author = cleaned.author;
  return best;
}

export async function searchWithRetry(player: any, query: any, user: any, _retries = 2): Promise<any> {
  try {
    const result = await player.search(query, user);
    return result;
  } catch (err: any) {
    const nodeName = player.node?.id || "?";
    const errMsg = err?.message || String(err);
    const qStr = typeof query === "object" ? (query.query || query.q || JSON.stringify(query)) : String(query);
    Logger.warn(`[SearchTimeout] retriesLeft=${_retries} err="${errMsg.slice(0,60)}" query="${qStr.slice(0,60)}" node=${nodeName}`);
    recordError(nodeName, errMsg);
    if (/html|proxy|cloudflare|503|502|gateway/i.test(errMsg)) recordHtmlError(nodeName);
    if (_retries > 0) return searchWithRetry(player, query, user, _retries - 1);
    throw err;
  }
}
