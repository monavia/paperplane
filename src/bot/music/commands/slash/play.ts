import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as NowPlayingEmbed from "../../../ui/embeds/NowPlayingEmbed";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import { pickBestTrack } from "../../../music/services/SearchService";
import { parseUrl as parseSpotifyUrl, scrape as scrapeSpotify } from "../../../music/engine/SpotifyScraper";
import { markTrackStartSuppressed } from "../../../music/engine/musicEvents";
import { withQueueLock } from "../../../core/state/QueueLock";
import Colors from "../../../core/constants/Colors";
import * as MusicService from "../../services/MusicService";
import botConfig from "../../../config/bot";

async function resolveSpotifyTrack(player: any, spotifyItem: any, user: any): Promise<any> {
  const q = spotifyItem.query || `${spotifyItem.artists?.join(" ") || ""} ${spotifyItem.name}`.trim();
  if (!q) return null;
  let result = await player.search({ query: `ytsearch:${q}` }, user);
  if (!result?.tracks?.length) result = await player.search({ query: `ytmsearch:${q}` }, user);
  if (!result?.tracks?.length) result = await player.search({ query: `scsearch:${q}` }, user);
  if (result?.tracks?.length) {
    const track = pickBestTrack(result.tracks);
    if (!track.info) track.info = {};
    // Override YouTube title with clean Spotify name
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
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song or playlist")
    .addStringOption((opt) =>
      opt.setName("query").setDescription("Song name or URL").setRequired(true)
    ),

  async execute(interaction: any) {
    const member = interaction.member;
    const voice = member?.voice?.channel;
    if (!voice) {
      return interaction.reply({
        embeds: [ErrorEmbed.build("You must be in a voice channel.")],
        ephemeral: true,
      });
    }

    const query = interaction.options.getString("query");
    await interaction.deferReply();

    try {
      const state = require("../../../core/state/StateManager");
      const { get } = require("../../../music/engine/lavalink");
      const { getPlayer, createPlayer } = require("../../../music/engine/PlayerManager");
      const { setTextChannelId } = require("../../../music/services/TextChannelStore");
      const { getEngine } = require("../../../music/services/PlayerService");

      const lavalink = get();
      if (!lavalink) throw new Error("Lavalink not connected");

      let player = getPlayer(interaction.guildId);
      if (!player) {
        player = createPlayer(interaction.guildId, voice.id, interaction.channelId);
        await player.connect();
      }
      getEngine(interaction.guildId).player = player;

      setTextChannelId(interaction.guildId, interaction.channelId);

      let searchQuery = query;

      // Spotify URL handling
      const spotifyParsed = parseSpotifyUrl(query);
      if (spotifyParsed) {
        await interaction.editReply({
          embeds: [NowPlayingEmbed.build({ info: { title: "Searching tracks from Spotify..." } }, null)],
        });

        const items = await scrapeSpotify(query).catch((err: any) => {
          throw new Error(`Spotify: ${err.message}`);
        });
        if (!items?.length) throw new Error("No tracks found on Spotify.");

        // Resolve all tracks to YouTube in parallel batches (asli pake batch 20)
        const resolvedTracks: any[] = [];
        const BATCH = 20;
        for (let b = 0; b < items.length; b += BATCH) {
          const batch = items.slice(b, b + BATCH);
          const results = await Promise.allSettled(
            batch.map((item: any) => resolveSpotifyTrack(player, item, interaction.user))
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) resolvedTracks.push(r.value);
          }
          if (b + BATCH < items.length) {
            await interaction.editReply({
              embeds: [NowPlayingEmbed.build({ info: { title: `Resolving tracks... ${Math.min(b + BATCH, items.length)}/${items.length}` } }, null)],
            }).catch(() => {});
          }
        }
        if (!resolvedTracks.length) throw new Error("No tracks could be resolved from Spotify.");

        if (player.playing || player.paused) {
          return await withQueueLock(interaction.guildId, async () => {
            const curQueue = state.queues.get(interaction.guildId) || [];
            const space = botConfig.maxQueue - curQueue.length;
            if (space <= 0) return interaction.editReply({ embeds: [ErrorEmbed.build("Queue full.")] });
            const addable = space < resolvedTracks.length ? resolvedTracks.slice(0, space) : resolvedTracks;
            state.queues.set(interaction.guildId, [...curQueue, ...addable]);
            return interaction.editReply({
              embeds: [new EmbedBuilder().setDescription(`Added ${addable.length} of ${resolvedTracks.length} tracks to queue.`).setColor(Colors.SUCCESS)],
            });
          });
        }

        // Nothing playing — start the first track, queue the rest
        const first = resolvedTracks.shift();
        const curQueue = state.queues.get(interaction.guildId) || [];
        const space = botConfig.maxQueue - curQueue.length;
        const addable = space < resolvedTracks.length ? resolvedTracks.slice(0, space) : resolvedTracks;
        const addedCount = addable.length + 1;
        await withQueueLock(interaction.guildId, async () => {
          state.queues.set(interaction.guildId, [...curQueue, ...addable]);
          state.nowPlaying.set(interaction.guildId, first);
          markTrackStartSuppressed(interaction.guildId);
          await MusicService.saveState(interaction.guildId);
        });
        await interaction.editReply({
          embeds: [new EmbedBuilder().setDescription(`Added ${addedCount} tracks from Spotify.`).setColor(Colors.SUCCESS)],
        });
        await player.play({ track: first, clientTrack: first }).catch(() => {});
        await interaction.followUp({ embeds: [NowPlayingEmbed.build(first, null)] });
        return;
      }

      // Regular search
      if (!query.startsWith("http") && !query.includes(":")) {
        searchQuery = `ytmsearch:${query}`;
      }

      let result = await player.search({ query: searchQuery }, interaction.user);

      if (!result?.tracks?.length && searchQuery.startsWith("ytmsearch:")) {
        const ytFallback = `ytsearch:${query}`;
        result = await player.search({ query: ytFallback }, interaction.user);
      }

      if (!result?.tracks?.length) {
        const scFallback = query.startsWith("http") ? query : `scsearch:${query}`;
        result = await player.search({ query: scFallback }, interaction.user);
      }

      // Handle playlist (YouTube, SoundCloud, etc.)
      if (result?.loadType === "playlist" && result?.tracks?.length > 1) {
        const playlistTracks = result.tracks;
        const playlistName = result.playlistInfo?.name || "Playlist";
        const q = state.queues.get(interaction.guildId) || [];
        const space = botConfig.maxQueue - q.length;
        if (space <= 0) return interaction.editReply({ embeds: [ErrorEmbed.build("Queue full.")] });
        const addable = space < playlistTracks.length ? playlistTracks.slice(0, space) : playlistTracks;
        const addedMsg = playlistTracks.length > space ? ` (${space} of ${playlistTracks.length})` : "";

        if (player.playing || player.paused || q.length) {
          return await withQueueLock(interaction.guildId, async () => {
            const q2 = state.queues.get(interaction.guildId) || [];
            const addable2 = space < playlistTracks.length ? playlistTracks.slice(0, space) : playlistTracks;
            state.queues.set(interaction.guildId, [...q2, ...addable2]);
            return interaction.editReply({
              embeds: [new EmbedBuilder().setDescription(`Added ${addable2.length} tracks from **${playlistName}**${addedMsg}`).setColor(Colors.SUCCESS)],
            });
          });
        }

        const first = addable.shift();
        if (!first) throw new Error("No tracks in playlist.");
        await withQueueLock(interaction.guildId, async () => {
          const q2 = state.queues.get(interaction.guildId) || [];
          state.queues.set(interaction.guildId, [...q2, ...addable]);
          state.nowPlaying.set(interaction.guildId, first);
          markTrackStartSuppressed(interaction.guildId);
          await player.play({ track: first, clientTrack: first });
          await MusicService.saveState(interaction.guildId);
        });
        return interaction.editReply({
          embeds: [new EmbedBuilder().setDescription(`Playing **${playlistName}** — ${addable.length + 1} tracks${addedMsg}`).setColor(Colors.SUCCESS)],
        });
      }

      const tracks = result?.tracks;
      const track = tracks?.length ? pickBestTrack(tracks) : null;
      if (!track) {
        return interaction.editReply({
          embeds: [ErrorEmbed.build("No results found.")],
        });
      }

      const queue = state.queues.get(interaction.guildId) || [];

      if (player.playing || player.paused) {
        return await withQueueLock(interaction.guildId, async () => {
          const queue2 = state.queues.get(interaction.guildId) || [];
          state.queues.set(interaction.guildId, [...queue2, track]);
          return interaction.editReply({
            embeds: [NowPlayingEmbed.addedToQueue(track, queue2.length + 1)],
          });
        });
      }

      await withQueueLock(interaction.guildId, async () => {
        queue.push(track);
        state.queues.set(interaction.guildId, queue);
        const next = queue.shift() || track;
        state.nowPlaying.set(interaction.guildId, next);
        markTrackStartSuppressed(interaction.guildId);
        await player.play({ track: next, clientTrack: next });
        await MusicService.saveState(interaction.guildId);
      });
      await interaction.editReply({
        embeds: [NowPlayingEmbed.build(track, null)],
      });
    } catch (err: any) {
      if (String(err?.message || "").includes("spotify")) return;
      await interaction.editReply({
        embeds: [ErrorEmbed.build(err.message)],
      });
    }
  },
};
