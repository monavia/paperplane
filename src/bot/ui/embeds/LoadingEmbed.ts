import { EmbedBuilder } from "discord.js";
import Colors from "../../core/constants/Colors.js";

function build(text: string) {
  return new EmbedBuilder()
    .setDescription(text)
    .setColor(Colors.INFO);
}

export { build };
