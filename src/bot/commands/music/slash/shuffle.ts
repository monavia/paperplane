import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import state from "@/bot/core/state/StateManager";
import Colors from "@/bot/core/constants/Colors";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import ActivityService from "@/bot/services/ActivityService";
import * as MusicService from "@/bot/music/services/MusicService";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import { setShuffle } from "@/bot/database/repositories/GuildRepository";

const TIMEOUT = 30000;

function buildButtons(isShuffleOn: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("shuffle_off")
      .setLabel("Shuffle OFF")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isShuffleOn),
    new ButtonBuilder()
      .setCustomId("shuffle_on")
      .setLabel("Shuffle ON")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isShuffleOn),
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Shuffle the queue"),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const guildId = interaction.guildId!;
    if (!MusicService.getEngine(guildId)?.player) return interaction.reply({ embeds: [ErrorEmbed.build("Bot is not connected to a voice channel.")], ephemeral: true });

    const isShuffleOn = state.shuffle.get(guildId);

    const embed = new EmbedBuilder()
      .setDescription(`Current shuffle: **${isShuffleOn ? "ON" : "OFF"}**`)
      .setColor(isShuffleOn ? Colors.SUCCESS : Colors.ERROR);

    const row = buildButtons(isShuffleOn);
    const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
      time: TIMEOUT,
    });

    collector.on("collect", async (i: any) => {
      const newState = i.customId === "shuffle_on";
      state.shuffle.set(guildId, newState);
      if (newState) {
        const tracks = state.queues.get(guildId);
        if (tracks.length > 1) {
          for (let idx = tracks.length - 1; idx > 0; idx--) {
            const j = Math.floor(Math.random() * (idx + 1));
            [tracks[idx], tracks[j]] = [tracks[j], tracks[idx]];
          }
          state.queues.set(guildId, tracks);
        }
      }
      const result = new EmbedBuilder()
        .setDescription(`Shuffle is **${newState ? "ON" : "OFF"}**`)
        .setColor(newState ? Colors.SUCCESS : Colors.ERROR);
      await i.update({ embeds: [result], components: [buildButtons(newState)] });
      setShuffle(guildId, newState).catch(() => {});
      ActivityService.log({ guildId, userId: interaction.user.id, userName: (interaction.member as any)?.displayName || interaction.user.username, action: `shuffle_${newState ? "on" : "off"}`, detail: `Shuffle ${newState ? "ON" : "OFF"}` }).catch(() => {});
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },
};
