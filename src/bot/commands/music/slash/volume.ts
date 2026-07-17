import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import { formatVolume } from "@/bot/core/utils/Formatter";
import * as SuccessEmbed from "@/bot/ui/embeds/SuccessEmbed";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { updateVolume } from "@/bot/database/repositories/GuildRepository";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";

export default {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set playback volume")
    .addIntegerOption((o) =>
      o.setName("level").setDescription("Volume 1-100").setMinValue(1).setMaxValue(100).setRequired(true),
    ),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const volume = interaction.options.getInteger("level");
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    MusicService.setVolume(interaction.guildId!, volume!, interaction.user.id, (interaction.member as any)?.displayName || interaction.user.username);
    updateVolume(interaction.guildId!, volume!);
    
    await interaction.reply({ embeds: [SuccessEmbed.build(`Volume set to ${formatVolume(volume!)}`)] });
  },
};
