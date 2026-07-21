import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Colors from "@/bot/core/constants/Colors";
import { requireSameVoice } from "@/bot/core/utils/VoiceCheck";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { set247 } from "@/bot/database/repositories/GuildRepository";
import state from "@/bot/core/state/StateManager";

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
  name: "247",
  aliases: ["24h"],
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!await requireSameVoice(message)) return;

    const guildId = message.guildId!;
    const is247On = state.twentyFourSeven.isEnabled(guildId);

    const embed = new EmbedBuilder()
      .setDescription(`Current 24/7 mode: **${is247On ? "ON" : "OFF"}**`)
      .setColor(is247On ? Colors.SUCCESS : Colors.ERROR);

    const row = buildButtons(is247On);
    const msg = await (message.channel as any).send({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === message.author.id,
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
