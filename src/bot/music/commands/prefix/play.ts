import botConfig from "../../../config/bot";
import { EmbedBuilder } from "discord.js";
import * as NowPlayingEmbed from "../../../ui/embeds/NowPlayingEmbed";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import { pickBestTrack } from "../../../music/services/SearchService";
import { parseUrl as parseSpotifyUrl, scrape as scrapeSpotify } from "../../../music/engine/SpotifyScraper";
import { markTrackStartSuppressed } from "../../../music/engine/musicEvents";
import { withQueueLock } from "../../../core/state/QueueLock";
import Colors from "../../../core/constants/Colors";
import * as MusicService from "../../services/MusicService";

async function resolveSpotifyTrack(player: any, spotifyItem: any, user: any): Promise<any> {
  const q = spotifyItem.query || `${spotifyItem.artists?.join(" ") || ""} ${spotifyItem.name}`.trim();
  if (!q) return null;
  let result = await player.search({ query: `ytsearch:${q}` }, user);
  if (!result?.tracks?.length) result = await player.search({ query: `ytmsearch:${q}` }, user);
  if (!result?.tracks?.length) result = await player.search({ query: `scsearch:${q}` }, user);
  if (result?.tracks?.length) {
    const track = pickBestTrack(result.tracks);
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
      const state = require("../../../core/state/StateManager");
      const { get } = require("../../../music/engine/lavalink");
      const { getPlayer, createPlayer } = require("../../../music/engine/PlayerManager");
      const { setTextChannelId } = require("../../../music/services/TextChannelStore");
      const { getEngine } = require("../../../music/services/PlayerService");

      const lavalink = get();
      if (!lavalink) throw new Error("Lavalink not connected");

      let player = getPlayer(message.guildId);
      if (!player) {
        player = createPlayer(message.guildId, voice.id, message.channelId);
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

        if (items.length === 1) {
          const resolved = await resolveSpotifyTrack(player, items[0], message.author);
          if (!resolved) throw new Error("Could not resolve Spotify track on YouTube.");
          const queue = state.queues.get(message.guildId) || [];
           if (player.playing || player.paused || queue.length) {
             return await withQueueLock(message.guildId, async () => {
               const q2 = state.queues.get(message.guildId) || [];
               state.queues.set(message.guildId, [...q2, resolved]);
               return message.channel.send({ embeds: [NowPlayingEmbed.addedToQueue(resolved, q2.length + 1)] });
             });
           }
           await withQueueLock(message.guildId, async () => {
             state.nowPlaying.set(message.guildId, resolved);
             markTrackStartSuppressed(message.guildId);
            await player.play({ track: resolved, clientTrack: resolved });
            await MusicService.saveState(message.guildId);
          });
           return message.channel.send({ embeds: [NowPlayingEmbed.build(resolved, null)] });
        }

        // Resolve all tracks (parallel batches)
        const resolvedTracks: any[] = [];
        const BATCH = 20;
        for (let b = 0; b < items.length; b += BATCH) {
          const batch = items.slice(b, b + BATCH);
          const results = await Promise.allSettled(
            batch.map((item: any) => resolveSpotifyTrack(player, item, message.author))
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) resolvedTracks.push(r.value);
          }
        }
        if (!resolvedTracks.length) throw new Error("No tracks could be resolved from Spotify.");

        if (player.playing || player.paused) {
          return await withQueueLock(message.guildId, async () => {
            const curQueue = state.queues.get(message.guildId) || [];
            const space = botConfig.maxQueue - curQueue.length;
            if (space <= 0) return message.channel.send({ embeds: [ErrorEmbed.build("Queue full.")] });
            const addable = space < resolvedTracks.length ? resolvedTracks.slice(0, space) : resolvedTracks;
            state.queues.set(message.guildId, [...curQueue, ...addable]);
            return message.channel.send({
              embeds: [new EmbedBuilder().setDescription(`Added ${addable.length} of ${resolvedTracks.length} tracks to queue.`).setColor(Colors.SUCCESS)],
            });
          });
        }

         const first = resolvedTracks.shift();
         const curQueue = state.queues.get(message.guildId) || [];
         const space = botConfig.maxQueue - curQueue.length;
         const addable = space < resolvedTracks.length ? resolvedTracks.slice(0, space) : resolvedTracks;
         const addedCount = addable.length + 1;
         await withQueueLock(message.guildId, async () => {
           state.queues.set(message.guildId, [...curQueue, ...addable]);
           state.nowPlaying.set(message.guildId, first);
           markTrackStartSuppressed(message.guildId);
           await MusicService.saveState(message.guildId);
          });
         await message.channel.send({
           embeds: [new EmbedBuilder().setDescription(`Added ${addedCount} tracks from Spotify.`).setColor(Colors.SUCCESS)],
         });
         await player.play({ track: first, clientTrack: first }).catch(() => {});
         await message.channel.send({ embeds: [NowPlayingEmbed.build(first, null)] });
         return;
      }

      // Regular search
      let searchQuery = query;
      if (!query.startsWith("http") && !query.includes(":")) {
        searchQuery = `ytmsearch:${query}`;
      }

      let result = await player.search({ query: searchQuery }, message.author);

      if (!result?.tracks?.length && searchQuery.startsWith("ytmsearch:")) {
        const ytFallback = `ytsearch:${query}`;
        result = await player.search({ query: ytFallback }, message.author);
      }

      if (!result?.tracks?.length) {
        const scFallback = query.startsWith("http") ? query : `scsearch:${query}`;
        result = await player.search({ query: scFallback }, message.author);
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
            return message.channel.send({
              embeds: [new EmbedBuilder().setDescription(`Added ${addable2.length} tracks from **${playlistName}**${addedMsg}`).setColor(Colors.SUCCESS)],
            });
          });
        }

        const first = addable.shift();
        if (!first) throw new Error("No tracks in playlist.");
        await withQueueLock(message.guildId, async () => {
          const q2 = state.queues.get(message.guildId) || [];
          state.queues.set(message.guildId, [...q2, ...addable]);
          state.nowPlaying.set(message.guildId, first);
          markTrackStartSuppressed(message.guildId);
          await player.play({ track: first, clientTrack: first });
          await MusicService.saveState(message.guildId);
        });
        return message.channel.send({
          embeds: [new EmbedBuilder().setDescription(`Playing **${playlistName}** — ${addable.length + 1} tracks${addedMsg}`).setColor(Colors.SUCCESS)],
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
      if (String(err?.message || "").includes("spotify")) return;
      message.channel.send({ embeds: [ErrorEmbed.build(err.message)] });
    }
  },
};
