import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import state from "../../../../bot/core/state/StateManager.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import ActivityService from "../../../../bot/services/ActivityService.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import { setLoop } from "../../../../bot/database/repositories/GuildRepository.js";

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
  name: "loop",
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!await requireSameVoice(message)) return;
    const down = MusicService.requireLavalink();
    if (down) return (message.channel as any).send(down);

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
        userId: message.author.id,
        userName: message.member?.displayName || message.author.username,
        action: `loop_${newMode}`,
        detail: `Loop set to ${newMode}`,
      }).catch(() => {});
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  },
};
