import { readdirSync } from "fs";
import { join } from "path";
import Logger from "../utils/Logger";

export function load(client: any): number {
  const eventsPath = join(__dirname, "../../events");
  let count = 0;
  try {
    const files = readdirSync(eventsPath).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    for (const file of files) {
      try {
        const mod = require(join(eventsPath, file)); // dynamic path — must stay require()
        if (typeof mod.start === "function") {
          mod.start(client);
          count++;
        }
      } catch (err: any) {
        Logger.error(`Failed to load event ${file}: ${err.message}`);
      }
    }
  } catch {}
  return count;
}
