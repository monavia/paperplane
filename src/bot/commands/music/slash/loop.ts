import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import state from "@/bot/core/state/StateManager";
import Colors from "@/bot/core/constants/Colors";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import ActivityService from "@/bot/services/ActivityService";
import * as MusicService from "@/bot/music/services/MusicService";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import { setLoop } from "@/bot/database/repositories/GuildRepository";

const TIMEOUT = 30000;

type LoopMode = "off" | "track" | "playlist";

const loopLabels: Record<LoopMode, string> = {
  off: "Loop OFF",
  track: "Loop Track",
  playlist: "Loop Playlist",
};

const loopStyles: Record<LoopMode, ButtonStyle> = {
  off: ButtonStyle.Secondary,
  track: ButtonStyle.Success,
  playlist: ButtonStyle.Primary,
};

function buildButtons(currentMode: LoopMode) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("loop_off")
      .setLabel(loopLabels.off)
      .setStyle(loopStyles.off)
      .setDisabled(currentMode === "off"),
    new ButtonBuilder()
      .setCustomId("loop_track")
      .setLabel(loopLabels.track)
      .setStyle(loopStyles.track)
      .setDisabled(currentMode === "track"),
    new ButtonBuilder()
      .setCustomId("loop_playlist")
      .setLabel(loopLabels.playlist)
      .setStyle(loopStyles.playlist)
      .setDisabled(currentMode === "playlist"),
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Set loop mode (off, track, playlist)"),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const guildId = interaction.guildId!;
    if (!MusicService.getEngine(guildId)?.player) return interaction.reply({ embeds: [ErrorEmbed.build("Bot is not connected to a voice channel.")], ephemeral: true });

    const currentMode = state.loop.get(guildId);

    const embed = new EmbedBuilder()
      .setDescription(`Current loop: **${currentMode}**`)
      .setColor(currentMode === "off" ? Colors.INFO : currentMode === "track" ? Colors.SUCCESS : Colors.PRIMARY);

    const row = buildButtons(currentMode);
    const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
      time: TIMEOUT,
    });

    collector.on("collect", async (i: any) => {
      const newMode = i.customId.replace("loop_", "") as LoopMode;
      state.loop.set(guildId, newMode);
      const result = new EmbedBuilder()
        .setDescription(`Loop mode set to **${newMode}**`)
        .setColor(newMode === "off" ? Colors.INFO : newMode === "track" ? Colors.SUCCESS : Colors.PRIMARY);
      await i.update({ embeds: [result], components: [buildButtons(newMode)] });
      setLoop(guildId, newMode).catch(() => {});
      ActivityService.log({
        guildId,
        userId: interaction.user.id,
        userName: (interaction.member as any)?.displayName || interaction.user.username,
        action: `loop_${newMode}`,
        detail: `Loop set to ${newMode}`,
      }).catch(() => {});
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },
};
