import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { getQueue } from "../../../../bot/music/services/QueueService.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import { parseDuration } from "../../../../bot/core/utils/Duration.js";

export default {
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("Show current track"),
  async execute(interaction: any) {
    const tracks = getQueue(interaction.guildId!);
    if (!tracks?.length) return interaction.reply({ embeds: [ErrorEmbed.build("Nothing is playing.")], flags: 64 });
    const track = tracks[0];
    const info = track.info || {};
    const thumb = info.artworkUrl || (info.identifier?.length === 11 ? `https://img.youtube.com/vi/${info.identifier}/maxresdefault.jpg` : null);
    const requester = info.requester || track.requester;
    const requesterName = typeof requester === "object" ? requester?.username || requester?.tag : `<@${requester}>`;

    const url = info.originalUrl || info.uri || "";
    const embed = new EmbedBuilder()
      .setDescription(`[${info.author || "Unknown"} — ${info.title || "Unknown"}](${url})\nDuration: \`${parseDuration(info.duration || 0)}\`\nRequested by: ${requesterName || "Unknown"}`)
      .setColor(Colors.NOWPLAYING);

    if (thumb) embed.setImage(thumb);

    await interaction.deferReply();
    await interaction.editReply({ embeds: [embed] });
  },
};
