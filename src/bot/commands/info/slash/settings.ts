import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import Colors from "@/bot/core/constants/Colors";
import { getPrefix, getAutoplay, getLoop, getShuffle, get247, getLastFilter, getLastEqualizer } from "@/bot/database/repositories/GuildRepository";
import { getEngine } from "@/bot/music/services/PlayerService";
import state from "@/bot/core/state/StateManager";
import { isLavalinkReady } from "@/bot/music/services/MusicService";

export default {
  data: new SlashCommandBuilder().setName("settings").setDescription("Show current server settings"),
  async execute(interaction: any) {
    const guildId = interaction.guildId;
    await interaction.deferReply({ flags: 64 });

    const [prefix, autoplay, loop, shuffle, is247, lastFilter, lastEq] = await Promise.all([
      getPrefix(guildId),
      getAutoplay(guildId),
      getLoop(guildId),
      getShuffle(guildId),
      get247(guildId),
      getLastFilter(guildId),
      getLastEqualizer(guildId),
    ]);

    const engine = getEngine(guildId);
    const player = engine?.player;
    const queueSize = state.queues.get(guildId)?.length || 0;
    const np = state.nowPlaying.get(guildId);
    const volume = player?.volume ?? 80;
    const lavalinkOk = isLavalinkReady();

    let vcName = "None";
    let vcHumans = 0;
    if (player?.voiceChannelId) {
      const vc = interaction.guild?.channels?.cache?.get(player.voiceChannelId);
      if (vc) {
        vcName = vc.name;
        vcHumans = vc.members?.filter((m: any) => !m.user?.bot)?.size || 0;
      }
    }

    const eqName = typeof lastEq === "string" ? lastEq : lastEq ? "Custom" : "Flat";
    const filterName = lastFilter && lastFilter !== "none" ? lastFilter : "None";

    const activeFilters: string[] = [];
    const sf = state.filter.get(guildId);
    if (sf && sf !== "none") activeFilters.push(sf);
    const eq = state.equalizer.get(guildId);
    if (eq && eq !== "flat") activeFilters.push("Equalizer");

    const embed = new EmbedBuilder()
      .setTitle("📋 Server Settings")
      .setDescription(`**${interaction.guild?.name || "Unknown"}**`)
      .addFields(
        { name: "Prefix", value: `\`${prefix}\``, inline: true },
        { name: "Volume", value: `${volume}%`, inline: true },
        { name: "Lavalink", value: lavalinkOk ? "✅ Connected" : "❌ Disconnected", inline: true },
        { name: "Autoplay", value: autoplay ? "✅ Enabled" : "❌ Disabled", inline: true },
        { name: "Loop", value: loop === "off" ? "❌ Off" : `✅ ${loop.charAt(0).toUpperCase() + loop.slice(1)}`, inline: true },
        { name: "Shuffle", value: shuffle ? "✅ Enabled" : "❌ Disabled", inline: true },
        { name: "24/7 Mode", value: is247 ? "✅ Enabled" : "❌ Disabled", inline: true },
        { name: "Active Filter", value: activeFilters.length ? activeFilters.join(", ") : filterName, inline: true },
        { name: "Equalizer", value: eqName, inline: true },
        { name: "Voice Channel", value: player?.voiceChannelId ? `${vcName} (${vcHumans} humans)` : "Not connected", inline: false },
        { name: "Queue", value: `${queueSize} track(s)`, inline: true },
        { name: "Now Playing", value: np ? `**${np.info?.title || "Unknown"}** — ${np.info?.author || ""}` : "Nothing", inline: false },
      )
      .setColor(Colors.INFO)
      .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
