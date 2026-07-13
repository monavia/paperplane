import "reflect-metadata";
import "dotenv/config";

import { Client, GatewayIntentBits, REST, Routes, Collection } from "discord.js";
import Config from "./bot/config/bot";
import AIConfig from "./bot/config/ai";
import Logger from "./bot/core/utils/Logger";
import { connect as connectDB } from "./bot/database/connection";
import { load as loadEvents } from "./bot/core/bootstrap/loadEvents";
import { loadSlash, loadPrefix, getSlashData } from "./bot/core/bootstrap/loadCommands";
import { registerShutdownTasks } from "./bot/core/bootstrap/registerShutdownTasks";
import { startApiServer } from "./bot/api/apiServer";

const client: Client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

(client as any).slashCommands = new Collection();
(client as any).prefixCommands = new Collection();

async function main() {
  try {
    Logger.info("Starting bot...");

    // Database
    try {
      await connectDB();
      Logger.ready("Database connected");
    } catch (err) {
      Logger.error("Database connection failed:", err);
    }

    // Load event handlers
    loadEvents(client);

    // Login
    await client.login(Config.token);
    Logger.ready(`Logged in as ${client.user?.tag}`);

    // Load slash + prefix commands
    const slashCount = loadSlash(client);
    const prefixCount = loadPrefix(client);
    Logger.ready(`Loaded ${slashCount} slash, ${prefixCount} prefix commands`);

    // Deploy slash commands
    if (Config.deployCommands && Config.clientId) {
      try {
        const commands = getSlashData(client);
        if (commands.length) {
          const rest = new REST({ version: "10" }).setToken(Config.token);
          await rest.put(Routes.applicationCommands(Config.clientId), { body: commands });
          Logger.ready(`Deployed ${commands.length} slash commands`);
        }
      } catch (err: any) {
        Logger.error("Slash deploy failed:", err.message);
      }
    }

    // Register shutdown tasks
    const ShutdownManager = require("./bot/core/utils/ShutdownManager").ShutdownManager;
    const shutdownManager = new ShutdownManager(30000);
    registerShutdownTasks({
      shutdownManager,
      destroyPlayer: async (id: string) => {
        const { destroyPlayer } = require("./bot/music/engine/PlayerManager");
        if (id === "all") {
          const lavalink = require("./bot/music/engine/lavalink").get();
          if (lavalink?.players) {
            for (const [gid] of lavalink.players) {
              await destroyPlayer(gid);
            }
          }
        } else {
          await destroyPlayer(id);
        }
      },
    });

    process.on("SIGINT", () => shutdownManager.startShutdown());
    process.on("SIGTERM", () => shutdownManager.startShutdown());

    // AI status
    const { default: AIEngine } = await import("./bot/ai/engine/AIEngine");
    const aiReady = AIEngine.isReady();
    if (aiReady) Logger.ready("AI assistant ready");

    Logger.ready("Bot is ready!");
    const t = new Date().toISOString();
    const okTag = `\x1b[32m[OK]\x1b[0m`;
    const failTag = `\x1b[31m[FAILED]\x1b[0m`;
    console.log(`[${t}] ${aiReady ? okTag : failTag} AI Assistant : ${aiReady ? `enabled (${AIConfig.model})` : "disabled"}`);
    console.log(`[${t}] ${okTag} Commands: ${slashCount} slash, ${prefixCount} prefix`);

    // Start API
    try {
      await startApiServer({});
    } catch (err: any) {
      Logger.error("API server failed:", err.message);
    }

    Logger.ready("Bot is ready!");
  } catch (err: any) {
    Logger.error("Fatal startup error:", err);
    process.exit(1);
  }
}

process.on("unhandledRejection", (err: any) => {
  Logger.error("Unhandled rejection:", err?.message || String(err));
});
process.on("uncaughtException", (err: any) => {
  const msg = err?.message || err;
  // lavalink-client sometimes throws detailed node objects — only log brief
  if (typeof msg === "object") {
    Logger.error(`Uncaught exception: ${msg?.options?.id || "Lavalink"} node error`);
  } else {
    Logger.error("Uncaught exception:", msg);
  }
});

main();
