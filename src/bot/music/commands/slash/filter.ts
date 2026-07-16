import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "../../services/MusicService";
import { setLastFilter, getLastFilter } from "../../../database/repositories/GuildRepository";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import * as SuccessEmbed from "../../../ui/embeds/SuccessEmbed";
import Colors from "../../../core/constants/Colors";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";
import state from "../../../core/state/StateManager";
import MusicModes from "../../../core/constants/MusicModes";

const FILTERS = [
  { name: "Bass Boost", value: MusicModes.FILTERS.BASSBOOST },
  { name: "Nightcore", value: MusicModes.FILTERS.NIGHT_CORE, emoji: "🏎️" },
  { name: "Vaporwave", value: MusicModes.FILTERS.VAPORWAVE, emoji: "🌊" },
  { name: "8D Audio", value: MusicModes.FILTERS.EIGHT_D, emoji: "🎧" },
  { name: "Slow Motion", value: MusicModes.FILTERS.SLOWMO, emoji: "🐢" },
  { name: "Soft", value: MusicModes.FILTERS.SOFT, emoji: "🎻" },
  { name: "Treble", value: MusicModes.FILTERS.TREBLE, emoji: "🔔" },
  { name: "Reset", value: MusicModes.FILTERS.NONE, emoji: "❌" },
];

function buildButtons(currentFilter: string) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  for (const f of FILTERS) {
    const active = f.value === currentFilter;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`filter_${f.value}`)
        .setLabel(`${f.emoji} ${f.name}`)
        .setStyle(active ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(active),
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
  data: new SlashCommandBuilder()
    .setName("filter")
    .setDescription("Apply audio filters to playback"),

  async execute(interaction: any) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const guildId = interaction.guildId!;
    const engine = MusicService.getEngine(guildId);

    const currentFilter = await getLastFilter(guildId);

    const embed = new EmbedBuilder()
      .setDescription(`Current filter: **${currentFilter}**`)
      .setColor(Colors.INFO);

    const rows = buildButtons(currentFilter);
    const response = await interaction.reply({ embeds: [embed], components: rows, withResponse: true });

    const msg = response.resource?.message ?? await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
      time: 30000,
      max: 1,
    });

    collector.on("collect", async (i: any) => {
      const filterValue = i.customId.replace("filter_", "");
      state.filter.set(guildId, filterValue);
      if (filterValue === MusicModes.FILTERS.NONE) {
        await MusicService.resetFilters(guildId, interaction.user.id, interaction.member?.displayName || interaction.user.username);
        await setLastFilter(guildId, "none");
      } else {
        const ok = await MusicService.setFilter(guildId, filterValue, interaction.user.id, interaction.member?.displayName || interaction.user.username);
        if (!ok) return i.update({ embeds: [ErrorEmbed.build("Failed to apply filter. Is the bot playing?")], components: [] });
        await setLastFilter(guildId, filterValue);
      }
      const label = FILTERS.find((f) => f.value === filterValue)?.name || filterValue;
      await i.update({ embeds: [SuccessEmbed.build(`Applied filter: ${label}`)], components: [] });
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },
};
