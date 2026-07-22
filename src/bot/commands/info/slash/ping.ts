import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Colors from "@/bot/core/constants/Colors";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
  async execute(interaction: any) {
    const wsPing = interaction.client?.ws?.ping ?? 0;
    await interaction.deferReply({ flags: 64 });
    const embed = new EmbedBuilder()
      .setTitle("📶 Pong!")
      .addFields(
        { name: "WebSocket", value: `${wsPing}ms`, inline: true },
        { name: "Roundtrip", value: "⏳ ...", inline: true },
      )
      .setColor(Colors.SUCCESS)
      .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();
    const sent = await interaction.editReply({ embeds: [embed] });
    const roundtrip = (sent as any)?.createdTimestamp - interaction.createdTimestamp;
    embed.spliceFields(1, 1, { name: "Roundtrip", value: `${roundtrip}ms`, inline: true });
    await interaction.editReply({ embeds: [embed] });
  },
};
