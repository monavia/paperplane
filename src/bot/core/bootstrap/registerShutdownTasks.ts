import Logger from "../utils/Logger";
import { saveAllStates } from "../../music/services/StateService";

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
}
