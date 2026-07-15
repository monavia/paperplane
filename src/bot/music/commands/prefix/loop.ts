import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import state from "../../../core/state/StateManager";
import Colors from "../../../core/constants/Colors";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import ActivityService from "../../../services/ActivityService";
import * as MusicService from "../../services/MusicService";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";

const TIMEOUT = 60000;

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
  name: "loop",
  async execute(message: import("discord.js").Message, args: string[]) {
    const vc = checkSameVoice(message);
    if (!vc.ok) return (message.channel as any).send({ embeds: [ErrorEmbed.build(vc.message)] });

    const guildId = message.guildId!;
    if (!MusicService.getEngine(guildId)?.player) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Bot is not connected to a voice channel.")] });

    const currentMode = state.loop.get(guildId);

    const embed = new EmbedBuilder()
      .setDescription(`Current loop: **${currentMode}**`)
      .setColor(currentMode === "off" ? Colors.INFO : currentMode === "track" ? Colors.SUCCESS : Colors.PRIMARY);

    const row = buildButtons(currentMode);
    const msg = await (message.channel as any).send({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === message.author.id,
      time: 60000,
      max: 1,
    });

    collector.on("collect", async (i: any) => {
      const newMode = i.customId.replace("loop_", "") as LoopMode;
      state.loop.set(guildId, newMode);

      await ActivityService.log({
        guildId,
        userId: message.author.id,
        userName: message.member?.displayName || message.author.username,
        action: `loop_${newMode}`,
        detail: `Loop set to ${newMode}`
      });

      const result = new EmbedBuilder()
        .setDescription(`Loop mode set to **${newMode}**`)
        .setColor(newMode === "off" ? Colors.INFO : newMode === "track" ? Colors.SUCCESS : Colors.PRIMARY);

      await i.update({ embeds: [result], components: [] });
    });

    collector.on("end", async (collected: any) => {
      if (collected.size === 0) {
        await msg.delete().catch(() => {});
      }
    });
  },
};
