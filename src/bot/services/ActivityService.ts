import ActivityRepository from '../database/repositories/ActivityRepository';
import Logger from '../core/utils/Logger';

export interface ActivityLog {
  guildId: string;
  userId: string;
  userName: string;
  action: string;
  detail: string;
  songTitle?: string;
  artist?: string;
}

const SKIP_ACTIONS = new Set(['queue_add', 'queue_remove']);
const BATCH_INTERVAL_MS = 30000;
const MAX_BUFFER_SIZE = 500;

class ActivityService {
  private buffer: ActivityLog[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.flushTimer = setInterval(() => this.flush(), BATCH_INTERVAL_MS);
  }

  async log(data: ActivityLog) {
    if (SKIP_ACTIONS.has(data.action)) return;
    this.buffer.push(data);
    if (this.buffer.length >= MAX_BUFFER_SIZE) await this.flush();
  }

  private async flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, MAX_BUFFER_SIZE);
    try {
      await ActivityRepository.insertMany(batch);
    } catch {
      this.buffer = batch.concat(this.buffer).slice(0, MAX_BUFFER_SIZE);
    }
  }

  async cleanup() {
    try {
      const result = await ActivityRepository.clearOldActivities(30);
    } catch {}
  }
}

export default new ActivityService();
