import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPlayer } from "../../engine/PlayerManager";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import Colors from "../../../core/constants/Colors";
import Logger from "../../../core/utils/Logger";
import { fetchLyrics } from "../../services/LyricsService";
import lyricsMessages from "../../../core/state/LyricsMessageStore";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";

export default {
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("Show lyrics for the current track"),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });
    const player = getPlayer(interaction.guildId!);
    const track = player?.queue?.current;
    if (!track) return interaction.reply({ embeds: [ErrorEmbed.build("Nothing is playing.")], ephemeral: true });

    await interaction.deferReply();

    try {
      let text = "";
      let source = "";

      try {
        const lyrics = await player.getCurrentLyrics();
        if (lyrics?.lines?.length) {
          text = lyrics.text || lyrics.lines.map((l: any) => l.line).join("\n");
          source = lyrics.sourceName || lyrics.provider || "Lavalink";
        }
      } catch {}

      if (!text) {
        const lrclib = await fetchLyrics(track);
        if (lrclib) {
          text = lrclib.text;
          source = lrclib.source;
        }
      }

      if (!text) {
        return interaction.editReply({ embeds: [ErrorEmbed.build("No lyrics found for this track.")] });
      }

      const title = track.info.title || "Unknown";
      const author = track.info.author || "Unknown";

      const description = text.length > 4000 ? text.slice(0, 4000) + "\n*...*" : text;

      const embed = new EmbedBuilder()
        .setTitle(`${title} - ${author}`)
        .setDescription(description)
        .setFooter({ text: `Source: ${source}` })
        .setColor(Colors.NOWPLAYING);

      await interaction.editReply({ embeds: [embed] });
      if (interaction.guildId) {
        const reply = await interaction.fetchReply().catch(() => null);
        if (reply) lyricsMessages.set(interaction.guildId, interaction.channelId, reply.id);
      }
    } catch (err: any) {
      Logger.error(`[LYRICS] Error: ${err.message}`);
      await interaction.editReply({ embeds: [ErrorEmbed.build("Failed to fetch lyrics.")] });
    }
  },
};
