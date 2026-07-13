import Activity from "../models/Activity";

class ActivityRepository {
  async insertMany(docs: any[]) {
    return Activity.insertMany(docs, { ordered: false }).catch(() => ({}));
  }

  async findRecentByGuild(guildId: string, limit = 10) {
    return Activity.find({ guildId }).sort({ timestamp: -1 }).limit(limit);
  }

  async clearOldActivities(days = 30) {
    const date = new Date(Date.now() - days * 86400000);
    return Activity.deleteMany({ timestamp: { $lt: date } });
  }
}

export default new ActivityRepository();
