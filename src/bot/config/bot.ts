import "dotenv/config";

export default {
  token: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  prefix: process.env.PREFIX || "-",
  trigger: (process.env.TRIGGER || "mona").toLowerCase(),
  apiPort: parseInt(process.env.API_PORT || process.env.BOT_API_PORT || "3001"),
  apiHost: process.env.API_HOST || "127.0.0.1",
  deployCommands: process.env.DEPLOY_COMMANDS !== "false",
};
