import { EmbedBuilder } from "discord.js";
import Logger from "../core/utils/Logger";
import Colors from "../core/constants/Colors";
import { getTextChannelId } from "../music/services/TextChannelStore";
import { setLastFilter, setAutoplay, setShuffle } from "../database/repositories/GuildRepository";
import { isIdleDisconnect, clearIdleDisconnect } from "../music/engine/musicEvents";
import state from "../core/state/StateManager";
import { isLavalinkReady } from "../music/services/MusicService";
import { getEngine, destroyEngine } from "../music/services/PlayerService";
import { deleteState } from "../music/services/StateService";

const aloneTimers = new Map<string, any>();

function startAloneTimer(guildId: string) {
  const existing = aloneTimers.get(guildId);
  if (existing) clearTimeout(existing);
  aloneTimers.set(guildId, setTimeout(() => {
    aloneTimers.delete(guildId);
    if (state.twentyFourSeven.isEnabled(guildId)) return;
    if (!isLavalinkReady()) return; // skip destroy when Lavalink down
    const engine = getEngine(guildId);
    if (engine?.player) {
      Logger.info(`[VoiceState] Bot alone for 1m in ${guildId} — destroying player`);
      destroyEngine(guildId);
    }
  }, 60000));
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

      await setLastFilter(guildId, "none").catch(Logger.safe("bot/events/voiceStateUpdate.ts"));

      if (isIdleDisconnect(guildId)) {
        clearIdleDisconnect(guildId);
        return;
      }

      await deleteState(guildId).catch(Logger.safe("bot/events/voiceStateUpdate.ts"));
      if (!state.twentyFourSeven.isEnabled(guildId)) {
        state.autoplay.delete(guildId);
        setAutoplay(guildId, false).catch(Logger.safe("bot/events/voiceStateUpdate.ts"));
        state.shuffle.delete(guildId);
        setShuffle(guildId, false).catch(Logger.safe("bot/events/voiceStateUpdate.ts"));
        state.filter.delete(guildId);
        state.equalizer.delete(guildId);
      }

const channelId = getTextChannelId(guildId);
      if (channelId) {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          const embed = new EmbedBuilder()
            .setDescription("Disconnected from voice channel.")
            .setColor(Colors.INFO);
          channel.send({ embeds: [embed] }).catch(Logger.safe("bot/events/voiceStateUpdate.ts"));
        }
      }
      return;
    }

    // Bot moved to a different voice channel
    if (oldState.channelId && newState.channelId && oldState.member?.id === botId && oldState.channelId !== newState.channelId) {
      const guildId = oldState.guild.id;
      cancelAloneTimer(guildId);
      Logger.info(`[VoiceState] Bot moved from ${oldState.channelId} to ${newState.channelId} in ${guildId}`);
      const humans = newState.channel?.members?.filter((m: any) => !m.user?.bot).size || 0;
      if (humans === 0 && !state.twentyFourSeven.isEnabled(guildId)) {
        Logger.info(`[VoiceState] No humans in new voice channel for ${guildId} — will disconnect in 1m`);
        startAloneTimer(guildId);
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
      const humans = vc.members.filter((m: any) => !m.user?.bot).size;
      if (humans === 0) { // only bots left
        if (state.twentyFourSeven.isEnabled(guildId)) return;
        Logger.info(`[VoiceState] No humans in ${guildId} — will disconnect in 1m`);
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
