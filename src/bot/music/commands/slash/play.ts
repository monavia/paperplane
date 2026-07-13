import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
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
  const result = await player.search({ query: `ytsearch:${q}` }, user);
  if (result?.tracks?.length) {
    const track = pickBestTrack(result.tracks);
    if (!track.info) track.info = {};
    // Override YouTube title with clean Spotify name
    const artistStr = spotifyItem.artists?.join(", ") || track.info.author || "";
    track.info.author = artistStr;
    track.info.title = spotifyItem.name || track.info.title;
    track.info.source = "spotify";
    track.info.originalUrl = track.info.uri;
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
          const curQueue = state.queues.get(interaction.guildId) || [];
          state.queues.set(interaction.guildId, [...curQueue, ...resolvedTracks]);
          return interaction.editReply({
            embeds: [new EmbedBuilder().setDescription(`Added ${resolvedTracks.length} tracks to queue.`).setColor(Colors.SUCCESS)],
          });
        }

        // Nothing playing — start the first track, queue the rest
        const first = resolvedTracks.shift();
        const addedCount = resolvedTracks.length;
        await withQueueLock(interaction.guildId, async () => {
          const curQueue = state.queues.get(interaction.guildId) || [];
          state.queues.set(interaction.guildId, [...curQueue, ...resolvedTracks]);
          state.nowPlaying.set(interaction.guildId, first);
          await player.play({ track: first, clientTrack: first });
          await MusicService.saveState(interaction.guildId);
        });
        return interaction.editReply({
          embeds: [new EmbedBuilder().setDescription(`Added ${addedCount} tracks from Spotify.`).setColor(Colors.SUCCESS)],
        });
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

      const tracks = result?.tracks;
      const track = tracks?.length ? pickBestTrack(tracks) : null;
      if (!track) {
        return interaction.editReply({
          embeds: [ErrorEmbed.build("No results found.")],
        });
      }

      const queue = state.queues.get(interaction.guildId) || [];

      if (player.playing || player.paused) {
        state.queues.set(interaction.guildId, [...queue, track]);
        return interaction.editReply({
          embeds: [NowPlayingEmbed.addedToQueue(track, queue.length + 1)],
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
      await interaction.editReply({
        embeds: [ErrorEmbed.build(err.message)],
      });
    }
  },
};
