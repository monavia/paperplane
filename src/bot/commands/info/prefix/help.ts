import { EmbedBuilder } from "discord.js";
import Colors from "@/bot/core/constants/Colors";
import botConfig from "@/bot/config/bot";
import { getPrefix } from "@/bot/database/repositories/GuildRepository";

export default {
  name: "help",
  aliases: ["h", "commands"],
  async execute(message: any, _args: string[]) {
    const commands = message.client?.slashCommands;
    if (!commands?.size) return message.channel.send({ content: "No commands loaded." });

    const prefix = await getPrefix(message.guildId);
    const lines = commands.map((cmd: any) => `\`${prefix}${cmd.data.name}\` — ${cmd.data.description}`);
    const embed = new EmbedBuilder()
      .setTitle("Commands")
      .setDescription(lines.join("\n"))
      .setColor(Colors.INFO)
      .setFooter({ text: `${commands.size} commands` });
    await message.channel.send({ embeds: [embed] });
  },
};
