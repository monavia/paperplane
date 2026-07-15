import { readdirSync } from "fs";
import { join } from "path";
import { Collection } from "discord.js";
import Logger from "../utils/Logger";

let slashCommands: Collection<string, any> = new Collection();
let prefixCommands: Collection<string, any> = new Collection();

export function loadSlash(client: any, _pluginManager?: any): number {
  const slashDir = join(__dirname, "../../music/commands/slash");
  try {
    const files = readdirSync(slashDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    for (const file of files) {
      const cmd = require(join(slashDir, file)).default;
      if (cmd?.data?.name && cmd?.execute) {
        slashCommands.set(cmd.data.name, cmd);
        client.slashCommands?.set?.(cmd.data.name, cmd);
      }
    }
  } catch (err) {
    Logger.warn(`[loadSlash] Failed to load slash commands from ${slashDir}: ${err}`);
  }
  return slashCommands.size;
}

export function loadPrefix(client: any): number {
  const prefixDir = join(__dirname, "../../music/commands/prefix");
  try {
    const files = readdirSync(prefixDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    for (const file of files) {
      const cmd = require(join(prefixDir, file)).default || require(join(prefixDir, file));
      if (cmd?.name && cmd?.execute) {
        prefixCommands.set(cmd.name, cmd);
        if (!client.prefixCommands) client.prefixCommands = new Collection();
        client.prefixCommands.set(cmd.name, cmd);
      }
    }
  } catch (err) {
    Logger.warn(`[loadPrefix] Failed to load prefix commands from ${prefixDir}: ${err}`);
  }
  return prefixCommands.size;
}

export function getSlashData(_client: any): any[] {
  return Array.from(slashCommands.values()).map((c: any) => c.data.toJSON());
}
