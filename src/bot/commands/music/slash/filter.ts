import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import { setLastFilter } from "../../../../bot/database/repositories/GuildRepository.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";
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

function formatActive(activeFilters: string[]): string {
  if (!activeFilters.length) return "none";
  return activeFilters.map((f) => FILTERS.find((x) => x.value === f)?.name || f).join(", ");
}

export default {
  data: new SlashCommandBuilder()
    .setName("filter")
    .setDescription("Manage audio filters (toggle on/off, multi-stack supported)"),

  async execute(interaction: any) {
    if (!await requireSameVoice(interaction)) return;
    const down = MusicService.requireLavalink();
    if (down) return interaction.reply({ ...down, flags: 64 });

    const guildId = interaction.guildId!;
    const activeFilters = state.filter.get(guildId);

    const embed = new EmbedBuilder()
      .setTitle("Audio Filters")
      .setDescription(`Active: **${formatActive(activeFilters)}**\n\nTap a filter to toggle it on/off. Compatible filters stack (e.g. Soft + 8D + Bass Boost).`)
      .setColor(Colors.INFO);

    const rows = buildButtons(activeFilters);
    await interaction.deferReply();
    const msg = await interaction.editReply({ embeds: [embed], components: rows });
    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
      time: 30000,
    });

    collector.on("collect", async (i: any) => {
      const filterValue = i.customId.replace("filter_", "");

      if (filterValue === "none") {
        state.filter.clear(guildId);
        MusicService.resetFilters(guildId, interaction.user.id, interaction.member?.displayName || interaction.user.username).catch(() => {});
        setLastFilter(guildId, "none").catch(() => {});
      } else {
        await MusicService.toggleFilter(guildId, filterValue, interaction.user.id, interaction.member?.displayName || interaction.user.username);
        setLastFilter(guildId, state.filter.get(guildId).join(",") || "none").catch(() => {});
      }

      const updated = state.filter.get(guildId);
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
