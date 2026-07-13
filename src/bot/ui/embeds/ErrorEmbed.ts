import { EmbedBuilder } from "discord.js";
import Colors from "../../core/constants/Colors";

export function build(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setDescription(message)
    .setColor(Colors.ERROR);
}
