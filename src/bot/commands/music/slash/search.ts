import { SlashCommandBuilder } from "discord.js";
import { getPlayer } from "@/bot/music/engine/PlayerManager";
import * as MusicService from "@/bot/music/services/MusicService";
import * as SearchEmbed from "@/bot/ui/embeds/SearchEmbed";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import Logger from "@/bot/core/utils/Logger";

export default {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for tracks to play")
    .addStringOption((o) => o.setName("query").setDescription("Song name or keywords").setRequired(true)),

  async execute(interaction: any) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });
    const voice = interaction.member.voice.channel;

    const query = interaction.options.getString("query", true);
    await interaction.deferReply();

    try {
      let player = getPlayer(interaction.guildId!);
      if (!player) {
        const { get } = require("../../../music/engine/lavalink");
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
        const pl = await engine.join(voice.id, interaction.channelId!);
        if (!pl) return i.editReply({ embeds: [ErrorEmbed.build("Failed to join voice channel.")], components: [] });

         MusicService.setTextChannelId(interaction.guildId!, interaction.channelId!);

         const { withQueueLock } = require("../../../core/state/QueueLock");
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
