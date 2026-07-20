import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import { setLastFilter, getLastFilter } from "@/bot/database/repositories/GuildRepository";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import * as SuccessEmbed from "@/bot/ui/embeds/SuccessEmbed";
import Colors from "@/bot/core/constants/Colors";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import state from "@/bot/core/state/StateManager";
import MusicModes from "@/bot/core/constants/MusicModes";

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
  name: "filter",
  aliases: ["filters"],
  async execute(message: any, args: string[]) {
    if (!message.member) return;
    const vc = checkSameVoice(message);
    if (!vc.ok) return (message.channel as any).send({ embeds: [ErrorEmbed.build(vc.message)] });
    const down = MusicService.requireLavalink();
    if (down) return (message.channel as any).send(down);

    const guildId = message.guildId!;
    const engine = MusicService.getEngine(guildId);

    const currentFilter = await getLastFilter(guildId);

    const embed = new EmbedBuilder()
      .setDescription(`Current filter: **${currentFilter}**`)
      .setColor(Colors.INFO);

    const rows = buildButtons(currentFilter);
    const msg = await message.channel.send({ embeds: [embed], components: rows });

    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === message.author.id,
      time: 30000,
      max: 1,
    });

    collector.on("collect", async (i: any) => {
      const filterValue = i.customId.replace("filter_", "");
      state.filter.set(guildId, filterValue);
      const label = FILTERS.find((f) => f.value === filterValue)?.name || filterValue;
      await i.update({ embeds: [SuccessEmbed.build(`Applied filter: ${label}`)], components: [] });
      if (filterValue === MusicModes.FILTERS.NONE) {
        MusicService.resetFilters(guildId, message.author.id, message.member?.displayName || message.author.username).catch(() => {});
        setLastFilter(guildId, "none").catch(() => {});
      } else {
        MusicService.setFilter(guildId, filterValue, message.author.id, message.member?.displayName || message.author.username).catch(() => {});
        setLastFilter(guildId, filterValue).catch(() => {});
      }
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },
};
