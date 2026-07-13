import { EmbedBuilder } from "discord.js";
import Config from "../config/bot";
import { runAIAsk } from "../ai/services/AITaskQueue";
import { checkPrompt } from "../ai/services/PromptFilter";
import Logger from "../core/utils/Logger";
import Colors from "../core/constants/Colors";
import * as ErrorEmbed from "../ui/embeds/ErrorEmbed";
import { getPrefix } from "../database/repositories/GuildRepository";

export function start(client: any): void {
  client.on("messageCreate", async (message: any) => {
    if (message.author.bot || !message.guild) return;

    const botMention = `<@${client.user?.id}>`;
    const botMentionNick = `<@!${client.user?.id}>`;
    const content = message.content;
    const isMention = content.startsWith(botMention) || content.startsWith(botMentionNick);
    const guildPrefix = await getPrefix(message.guildId);
    const isPrefix = content.startsWith(guildPrefix);

    // Prefix command handling
    if (isPrefix) {
      const args = content.slice(guildPrefix.length).trim().split(/ +/);
      const commandName = args.shift()?.toLowerCase();
      if (!commandName) return;

      const cmd = client.prefixCommands?.get(commandName);
      if (!cmd) {
        const found: any = Array.from(client.prefixCommands?.values() || []).find((c: any) =>
          c.aliases?.includes?.(commandName)
        );
        if (found) {
          try { return await found.execute(message, args); } catch (e: any) { Logger.error(`Prefix command alias "${commandName}" error:`, e); return message.channel.send("Command error.").catch(() => {}); }
        }
        return; // unknown prefix command
      }
      try { return await cmd.execute(message, args); } catch (e: any) { Logger.error(`Prefix command "${commandName}" error:`, e); return message.channel.send("Command error.").catch(() => {}); }
    }

    // AI trigger: bot mention or trigger word
    const trigger = Config.trigger;
    const text = isMention ? content.replace(botMention, "").replace(botMentionNick, "").trim() : content;
    const isAI = isMention || text.toLowerCase().startsWith(trigger);

    if (!isAI) return;

    const prompt = isMention ? text : text.slice(trigger.length).trim();
    if (!prompt) return;

    // Check filter
    const filter = checkPrompt(prompt);
    if (filter.blocked) {
      return message.channel.send(filter.reason || "I can't help with that.");
    }

    // Show typing indicator
    await message.channel.sendTyping().catch(() => {});

    try {
      // Pre-check: prefix change requires ManageGuild
      if (/\b(prefix|ganti|change|set|ubah)\b/i.test(prompt) && !message.member?.permissions?.has("ManageGuild")) {
        return message.channel.send({ embeds: [ErrorEmbed.build("Changing prefix requires `Manage Server` permission.")] });
      }

      const prefix = await getPrefix(message.guildId);
      const sysPrompt = `Current bot prefix for this server is: "${prefix}". ` +
        `User can type "${prefix}help" or "/help" to see commands. ` +
        `To change prefix, reply with: PREFIX: <new prefix> (e.g., "PREFIX: !") — I will execute it.`;
      const reply = await runAIAsk(message.author.id, prompt, sysPrompt);
      const prefixExec = reply.match(/^PREFIX:\s*(\S+)/im);
      if (prefixExec) {
        const newP = prefixExec[1].substring(0, 3);
        const { setPrefix } = require("../database/repositories/GuildRepository");
        await setPrefix(message.guildId, newP);
        return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`Prefix changed to \`${newP}\``).setColor(Colors.INFO)] });
      }
      const chunks = reply.match(/[\s\S]{1,3800}/g) || [reply];
      const embeds = chunks.map((text: string) => new EmbedBuilder().setDescription(text).setColor(Colors.INFO));
      for (const embed of embeds) {
        await message.channel.send({ embeds: [embed] });
      }
    } catch (err: any) {
      Logger.error(`AI error: ${err.message}`);
      message.channel.send({ embeds: [ErrorEmbed.build("Sorry, I couldn't process that. Try again later.")] });
    }
  });
}
