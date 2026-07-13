import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Colors from "../../core/constants/Colors";
import { formatTrack } from "../../core/utils/Formatter";

const PER_PAGE = 10;

function build(tracks: any[], page: number = 1) {
  const totalPages = Math.max(1, Math.ceil(tracks.length / PER_PAGE));
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * PER_PAGE;
  const slice = tracks.slice(start, start + PER_PAGE);

  const desc = slice.length
    ? slice.map((t, i) => formatTrack(t, start + i + 1)).join("\n")
    : "The queue is empty.";

  const currentTrack = tracks[0];
  const nowPlaying = currentTrack
    ? `Now Playing: ${currentTrack.info.title || "Unknown"} — ${currentTrack.info.author || "Unknown"}`
    : "";

  const embed = new EmbedBuilder()
    .setTitle("Music Queue")
    .setDescription(desc)
    .setColor(Colors.NOWPLAYING)
    .setFooter({ text: `Page ${page}/${totalPages} • ${tracks.length} tracks` });

  if (nowPlaying) embed.setAuthor({ name: nowPlaying });

  const buttonRow = new ActionRowBuilder<ButtonBuilder>();
  buttonRow.addComponents(
    new ButtonBuilder().setCustomId("queue_first").setLabel("◀◀").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId("queue_prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId("queue_next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages),
    new ButtonBuilder().setCustomId("queue_last").setLabel("▶▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages),
  );

  return { embed, buttonRow, totalPages };
}

function buildQueuePayload(tracks: any[], page: number) {
  const { embed, buttonRow } = build(tracks, page);
  return { embeds: [embed], components: [buttonRow] };
}

export { build, buildQueuePayload };
