import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Colors from "../../../core/constants/Colors";
import * as MusicService from "../../services/MusicService";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";

const TIMEOUT = 60000;

function buildButtons(isAutoplayOn: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("autoplay_off")
      .setLabel("Autoplay OFF")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isAutoplayOn),
    new ButtonBuilder()
      .setCustomId("autoplay_on")
      .setLabel("Autoplay ON")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isAutoplayOn),
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Toggle autoplay for similar tracks"),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const guildId = interaction.guildId;
    const engine = MusicService.getEngine(guildId!);
    if (!engine) return interaction.reply({ embeds: [ErrorEmbed.build("No active player.")], ephemeral: true });

    const isAutoplayOn = engine.playback.autoplay;

    const embed = new EmbedBuilder()
      .setDescription(`Current autoplay: **${isAutoplayOn ? "ON" : "OFF"}**`)
      .setColor(isAutoplayOn ? Colors.SUCCESS : Colors.ERROR);

    const row = buildButtons(isAutoplayOn);
    const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });

    const msg = response.resource?.message ?? await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
      time: TIMEOUT,
      max: 1,
    });

    collector.on("collect", async (i: any) => {
      if (i.customId === "autoplay_on") {
        engine.playback.autoplay = true;
        const result = new EmbedBuilder()
          .setDescription("Autoplay is **ON**")
          .setColor(Colors.SUCCESS);
        await i.update({ embeds: [result], components: [] });
      }

      if (i.customId === "autoplay_off") {
        engine.playback.autoplay = false;
        const result = new EmbedBuilder()
          .setDescription("Autoplay is **OFF**")
          .setColor(Colors.ERROR);
        await i.update({ embeds: [result], components: [] });
      }
    });

    collector.on("end", async (collected: any) => {
      if (collected.size === 0) {
        await msg.delete().catch(() => {});
      }
    });
  },
};
