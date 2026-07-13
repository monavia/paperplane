import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

function build() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ai_retry")
      .setEmoji("🔄")
      .setLabel("Retry")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ai_clear")
      .setEmoji("🗑️")
      .setLabel("Clear History")
      .setStyle(ButtonStyle.Danger),
  );
  return row;
}

export { build };
