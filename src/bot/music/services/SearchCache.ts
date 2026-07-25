import Logger from "../../core/utils/Logger.js";
import { searchWithRetry } from "./SearchService.js";
import { getAdapter } from "../../cache/CacheAdapter.js";

const SEARCH_PREFIX = "search:";
const SEARCH_TTL = 86_400_000;

function cacheKey(query: string): string {
  return `${SEARCH_PREFIX}${query.toLowerCase().trim()}`;
}

export async function cachedSearch(player: any, query: string, user: any): Promise<any> {
  const adapter = getAdapter();
  const key = cacheKey(query);

  const cached = await adapter.get<any>(key);
  if (cached) {
    Logger.info(`[SearchCache] Hit: ${query.slice(0, 60)}`);
    return cached;
  }

  const result = await searchWithRetry(player, { query }, user);
  if (result?.tracks?.length) {
    await adapter.set(key, result, SEARCH_TTL);
    Logger.info(`[SearchCache] Miss (stored): ${query.slice(0, 60)}`);
  } else {
    Logger.info(`[SearchCache] Miss (empty): ${query.slice(0, 60)}`);
  }
  return result;
}
