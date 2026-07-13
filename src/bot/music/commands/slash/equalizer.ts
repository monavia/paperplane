import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "../../services/MusicService";
import { setLastEqualizer, getLastEqualizer } from "../../../database/repositories/GuildRepository";
import * as SuccessEmbed from "../../../ui/embeds/SuccessEmbed";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import Colors from "../../../core/constants/Colors";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";

const EQ_PRESETS: Record<string, { band: number; gain: number }[]> = {
  flat: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: 0.0 })),
  bass: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 5 ? 0.4 - i * 0.1 : -0.05 - (i - 5) * 0.02 })),
  treble: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 5 ? -0.2 + i * 0.05 : -0.1 + (i - 5) * 0.05 })),
  rock: [
    { band: 0, gain: 0.2 }, { band: 1, gain: 0.1 }, { band: 2, gain: 0.0 },
    { band: 3, gain: -0.1 }, { band: 4, gain: -0.1 }, { band: 5, gain: 0.0 },
    { band: 6, gain: 0.1 }, { band: 7, gain: 0.2 }, { band: 8, gain: 0.3 },
    { band: 9, gain: 0.3 }, { band: 10, gain: 0.3 }, { band: 11, gain: 0.2 },
    { band: 12, gain: 0.1 }, { band: 13, gain: 0.0 }, { band: 14, gain: -0.1 },
  ],
  jazz: [
    { band: 0, gain: 0.2 }, { band: 1, gain: 0.15 }, { band: 2, gain: 0.1 },
    { band: 3, gain: 0.05 }, { band: 4, gain: 0.0 }, { band: 5, gain: -0.05 },
    { band: 6, gain: -0.1 }, { band: 7, gain: -0.05 }, { band: 8, gain: 0.0 },
    { band: 9, gain: 0.05 }, { band: 10, gain: 0.1 }, { band: 11, gain: 0.15 },
    { band: 12, gain: 0.2 }, { band: 13, gain: 0.25 }, { band: 14, gain: 0.3 },
  ],
};

const PRESET_LIST = [
  { name: "Flat", value: "flat" },
  { name: "Bass", value: "bass" },
  { name: "Treble", value: "treble" },
  { name: "Rock", value: "rock" },
  { name: "Jazz", value: "jazz" },
];

export default {
  data: new SlashCommandBuilder()
    .setName("equalizer")
    .setDescription("Set equalizer preset"),

  async execute(interaction: any) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const current = await getLastEqualizer(interaction.guildId!);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...PRESET_LIST.map((p) =>
        new ButtonBuilder()
          .setCustomId(`eq_${p.value}`)
          .setLabel(p.name)
          .setStyle(p.value === current ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(p.value === current)
      ),
    );

    const embed = new EmbedBuilder()
      .setDescription(`Current EQ: **${current}**`)
      .setColor(Colors.INFO);

    const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
    const msg = response.resource?.message ?? await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
      time: 30000,
      max: 1,
    });

    collector.on("collect", async (i: any) => {
      const preset = i.customId.replace("eq_", "");
      const bands = EQ_PRESETS[preset];
      if (!bands) return i.update({ embeds: [ErrorEmbed.build("Invalid preset.")], components: [] });

      const ok = await MusicService.setEqualizer(interaction.guildId, bands, interaction.user.id, interaction.user.username);
      if (!ok) return i.update({ embeds: [ErrorEmbed.build("Failed to set equalizer.")], components: [] });
      await setLastEqualizer(interaction.guildId, preset);

      const label = PRESET_LIST.find((p) => p.value === preset)?.name || preset;
      await i.update({ embeds: [SuccessEmbed.build(`Equalizer set to ${label}.`)], components: [] });
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },
};
