import { EventEmitter } from "events";
import Logger from "./Logger.js";

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
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              reject(new Error(`${task.name} timed out`));
            }, task.timeout);

            task.execute().then(
              () => { clearTimeout(timer); resolve(); },
              (err) => { clearTimeout(timer); reject(err); },
            );
          });
        } catch (err: any) {
          Logger.error(`[Shutdown] ${task.name} failed: ${err.message}`);
        }
      }
    }

    Logger.info("[Shutdown] All tasks completed.");
    process.exit(0);
  }
}
