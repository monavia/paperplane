import { cleanTitle, isCover } from "./TitleResolver.js";
import { pickBestTrack, searchWithRetry } from "./SearchService.js";
import { LIVE_RE, STYLE_RE, STYLE_ML_RE, INSTRUMENT_RE } from "../engine/JunkKeywords.js";
import Logger from "../../core/utils/Logger.js";

const VARIANT_MARKERS = [LIVE_RE, STYLE_RE, STYLE_ML_RE, INSTRUMENT_RE];

const MATCH_STOPWORDS = new Set(["feat", "ft", "featuring", "the", "and", "with", "of", "remix", "remastered", "radio", "edit", "version"]);

const AUTHOR_NOISE_RE = /\b(?:topic|vevo|official|channel|records?|entertainment|production|music|sounds?|videos?|audio|lyrics?)\b/gi;

const MAX_DURATION_DIFF_MS = 90_000;

function compact(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
}

function tokens(s: string): string[] {
  return (s.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]{2,}/gu) || []).filter((t) => !MATCH_STOPWORDS.has(t));
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

function titleMatches(spTitle: string, ytTitle: string): boolean {
  const sp = compact(spTitle);
  const yt = compact(ytTitle);
  if (!sp || !yt) return false;
  if (sp === yt) return true;
  if (!/[a-z]/i.test(sp)) {
    return yt.includes(sp) || sp.includes(yt);
  }
  const spTokens = tokens(spTitle).filter((t) => t.length >= 3);
  const ytTokens = tokens(ytTitle).filter((t) => t.length >= 3);
  if (!spTokens.length || !ytTokens.length) return yt.includes(sp) || sp.includes(yt);
  return symmetricMatch(spTokens, ytTokens, sp, yt, 1.0);
}

function artistMatches(spArtists: string[], ytAuthor: string): boolean {
  const main = spArtists[0];
  if (!main) return true;
  const ytClean = ytAuthor.replace(/\s*[-–—]\s*Topic$/i, "").replace(AUTHOR_NOISE_RE, "").trim();
  const yt = compact(ytClean);
  if (!yt) return true;
  const sp = compact(main);
  if (!sp) return true;
  if (!/[a-z]/i.test(sp)) {
    return yt.includes(sp) || sp.includes(yt);
  }
  const spTokens = tokens(main).filter((t) => t.length >= 3);
  const ytTokens = tokens(ytClean).filter((t) => t.length >= 3);
  if (!spTokens.length || !ytTokens.length) return yt.includes(sp) || sp.includes(yt);
  return symmetricMatch(spTokens, ytTokens, sp, yt, 1.0);
}

export function verifySpotifyMatch(spotifyItem: any, track: any, rawInfo?: { title?: string; author?: string }): boolean {
  const rawTitle = (rawInfo?.title ?? track.info?.title) || "";
  const rawAuthor = (rawInfo?.author ?? track.info?.author) || "";
  const spotName = spotifyItem.name || "";

  if (VARIANT_MARKERS.some((re) => re.test(rawTitle)) && !VARIANT_MARKERS.some((re) => re.test(spotName))) return false;
  if (isCover(rawTitle, rawAuthor) && !isCover(spotName)) return false;

  const cleaned = cleanTitle(rawTitle, rawAuthor);
  if (!titleMatches(spotName, cleaned.title)) return false;
  if (!artistMatches(spotifyItem.artists || [], cleaned.author)) return false;

  const spMs = spotifyItem.duration;
  const ytMs = track.info?.duration ?? track.info?.length ?? null;
  if (spMs && ytMs && Math.abs(spMs - ytMs) > MAX_DURATION_DIFF_MS) return false;

  return true;
}

export function buildQueryVariants(spotifyItem: any): string[] {
  const name = (spotifyItem.name || "").trim();
  const artistStr = (spotifyItem.artists || []).map((a: string) => a.trim()).filter(Boolean).join(" ");
  const variants: string[] = [];
  if (artistStr && name) variants.push(`${artistStr} ${name}`);
  if (name && !variants.includes(name)) variants.push(name);
  if (artistStr && name) variants.push(`${name} ${artistStr}`);
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
  for (const q of variants) {
    let result: any;
    try { result = await searchFn(player, { query: `ytmsearch:${q}` }, user); } catch { continue; }
    if (!result?.tracks?.length) continue;
    const raws = new Map<any, { title: string; author: string }>();
    for (const t of result.tracks) raws.set(t, { title: t.info?.title || "", author: t.info?.author || "" });
    const track = pickBestTrack(result.tracks, q);
    if (!track) continue;
    if (verifySpotifyMatch(spotifyItem, track, raws.get(track))) {
      return finalizeSpotifyTrack(track, spotifyItem);
    }
  }

  // Deezer fallback — strictly verified too; anything that fails is skipped silently.
  const name = (spotifyItem.name || "").trim();
  const artistStr = (spotifyItem.artists || []).filter(Boolean).join(" ").trim();
  if (artistStr && name) {
    try {
      const result: any = await searchFn(player, { query: `dzsearch:${artistStr} ${name}` }, user);
      if (result?.tracks?.length) {
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

  Logger.warn(`[SpotifyResolver] No strict match on YouTube/Deezer for "${spotifyItem.name || ""}" by ${(spotifyItem.artists || []).join(", ") || "-"} — skipped`);
  return null;
}
