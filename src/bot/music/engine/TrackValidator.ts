import { isDead, markDead, deadFingerprint, deadSpotifyFingerprint } from "../../cache/DeadTrackService.js";
import { getAdapter } from "../../cache/CacheAdapter.js";
import { findTrackWithDuration } from "../services/SearchService.js";
import { saveSpotifyMeta, applySpotifyMeta } from "../services/TitleResolver.js";
import Logger from "../../core/utils/Logger.js";

export interface ValidateResult {
  valid: boolean;
  track?: any;
  reason?: string;
}

export async function validateTrack(
  track: any,
  player: any,
  guildId: string,
  requester?: any,
): Promise<ValidateResult> {
  if (track?.encoded) return { valid: true, track };

  const fp = track.info?.title ? deadFingerprint(track.info.title, track.info.author) : null;

  if (fp && await isDead(fp)) {
    Logger.warn(`[TrackValidator] guild=${guildId} skipping dead track: ${track.info?.title || "?"}`);
    return { valid: false, reason: "dead_track" };
  }

  if (track.info?.uri) {
    const isSpotifyTrack = /^spotify:track:|open\.spotify\.com\/track\//.test(track.info.uri);
    if (isSpotifyTrack) {
      const m = track.info.uri.match(/([a-zA-Z0-9]+)$/);
      if (m && await isDead(deadSpotifyFingerprint(m[1]))) {
        Logger.warn(`[TrackValidator] guild=${guildId} skipping dead Spotify track: ${m[1]}`);
        return { valid: false, reason: "dead_spotify_track" };
      }
    }

    const cacheKey = `prefetch:${track.info.uri}`;
    const prefetched = await getAdapter().get<any>(cacheKey);
    if (prefetched?.encoded) {
      Object.assign(track, prefetched);
      Logger.info(`[TrackValidator] Prefetch hit for ${guildId}`);
      return { valid: true, track };
    }

    try {
      const uri = track.info.uri;
      const isSpotify = /^spotify:(track|album|playlist):/.test(uri) || /open\.spotify\.com/i.test(uri);
      const savedMeta = isSpotify ? saveSpotifyMeta(track) : null;

      if (isSpotify) {
        const q = `${track.info.author || ""} ${track.info.title || ""}`.trim();
        const found = await findTrackWithDuration(player, q, track, requester);
        if (found) {
          Object.assign(track, found);
          if (savedMeta) applySpotifyMeta(track, savedMeta);
          return { valid: true, track };
        }
      } else {
        const res = await player.search({ query: uri }, requester).catch(() => null);
        if (res?.tracks?.length) {
          Object.assign(track, res.tracks[0]);
          return { valid: true, track };
        }
      }
    } catch {
      Logger.warn(`[TrackValidator] Re-resolution failed for ${guildId}`);
      if (fp) markDead(fp, "re_resolve_failed").catch(() => {});
    }
  }

  if (!track.encoded) {
    Logger.warn(`[TrackValidator] guild=${guildId} skipping track without encoded data`);
    if (fp) markDead(fp, "no_encoded_data").catch(() => {});
    return { valid: false, reason: "no_encoded_data" };
  }

  return { valid: true, track };
}
