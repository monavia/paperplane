import "./instrument.js";
import "reflect-metadata";
import "dotenv/config";



// Suppress lavalink-client internal console.error dumps

// Verified: lavalink-client v2.10 debugOptions only has {noAudio, playerDestroy} — no console.error suppress.
const _origConsoleError = console.error;
console.error = (...args: any[]) => {
  const first = args[0];
  if (first && typeof first === "object" && (first.NodeManager || first.nodeType === "Lavalink" || first.heartBeatPingTimestamp !== undefined)) return;
  _origConsoleError(...args);
};

import { Client, GatewayIntentBits, REST, Routes, Collection } from "discord.js";
import Config from "./bot/config/bot.js";
import AIConfig from "./bot/config/ai.js";
import Logger from "./bot/core/utils/Logger.js";
import { connect as connectDB } from "./bot/database/connection.js";
import { load as loadEvents } from "./bot/core/bootstrap/loadEvents.js";
import { loadSlash, loadPrefix, getSlashData } from "./bot/core/bootstrap/loadCommands.js";
import { ShutdownManager } from "./bot/core/utils/ShutdownManager.js";
import { registerShutdownTasks } from "./bot/core/bootstrap/registerShutdownTasks.js";
import { startApiServer } from "./bot/api/apiServer.js";

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

function validateEnv(): void {
  const missing: string[] = [];

  if (!process.env.DISCORD_TOKEN) {
    missing.push("DISCORD_TOKEN");
  }
  if (!process.env.CLIENT_ID) {
    missing.push("CLIENT_ID");
  }
  if (!process.env.MONGO_URI && !process.env.DATABASE_URL) {
    missing.push("MONGO_URI or DATABASE_URL");
  }

  if (missing.length > 0) {
    console.error("\nMissing required environment variables:");
    for (const key of missing) {
      console.error(`  ✗ ${key}`);
    }
    console.error("\nSet them in .env or export before starting.");
    console.error(`Example .env:\n  DISCORD_TOKEN=your_token\n  CLIENT_ID=your_client_id\n  MONGO_URI=mongodb://localhost:27017/paperplane\n`);
    process.exit(1);
  }
}

async function main() {
  validateEnv();

  try {
    Logger.info("Starting bot...");

    // Database
    try {
      await connectDB();
      Logger.ready("Database connected");
    } catch (err) {
      Logger.error("Database connection failed:", err);
      process.exit(1);
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
    const shutdownManager = new ShutdownManager(30000);
    registerShutdownTasks({ shutdownManager });

    process.on("SIGINT", () => shutdownManager.startShutdown());
    process.on("SIGTERM", () => shutdownManager.startShutdown());

    // AI status
    const { default: AIEngine } = (await import("./bot/ai/engine/AIEngine.js") as any).default;
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
  } catch (err: any) {
    Logger.error("Fatal startup error:", err);
    process.exit(1);
  }
}

process.on("unhandledRejection", (err: any) => {
  if (err instanceof Error) {
    Logger.error("Unhandled rejection:", err?.message || String(err));
    import("@sentry/node").then(S => S.captureException(err));
  } else {
    Logger.warn("Unhandled rejection (non-Error):", String(err));
  }
});
process.on("uncaughtException", (err: any) => {
  if (!(err instanceof Error)) return;
  if (err.message?.includes("Unhandled error")) return;
  Logger.error("Uncaught exception:", err?.message || String(err));
  import("@sentry/node").then(S => S.captureException(err));
});

main();
