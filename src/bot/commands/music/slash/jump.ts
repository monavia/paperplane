import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import * as SuccessEmbed from "@/bot/ui/embeds/SuccessEmbed";

export default {
  data: new SlashCommandBuilder()
    .setName("jump")
    .setDescription("Jump to a specific track in the queue")
    .addIntegerOption((o) => o.setName("index").setDescription("Track position").setRequired(true)),

  async execute(interaction: any) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const index = interaction.options.getInteger("index", true);
    const guildId = interaction.guildId!;
    const queue = MusicService.getQueue(guildId);

    if (index < 0 || index >= queue.length) {
      return interaction.reply({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)], ephemeral: true });
    }
    if (index === 0) return interaction.reply({ embeds: [ErrorEmbed.build("Already playing that track.")], ephemeral: true });

    const track = queue[index];
    const success = await MusicService.jumpTo(guildId, index);
    if (!success) return interaction.reply({ embeds: [ErrorEmbed.build("Failed to jump to track.")], ephemeral: true });

    interaction.reply({ embeds: [SuccessEmbed.build(`Jumped to **${track?.info?.title || "?"}**`)] });
  },
};
