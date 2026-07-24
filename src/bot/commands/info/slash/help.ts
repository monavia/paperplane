import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import botConfig from "../../../../bot/config/bot.js";

export default {
  data: new SlashCommandBuilder().setName("help").setDescription("Show all available commands"),
  async execute(interaction: any) {
    const commands = interaction.client?.slashCommands;
    if (!commands?.size) return interaction.reply({ content: "No commands loaded.", flags: 64 });

    const lines = commands.map((cmd: any) => `\`/${cmd.data.name}\` — ${cmd.data.description}`);
    const embed = new EmbedBuilder()
      .setTitle("Commands")
      .setDescription(lines.join("\n"))
      .setColor(Colors.INFO)
      .setFooter({ text: `${commands.size} slash commands • Prefix: \`${botConfig.prefix}\`` });
    await interaction.deferReply({ flags: 64 });
    await interaction.editReply({ embeds: [embed] });
  },
};
