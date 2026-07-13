import Activity from "../models/Activity";
import { isUsingPrisma } from "../connection";

let _prisma: any = null;
async function getPrisma() {
  if (!_prisma) _prisma = (await import("../prisma")).default;
  return _prisma;
}

class ActivityRepository {
  async insertMany(docs: any[]) {
    if (isUsingPrisma()) {
      const p = await getPrisma();
      try { await p.activity.createMany({ data: docs }); } catch {}
    } else {
      await Activity.insertMany(docs, { ordered: false }).catch(() => ({}));
    }
  }

  async findRecentByGuild(guildId: string, limit = 10) {
    if (isUsingPrisma()) {
      const p = await getPrisma();
      return p.activity.findMany({ where: { guildId }, orderBy: { timestamp: "desc" }, take: limit });
    }
    return Activity.find({ guildId }).sort({ timestamp: -1 }).limit(limit);
  }

  async clearOldActivities(days = 30) {
    const date = new Date(Date.now() - days * 86400000);
    if (isUsingPrisma()) {
      const p = await getPrisma();
      return p.activity.deleteMany({ where: { timestamp: { lt: date } } });
    }
    return Activity.deleteMany({ timestamp: { $lt: date } });
  }
}

export default new ActivityRepository();
