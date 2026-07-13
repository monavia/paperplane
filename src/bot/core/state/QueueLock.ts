import Logger from "../utils/Logger";

const LOCK_TIMEOUT_MS = 30000;

interface LockState {
  locked: boolean;
  queue: Array<() => void>;
}

const locks = new Map<string, LockState>();

export function withQueueLock<T>(
  guildId: string,
  fn: () => Promise<T> | T,
  timeoutMs: number = LOCK_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let state = locks.get(guildId);
    if (!state) {
      state = { locked: false, queue: [] };
      locks.set(guildId, state);
    }

    const acquire = () => {
      if (state!.locked) {
        state!.queue.push(acquire);
        return;
      }
      state!.locked = true;

      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        state!.locked = false;
        const next = state!.queue.shift();
        if (next) next();
      };

      const timer = setTimeout(() => {
        Logger.error(
          `[QueueLock] guild=${guildId} fn exceeded ${timeoutMs}ms — force-releasing lock`,
        );
        release();
        reject(new Error("QueueLock timeout"));
      }, timeoutMs);

      Promise.resolve().then(async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          clearTimeout(timer);
          release();
        }
      });
    };

    acquire();
  });
}
