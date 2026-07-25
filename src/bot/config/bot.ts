import "dotenv/config";

export default {
  token: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  prefix: process.env.PREFIX || "-",
  trigger: (process.env.TRIGGER || "mona").toLowerCase(),
  apiPort: parseInt(process.env.API_PORT || process.env.BOT_API_PORT || "3001"),
  apiHost: process.env.API_HOST || "127.0.0.1",
  deployCommands: process.env.DEPLOY_COMMANDS !== "false",
  maxQueue: parseInt(process.env.MAX_QUEUE || "150"),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  redisPrefix: process.env.REDIS_PREFIX || "paperplane:",
  redisEnabled: process.env.REDIS_ENABLED !== "false",
};
