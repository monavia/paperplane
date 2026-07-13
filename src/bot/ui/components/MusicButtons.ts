import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

function build(player: any) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music_prev")
      .setEmoji("⏮️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(player?.paused ? "music_resume" : "music_pause")
      .setEmoji(player?.paused ? "▶️" : "⏸️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music_skip")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_stop")
      .setEmoji("⏹️")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("music_shuffle")
      .setEmoji("🔀")
      .setStyle(ButtonStyle.Secondary),
  );
  return row;
}

export { build };
