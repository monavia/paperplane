import HistoryEntry from "../../database/models/HistoryEntry";
import Logger from "../../core/utils/Logger";
import { isUsingPrisma } from "../../database/connection";

let _prisma: any = null;
async function getPrisma() {
  if (!_prisma) _prisma = (await import("../../database/prisma")).default;
  return _prisma;
}
function usePg() { return isUsingPrisma(); }

export async function addEntry(guildId: string, userId: string, track: any): Promise<void> {
  try {
    const data = {
      guildId, userId,
      songTitle: track.info?.title || "Unknown",
      artist: track.info?.author || "",
      timestamp: new Date(),
    };
    if (usePg()) {
      const p = await getPrisma();
      await p.historyEntry.create({ data }).catch(() => {});
    } else {
      await HistoryEntry.create(data).catch(() => {});
    }
  } catch (err: any) {
    Logger.error(`[History] Failed to save entry: ${err.message}`);
  }
}

export async function getHistory(guildId: string, limit = 15): Promise<any[]> {
  try {
    if (usePg()) {
      const p = await getPrisma();
      return p.historyEntry.findMany({ where: { guildId }, orderBy: { timestamp: "desc" }, take: limit });
    }
    return await HistoryEntry.find({ guildId }).sort({ timestamp: -1 }).limit(limit).lean();
  } catch { return []; }
}

export async function getTotalCount(guildId: string): Promise<number> {
  try {
    if (usePg()) {
      const p = await getPrisma();
      return await p.historyEntry.count({ where: { guildId } });
    }
    return await HistoryEntry.countDocuments({ guildId });
  } catch { return 0; }
}

export async function cleanupOldEntries(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 86400000);
  try {
    if (usePg()) {
      const p = await getPrisma();
      await p.historyEntry.deleteMany({ where: { timestamp: { lt: cutoff } } });
    } else {
      await HistoryEntry.deleteMany({ timestamp: { $lt: cutoff } }).catch(() => {});
    }
  } catch {}
}
