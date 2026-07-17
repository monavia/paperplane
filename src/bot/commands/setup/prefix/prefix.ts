import { EmbedBuilder } from "discord.js";
import { setPrefix, getPrefix } from "@/bot/database/repositories/GuildRepository";
import * as SuccessEmbed from "@/bot/ui/embeds/SuccessEmbed";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import Colors from "@/bot/core/constants/Colors";

export default {
  name: "prefix",
  async execute(message: any, args: string[]) {
    if (args.length) {
      if (!message.member?.permissions?.has("ManageGuild")) {
        return message.channel.send({ embeds: [ErrorEmbed.build("You need `Manage Server` permission.")] });
      }
      const prefix = args[0].substring(0, 3);
      await setPrefix(message.guildId, prefix);
      return message.channel.send({ embeds: [SuccessEmbed.build(`Prefix set to \`${prefix}\``)] });
    }

    const current = await getPrefix(message.guildId);
    const embed = new EmbedBuilder()
      .setDescription(`Current prefix: \`${current}\``)
      .setColor(Colors.INFO);
    await message.channel.send({ embeds: [embed] });
  },
};
