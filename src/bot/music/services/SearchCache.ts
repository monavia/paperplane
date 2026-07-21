import Logger from "../../core/utils/Logger";
import { searchWithRetry } from "./SearchService";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class SearchCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 500, ttlMs = 3600000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  private makeKey(query: string): string {
    return query.toLowerCase().trim();
  }

  get(query: string): any | null {
    const key = this.makeKey(query);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(query: string, value: any): void {
    const key = this.makeKey(query);
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  has(query: string): boolean {
    return this.get(query) !== null;
  }

  delete(query: string): boolean {
    return this.cache.delete(this.makeKey(query));
  }

  clear(): void {
    this.cache.clear();
  }

  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  size(): number {
    this.prune();
    return this.cache.size;
  }
}

const _instance = new SearchCache();
export const searchCache = _instance;

export async function cachedSearch(player: any, query: string, user: any): Promise<any> {
  const cached = _instance.get(query);
  if (cached) {
    Logger.info(`[SearchCache] Hit: ${query.slice(0, 60)}`);
    return cached;
  }

  const result = await searchWithRetry(player, { query }, user);
  if (result?.tracks?.length) {
    _instance.set(query, result);
    Logger.info(`[SearchCache] Miss (stored): ${query.slice(0, 60)}`);
  } else {
    Logger.info(`[SearchCache] Miss (empty): ${query.slice(0, 60)}`);
  }
  return result;
}