import type { QueueStoreManager, StoredQueue } from "lavalink-client";
import PlayerState from "../../database/models/PlayerState";

class MongoQueueStore implements QueueStoreManager {
  async get(guildId: string): Promise<string | StoredQueue | undefined> {
    try {
      const doc = await PlayerState.findOne({ guildId }).lean();
      if (!doc?.queue?.length) return undefined;
      const nowPlaying = doc.nowPlaying || null;
      return { current: nowPlaying, tracks: doc.queue } as StoredQueue;
    } catch { return undefined; }
  }

  async set(guildId: string, value: string | StoredQueue): Promise<boolean | void> {
    try {
      const parsed: StoredQueue = typeof value === "string" ? JSON.parse(value) : value;
      await PlayerState.updateOne(
        { guildId },
        {
          $set: {
            queue: [...(parsed.tracks || []), ...(parsed.current ? [parsed.current] : [])].map((t: any) => JSON.parse(JSON.stringify(t))),
            nowPlaying: parsed.current ? JSON.parse(JSON.stringify(parsed.current)) : null,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch {}
  }

  async delete(guildId: string): Promise<boolean | void> {
    try {
      await PlayerState.updateOne(
        { guildId },
        { $set: { queue: [], nowPlaying: null, updatedAt: new Date() } },
      );
    } catch {}
  }

  async parse(value: string | StoredQueue): Promise<Partial<StoredQueue>> {
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  async stringify(value: string | StoredQueue): Promise<string | StoredQueue> {
    return typeof value === "string" ? value : value;
  }
}

export default MongoQueueStore;
