import { EmbedBuilder, version } from "discord.js";
import Colors from "../../core/constants/Colors";
import { parseDuration } from "../../core/utils/Duration";

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function build(client: any) {
  const guilds = formatNumber(client.guilds.cache.size);
  const users = formatNumber(client.users.cache.size);
  const channels = formatNumber(client.channels.cache.size);
  const uptime = parseDuration(client.uptime);
  const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

  return new EmbedBuilder()
    .setTitle("Bot Statistics")
    .setThumbnail(client.user.displayAvatarURL())
    .addFields(
      { name: "Servers", value: guilds, inline: true },
      { name: "Users", value: users, inline: true },
      { name: "Channels", value: channels, inline: true },
      { name: "Uptime", value: uptime, inline: true },
      { name: "Ping", value: `${client.ws.ping}ms`, inline: true },
      { name: "Memory", value: `${memory} MB`, inline: true },
      { name: "Discord.js", value: `v${version}`, inline: true },
      { name: "Node.js", value: process.version, inline: true },
    )
    .setColor(Colors.STATS || Colors.INFO);
}

export { build };
