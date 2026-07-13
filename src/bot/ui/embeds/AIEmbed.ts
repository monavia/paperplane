import { EmbedBuilder } from "discord.js";
import Colors from "../../core/constants/Colors";

function build(prompt: string, answer: string) {
  const truncated = answer.length > 2000 ? answer.slice(0, 1997) + "..." : answer;
  return new EmbedBuilder()
    .setAuthor({ name: "AI Assistant" })
    .setDescription(truncated)
    .setColor(Colors.AI || Colors.INFO)
    .setFooter({ text: `Prompt: ${prompt.slice(0, 80)}` });
}

export { build };
