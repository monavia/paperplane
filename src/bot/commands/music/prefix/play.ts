import botConfig from "@/bot/config/bot";
import { EmbedBuilder } from "discord.js";
import * as NowPlayingEmbed from "@/bot/ui/embeds/NowPlayingEmbed";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { pickBestTrack } from "@/bot/music/services/SearchService";
import { cachedSearch } from "@/bot/music/services/SearchCache";
import { parseUrl as parseSpotifyUrl, scrape as scrapeSpotify } from "@/bot/music/engine/SpotifyScraper";
import { markTrackStartSuppressed } from "@/bot/music/engine/musicEvents";
import { withQueueLock } from "@/bot/core/state/QueueLock";
import Colors from "@/bot/core/constants/Colors";
import * as MusicService from "@/bot/music/services/MusicService";
import Logger from "@/bot/core/utils/Logger";
import state from "../../../core/state/StateManager";
import { get } from "../../../music/engine/lavalink";
import { getPlayer, createPlayer } from "../../../music/engine/PlayerManager";
import { setTextChannelId } from "../../../music/services/TextChannelStore";
import { getEngine } from "../../../music/services/PlayerService";

async function resolveSpotifyTrack(player: any, spotifyItem: any, user: any): Promise<any> {
  const q = spotifyItem.query || `${spotifyItem.artists?.join(" ") || ""} ${spotifyItem.name}`.trim();
  if (!q) return null;
  const yt = await player.search({ query: `ytsearch:${q}` }, user);
  let tracks: any = yt?.tracks;
  let ytm: any, sc: any;
  if (!tracks?.length) { ytm = await player.search({ query: `ytmsearch:${q}` }, user); tracks = ytm?.tracks; }
  if (!tracks?.length) { sc = await player.search({ query: `scsearch:${q}` }, user); tracks = sc?.tracks; }
  if (tracks?.length) {
    const track = pickBestTrack(tracks);
    if (!track.info) track.info = {};
    const artistStr = spotifyItem.artists?.join(", ") || track.info.author || "";
    track.info.author = artistStr;
    track.info.title = spotifyItem.name || track.info.title;
    track.info.originalUrl = track.info.uri;
    track.info.spotifyUrl = spotifyItem.spotifyUri || null;
    return track;
  }
  return null;
}

async function resolveSpotifyBatch(items: any[], player: any, guildId: string, user: any): Promise<any[]> {
  const resolved: any[] = [];
  for (let b = 0; b < items.length; b += 5) {
    const results = await Promise.allSettled(
      items.slice(b, b + 5).map((item: any) => resolveSpotifyTrack(player, item, user))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) resolved.push(r.value);
    }
  }
  const curQueue = state.queues.get(guildId) || [];
  const space = botConfig.maxQueue - curQueue.length;
  if (space <= 0) return resolved;
  const addable = space < resolved.length ? resolved.slice(0, space) : resolved;
  await withQueueLock(guildId, async () => {
    state.queues.set(guildId, [...curQueue, ...addable]);
  });
  return addable;
}

export default {
  name: "play",
  aliases: ["p"],

  async execute(message: any, args: string[]) {
    const query = args.join(" ");
    if (!query) {
      return message.channel.send({ embeds: [ErrorEmbed.build(`Usage: ${botConfig.prefix}play <song name or URL>`)] });
    }

    const member = message.member;
    const voice = member?.voice?.channel;
    if (!voice) {
      return message.channel.send({ embeds: [ErrorEmbed.build("You must be in a voice channel.")] });
    }

    try {
      const lavalink = get();
      if (!lavalink) throw new Error("Lavalink not connected");

      let player = getPlayer(message.guildId);
      if (!player) {
        player = createPlayer(message.guildId, voice.id, message.channelId, voice.rtcRegion);
        await player.connect();
      }
      getEngine(message.guildId).player = player;

      setTextChannelId(message.guildId, message.channelId);

      // Spotify URL handling
      const spotifyParsed = parseSpotifyUrl(query);
      if (spotifyParsed) {
        const items = await scrapeSpotify(query).catch((err: any) => {
          throw new Error(`Spotify: ${err.message}`);
        });
        if (!items?.length) throw new Error("No tracks found on Spotify.");
        Logger.info(`[Spotify] Scraped ${items.length} items. First query: "${items[0]?.query?.slice(0, 80)}"`);

        if (player.playing || player.paused || state.queues.get(message.guildId)?.length) {
          // Already playing — queue all in background
          const statusMsg = await message.channel.send({
            embeds: [new EmbedBuilder().setDescription(`Added ${items.length} tracks from Spotify.`).setColor(Colors.INFO)]
          }).catch(() => null);
          resolveSpotifyBatch(items, player, message.guildId, message.author).then((added) => {
            statusMsg?.edit({ embeds: [new EmbedBuilder().setDescription(`Added ${added.length} tracks from Spotify.`).setColor(Colors.SUCCESS)] }).catch(() => {});
            Logger.info(`[Spotify] Resolved ${added.length}/${items.length} tracks`);
          }).catch((err) => Logger.error(`[Spotify] Background resolve error: ${err.message}`));
          return;
        }

        // Nothing playing — play first track now, queue rest in background
        const firstResolved = await resolveSpotifyTrack(player, items[0], message.author);
        if (!firstResolved) throw new Error("Could not resolve Spotify track on YouTube.");
        const rest = items.slice(1);
        await withQueueLock(message.guildId, async () => {
          state.nowPlaying.set(message.guildId, firstResolved);
          markTrackStartSuppressed(message.guildId);
          await player.play({ track: firstResolved, clientTrack: firstResolved });
          await MusicService.saveState(message.guildId);
        });
        await message.channel.send({ embeds: [NowPlayingEmbed.build(firstResolved, null)] });

        if (rest.length) {
          const statusMsg = await message.channel.send({
            embeds: [new EmbedBuilder().setDescription(`Added ${rest.length} tracks from Spotify.`).setColor(Colors.INFO)]
          }).catch(() => null);
          resolveSpotifyBatch(rest, player, message.guildId, message.author).then((added) => {
            statusMsg?.edit({ embeds: [new EmbedBuilder().setDescription(`Added ${added.length} tracks from Spotify.`).setColor(Colors.SUCCESS)] }).catch(() => {});
            Logger.info(`[Spotify] Resolved ${added.length}/${rest.length} tracks`);
          }).catch((err) => Logger.error(`[Spotify] Background resolve error: ${err.message}`));
        }
        return;
      }

      // Regular search
      let searchQuery = query;
      if (!query.startsWith("http") && !query.includes(":")) {
        searchQuery = `ytmsearch:${query}`;
      }

      let result = await cachedSearch(player, searchQuery, message.author);

      if (!result?.tracks?.length && searchQuery.startsWith("ytmsearch:")) {
        const ytFallback = `ytsearch:${query}`;
        result = await cachedSearch(player, ytFallback, message.author);
      }

      if (!result?.tracks?.length) {
        const scFallback = query.startsWith("http") ? query : `scsearch:${query}`;
        result = await cachedSearch(player, scFallback, message.author);
      }

      // Handle playlist (YouTube, SoundCloud, etc.)
      if (result?.loadType === "playlist" && result?.tracks?.length > 1) {
        const playlistTracks = result.tracks;
        const playlistName = result.playlistInfo?.name || "Playlist";
        const q = state.queues.get(message.guildId) || [];
        const space = botConfig.maxQueue - q.length;
        if (space <= 0) return message.channel.send({ embeds: [ErrorEmbed.build("Queue full.")] });
        const addable = space < playlistTracks.length ? playlistTracks.slice(0, space) : playlistTracks;
        const addedMsg = playlistTracks.length > space ? ` (${space} of ${playlistTracks.length})` : "";

        if (player.playing || player.paused || q.length) {
          return await withQueueLock(message.guildId, async () => {
            const q2 = state.queues.get(message.guildId) || [];
            const addable2 = space < playlistTracks.length ? playlistTracks.slice(0, space) : playlistTracks;
            state.queues.set(message.guildId, [...q2, ...addable2]);
            await MusicService.saveState(message.guildId);
            return message.channel.send({
              embeds: [new EmbedBuilder().setDescription(`Added ${addable2.length} tracks from **${playlistName}**${addedMsg}`).setColor(Colors.SUCCESS)],
            });
          });
        }

        const first = addable.shift();
        if (!first) throw new Error("No tracks in playlist.");
        const sourceLabel = /youtube\.|youtu\.be/i.test(query) ? "from YouTube" : /soundcloud\./i.test(query) ? "from SoundCloud" : "";
        await withQueueLock(message.guildId, async () => {
          const q2 = state.queues.get(message.guildId) || [];
          state.queues.set(message.guildId, [...q2, ...addable]);
          state.nowPlaying.set(message.guildId, first);
          markTrackStartSuppressed(message.guildId);
          await player.play({ track: first, clientTrack: first });
          await MusicService.saveState(message.guildId);
        });
        await message.channel.send({ embeds: [NowPlayingEmbed.build(first, null)] });
        return message.channel.send({
          embeds: [new EmbedBuilder().setDescription(`Playing **${playlistName}** — ${addable.length + 1} tracks ${sourceLabel}`.trim()).setColor(Colors.SUCCESS)],
        });
      }

      const tracks = result?.tracks;
      const track = tracks?.length ? pickBestTrack(tracks) : null;
      if (!track) {
        return message.channel.send({ embeds: [ErrorEmbed.build("No results found.")] });
      }

      const queue = state.queues.get(message.guildId) || [];

        if (player.playing || player.paused) {
          return await withQueueLock(message.guildId, async () => {
            const queue2 = state.queues.get(message.guildId) || [];
            state.queues.set(message.guildId, [...queue2, track]);
            await MusicService.saveState(message.guildId);
            return message.channel.send({ embeds: [NowPlayingEmbed.addedToQueue(track, queue2.length + 1)] });
          });
        }

       await withQueueLock(message.guildId, async () => {
         queue.push(track);
         state.queues.set(message.guildId, queue);
         const next = queue.shift() || track;
         state.nowPlaying.set(message.guildId, next);
         markTrackStartSuppressed(message.guildId);
          await player.play({ track: next, clientTrack: next });
          await MusicService.saveState(message.guildId);
        });
       await message.channel.send({ embeds: [NowPlayingEmbed.build(track, null)] });
    } catch (err: any) {
      if (String(err?.message || "").includes("spotify")) { Logger.info(`[Spotify] Suppressed: ${err.message}`); return; }
      message.channel.send({ embeds: [ErrorEmbed.build(err.message)] });
    }
  },
};
