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
        // Clean up entry when idle (no lock, no waiters)
        else if (!state!.locked && state!.queue.length === 0) locks.delete(guildId);
      };

      // Timeout = warning only. Do NOT release/reject — fn() owns the lock
      // until it finishes. Releasing early would let a second caller in
      // while the first is still mutating the queue.
      const timer = setTimeout(() => {
        Logger.warn(
          `[QueueLock] guild=${guildId} fn exceeded ${timeoutMs}ms — still waiting for completion`,
        );
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
