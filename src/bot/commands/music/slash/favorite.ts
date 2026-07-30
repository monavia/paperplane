import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as FavoritesService from "../../../../bot/music/services/FavoritesService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import state from "../../../../bot/core/state/StateManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("favorite")
    .setDescription("Manage your favorite tracks")
    .addSubcommand((sub) =>
      sub.setName("add").setDescription("Add current track to favorites")
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List your favorite tracks")
    )
    .addSubcommand((sub) =>
      sub.setName("remove").setDescription("Remove a favorite by number or title")
        .addStringOption((opt) => opt.setName("query").setDescription("Track title or number to remove").setRequired(true))
    ),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "add") {
      const track = state.nowPlaying.get(interaction.guildId!);
      if (!track) {
        return interaction.reply({ embeds: [ErrorEmbed.build("Nothing is playing right now.")], flags: 64 });
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
        return interaction.reply({ embeds: [ErrorEmbed.build("Track is already in your favorites.")], flags: 64 });
      }
      const embed = new EmbedBuilder()
        .setDescription(`Added **${pt.title}** to favorites (${result.total} total)`)
        .setColor(Colors.SUCCESS);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "list") {
      const list = FavoritesService.listFavorites(userId);
      if (!list.length) {
        return interaction.reply({ embeds: [ErrorEmbed.build("You have no favorites. Use `/favorite add` to add one.")], flags: 64 });
      }
      const desc = list.map((f, i) => `\`${i + 1}.\` **${f.track.title}**${f.track.author ? ` — ${f.track.author}` : ""}`).slice(0, 25).join("\n");
      const embed = new EmbedBuilder()
        .setTitle("Your Favorites")
        .setDescription(desc)
        .setColor(Colors.INFO)
        .setFooter({ text: `${list.length} track(s)` });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "remove") {
      const query = interaction.options.getString("query", true);
      const ok = FavoritesService.removeFavorite(userId, query);
      if (!ok) {
        return interaction.reply({ embeds: [ErrorEmbed.build(`No favorite found matching "${query}".`)], flags: 64 });
      }
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`Removed from favorites.`).setColor(Colors.INFO)] });
    }
  },
};
