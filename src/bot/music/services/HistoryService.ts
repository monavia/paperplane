import HistoryEntry from "../../database/models/HistoryEntry";
import Logger from "../../core/utils/Logger";

export async function addEntry(guildId: string, userId: string, track: any): Promise<void> {
  try {
    await HistoryEntry.create({
      guildId,
      userId,
      track: {
        title: track.info?.title || "Unknown",
        author: track.info?.author || "",
        duration: track.info?.duration || 0,
        uri: track.info?.uri || "",
        artworkUrl: track.info?.artworkUrl || "",
        source: track.info?.source || "youtube",
      },
      playedAt: new Date(),
    });
  } catch (err: any) {
    Logger.error(`[History] Failed to save entry: ${err.message}`);
  }
}

export async function getHistory(guildId: string, limit = 15): Promise<any[]> {
  try {
    return await HistoryEntry.find({ guildId }).sort({ playedAt: -1 }).limit(limit).lean();
  } catch {
    return [];
  }
}

export async function getTotalCount(guildId: string): Promise<number> {
  try {
    return await HistoryEntry.countDocuments({ guildId });
  } catch {
    return 0;
  }
}

export async function cleanupOldEntries(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 86400000);
  try {
    const result = await HistoryEntry.deleteMany({ playedAt: { $lt: cutoff } });
  } catch {}
}
