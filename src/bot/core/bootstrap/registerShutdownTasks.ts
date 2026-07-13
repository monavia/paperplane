import Logger from "../utils/Logger";

export function registerShutdownTasks(deps: {
  shutdownManager: any;
  destroyPlayer: (guildId: string) => Promise<any>;
}): void {
  const { shutdownManager, destroyPlayer } = deps;

  shutdownManager.registerTask({
    name: "destroy-players",
    priority: "high",
    timeout: 5000,
    description: "Destroy all Lavalink players",
    execute: async () => {
      await destroyPlayer("all");
      Logger.info("All players destroyed");
    },
  });
}
