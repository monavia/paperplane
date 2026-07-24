import { readdirSync } from "fs";
import { join } from "path";
import { Collection } from "discord.js";
import Logger from "../utils/Logger.js";

let slashCommands: Collection<string, any> = new Collection();
let prefixCommands: Collection<string, any> = new Collection();

function loadDir(client: any, dir: string, type: "slash" | "prefix"): number {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
  } catch (err) {
    Logger.warn(`[loadDir] Failed to read directory ${dir}: ${err}`);
    return 0;
  }
  for (const file of files) {
    if (file.startsWith(".")) continue;
    const filePath = join(dir, file);
    try {
      if (type === "slash") {
        const cmd = require(filePath).default; // dynamic path — must stay require()
        if (cmd?.data?.name && cmd?.execute) {
          slashCommands.set(cmd.data.name, cmd);
          client.slashCommands?.set?.(cmd.data.name, cmd);
        }
      } else {
        const cmd = require(filePath).default || require(filePath); // dynamic path — must stay require()
        if (cmd?.name && cmd?.execute) {
          prefixCommands.set(cmd.name, cmd);
          if (!client.prefixCommands) client.prefixCommands = new Collection();
          client.prefixCommands.set(cmd.name, cmd);
        }
      }
    } catch (err) {
      Logger.warn(`[loadDir] Failed to load command: ${filePath} — ${err}`);
    }
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
