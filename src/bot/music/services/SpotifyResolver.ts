import { cleanTitle, isCover } from "./TitleResolver.js";
import { searchWithRetry } from "./SearchService.js";
import { LIVE_RE, STYLE_RE, STYLE_ML_RE, INSTRUMENT_RE } from "../engine/JunkKeywords.js";
import Logger from "../../core/utils/Logger.js";
import { hasThai, toLatinCandidates, romanizedApproxEqual } from "./ScriptUtils.js";

const VARIANT_MARKERS = [LIVE_RE, STYLE_RE, STYLE_ML_RE, INSTRUMENT_RE];

const MATCH_STOPWORDS = new Set(["feat", "ft", "featuring", "the", "and", "with", "of", "remix", "remastered", "radio", "edit", "version", "acoustic", "unplugged", "live", "concert", "konser", "session", "akustik", "stereo"]);

// Cluster/label words allowed to appear in a YouTube title OUTSIDE the Spotify title
// tokens when the spot title is fully contained (B fallback). Anything variant-y
// (live/acoustic/cover/instrumental/remix) is deliberately NOT here — those are
// already screened by VARIANT_MARKERS / isCover before this step.
const CLUSTER_LABEL_TOKENS = new Set([
  "feat", "ft", "featuring", "x", "with", "and", "official", "officialaudio",
  "officialmv", "officialmusicvideo", "officiallyricvideo", "lyric", "lyrics",
  "lyricvideo", "lyricverv", "video", "audio", "clip", "mv", "visualizer",
  "visualzone", "music", "song", "track", "hd", "4k", "full", "audiooff", "bts",
]);

const AUTHOR_NOISE_RE = /\b(?:topic|vevo|official|channel|records?|entertainment|production|music|sounds?|videos?|audio|lyrics?)\b/gi;

const MAX_DURATION_DIFF_MS = 90_000;

let lastDeezerUnavailableLog = 0;

function deezerEnabled(player: any): boolean {
  const managers = player?.node?.info?.sourceManagers;
  if (!Array.isArray(managers)) return true;
  if (managers.includes("deezer")) return true;
  const now = Date.now();
  if (now - lastDeezerUnavailableLog > 60_000) {
    lastDeezerUnavailableLog = now;
    Logger.info(`[SpotifyResolver] Deezer source not enabled on node ${player?.node?.id || "?"} — skipping dzsearch fallback`);
  }
  return false;
}

function describeCandidates(result: any): string {
  return (result?.tracks || []).slice(0, 3).map((t: any) => {
    const dur: any = t.info?.duration ?? t.info?.length;
    return `${t.info?.title || "?"}|${t.info?.author || "?"}${dur ? `|${Math.round(Number(dur) / 1000)}s` : ""}`;
  }).join("  ");
}

function compact(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
}

function tokens(s: string): string[] {
  const spaced = s.normalize("NFKC").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return (spaced.match(/[\p{L}\p{N}]{2,}/gu) || []).filter((t) => !MATCH_STOPWORDS.has(t));
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ratioOverlap(aTokens: string[], bTokens: string[], bCompact: string): number {
  if (!aTokens.length) return 0;
  const bSet = new Set(bTokens);
  const hits = aTokens.filter((t) => bSet.has(t) || bCompact.includes(t));
  return hits.length / aTokens.length;
}

function symmetricMatch(aTokens: string[], bTokens: string[], aCompact: string, bCompact: string, threshold: number): boolean {
  if (!aTokens.length || !bTokens.length) return aCompact === bCompact && aCompact.length > 0;
  return ratioOverlap(aTokens, bTokens, bCompact) >= threshold && ratioOverlap(bTokens, aTokens, aCompact) >= threshold;
}

const FEATURE_PAREN_RE = /[\[(]\s*(?:feat(?:uring)?|ft)\.?\s*:?\s*([^)\]]+?)\s*[\]\)]/gi;
const FEATURE_TRAILING_RE = /(?:^|\s)\(?\s*(?:feat(?:uring)?|ft)\.?\s*:?\s*([A-Za-z0-9\-',+]+(?:\s+[A-Za-z0-9\-',+]+)*)\s*\)?\s*(?:[-–—]\s*Topic)?$/i;

function extractFeatured(title: string): { core: string; featured: string[] } {
  const featured: string[] = [];
  const core = title.replace(FEATURE_PAREN_RE, (_m, inner: string) => {
    if (inner.trim()) featured.push(inner);
    return " ";
  });
  let tidied = core;
  const trailing = tidied.match(FEATURE_TRAILING_RE);
  if (trailing) {
    featured.push(trailing[1].trim());
    tidied = tidied.slice(0, trailing.index).trim();
  }
  return { core: tidied, featured };
}

function normLatin(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
}

function artistTokenUnion(artists: string[]): Set<string> {
  const all = new Set<string>();
  for (const a of artists) for (const t of tokens(a).filter((x) => x.length >= 3)) all.add(t);
  return all;
}

// Latin renderings of Thai artist names — used to match "feat." credits that YT/Deezer
// write in romanized form (e.g. "Pra Ma Ha" for "พระมหา") instead of the original script.
function artistLatinCandidates(artists: string[]): string[] {
  const out: string[] = [];
  for (const a of artists) {
    if (hasThai(a)) for (const c of toLatinCandidates(a.trim())) out.push(c);
  }
  return out;
}

function featAcceptedByScript(feat: string, romanArtists: string[]): boolean {
  if (!hasThai(feat) && !romanArtists.length) return false;
  const f = normLatin(feat);
  if (!f) return false;
  if (romanArtists.some((c) => normLatin(c).includes(f) || f.includes(normLatin(c)) || romanizedApproxEqual(c, feat))) return true;
  return false;
}

function romanApproxTitle(spToken: string, ytTokens: string[], ytCompact: string): boolean {
  if (!hasThai(spToken) && !spToken) return false;
  for (const c of toLatinCandidates(spToken)) {
    const cn = normLatin(c);
    if (!cn || cn.length < 2) continue;
    if (normLatin(ytCompact).includes(cn) || ytTokens.some((t) => normLatin(t).includes(cn) || cn.includes(normLatin(t)))) return true;
  }
  return false;
}

function titleMatches(spTitle: string, ytTitle: string, knownArtistTokens?: Set<string>, romanArtists?: string[]): boolean {
  const spExt = extractFeatured(stripSessionClause(spTitle));
  const ytExt = extractFeatured(stripSessionClause(ytTitle));
  const sp = compact(spExt.core);
  const yt = compact(ytExt.core);
  if (!sp || !yt) return false;

  // A feat artist introduced on the YT side must be accounted for: it has to be a
  // listed Spotify artist OR already credited as a feat artist inside the Spotify
  // title itself. Feat artists that appear ONLY in the Spotify title are trusted
  // (they are authoritative metadata), so they never block the match.
  if (knownArtistTokens?.size || spExt.featured.length) {
    const spotFeatTokens = new Set<string>();
    for (const f of spExt.featured) for (const t of tokens(f).filter((x) => x.length >= 3)) spotFeatTokens.add(t);
    for (const f of ytExt.featured) {
      const latin = normLatin(f);
      if (romanArtists?.length && romanArtists.some((c) => normLatin(c) === latin)) continue;
      if (romanArtists?.length && featAcceptedByScript(f, romanArtists)) continue;
      for (const t of tokens(f).filter((x) => x.length >= 3)) {
        if (t.length < 3) continue;
        if (!knownArtistTokens?.has(t) && !spotFeatTokens.has(t)) return false;
      }
    }
  }

  if (sp === yt) return true;
  if (!/[a-z]/i.test(sp)) {
    return yt.includes(sp) || sp.includes(yt);
  }
  const spTokens = tokens(spExt.core).filter((t) => t.length >= 3);
  const ytTokens = tokens(ytExt.core).filter((t) => t.length >= 3);
  if (!spTokens.length || !ytTokens.length) return yt.includes(sp) || sp.includes(yt);
  if (symmetricMatch(spTokens, ytTokens, sp, yt, 1.0)) return true;

  // B: containment fallback — every Spotify title token must be present in the YT
  // title, and every YT-only token must be a known artist, a romanized artist, or a
  // benign cluster/label label. Rescues official uploads whose YT title carries
  // artist + feat + "[Official …]" prose around the clean song title.
  const ytSet = new Set(ytTokens);
  if (spTokens.every((t) => ytSet.has(t) || romanApproxTitle(t, ytTokens, yt))) {
    const spSet = new Set(spTokens);
    const extras = ytTokens.filter((t) => !spSet.has(t) && t.length >= 3);
    const allowed = extras.every(
      (t) => CLUSTER_LABEL_TOKENS.has(t) || MATCH_STOPWORDS.has(t) || knownArtistTokens?.has(t));
    if (allowed) return true;
  }

  // Script-fallback: when either side is non-Latin and strict token matching failed,
  // compare on the romanized renderings (only when that side actually has Thai).
  if (hasThai(spExt.core) || hasThai(ytExt.core)) {
    const sL = normLatin(toLatinCandidates(spExt.core).join(" "));
    const yL = normLatin(toLatinCandidates(ytExt.core).join(" "));
    if (sL && yL && (yL.includes(sL) || sL.includes(yL))) return true;
  }

  return false;
}

function artistMatches(spArtists: string[], ytAuthor: string): boolean {
  const mains = spArtists.map((a) => a.trim()).filter(Boolean);
  if (!mains.length) return true;
  const ytClean = ytAuthor.replace(/\s*[-–—]\s*Topic$/i, "").replace(AUTHOR_NOISE_RE, "").trim();
  const yt = compact(ytClean);
  const ytTokens = tokens(ytClean).filter((t) => t.length >= 3);
  if (!yt) return true;

  const primary = mains[0];
  const sp = compact(primary);
  if (sp) {
    if (!/[a-z]/i.test(sp)) {
      if (yt.includes(sp) || sp.includes(yt)) return true;
    } else {
      const spTokens = tokens(primary).filter((t) => t.length >= 3);
      if (spTokens.length && ytTokens.length) {
        if (symmetricMatch(ytTokens, spTokens, yt, sp, 1.0)) return true;
      } else if (yt.includes(sp) || sp.includes(yt)) {
        return true;
      }
    }
  }

  // YT/Deezer authors legitimately vary from the primary: they may name only a
  // secondary listed artist ("Main Theme" hosted by Lindsey Stirling), a joined
  // author ("X, Y" / "X & Y"), or a feat host. Accepted only when every token
  // of the author belongs to the union of all artists listed on the Spotify item.
  const known = artistTokenUnion(mains);
  if (ytTokens.length && known.size && ytTokens.every((t) => known.has(t))) return true;
  return false;
}

export function verifySpotifyMatch(spotifyItem: any, track: any, rawInfo?: { title?: string; author?: string }): boolean {
  const rawTitle = (rawInfo?.title ?? track.info?.title) || "";
  const rawAuthor = (rawInfo?.author ?? track.info?.author) || "";
  const spotName = spotifyItem.name || "";

  if (VARIANT_MARKERS.some((re) => re.test(rawTitle)) && !VARIANT_MARKERS.some((re) => re.test(spotName))) {
    // YouTube marks variants with parens ("(Violin Remix)") while the Spotify title
    // often carries the same words without parens ("- Violin Remix"). Only reject
    // when the spot title shares none of the variant's own words.
    const rawWords = new Set<string>();
    for (const m of rawTitle.match(/[a-z]{3,}/gi) || []) rawWords.add(m.toLowerCase());
    if (spotName && ![...rawWords].some((w) => new RegExp(`\\b${esc(w)}\\b`, "i").test(spotName))) return false;
  }
  if (isCover(rawTitle, rawAuthor) && !isCover(spotName)) return false;

  const cleaned = cleanTitle(rawTitle, rawAuthor);
  const artistsArr = spotifyItem.artists || [];
  const known = artistTokenUnion(artistsArr);
  const romanArtists = artistLatinCandidates(artistsArr);
  if (!titleMatches(spotName, cleaned.title, known, romanArtists)) return false;
  if (!artistMatches(artistsArr, cleaned.author)) return false;

  const spMs = spotifyItem.duration;
  const ytMs = track.info?.duration ?? track.info?.length ?? null;
  if (spMs && ytMs && Math.abs(spMs - ytMs) > MAX_DURATION_DIFF_MS) return false;

  return true;
}

const QUERY_SESSION_NOISE_RE = /\s*[-–—]\s*(?:recorded\s+(?:live\s+)?(?:at|in)|at|from|live\s+at(?:\s+the)?)\b[\s\S]*$/i;
const TITLE_SESSION_RE = /\s*[-–—]\s*(?:recorded\s+(?:live\s+)?(?:at|in|for|by)\b|\@\s*)[\s\S]*$|[\[(]\s*(?:recorded\s+(?:live\s+)?(?:at|in|for|by)\b|\@\s*)[^)\]]*[)\]]/gi;

function stripQueryNoise(name: string): string {
  return name
    .replace(/[\[(][^\])]*[)\]]/g, " ")
    .replace(QUERY_SESSION_NOISE_RE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripSessionClause(title: string): string {
  return title
    .replace(TITLE_SESSION_RE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildQueryVariants(spotifyItem: any): string[] {
  const name = (spotifyItem.name || "").trim();
  const artists = (spotifyItem.artists || []).map((a: string) => a.trim()).filter(Boolean);
  const artistStr = artists.join(" ");
  const variants: string[] = [];
  if (artistStr && name) variants.push(`${artistStr} ${name}`);
  if (name && !variants.includes(name)) variants.push(name);
  if (artistStr && name) variants.push(`${name} ${artistStr}`);

  // Fallback variants: strip session/edition noise from the title AND cap the
  // query to the primary artist only — YouTube Music ranks the official upload
  // better under a clean query. Verification stays strict-1.0, this only
  // widens the search surface.
  const clean = stripQueryNoise(name);
  if (clean && clean !== name && !variants.includes(clean)) variants.push(clean);
  const primary = artists[0] || "";
  if (primary && clean && !variants.includes(`${primary} ${clean}`)) variants.push(`${primary} ${clean}`);
  return variants;
}

function finalizeSpotifyTrack(track: any, spotifyItem: any): any {
  if (!track.info) track.info = {};
  const artistStr = spotifyItem.artists?.join(", ") || track.info.author || "";
  track.info.author = artistStr;
  track.info.title = spotifyItem.name || track.info.title;
  track.info.originalUrl = track.info.uri;
  track.info.spotifyUrl = spotifyItem.spotifyUri || null;
  return track;
}

export function buildSpotifyItemFromTrack(track: any): any | null {
  const info = track?.info;
  if (!info) return null;
  const uri = info.spotifyUrl || info.uri || "";
  if (!/^spotify:|open\.spotify\.com/i.test(uri)) return null;
  return {
    name: info.title || "",
    artists: (info.author || "").split(",").map((s: string) => s.trim()).filter(Boolean),
    duration: info.duration || info.length || 0,
    spotifyUri: info.spotifyUrl || uri || null,
  };
}

export async function resolveStoredSpotifyTrack(player: any, track: any, user: any): Promise<any | null> {
  const item = buildSpotifyItemFromTrack(track);
  if (!item) return null;
  return (await resolveSpotifyTrack(player, item, user)) || null;
}

export async function resolveSpotifyTrack(player: any, spotifyItem: any, user: any, searchFn: any = searchWithRetry): Promise<any> {
  const variants = buildQueryVariants(spotifyItem);
  if (!variants.length) return null;
  const audit: string[] = [];
  for (const q of variants) {
    let result: any;
    try { result = await searchFn(player, { query: `ytmsearch:${q}` }, user); } catch { continue; }
    const tracks = result?.tracks || [];
    if (!tracks.length) continue;
    audit.push(`"${q}" → ${describeCandidates(result)}`);
    const raws = new Map<any, { title: string; author: string }>();
    for (const t of tracks) raws.set(t, { title: t.info?.title || "", author: t.info?.author || "" });
    for (const t of tracks) {
      if (verifySpotifyMatch(spotifyItem, t, raws.get(t))) {
        return finalizeSpotifyTrack(t, spotifyItem);
      }
    }
  }

  // Plain YouTube search fallback — YTM (music) ranks releases/albums and often
  // hides the official upload, while ytsearch surfaces it. Only the clean/primary
  // variants are retried (a couple of extra calls), and verification stays strict-1.0.
  const cleanFallbacks = variants.slice(-2);
  if (cleanFallbacks.length) {
    for (const q of cleanFallbacks) {
      let result: any;
      try { result = await searchFn(player, { query: `ytsearch:${q}` }, user); } catch { continue; }
      const tracks = result?.tracks || [];
      if (!tracks.length) continue;
      audit.push(`ytsearch "${q}" → ${describeCandidates(result)}`);
      const raws = new Map<any, { title: string; author: string }>();
      for (const t of tracks) raws.set(t, { title: t.info?.title || "", author: t.info?.author || "" });
      for (const t of tracks) {
        if (verifySpotifyMatch(spotifyItem, t, raws.get(t))) {
          return finalizeSpotifyTrack(t, spotifyItem);
        }
      }
    }
  }

  // Deezer fallback — strictly verified too; anything that fails is skipped silently.
  // Skip entirely when the node never enabled the deezer source (avoids burning retries + node penalties).
  const name = (spotifyItem.name || "").trim();
  const primaryArtist = ((spotifyItem.artists || [])[0] || "").trim();
  if (primaryArtist && name && deezerEnabled(player)) {
    try {
      const result: any = await searchFn(player, { query: `dzsearch:${primaryArtist} ${name}` }, user);
      if (result?.tracks?.length) {
        audit.push(`dzsearch → ${describeCandidates(result)}`);
        const raws = new Map<any, { title: string; author: string }>();
        for (const t of result.tracks) raws.set(t, { title: t.info?.title || "", author: t.info?.author || "" });
        for (const t of result.tracks) {
          if (verifySpotifyMatch(spotifyItem, t, raws.get(t))) {
            return finalizeSpotifyTrack(t, spotifyItem);
          }
        }
      }
    } catch { /* dzsearch unavailable — skip */ }
  }

  Logger.warn(`[SpotifyResolver] No strict match on YouTube/Deezer for "${spotifyItem.name || ""}" by ${(spotifyItem.artists || []).join(", ") || "-"}${audit.length ? `\n  candidates: ${audit.slice(-6).join("\n  ")}` : ""} — skipped`);
  return null;
}
