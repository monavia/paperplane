import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import * as SuccessEmbed from "@/bot/ui/embeds/SuccessEmbed";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";

function parseTime(input: string): number | null {
  const match = input.match(/^(?:(\d+):)?(\d+)$/);
  if (!match) return null;
  const mins = parseInt(match[1] || "0", 10);
  const secs = parseInt(match[2], 10);
  if (secs >= 60) return null;
  return (mins * 60 + secs) * 1000;
}

export default {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Seek to a specific position in the current track")
    .addStringOption((o) =>
      o.setName("position").setDescription("Position (e.g. 1:30 or 90)").setRequired(true)
    ),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const player = MusicService.getEngine(interaction.guildId!).player;
    if (!player?.playing) return interaction.reply({ embeds: [ErrorEmbed.build("No track is currently playing.")], ephemeral: true });

    const input = interaction.options.getString("position", true);
    const ms = parseTime(input);
    if (ms === null) return interaction.reply({ embeds: [ErrorEmbed.build("Invalid position. Use format: `1:30` or `90`.")], ephemeral: true });

    const duration = player.queue.current?.info?.duration || 0;
    if (ms > duration) return interaction.reply({ embeds: [ErrorEmbed.build("Position exceeds track duration.")], ephemeral: true });

    player.seek(ms);
    const display = input.match(/^(\d+:)?\d+$/) ? input : `${Math.floor(ms / 60000)}:${Math.floor((ms % 60000) / 1000).toString().padStart(2, "0")}`;
    await interaction.reply({ embeds: [SuccessEmbed.build(`Seeked to \`${display}\``)] });
  },
};
