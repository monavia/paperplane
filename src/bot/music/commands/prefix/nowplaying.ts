import { EmbedBuilder } from "discord.js";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import { getQueue } from "../../../music/services/QueueService";
import Colors from "../../../core/constants/Colors";
import { parseDuration } from "../../../core/utils/Duration";

export default {
  name: "nowplaying", aliases: ["np"],
  async execute(message: any, _args: string[]) {
    const tracks = getQueue(message.guildId!);
    if (!tracks?.length) return message.channel.send({ embeds: [ErrorEmbed.build("Nothing is playing.")] });
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

    await message.channel.send({ embeds: [embed] });
  },
};
