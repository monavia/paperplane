import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import { setLastFilter } from "../../../../bot/database/repositories/GuildRepository.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import state from "../../../../bot/core/state/StateManager.js";
import MusicModes from "../../../../bot/core/constants/MusicModes.js";

const FILTERS = [
  { name: "Bass Boost", value: MusicModes.FILTERS.BASSBOOST, emoji: "🎵" },
  { name: "Nightcore", value: MusicModes.FILTERS.NIGHT_CORE, emoji: "🏎️" },
  { name: "Vaporwave", value: MusicModes.FILTERS.VAPORWAVE, emoji: "🌊" },
  { name: "8D Audio", value: MusicModes.FILTERS.EIGHT_D, emoji: "🎧" },
  { name: "Slow Motion", value: MusicModes.FILTERS.SLOWMO, emoji: "🐢" },
  { name: "Soft", value: MusicModes.FILTERS.SOFT, emoji: "🎻" },
  { name: "Treble", value: MusicModes.FILTERS.TREBLE, emoji: "🔔" },
  { name: "Reset All", value: "none", emoji: "❌" },
];

function formatActive(activeFilters: string[]): string {
  if (!activeFilters.length) return "none";
  return activeFilters.map((f) => FILTERS.find((x) => x.value === f)?.name || f).join(", ");
}

function buildButtons(activeFilters: string[]) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  for (const f of FILTERS) {
    const isActive = activeFilters.includes(f.value);
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`filter_${f.value}`)
        .setLabel(`${f.emoji} ${f.name}`)
        .setStyle(isActive ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(false),
    );
    if (row.components.length === 4) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
  }
  if (row.components.length) rows.push(row);
  return rows;
}

export default {
  name: "filter",
  aliases: ["filters"],
  async execute(message: any, args: string[]) {
    if (!message.member) return;
    if (!await requireSameVoice(message)) return;

    const guildId = message.guildId!;
    const active: string[] = state.filter.get(guildId);

    const embed = new EmbedBuilder()
      .setTitle("Audio Filters")
      .setDescription(`Active: **${formatActive(active)}**\n\nTap to toggle. Compatible filters stack.`)
      .setColor(Colors.INFO);

    const rows = buildButtons(active);
    const msg = await message.channel.send({ embeds: [embed], components: rows });

    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === message.author.id,
      time: 30000,
    });

    collector.on("collect", async (i: any) => {
      const filterValue = i.customId.replace("filter_", "");
      if (filterValue === "none") {
        state.filter.clear(guildId);
        await MusicService.resetFilters(guildId, message.author.id, message.member?.displayName || message.author.username);
        await setLastFilter(guildId, "none");
      } else {
        await MusicService.toggleFilter(guildId, filterValue, message.author.id, message.member?.displayName || message.author.username);
        await setLastFilter(guildId, state.filter.get(guildId).join(",") || "none");
      }
      const updated: string[] = state.filter.get(guildId);
      const newRows = buildButtons(updated);
      const newEmbed = new EmbedBuilder()
        .setTitle("Audio Filters")
        .setDescription(`Active: **${formatActive(updated)}**\n\nTap to toggle. Compatible filters stack.`)
        .setColor(Colors.INFO);
      await i.update({ embeds: [newEmbed], components: newRows });
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },
};
