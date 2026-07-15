import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import state from "../../../core/state/StateManager";
import Colors from "../../../core/constants/Colors";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import ActivityService from "../../../services/ActivityService";
import * as MusicService from "../../services/MusicService";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";

const TIMEOUT = 60000;

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
  name: "shuffle",
  async execute(message: import("discord.js").Message, args: string[]) {
    const vc = checkSameVoice(message);
    if (!vc.ok) return (message.channel as any).send({ embeds: [ErrorEmbed.build(vc.message)] });

    const guildId = message.guildId!;
    if (!MusicService.getEngine(guildId)?.player) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Bot is not connected to a voice channel.")] });

    const isShuffleOn = state.shuffle.get(guildId);

    const embed = new EmbedBuilder()
      .setDescription(`Current shuffle: **${isShuffleOn ? "ON" : "OFF"}**`)
      .setColor(isShuffleOn ? Colors.SUCCESS : Colors.ERROR);

    const row = buildButtons(isShuffleOn);
    const msg = await (message.channel as any).send({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === message.author.id,
      time: TIMEOUT,
      max: 1,
    });

    collector.on("collect", async (i: any) => {
      if (i.customId === "shuffle_on") {
        state.shuffle.set(guildId, true);
        const tracks = state.queues.get(guildId);
        if (tracks.length > 1) {
          for (let idx = tracks.length - 1; idx > 0; idx--) {
            const j = Math.floor(Math.random() * (idx + 1));
            [tracks[idx], tracks[j]] = [tracks[j], tracks[idx]];
          }
          state.queues.set(guildId, tracks);
        }
        await ActivityService.log({ guildId, userId: message.author.id, userName: message.member?.displayName || message.author.username, action: "shuffle_on", detail: "Shuffle ON" });
        const result = new EmbedBuilder()
          .setDescription("Shuffle is **ON**")
          .setColor(Colors.SUCCESS);
        await i.update({ embeds: [result], components: [] });
      }

      if (i.customId === "shuffle_off") {
        state.shuffle.set(guildId, false);
        await ActivityService.log({ guildId, userId: message.author.id, userName: message.member?.displayName || message.author.username, action: "shuffle_off", detail: "Shuffle OFF" });
        const result = new EmbedBuilder()
          .setDescription("Shuffle is **OFF**")
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
