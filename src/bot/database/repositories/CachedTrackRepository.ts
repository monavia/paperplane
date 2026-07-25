import Logger from "../../core/utils/Logger.js";
import CachedTrack, { ICachedTrack } from "../models/CachedTrack.js";

export async function findCachedTrack(identifier: string): Promise<ICachedTrack | null> {
  try {
    return await CachedTrack.findOne({ identifier });
  } catch (err) {
    Logger.warn(`[CachedTrackRepo] find error: ${err}`);
    return null;
  }
}

export async function upsertCachedTrack(
  identifier: string,
  data: { trackData: any; source?: string; query?: string },
): Promise<ICachedTrack | null> {
  try {
    const update: Record<string, any> = {
      $set: {
        identifier,
        trackData: data.trackData,
        source: data.source || "unknown",
        query: data.query || "",
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
      $inc: { hitCount: 1 },
    };
    return await CachedTrack.findOneAndUpdate({ identifier }, update, { upsert: true, returnDocument: "after" });
  } catch (err) {
    Logger.warn(`[CachedTrackRepo] upsert error: ${err}`);
    return null;
  }
}

export async function incrementHitCount(identifier: string): Promise<void> {
  try {
    await CachedTrack.updateOne({ identifier }, { $inc: { hitCount: 1 } });
  } catch (err) {
    Logger.warn(`[CachedTrackRepo] incrementHitCount error: ${err}`);
  }
}

export async function pruneExpired(): Promise<number> {
  try {
    const result = await CachedTrack.deleteMany({ expiresAt: { $lte: new Date() } });
    if (result.deletedCount > 0) {
      Logger.info(`[CachedTrackRepo] Pruned ${result.deletedCount} expired tracks`);
    }
    return result.deletedCount || 0;
  } catch (err) {
    Logger.warn(`[CachedTrackRepo] prune error: ${err}`);
    return 0;
  }
}
