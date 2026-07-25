import Logger from "../utils/Logger.js";
import { saveAllStates } from "../../music/services/StateService.js";
import { disconnect } from "../../database/connection.js";
import * as lavalink from "../../music/engine/lavalink.js";
import * as redis from "../../cache/redis.js";

export function registerShutdownTasks(deps: {
  shutdownManager: any;
}): void {
  const { shutdownManager } = deps;

  shutdownManager.registerTask({
    name: "save-state",
    priority: "critical",
    timeout: 10000,
    description: "Save all player states to database",
    execute: async () => {
      const saved = await saveAllStates();
      Logger.info(`Saved ${saved} player state(s)`);
    },
  });

  shutdownManager.registerTask({
    name: "lavalink-disconnect",
    priority: "normal",
    timeout: 5000,
    description: "Disconnect lavalink nodes and clear timers",
    execute: async () => {
      lavalink.cleanup();
      Logger.info("Lavalink cleaned up");
    },
  });

  shutdownManager.registerTask({
    name: "disconnect-redis",
    priority: "low",
    timeout: 5000,
    description: "Disconnect Redis",
    execute: async () => {
      await redis.shutdown();
      Logger.info("Redis disconnected");
    },
  });

  shutdownManager.registerTask({
    name: "disconnect-db",
    priority: "low",
    timeout: 5000,
    description: "Disconnect database",
    execute: async () => {
      await disconnect();
      Logger.info("Database disconnected");
    },
  });
}
