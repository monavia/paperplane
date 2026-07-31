import { EmbedBuilder } from "discord.js";
import Colors from "../../core/constants/Colors.js";

function build(answer: string) {
  const truncated = answer.length > 2000 ? answer.slice(0, 1997) + "..." : answer;
  return new EmbedBuilder()
    .setAuthor({ name: "Paperplane" })
    .setDescription(truncated)
    .setColor(Colors.AI || Colors.INFO);
}

export { build };
