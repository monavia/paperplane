import { EmbedBuilder } from "discord.js";
import Logger from "../core/utils/Logger";
import Colors from "../core/constants/Colors";
import { getTextChannelId } from "../music/services/TextChannelStore";
import { setLastFilter } from "../database/repositories/GuildRepository";
import { isIdleDisconnect, clearIdleDisconnect } from "../music/engine/musicEvents";

export function start(client: any): void {
  client.on("voiceStateUpdate", async (oldState: any, newState: any) => {
    const botId = client.user?.id;
    if (!botId) return;

    if (oldState.member?.id === botId && !newState.channelId) {
      const guildId = oldState.guild.id;
      Logger.info(`[VoiceState] Bot left voice in ${guildId}`);

      await setLastFilter(guildId, "none").catch(() => {});

      // Skip embed if disconnect was from idle timeout (queue ended)
      if (isIdleDisconnect(guildId)) {
        clearIdleDisconnect(guildId);
        return;
      }

      const channelId = getTextChannelId(guildId);
      if (channelId) {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          const embed = new EmbedBuilder()
            .setDescription("Disconnected from voice channel.")
            .setColor(Colors.INFO);
          channel.send({ embeds: [embed] }).catch(() => {});
        }
      }
    }
  });
}
