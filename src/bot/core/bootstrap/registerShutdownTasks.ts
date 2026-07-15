import Logger from "../utils/Logger";

export function registerShutdownTasks(deps: {
  shutdownManager: any;
  destroyPlayer: (guildId: string) => Promise<any>;
}): void {
  const { shutdownManager, destroyPlayer } = deps;

  shutdownManager.registerTask({
    name: "save-state",
    priority: "critical",
    timeout: 10000,
    description: "Save all player states to database",
    execute: async () => {
      const { saveAllStates } = require("../../../music/services/StateService");
      const saved = await saveAllStates();
      Logger.info(`Saved ${saved} player state(s)`);
    },
  });

  shutdownManager.registerTask({
    name: "destroy-players",
    priority: "normal",
    timeout: 5000,
    description: "Destroy all Lavalink players",
    execute: async () => {
      await destroyPlayer("all");
      Logger.info("All players destroyed");
    },
  });
}
