import { readdirSync } from "fs";
import { join } from "path";
import { Collection } from "discord.js";
import Logger from "../utils/Logger";

let slashCommands: Collection<string, any> = new Collection();
let prefixCommands: Collection<string, any> = new Collection();

function loadDir(client: any, dir: string, type: "slash" | "prefix"): number {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    for (const file of files) {
      if (file.startsWith(".")) continue;
      if (type === "slash") {
        const cmd = require(join(dir, file)).default;
        if (cmd?.data?.name && cmd?.execute) {
          slashCommands.set(cmd.data.name, cmd);
          client.slashCommands?.set?.(cmd.data.name, cmd);
        }
      } else {
        const cmd = require(join(dir, file)).default || require(join(dir, file));
        if (cmd?.name && cmd?.execute) {
          prefixCommands.set(cmd.name, cmd);
          if (!client.prefixCommands) client.prefixCommands = new Collection();
          client.prefixCommands.set(cmd.name, cmd);
        }
      }
    }
  } catch (err) {
    Logger.warn(`[loadDir] Failed to load commands from ${dir}: ${err}`);
  }
  return type === "slash" ? slashCommands.size : prefixCommands.size;
}

export function loadSlash(client: any, _pluginManager?: any): number {
  loadDir(client, join(__dirname, "../../commands/music/slash"), "slash");
  loadDir(client, join(__dirname, "../../commands/setup/slash"), "slash");
  loadDir(client, join(__dirname, "../../commands/info/slash"), "slash");
  return slashCommands.size;
}

export function loadPrefix(client: any): number {
  loadDir(client, join(__dirname, "../../commands/music/prefix"), "prefix");
  loadDir(client, join(__dirname, "../../commands/setup/prefix"), "prefix");
  loadDir(client, join(__dirname, "../../commands/info/prefix"), "prefix");
  return prefixCommands.size;
}

export function getSlashData(_client: any): any[] {
  return Array.from(slashCommands.values()).map((c: any) => c.data.toJSON());
}
