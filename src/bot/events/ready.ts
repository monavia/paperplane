import { ActivityType } from "discord.js";
import Logger from "../core/utils/Logger";
import { init as initLavalink, get as getLavalink } from "../music/engine/lavalink";
import { register } from "../music/engine/musicEvents";

export function start(client: any): void {
  client.once("clientReady", async () => {
    Logger.ready(`Logged in as ${client.user?.tag}`);

    const activity = () => ({ name: "/help | music", type: ActivityType.Listening });
    client.user?.setPresence({ activities: [activity()], status: "online" });

    // Cycle status every 10s
    const statuses: any[] = ["online", "idle", "dnd"];
    let i = 0;
    setInterval(() => {
      i++;
      client.user?.setPresence({
        activities: [activity()],
        status: statuses[i % statuses.length],
      });
    }, 10000);

    try {
      const ready = await initLavalink(client);
      register(client);
      if (ready) {
        const { startWatchdog } = require("../music/engine/PlayerWatchdog");
        startWatchdog(getLavalink(), client);

        const { restoreAllStates } = require("../music/services/StateService");
        restoreAllStates(client).catch((e: any) => Logger.error("restoreAllStates failed:", e));
      }
    } catch (err) {
      Logger.error("Lavalink init failed:", err);
    }

    // Periodic history cleanup
    const { cleanupOldEntries } = require("../music/services/HistoryService");
    cleanupOldEntries().catch(() => {});
    setInterval(() => cleanupOldEntries().catch(() => {}), 86400000);
  });
}
