import { EmbedBuilder } from "discord.js";
import * as PlaylistService from "../../../../bot/music/services/PlaylistService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import Colors from "../../../../bot/core/constants/Colors.js";

export default {
  name: "playlist",
  aliases: ["pl"],
  async execute(message: import("discord.js").Message, args: string[]) {
    const userId = message.author.id;
    const guildId = message.guildId!;
    const sub = args[0]?.toLowerCase();

    if (!sub || sub === "list") {
      const list = PlaylistService.listPlaylists(userId);
      if (!list.length) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build("You have no saved playlists. Usage: `-playlist save <name>`")] });
      }
      const desc = list.map((p, i) => `\`${i + 1}.\` **${p.name}** — ${p.trackCount} tracks`).join("\n");
      const embed = new EmbedBuilder().setTitle("Your Playlists").setDescription(desc).setColor(Colors.INFO);
      return (message.channel as any).send({ embeds: [embed] });
    }

    if (sub === "save") {
      if (!await requireSameVoice(message)) return;
      const name = args.slice(1).join(" ") || "unnamed";
      const result = PlaylistService.savePlaylist(userId, guildId, name);
      if (!result) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build("Queue is empty — nothing to save.")] });
      }
      const embed = new EmbedBuilder()
        .setDescription(`Saved **${result.tracks.length}** tracks as playlist **${result.name}**`)
        .setColor(Colors.SUCCESS);
      return (message.channel as any).send({ embeds: [embed] });
    }

    if (sub === "load") {
      if (!await requireSameVoice(message)) return;
      const name = args.slice(1).join(" ") || "";
      if (!name) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build("Specify a playlist name: `-playlist load <name>`")] });
      }
      const pl = PlaylistService.getPlaylist(userId, name);
      if (!pl) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Playlist "${name}" not found.`)] });
      }
      const added = await PlaylistService.importPlaylist(guildId, pl.tracks, userId);
      const embed = new EmbedBuilder()
        .setDescription(`Added **${added}/${pl.tracks.length}** tracks from playlist **${pl.name}** to the queue.`)
        .setColor(Colors.SUCCESS);
      return (message.channel as any).send({ embeds: [embed] });
    }

    if (sub === "delete") {
      const name = args.slice(1).join(" ") || "";
      if (!name) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build("Specify a playlist name: `-playlist delete <name>`")] });
      }
      const ok = PlaylistService.deletePlaylist(userId, name);
      if (!ok) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Playlist "${name}" not found.`)] });
      }
      return (message.channel as any).send({ embeds: [new EmbedBuilder().setDescription(`Deleted playlist **${name}**`).setColor(Colors.INFO)] });
    }

    return (message.channel as any).send({
      embeds: [ErrorEmbed.build("Unknown subcommand. Use: `save`, `load`, `list`, or `delete`.")],
    });
  },
};
