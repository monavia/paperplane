import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import Colors from "../../core/constants/Colors";

function build(tracks: any[], query: string) {
  const lines = tracks.map((t, i) => {
    const title = (t.info?.title || "Unknown").substring(0, 80);
    const author = (t.info?.author || "").substring(0, 40);
    const dur = t.info?.duration ? formatDuration(t.info.duration) : "?";
    return `\`${i + 1}.\` ${author ? `${author} - ` : ""}${title} (${dur})`;
  });

  const desc = lines.join("\n").substring(0, 4000);

  const embed = new EmbedBuilder()
    .setTitle(`Search results for "${query}"`)
    .setDescription(desc)
    .setColor(Colors.INFO)
    .setFooter({ text: "Select tracks from the dropdown below" });

  const select = new StringSelectMenuBuilder()
    .setCustomId("search-pick")
    .setPlaceholder("Select tracks to play")
    .setMinValues(1)
    .setMaxValues(tracks.length)
    .addOptions(
      tracks.map((t, i) => {
        const author = (t.info?.author || "").substring(0, 40);
        const title = (t.info?.title || "Unknown").substring(0, 50);
        const label = `${author ? `${author} - ` : ""}${title}`.substring(0, 100);
        return new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setValue(String(i))
          .setDescription((t.info?.duration ? `${formatDuration(t.info.duration)}` : "Unknown duration").substring(0, 100));
      })
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  return { embeds: [embed], components: [row] };
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export { build };
