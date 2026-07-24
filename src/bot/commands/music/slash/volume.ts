import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import { formatVolume } from "../../../../bot/core/utils/Formatter.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { updateVolume } from "../../../../bot/database/repositories/GuildRepository.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";

export default {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set playback volume")
    .addIntegerOption((o) =>
      o.setName("level").setDescription("Volume 1-100").setMinValue(1).setMaxValue(100).setRequired(true),
    ),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const volume = interaction.options.getInteger("level");
    if (!await requireSameVoice(interaction)) return;

    MusicService.setVolume(interaction.guildId!, volume!, interaction.user.id, (interaction.member as any)?.displayName || interaction.user.username);
    updateVolume(interaction.guildId!, volume!);
    
    await interaction.deferReply();
    await interaction.editReply({ embeds: [SuccessEmbed.build(`Volume set to ${formatVolume(volume!)}`)] });
  },
};
