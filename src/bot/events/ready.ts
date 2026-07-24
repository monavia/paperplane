import { ActivityType } from "discord.js";
import Logger from "../core/utils/Logger.js";
import { init as initLavalink, get as getLavalink } from "../music/engine/lavalink.js";
import { register } from "../music/engine/musicEvents.js";
import { startWatchdog } from "../music/engine/PlayerWatchdog.js";
import { restoreAllStates } from "../music/services/StateService.js";
import { cleanupOldEntries } from "../music/services/HistoryService.js";

export function start(client: any): void {
  client.once("clientReady", async () => {
    Logger.ready(`Logged in as ${client.user?.tag}`);

    const activity = () => ({ name: "/help | music", type: ActivityType.Listening });
    client.user?.setPresence({ activities: [activity()], status: "online" });

    // Cycle status every 10s
    const statuses: any[] = ["online", "idle", "dnd"];
    let i = 0;
    const cycleTimer = setInterval(() => {
      i++;
      client.user?.setPresence({
        activities: [activity()],
        status: statuses[i % statuses.length],
      });
    }, 10000);
    cycleTimer.unref();

    try {
      const ready = await initLavalink(client);
      register(client);
      if (ready) {
        startWatchdog(getLavalink(), client);

        // Tunggu guild cache terisi sebelum restore state
        if (client.guilds.cache.size === 0) {
          await new Promise<void>(resolve => {
            const start = Date.now();
            const check = () => {
              if (client.guilds.cache.size > 0 || Date.now() - start > 10000) resolve();
              else setTimeout(check, 500);
            };
            check();
          });
        }
        restoreAllStates(client).catch((e: any) => Logger.error("restoreAllStates failed:", e));
      }
    } catch (err) {
      Logger.error("Lavalink init failed:", err);
    }

    // Periodic history cleanup
    cleanupOldEntries().catch(Logger.safe("bot/events/ready.ts"));
    const historyCleanupTimer = setInterval(() => cleanupOldEntries().catch(Logger.safe("bot/events/ready.ts")), 86400000);
    historyCleanupTimer.unref();
  });
}
