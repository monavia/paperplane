import botConfig from "@/bot/config/bot";
import { getPlayer } from "@/bot/music/engine/PlayerManager";
import * as MusicService from "@/bot/music/services/MusicService";
import * as SearchEmbed from "@/bot/ui/embeds/SearchEmbed";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import * as LoadingEmbed from "@/bot/ui/embeds/LoadingEmbed";
import Logger from "@/bot/core/utils/Logger";
import { get } from "../../../music/engine/lavalink";
import { withQueueLock } from "../../../core/state/QueueLock";

export default {
  name: "search",
  aliases: ["find"],
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!message.member) return;
    const vc = checkSameVoice(message);
    if (!vc.ok) return (message.channel as any).send({ embeds: [ErrorEmbed.build(vc.message)] });
    const voice = message.member.voice.channel!;

    const query = args.join(" ");
    if (!query) return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Usage: ${botConfig.prefix}search <query>`)] });

    const msg = await (message.channel as any).send({ embeds: [LoadingEmbed.build("Searching...")] });

    try {
      let player = getPlayer(message.guildId!);
      if (!player) {
        const node = get()?.nodeManager?.nodes?.values()?.next()?.value as any;
        if (!node) return msg.edit({ embeds: [ErrorEmbed.build("Lavalink not connected.")] });
        player = node;
      }

      const result = await player.search({ query: `ytsearch:${query}` }, message.author);
      const tracks = result?.tracks?.slice(0, 10);
      if (!tracks?.length) return msg.edit({ embeds: [ErrorEmbed.build("No results found.")] });

      const payload = SearchEmbed.build(tracks, query);
      const sent = await (message.channel as any).send({ ...payload });
      await msg.delete().catch(() => {});

      const collector = sent.createMessageComponentCollector({ time: 60000, filter: (i: any) => i.user.id === message.author.id });

      collector.on("collect", async (i: any) => {
        if (i.customId !== "search-pick") return;
        const selected = i.values.map((v: string) => tracks[parseInt(v, 10)]);
        await i.deferUpdate();

        const engine = MusicService.getEngine(message.guildId!);
        const pl = await engine.join(voice.id, message.channelId, voice.rtcRegion ?? undefined);
        if (!pl) return i.editReply({ embeds: [ErrorEmbed.build("Failed to join voice channel.")], components: [] });

         MusicService.setTextChannelId(message.guildId!, message.channelId);

          await withQueueLock(message.guildId!, async () => {
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

         await MusicService.saveState(message.guildId!);
        await i.editReply({ embeds: [ErrorEmbed.build(`Added ${selected.length} track(s) to the queue.`)], components: [] });
      });

      collector.on("end", async () => {
        try { await sent.edit({ components: [] }); } catch {}
      });
    } catch (err: any) {
      Logger.error("!search error:", err.message);
      await msg.delete().catch(() => {});
      (message.channel as any).send({ embeds: [ErrorEmbed.build(`Search failed: ${err.message}`)] });
    }
  },
};
