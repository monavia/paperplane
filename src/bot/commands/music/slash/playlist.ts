import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import * as PlaylistService from "../../../../bot/music/services/PlaylistService.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import Colors from "../../../../bot/core/constants/Colors.js";

export default {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Manage playlists")
    .addSubcommand((sub) =>
      sub.setName("save").setDescription("Save current queue as a playlist")
        .addStringOption((opt) => opt.setName("name").setDescription("Playlist name").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("load").setDescription("Load a saved playlist into the queue")
        .addStringOption((opt) => opt.setName("name").setDescription("Playlist name").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List your saved playlists")
    )
    .addSubcommand((sub) =>
      sub.setName("delete").setDescription("Delete a saved playlist")
        .addStringOption((opt) => opt.setName("name").setDescription("Playlist name").setRequired(true))
    ),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    if (sub === "list") {
      const list = PlaylistService.listPlaylists(userId);
      if (!list.length) {
        return interaction.reply({ embeds: [ErrorEmbed.build("You have no saved playlists.")], flags: 64 });
      }
      const desc = list.map((p, i) => `\`${i + 1}.\` **${p.name}** — ${p.trackCount} tracks`).join("\n");
      const embed = new EmbedBuilder()
        .setTitle("Your Playlists")
        .setDescription(desc)
        .setColor(Colors.INFO);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "save") {
      if (!await requireSameVoice(interaction)) return;
      const name = interaction.options.getString("name", true);
      const result = PlaylistService.savePlaylist(userId, guildId, name);
      if (!result) {
        return interaction.reply({ embeds: [ErrorEmbed.build("Queue is empty — nothing to save.")], flags: 64 });
      }
      const embed = new EmbedBuilder()
        .setDescription(`Saved **${result.tracks.length}** tracks as playlist **${result.name}**`)
        .setColor(Colors.SUCCESS);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "load") {
      if (!await requireSameVoice(interaction)) return;
      const name = interaction.options.getString("name", true);
      const pl = PlaylistService.getPlaylist(userId, name);
      if (!pl) {
        return interaction.reply({ embeds: [ErrorEmbed.build(`Playlist "${name}" not found.`)], flags: 64 });
      }
      await interaction.deferReply();
      const added = await PlaylistService.importPlaylist(guildId, pl.tracks, userId);
      const embed = new EmbedBuilder()
        .setDescription(`Added **${added}/${pl.tracks.length}** tracks from playlist **${pl.name}** to the queue.`)
        .setColor(Colors.SUCCESS);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "delete") {
      const name = interaction.options.getString("name", true);
      const ok = PlaylistService.deletePlaylist(userId, name);
      if (!ok) {
        return interaction.reply({ embeds: [ErrorEmbed.build(`Playlist "${name}" not found.`)], flags: 64 });
      }
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`Deleted playlist **${name}**`).setColor(Colors.INFO)] });
    }
  },
};
