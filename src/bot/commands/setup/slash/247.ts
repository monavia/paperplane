import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { set247 } from "../../../../bot/database/repositories/GuildRepository.js";
import state from "../../../../bot/core/state/StateManager.js";

const TIMEOUT = 30000;

function buildButtons(is247On: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("247_off")
      .setLabel("24/7 OFF")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!is247On),
    new ButtonBuilder()
      .setCustomId("247_on")
      .setLabel("24/7 ON")
      .setStyle(ButtonStyle.Success)
      .setDisabled(is247On),
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName("247")
    .setDescription("Toggle 24/7 mode (stay in voice channel)"),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    if (!await requireSameVoice(interaction)) return;

    const guildId = interaction.guildId!;
    const is247On = state.twentyFourSeven.isEnabled(guildId);

    const embed = new EmbedBuilder()
      .setDescription(`Current 24/7 mode: **${is247On ? "ON" : "OFF"}**`)
      .setColor(is247On ? Colors.SUCCESS : Colors.ERROR);

    const row = buildButtons(is247On);
    await interaction.deferReply();
    const msg = await interaction.editReply({ embeds: [embed], components: [row] });
    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
      time: TIMEOUT,
    });

    collector.on("collect", async (i: any) => {
      const newState = i.customId === "247_on";
      state.twentyFourSeven.set(guildId, newState);
      const result = new EmbedBuilder()
        .setDescription(`24/7 mode is **${newState ? "ON" : "OFF"}**`)
        .setColor(newState ? Colors.SUCCESS : Colors.ERROR);
      await i.update({ embeds: [result], components: [buildButtons(newState)] });
      set247(guildId, newState).catch(() => {});
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },
};
