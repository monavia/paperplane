import Logger from "../../core/utils/Logger.js";
import { PortableTrack } from "./PlaylistService.js";

interface FavoriteEntry {
  track: PortableTrack;
  addedAt: number;
}

const favorites = new Map<string, FavoriteEntry[]>();

function userKey(userId: string): string { return userId; }

export function addFavorite(userId: string, track: PortableTrack): { ok: boolean; total: number } {
  const key = userKey(userId);
  const list = favorites.get(key) || [];
  const dup = list.find((f) => f.track.identifier && f.track.identifier === track.identifier);
  if (dup) return { ok: false, total: list.length };

  list.push({ track, addedAt: Date.now() });
  favorites.set(key, list);
  Logger.info(`[Favorites] Added for user ${userId}: "${track.title}"`);
  return { ok: true, total: list.length };
}

export function removeFavorite(userId: string, identifier: string): boolean {
  const key = userKey(userId);
  const list = favorites.get(key);
  if (!list) return false;

  const idx = list.findIndex((f) => f.track.identifier === identifier || f.track.title === identifier);
  if (idx < 0) return false;

  list.splice(idx, 1);
  if (list.length) favorites.set(key, list);
  else favorites.delete(key);
  Logger.info(`[Favorites] Removed for user ${userId}: identifier="${identifier}"`);
  return true;
}

export function listFavorites(userId: string): FavoriteEntry[] {
  return favorites.get(userKey(userId)) || [];
}

export function getFavoriteCount(userId: string): number {
  return (favorites.get(userKey(userId)) || []).length;
}

/** @internal — clear all data, used in tests */
export function _clearForTest(): void {
  favorites.clear();
}
