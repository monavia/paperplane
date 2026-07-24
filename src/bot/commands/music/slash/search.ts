import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "../../../../bot/music/engine/PlayerManager.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as SearchEmbed from "../../../../bot/ui/embeds/SearchEmbed.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import Logger from "../../../../bot/core/utils/Logger.js";
import { get } from "../../../music/engine/lavalink.js";
import { withQueueLock } from "../../../core/state/QueueLock.js";

export default {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for tracks to play")
    .addStringOption((o) => o.setName("query").setDescription("Song name or keywords").setRequired(true)),

  async execute(interaction: any) {
    if (!await requireSameVoice(interaction)) return;
    const voice = interaction.member.voice.channel;

    const query = interaction.options.getString("query", true);
    await interaction.deferReply();

    try {
      let player = getPlayer(interaction.guildId!);
      if (!player) {
        const node = get()?.nodeManager?.nodes?.values()?.next()?.value as any;
        if (!node) return interaction.editReply({ embeds: [ErrorEmbed.build("Lavalink not connected.")] });
        player = node;
      }

      const result = await player.search({ query: `ytsearch:${query}` }, interaction.user);
      const tracks = result?.tracks?.slice(0, 10);
      if (!tracks?.length) return interaction.editReply({ embeds: [ErrorEmbed.build("No results found.")] });

      const payload = SearchEmbed.build(tracks, query);
      const msg = await interaction.editReply({ ...payload });

      const collector = msg.createMessageComponentCollector({ time: 60000, filter: (i: any) => i.user.id === interaction.user.id });

      collector.on("collect", async (i: any) => {
        if (i.customId !== "search-pick") return;
        const selected = i.values.map((v: string) => tracks[parseInt(v, 10)]);
        await i.deferUpdate();

        const engine = MusicService.getEngine(interaction.guildId!);
        const pl = await engine.join(voice.id, interaction.channelId!, voice.rtcRegion);
        if (!pl) return i.editReply({ embeds: [ErrorEmbed.build("Failed to join voice channel.")], components: [] });

         MusicService.setTextChannelId(interaction.guildId!, interaction.channelId!);

          await withQueueLock(interaction.guildId!, async () => {
           const wasPlaying = pl.playing || pl.paused || engine.queue.getAll().length > 0 || !!pl?.queue?.current;

           for (const track of selected) {
             if (!track.info) track.info = {};
             track.info.source = "youtube";
             track.info.originalUrl = track.info.uri;
             engine.queue.add(track);
           }

           if (!wasPlaying) {
             const first = engine.queue.next();
             if (first) await pl.play({ track: first, clientTrack: first });
           }
         });

         MusicService.saveState(interaction.guildId!);
        await i.editReply({ embeds: [ErrorEmbed.build(`Added ${selected.length} track(s) to the queue.`)], components: [] });
      });

      collector.on("end", async () => {
        try { await msg.edit({ components: [] }); } catch {}
      });
    } catch (err: any) {
      Logger.error("/search error:", err.message);
      interaction.editReply({ embeds: [ErrorEmbed.build(`Search failed: ${err.message}`)] });
    }
  },
};
