import { EmbedBuilder } from "discord.js";
import * as FavoritesService from "../../../../bot/music/services/FavoritesService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import state from "../../../../bot/core/state/StateManager.js";

export default {
  name: "favorite",
  aliases: ["fav", "fave"],
  async execute(message: import("discord.js").Message, args: string[]) {
    const userId = message.author.id;
    const sub = args[0]?.toLowerCase();

    if (!sub || sub === "list") {
      const list = FavoritesService.listFavorites(userId);
      if (!list.length) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build("You have no favorites. Use `-favorite add` to add one.")] });
      }
      const desc = list.map((f, i) => `\`${i + 1}.\` **${f.track.title}**${f.track.author ? ` — ${f.track.author}` : ""}`).slice(0, 25).join("\n");
      const embed = new EmbedBuilder().setTitle("Your Favorites").setDescription(desc).setColor(Colors.INFO).setFooter({ text: `${list.length} track(s)` });
      return (message.channel as any).send({ embeds: [embed] });
    }

    if (sub === "add") {
      const track = state.nowPlaying.get(message.guildId!);
      if (!track) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build("Nothing is playing right now.")] });
      }
      const pt = {
        title: track.info?.title || "Unknown",
        author: track.info?.author || "",
        uri: track.info?.uri || null,
        identifier: track.info?.identifier || null,
        duration: track.info?.duration || 0,
        sourceName: track.info?.sourceName || track.info?.source || "unknown",
      };
      const result = FavoritesService.addFavorite(userId, pt);
      if (!result.ok) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build("Track is already in your favorites.")] });
      }
      const embed = new EmbedBuilder().setDescription(`Added **${pt.title}** to favorites (${result.total} total)`).setColor(Colors.SUCCESS);
      return (message.channel as any).send({ embeds: [embed] });
    }

    if (sub === "remove") {
      const query = args.slice(1).join(" ") || "";
      if (!query) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build("Usage: `-favorite remove <title or number>`")] });
      }
      const ok = FavoritesService.removeFavorite(userId, query);
      if (!ok) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build(`No favorite found matching "${query}".`)] });
      }
      return (message.channel as any).send({ embeds: [new EmbedBuilder().setDescription("Removed from favorites.").setColor(Colors.INFO)] });
    }

    return (message.channel as any).send({ embeds: [ErrorEmbed.build("Usage: `-favorite add`, `-favorite list`, or `-favorite remove <query>`")] });
  },
};
