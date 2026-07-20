import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import Colors from "@/bot/core/constants/Colors";
import * as MusicService from "@/bot/music/services/MusicService";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { setAutoplay } from "@/bot/database/repositories/GuildRepository";
import state from "@/bot/core/state/StateManager";

const TIMEOUT = 30000;

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
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], flags: 64 });
    const down = MusicService.requireLavalink();
    if (down) return interaction.reply({ ...down, flags: 64 });

    const guildId = interaction.guildId!;
    const engine = MusicService.getEngine(guildId);
    if (!engine) return interaction.reply({ embeds: [ErrorEmbed.build("No active player.")], flags: 64 });

    const isAutoplayOn = state.autoplay.get(guildId);

    const embed = new EmbedBuilder()
      .setDescription(`Current autoplay: **${isAutoplayOn ? "ON" : "OFF"}**`)
      .setColor(isAutoplayOn ? Colors.SUCCESS : Colors.ERROR);

    const row = buildButtons(isAutoplayOn);
    await interaction.reply({ embeds: [embed], components: [row] });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
      time: TIMEOUT,
    });

    collector.on("collect", async (i: any) => {
      const newState = i.customId === "autoplay_on";
      state.autoplay.set(guildId, newState);
      const result = new EmbedBuilder()
        .setDescription(`Autoplay is **${newState ? "ON" : "OFF"}**`)
        .setColor(newState ? Colors.SUCCESS : Colors.ERROR);
      await i.update({ embeds: [result], components: [buildButtons(newState)] });
      setAutoplay(guildId, newState).catch(() => {});
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },
};
