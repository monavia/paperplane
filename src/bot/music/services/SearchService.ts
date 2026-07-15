import { cleanTitle } from "./TitleResolver";

const BAD_KEYWORDS = [
  "remix", "cover", "live", "karaoke", "nightcore", "slowed", "sped up",
  "reverb", "bass boosted", "8d", "viral", "tiktok", "joget", "dj",
];

const BAD_WORDS_RE = BAD_KEYWORDS.map((kw) => new RegExp("\\b" + kw.replace(/ /g, "\\s") + "\\b", "i"));

function hasBadKeyword(title: string): boolean {
  return BAD_WORDS_RE.some((re) => re.test(title));
}

function scoreTrack(track: any): number {
  const title = (track.info?.title || "").toLowerCase();
  const author = (track.info?.author || "").toLowerCase();
  let score = 0;

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
  if (hasBadKeyword(firstTitle)) {
    const filtered = tracks.filter((t) => !hasBadKeyword((t.info?.title || "").toLowerCase()));
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
    return await player.search(query, user);
  } catch (err: any) {
    if (_retries > 0) return searchWithRetry(player, query, user, _retries - 1);
    throw err;
  }
}
