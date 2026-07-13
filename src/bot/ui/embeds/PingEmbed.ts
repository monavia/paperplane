import { EmbedBuilder } from "discord.js";
import Colors from "../../core/constants/Colors";

function build(botLatency: number, gatewayLatency: number, apiLatency: number | string) {
  const apiValue = typeof apiLatency === "number" ? `${apiLatency}ms` : apiLatency;
  return new EmbedBuilder()
    .setTitle("Pong!")
    .addFields(
      { name: "Bot Latency", value: `\`${botLatency}ms\``, inline: true },
      { name: "Gateway Latency", value: `\`${gatewayLatency}ms\``, inline: true },
      { name: "API Latency", value: `\`${apiValue}\``, inline: true },
    )
    .setColor(Colors.PING || Colors.INFO)
    .setFooter({ text: `Round-trip • ${botLatency + gatewayLatency}ms total` });
}

export { build };
