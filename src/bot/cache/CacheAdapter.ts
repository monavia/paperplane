import Redis from "ioredis";
import Config from "../config/bot.js";
import { getCache, isAvailable } from "./redis.js";

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
}

export class MemoryAdapter implements CacheAdapter {
  private store = new Map<string, { value: any; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs = 3_600_000): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async size(): Promise<number> {
    return this.store.size;
  }
}

export class RedisAdapter implements CacheAdapter {
  constructor(
    private redis: Redis,
    private prefix: string,
  ) {}

  private pk(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.pk(key));
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  async set<T>(key: string, value: T, ttlMs = 3_600_000): Promise<void> {
    const raw = JSON.stringify(value);
    await this.redis.setex(this.pk(key), Math.ceil(ttlMs / 1000), raw);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(this.pk(key));
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.redis.exists(this.pk(key));
    return exists === 1;
  }

  async clear(): Promise<void> {
    const stream = this.redis.scanStream({ match: `${this.prefix}*`, count: 500 });
    for await (const keys of stream) {
      if (keys.length) await this.redis.del(...keys);
    }
  }

  async size(): Promise<number> {
    let total = 0;
    const stream = this.redis.scanStream({ match: `${this.prefix}*`, count: 500 });
    for await (const keys of stream) total += keys.length;
    return total;
  }
}

let _adapter: CacheAdapter | null = null;

export function getAdapter(): CacheAdapter {
  if (!_adapter) {
    if (isAvailable()) {
      const redis = getCache()!;
      _adapter = new RedisAdapter(redis, Config.redisPrefix);
    } else {
      _adapter = new MemoryAdapter();
    }
  }
  return _adapter;
}

export function resetAdapter(): void {
  _adapter = null;
}
