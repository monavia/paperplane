import { EventEmitter } from "events";
import Logger from "./Logger";

export class ShutdownManager extends EventEmitter {
  private tasks: Array<{
    name: string;
    priority: "critical" | "high" | "normal" | "low";
    timeout: number;
    description: string;
    execute: () => Promise<void>;
  }> = [];
  private shuttingDown = false;
  private gracePeriod: number;

  constructor(gracePeriod = 30000) {
    super();
    this.gracePeriod = gracePeriod;
  }

  registerTask(task: {
    name: string;
    priority: "critical" | "high" | "normal" | "low";
    timeout: number;
    description: string;
    execute: () => Promise<void>;
  }): void {
    this.tasks.push(task);
  }

  async startShutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    Logger.info("[Shutdown] Starting graceful shutdown...");

    const priorityOrder: Array<"critical" | "high" | "normal" | "low"> = [
      "critical", "high", "normal", "low",
    ];

    for (const pri of priorityOrder) {
      const tasks = this.tasks.filter((t) => t.priority === pri);
      for (const task of tasks) {
        try {
          await Promise.race([
            task.execute(),
            new Promise((_, r) =>
              setTimeout(() => r(new Error(`${task.name} timed out`)), task.timeout)
            ),
          ]);
        } catch (err: any) {
          Logger.error(`[Shutdown] ${task.name} failed: ${err.message}`);
        }
      }
    }

    Logger.info("[Shutdown] All tasks completed.");
    setTimeout(() => process.exit(0), 5000);
  }
}
