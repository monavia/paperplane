import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";

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
    if (!await requireSameVoice(interaction)) return;

    const player = MusicService.getEngine(interaction.guildId!).player;
    if (!player?.playing) return interaction.reply({ embeds: [ErrorEmbed.build("No track is currently playing.")], flags: 64 });

    const input = interaction.options.getString("position", true);
    const ms = parseTime(input);
    if (ms === null) return interaction.reply({ embeds: [ErrorEmbed.build("Invalid position. Use format: `1:30` or `90`.")], flags: 64 });

    const duration = player.queue.current?.info?.duration || 0;
    if (ms > duration) return interaction.reply({ embeds: [ErrorEmbed.build("Position exceeds track duration.")], flags: 64 });

    player.seek(ms);
    const display = input.match(/^(\d+:)?\d+$/) ? input : `${Math.floor(ms / 60000)}:${Math.floor((ms % 60000) / 1000).toString().padStart(2, "0")}`;
    await interaction.deferReply();
    await interaction.editReply({ embeds: [SuccessEmbed.build(`Seeked to \`${display}\``)] });
  },
};
