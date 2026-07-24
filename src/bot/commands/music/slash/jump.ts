import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("jump")
    .setDescription("Jump to a specific track in the queue")
    .addIntegerOption((o) => o.setName("index").setDescription("Track position").setRequired(true)),

  async execute(interaction: any) {
    if (!await requireSameVoice(interaction)) return;

    const index = interaction.options.getInteger("index", true);
    const guildId = interaction.guildId!;
    const queue = MusicService.getQueue(guildId);

    if (index < 0 || index >= queue.length) {
      return interaction.reply({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)], flags: 64 });
    }
    if (index === 0) return interaction.reply({ embeds: [ErrorEmbed.build("Already playing that track.")], flags: 64 });

    const track = queue[index];
    const success = await MusicService.jumpTo(guildId, index);
    if (!success) return interaction.reply({ embeds: [ErrorEmbed.build("Failed to jump to track.")], flags: 64 });

    await interaction.deferReply();
    await interaction.editReply({ embeds: [SuccessEmbed.build(`Jumped to **${track?.info?.title || "?"}**`)] });
  },
};
