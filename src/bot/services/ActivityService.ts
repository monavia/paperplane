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
const BASE_INTERVAL_MS = 30000;
const MAX_BUFFER_SIZE = 500;
const MAX_BACKOFF_MS = 300000; // 5 min max

class ActivityService {
  private buffer: ActivityLog[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;

  constructor() {
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    const delay = Math.min(BASE_INTERVAL_MS * Math.pow(2, this.consecutiveFailures), MAX_BACKOFF_MS);
    this.flushTimer = setTimeout(() => this.flush(), delay);
  }

  async log(data: ActivityLog) {
    if (SKIP_ACTIONS.has(data.action)) return;
    this.buffer.push(data);
    if (this.buffer.length >= MAX_BUFFER_SIZE) await this.flush();
  }

  private async flush() {
    if (this.buffer.length === 0) { this.scheduleNext(); return; }
    const batch = this.buffer.splice(0, MAX_BUFFER_SIZE);
    try {
      await ActivityRepository.insertMany(batch);
      this.consecutiveFailures = 0;
    } catch {
      this.consecutiveFailures++;
      this.buffer = batch.concat(this.buffer).slice(0, MAX_BUFFER_SIZE);
      Logger.warn(`[ActivityService] Flush failed (${this.consecutiveFailures}x), backoff: ${Math.min(BASE_INTERVAL_MS * Math.pow(2, this.consecutiveFailures), MAX_BACKOFF_MS)}ms`);
    }
    this.scheduleNext();
  }

  async cleanup() {
    try {
      await ActivityRepository.clearOldActivities(30);
    } catch {}
  }
}

export default new ActivityService();
