import Logger from "../../core/utils/Logger";

const BAD_KEYWORDS = [
  "remix", "cover", "live", "karaoke", "nightcore", "slowed", "sped up",
  "reverb", "bass boosted", "8d", "viral", "tiktok", "joget", "dj",
];

const GOOD_KEYWORDS = [
  "lyrics", "lyric", "official", "mv", "music video",
];

const BAD_WORDS_RE = BAD_KEYWORDS.map((kw) => new RegExp("\\b" + kw.replace(/ /g, "\\s") + "\\b", "i"));

function hasBadKeyword(title: string): boolean {
  return BAD_WORDS_RE.some((re) => re.test(title));
}

function hasGoodKeyword(title: string): boolean {
  return GOOD_KEYWORDS.some((kw) => title.includes(kw));
}

function scoreTrack(track: any): number {
  const title = (track.info?.title || "").toLowerCase();
  const author = (track.info?.author || "").toLowerCase();
  let score = 0;

  if (hasGoodKeyword(title)) score += 2;
  if (title.includes("lyrics") || title.includes("lyric")) score += 4;
  if (title.includes("official") || author.includes("vevo")) score += 2;

  const dur = track.info?.duration || 0;
  if (dur > 120000 && dur < 420000) score += 1;

  return score;
}

export function pickBestTrack(tracks: any[]): any {
  if (!tracks?.length) return null;
  if (tracks.length === 1) return tracks[0];

  // Prefer FIRST result if it passes basic checks (YouTube ranking is most relevant)
  const first = tracks[0];
  const firstTitle = (first.info?.title || "").toLowerCase();
  const firstDur = first.info?.duration || 0;
  const firstOk = !hasBadKeyword(firstTitle) && (firstDur >= 120000 && firstDur <= 420000);

  if (firstOk) return first;

  // First result has bad keywords — try harder to find a better match
  let filtered = tracks.filter((t) => {
    const title = (t.info?.title || "").toLowerCase();
    const dur = t.info?.duration || 0;
    return !hasBadKeyword(title) && dur >= 120000 && dur <= 420000;
  });

  if (!filtered.length) {
    Logger.info("[pickBestTrack] All tracks had bad keywords or bad duration — falling back to scoring");
    filtered = tracks;
  }

  const scored = filtered.map((t: any) => ({ track: t, score: scoreTrack(t) }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].track;
}

export async function searchWithRetry(player: any, query: any, user: any, _retries = 2): Promise<any> {
  try {
    return await player.search(query, user);
  } catch (err: any) {
    if (_retries > 0) return searchWithRetry(player, query, user, _retries - 1);
    throw err;
  }
}
