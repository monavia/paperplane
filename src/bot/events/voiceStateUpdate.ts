import { EmbedBuilder } from "discord.js";
import Logger from "../core/utils/Logger";
import Colors from "../core/constants/Colors";
import { getTextChannelId } from "../music/services/TextChannelStore";
import { setLastFilter } from "../database/repositories/GuildRepository";
import { isIdleDisconnect, clearIdleDisconnect } from "../music/engine/musicEvents";

const aloneTimers = new Map<string, any>();

function startAloneTimer(guildId: string) {
  const existing = aloneTimers.get(guildId);
  if (existing) clearTimeout(existing);
  aloneTimers.set(guildId, setTimeout(() => {
    aloneTimers.delete(guildId);
    const { getEngine, destroyEngine } = require("../music/services/PlayerService");
    const engine = getEngine(guildId);
    if (engine?.player) {
      Logger.info(`[VoiceState] Bot alone for 3m in ${guildId} — destroying player`);
      destroyEngine(guildId);
    }
  }, 180000));
}

function cancelAloneTimer(guildId: string) {
  const t = aloneTimers.get(guildId);
  if (t) { clearTimeout(t); aloneTimers.delete(guildId); }
}

export function start(client: any): void {
  client.on("voiceStateUpdate", async (oldState: any, newState: any) => {
    const botId = client.user?.id;
    if (!botId) return;

    // Bot left voice
    if (oldState.member?.id === botId && !newState.channelId) {
      const guildId = oldState.guild.id;
      cancelAloneTimer(guildId);
      Logger.info(`[VoiceState] Bot left voice in ${guildId}`);

      await setLastFilter(guildId, "none").catch(() => {});

      if (isIdleDisconnect(guildId)) {
        clearIdleDisconnect(guildId);
        return;
      }

      const { deleteState } = require("../music/services/StateService");
      await deleteState(guildId).catch(() => {});

      const { getEngine } = require("../music/services/PlayerService");
      const engine = getEngine(guildId);
      if (!engine.player?.voiceChannelId) return;

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
      return;
    }

    // Non-bot member left a voice channel
    if (oldState.channelId && !newState.channelId && oldState.member?.id !== botId) {
      const guildId = oldState.guild.id;
      const vc = oldState.guild.channels.cache.get(oldState.channelId);
      if (!vc?.isVoiceBased() || !vc.members) return;
      const botInVc = vc.members.has(botId);
      if (!botInVc) return;
      if (vc.members.size === 1) { // only bot left
        Logger.info(`[VoiceState] Bot alone in ${guildId} — will disconnect in 3m`);
        startAloneTimer(guildId);
      }
    }

    // Someone joined a voice channel (cancel alone timer if active)
    if (newState.channelId && !oldState.channelId && newState.member?.id !== botId) {
      const guildId = newState.guild.id;
      cancelAloneTimer(guildId);
    }
  });
}
