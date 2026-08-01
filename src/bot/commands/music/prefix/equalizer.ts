import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import { setLastEqualizer, getLastEqualizer } from "../../../../bot/database/repositories/GuildRepository.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import state from "../../../../bot/core/state/StateManager.js";
import { EQ_PRESETS, PRESET_LIST } from "../../../../bot/core/constants/EQPresets.js";

function buildPresetRows(current: string): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  for (const p of PRESET_LIST) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`eq_${p.value}`)
        .setLabel(p.name)
        .setStyle(p.value === current ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(p.value === current),
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
  name: "equalizer",
  aliases: ["eq"],
  async execute(message: any, args: string[]) {
    if (!message.member) return;
    if (!await requireSameVoice(message)) return;
    const down = MusicService.requireLavalink();
    if (down) return (message.channel as any).send(down);

const current = await getLastEqualizer(message.guildId!);

    const rows = buildPresetRows(current);

    const embed = new EmbedBuilder()
      .setDescription(`Current EQ: **${current}**`)
      .setColor(Colors.INFO);

    const msg = await (message.channel as any).send({ embeds: [embed], components: rows });

    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === message.author.id,
      time: 30000,
      max: 1,
    });

    collector.on("collect", async (i: any) => {
      const preset = i.customId.replace("eq_", "");
      const bands = EQ_PRESETS[preset];
      if (!bands) return i.update({ embeds: [ErrorEmbed.build("Invalid preset.")], components: [] });
      const label = PRESET_LIST.find((p) => p.value === preset)?.name || preset;
      await i.update({ embeds: [SuccessEmbed.build(`Equalizer set to ${label}.`)], components: [] });
      state.equalizer.set(message.guildId, bands);
      MusicService.setEqualizer(message.guildId, bands, message.author.id, message.member?.displayName || message.author.username).catch(() => {});
      setLastEqualizer(message.guildId, preset).catch(() => {});
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },
};
