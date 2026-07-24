import { EmbedBuilder } from "discord.js";
import Colors from "../../../../bot/core/constants/Colors.js";

export default {
  name: "ping",
  aliases: ["pong"],
  async execute(message: any, _args: string[]) {
    const wsPing = message.client?.ws?.ping ?? 0;
    const embed = new EmbedBuilder()
      .setTitle("📶 Pong!")
      .addFields(
        { name: "WebSocket", value: `${wsPing}ms`, inline: true },
        { name: "Roundtrip", value: "⏳ ...", inline: true },
      )
      .setColor(Colors.SUCCESS)
      .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();
    const sent = await message.channel.send({ embeds: [embed] });
    const roundtrip = sent.createdTimestamp - message.createdTimestamp;
    embed.spliceFields(1, 1, { name: "Roundtrip", value: `${roundtrip}ms`, inline: true });
    await sent.edit({ embeds: [embed] });
  },
};
