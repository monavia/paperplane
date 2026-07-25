import { createHash } from "node:crypto";
import Logger from "../core/utils/Logger.js";
import { getAdapter } from "./CacheAdapter.js";

const DEAD_PREFIX = "dead:";
const DEAD_TTL = 3_600_000;
const SPOTIFY_TTL = 21_600_000;
const MAX_ATTEMPTS = 3;

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function deadFingerprint(title: string, author = ""): string {
  return sha1(`${title.toLowerCase().trim()}|${author.toLowerCase().trim()}`);
}

export function deadSpotifyFingerprint(trackId: string): string {
  return `spotify:${trackId}`;
}

async function getEntry(key: string): Promise<any | null> {
  try {
    return await getAdapter().get<{ attempts: number; reason: string; lastAttempt: number }>(`${DEAD_PREFIX}${key}`);
  } catch {
    return null;
  }
}

async function setEntry(key: string, entry: any): Promise<void> {
  const ttl = key.startsWith("spotify:") ? SPOTIFY_TTL : DEAD_TTL;
  await getAdapter().set(`${DEAD_PREFIX}${key}`, entry, ttl);
}

export async function isDead(fingerprint: string): Promise<boolean> {
  const entry = await getEntry(fingerprint);
  if (!entry) return false;
  if (entry.attempts >= MAX_ATTEMPTS) {
    Logger.info(`[DeadTrack] Skipping (dead): ${fingerprint.slice(0, 40)}`);
    return true;
  }
  return false;
}

export async function markDead(
  fingerprint: string,
  reason = "resolve_failed",
): Promise<void> {
  const existing = await getEntry(fingerprint) || { attempts: 0, reason: "", lastAttempt: 0 };
  existing.attempts += 1;
  existing.reason = reason;
  existing.lastAttempt = Date.now();
  await setEntry(fingerprint, existing);
  Logger.info(`[DeadTrack] Marked (${existing.attempts}/${MAX_ATTEMPTS}): ${fingerprint.slice(0, 40)} — ${reason}`);
}
