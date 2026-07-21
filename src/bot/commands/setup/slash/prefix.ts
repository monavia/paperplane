import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { setPrefix, getPrefix } from "@/bot/database/repositories/GuildRepository";
import * as SuccessEmbed from "@/bot/ui/embeds/SuccessEmbed";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import Colors from "@/bot/core/constants/Colors";

export default {
  data: new SlashCommandBuilder()
    .setName("prefix")
    .setDescription("Show or change bot prefix")
    .addStringOption((o) =>
      o.setName("new").setDescription("New prefix (max 3 chars)").setMinLength(1).setMaxLength(3)
    ),

  async execute(interaction: any) {
    const newPrefix = interaction.options.getString("new");

    if (newPrefix) {
      if (!interaction.memberPermissions?.has("ManageGuild")) {
        return interaction.reply({ embeds: [ErrorEmbed.build("You need `Manage Server` permission.")], flags: 64 });
      }
      await setPrefix(interaction.guildId, newPrefix);
      await interaction.deferReply();
      return interaction.editReply({ embeds: [SuccessEmbed.build(`Prefix set to \`${newPrefix}\``)] });
    }

    const current = await getPrefix(interaction.guildId);
    const embed = new EmbedBuilder()
      .setDescription(`Current prefix: \`${current}\``)
      .setColor(Colors.INFO);
    await interaction.deferReply({ flags: 64 });
    await interaction.editReply({ embeds: [embed] });
  },
};
