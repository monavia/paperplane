import { EmbedBuilder } from "discord.js";
import Config from "../config/bot";
import { runAIAsk, runAIInterpret } from "../ai/services/AITaskQueue";
import { checkPrompt } from "../ai/services/PromptFilter";
import Logger from "../core/utils/Logger";
import { incCommandsExecuted, observeCommandLatency } from "../telemetry/MetricsCollector";
import Colors from "../core/constants/Colors";
import * as ErrorEmbed from "../ui/embeds/ErrorEmbed";
import { getPrefix, setPrefix } from "../database/repositories/GuildRepository";
import * as MusicService from "../music/services/MusicService";
import { getQueue } from "../music/services/QueueService";
import { isLavalinkReady } from "../music/services/MusicService";
import state from "../core/state/StateManager";
import { get } from "../music/engine/lavalink";
import { setTextChannelId } from "../music/services/TextChannelStore";
import { withQueueLock } from "../core/state/QueueLock";
import { markTrackStartSuppressed } from "../music/engine/musicEvents";
import { saveState } from "../music/services/StateService";
import * as NowPlayingEmbed from "../ui/embeds/NowPlayingEmbed";
import { build as buildQueueEmbed } from "../ui/embeds/QueueEmbed";
import CooldownManager from "../core/utils/CooldownManager";

export function start(client: any): void {
  client.on("messageCreate", async (message: any) => {
    if (message.author.bot || !message.guild) return;

    const botMention = `<@${client.user?.id}>`;
    const botMentionNick = `<@!${client.user?.id}>`;
    const content = message.content;
    const isMention = content.startsWith(botMention) || content.startsWith(botMentionNick);
    const guildPrefix = await getPrefix(message.guildId);
    const isPrefix = content.startsWith(guildPrefix);

    // Prefix command handling
    if (isPrefix) {
      const args = content.slice(guildPrefix.length).trim().split(/ +/);
      const commandName = args.shift()?.toLowerCase();
      if (!commandName) return;

      const musicCommands = ["play", "skip", "stop", "pause", "resume", "queue", "nowplaying", "volume", "search", "autoplay", "loop", "shuffle", "clear", "remove", "move", "swap", "jump", "seek", "filter", "equalizer", "lyrics", "volume"];

      const cmd = client.prefixCommands?.get(commandName);
      if (!cmd) {
        const found: any = Array.from(client.prefixCommands?.values() || []).find((c: any) =>
          c.aliases?.includes?.(commandName)
        );
        if (found) {
          const cdMs = musicCommands.includes(found.name) ? 5000 : 3000;
          if (!CooldownManager.check(message.author.id, found.name, cdMs)) {
            const remain = CooldownManager.getRemaining(message.author.id, found.name, cdMs);
            return message.channel.send({ embeds: [ErrorEmbed.build(`Please wait ${Math.ceil(remain / 1000)}s before using this command again.`)] });
          }
          CooldownManager.set(message.author.id, found.name);
          if (!isLavalinkReady() && musicCommands.includes(found.name)) {
            return message.channel.send({ embeds: [ErrorEmbed.build("Music service is currently unavailable. Please try again in a few minutes.")] });
          }
          const startA = Date.now(); try { const r = await found.execute(message, args); incCommandsExecuted({ command: found.name, status: "success" }); observeCommandLatency(found.name, Date.now() - startA); return r; } catch (e: any) { incCommandsExecuted({ command: found.name, status: "failure" }); Logger.error(`Prefix command alias "${commandName}" error:`, e); return message.channel.send("Command error.").catch(Logger.safe("bot/events/messageCreate.ts")); }
        }
        return;
      }
      const cdMs = musicCommands.includes(cmd.name) ? 5000 : 3000;
      if (!CooldownManager.check(message.author.id, cmd.name, cdMs)) {
        const remain = CooldownManager.getRemaining(message.author.id, cmd.name, cdMs);
        return message.channel.send({ embeds: [ErrorEmbed.build(`Please wait ${Math.ceil(remain / 1000)}s before using this command again.`)] });
      }
      CooldownManager.set(message.author.id, cmd.name);
      if (!isLavalinkReady() && musicCommands.includes(cmd.name)) {
        return message.channel.send({ embeds: [ErrorEmbed.build("Music service is currently unavailable. Please try again in a few minutes.")] });
      }
      const startB = Date.now(); try { const r = await cmd.execute(message, args); incCommandsExecuted({ command: cmd.name, status: "success" }); observeCommandLatency(cmd.name, Date.now() - startB); return r; } catch (e: any) { incCommandsExecuted({ command: cmd.name, status: "failure" }); Logger.error(`Prefix command "${commandName}" error:`, e); return message.channel.send("Command error.").catch(Logger.safe("bot/events/messageCreate.ts")); }
    }

    // AI trigger: bot mention or trigger word
    const trigger = Config.trigger;
    const text = isMention ? content.replace(botMention, "").replace(botMentionNick, "").trim() : content;
    const isAI = isMention || text.toLowerCase().startsWith(trigger);

    if (!isAI) return;

    const prompt = isMention ? text : text.slice(trigger.length).trim();
    if (!prompt) return;

    // Check filter
    const filter = checkPrompt(prompt);
    if (filter.blocked) {
      return message.channel.send(filter.reason || "I can't help with that.");
    }

    // Cooldown for AI — 10s per user
    if (!CooldownManager.check(message.author.id, "ai", 10000)) {
      const remain = CooldownManager.getRemaining(message.author.id, "ai", 10000);
      return message.channel.send({ embeds: [ErrorEmbed.build(`Please wait ${Math.ceil(remain / 1000)}s before using AI again.`)] });
    }
    CooldownManager.set(message.author.id, "ai");

    // Show typing indicator
    await message.channel.sendTyping().catch(Logger.safe("bot/events/messageCreate.ts"));

    try {
      const interpreted = await runAIInterpret(prompt);
      if (interpreted.type !== "chat") {
        const guildId = message.guildId;
        const voice = message.member?.voice?.channel;
        const name = message.member?.displayName || message.author.username;

        if (interpreted.type === "play" || interpreted.type === "playlist") {
          if (!voice) return message.channel.send({ embeds: [ErrorEmbed.build("You must be in a voice channel.")] });
          const lavalink = get();
          if (!lavalink) return message.channel.send({ embeds: [ErrorEmbed.build("Music system not ready.")] });
          let player = lavalink.players.get(guildId);
          if (!player) {
            player = lavalink.createPlayer({ guildId, voiceChannelId: voice.id, textChannelId: message.channelId, selfDeaf: true, selfMute: false, vcRegion: voice.rtcRegion });
            await player.connect();
          }
          MusicService.getEngine(guildId).player = player;
          setTextChannelId(guildId, message.channelId);

          const queries = interpreted.type === "playlist" ? interpreted.songs : [interpreted.query];
          for (let i = 0; i < queries.length; i++) {
            const q = queries[i];
            const result = await player.search({ query: `ytmsearch:${q}` }, message.author);
            const track = result?.tracks?.[0];
            if (!track) continue;
            if (i === 0 && !player.playing && !player.paused) {
              await withQueueLock(guildId, async () => {
                state.nowPlaying.set(guildId, track);
                markTrackStartSuppressed(guildId);
                await player.play({ track, clientTrack: track });
                await saveState(guildId);
              });
            } else {
              await withQueueLock(guildId, async () => {
                const q2 = state.queues.get(guildId) || [];
                state.queues.set(guildId, [...q2, track]);
                await saveState(guildId);
              });
            }
          }
          return message.channel.send({ embeds: [new EmbedBuilder().setDescription(queries.length > 1 ? `Queued ${queries.length} tracks.` : `Playing **${queries[0]}**`).setColor(Colors.SUCCESS)] });
        }

        if (interpreted.type === "info") {
          const qCount = state.queues.get(guildId)?.length || 0;
          const np = state.nowPlaying.get(guildId);
          return message.channel.send({
            embeds: [new EmbedBuilder()
              .setTitle("Paperplane Bot")
              .setDescription(`Queue: **${qCount}** tracks\nNow playing: ${np ? `**${np.info?.title}**` : "Nothing"}\nLavalink: ${MusicService.isLavalinkReady() ? "✅ Connected" : "❌ Disconnected"}`)
              .setColor(Colors.INFO)]
          });
        }
        if (interpreted.type === "ping") {
          const wsPing = message.client?.ws?.ping ?? 0;
          return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`🏓 Pong! WS Ping: **${wsPing}ms**`).setColor(Colors.INFO)] });
        }

        if (!voice) return message.channel.send({ embeds: [ErrorEmbed.build("You must be in a voice channel.")] });

        switch (interpreted.type) {
          case "skip": {
            const player = MusicService.getEngine(guildId).player;
            if (!player) return message.channel.send({ embeds: [ErrorEmbed.build("No track playing.")] });
            const nextTrack = await MusicService.skip(guildId, message.author.id, name);
            if (nextTrack) return message.channel.send({ embeds: [NowPlayingEmbed.build(nextTrack, null)] });
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Queue empty.").setColor(Colors.INFO)] });
          }
          case "stop": {
            const engine = MusicService.getEngine(guildId);
            if (!engine.player) return message.channel.send({ embeds: [ErrorEmbed.build("Nothing to stop.")] });
            await MusicService.stop(guildId, message.author.id, name);
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Playback stopped.").setColor(Colors.INFO)] });
          }
          case "pause": {
            if (!MusicService.getEngine(guildId).player) return message.channel.send({ embeds: [ErrorEmbed.build("No track playing.")] });
            const paused = await MusicService.pause(guildId, message.author.id, name);
            if (!paused) return message.channel.send({ embeds: [ErrorEmbed.build("Failed to pause.")] });
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Playback paused.").setColor(Colors.SUCCESS)] });
          }
          case "resume": {
            if (!MusicService.getEngine(guildId).player) return message.channel.send({ embeds: [ErrorEmbed.build("No track playing.")] });
            const resumed = await MusicService.resume(guildId, message.author.id, name);
            if (!resumed) return message.channel.send({ embeds: [ErrorEmbed.build("Failed to resume.")] });
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Playback resumed.").setColor(Colors.SUCCESS)] });
          }
          case "autoplay": {
            const newState = !state.autoplay.get(guildId);
            state.autoplay.set(guildId, newState);
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`Autoplay **${newState ? "ON" : "OFF"}**`).setColor(newState ? Colors.SUCCESS : Colors.INFO)] });
          }
          case "shuffle": {
            const newState = !state.shuffle.get(guildId);
            state.shuffle.set(guildId, newState);
            if (newState) {
              const tracks = state.queues.get(guildId);
              if (tracks?.length > 1) {
                for (let idx = tracks.length - 1; idx > 0; idx--) {
                  const j = Math.floor(Math.random() * (idx + 1));
                  [tracks[idx], tracks[j]] = [tracks[j], tracks[idx]];
                }
                state.queues.set(guildId, tracks);
              }
            }
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`Shuffle **${newState ? "ON" : "OFF"}**`).setColor(newState ? Colors.SUCCESS : Colors.INFO)] });
          }
          case "loop": {
            const modes = ["off", "track", "playlist"] as const;
            const cur = state.loop.get(guildId);
            const idx = modes.indexOf(cur);
            const next = modes[(idx + 1) % modes.length];
            state.loop.set(guildId, next);
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`Loop: **${next}**`).setColor(Colors.INFO)] });
          }
          case "247": {
            const newState = !state.twentyFourSeven.isEnabled(guildId);
            state.twentyFourSeven.set(guildId, newState);
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`24/7 mode **${newState ? "ON" : "OFF"}**`).setColor(newState ? Colors.SUCCESS : Colors.INFO)] });
          }
          case "clear": {
            state.queues.clear(guildId);
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Queue cleared.").setColor(Colors.SUCCESS)] });
          }
          case "recommend": {
            state.autoplay.set(guildId, true);
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Autoplay enabled — recommendations will play when queue ends.").setColor(Colors.INFO)] });
          }
          case "correct_playlist": {
            const keyword = interpreted.keyword;
            if (!keyword) return message.channel.send({ embeds: [ErrorEmbed.build("What should I play instead?")] });
            const lavalink = get();
            if (!lavalink) return message.channel.send({ embeds: [ErrorEmbed.build("Music system not ready.")] });
            let player = lavalink.players.get(guildId);
            if (!player) {
              if (!voice) return message.channel.send({ embeds: [ErrorEmbed.build("You must be in a voice channel.")] });
              player = lavalink.createPlayer({ guildId, voiceChannelId: voice.id, textChannelId: message.channelId, selfDeaf: true, selfMute: false, vcRegion: voice.rtcRegion });
              await player.connect();
            }
            MusicService.getEngine(guildId).player = player;
            setTextChannelId(guildId, message.channelId);
            const result = await player.search({ query: `ytmsearch:${keyword}` }, message.author);
            const track = result?.tracks?.[0];
            if (!track) return message.channel.send({ embeds: [ErrorEmbed.build("No results found.")] });
            if (player.playing || player.paused) {
              await withQueueLock(guildId, async () => {
                state.nowPlaying.set(guildId, track);
                markTrackStartSuppressed(guildId);
                await player.stopPlaying();
                await player.play({ track, clientTrack: track });
                await saveState(guildId);
              });
            } else {
              await withQueueLock(guildId, async () => {
                state.nowPlaying.set(guildId, track);
                markTrackStartSuppressed(guildId);
                await player.play({ track, clientTrack: track });
                await saveState(guildId);
              });
            }
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`Changed to **${track.info?.title || keyword}**`).setColor(Colors.SUCCESS)] });
          }
          case "queue": {
            const tracks = getQueue(guildId);
            if (!tracks?.length) return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Queue is empty.").setColor(Colors.INFO)] });
            const { embed } = buildQueueEmbed(tracks, 1);
            return message.channel.send({ embeds: [embed] });
          }
          case "nowplaying": {
            const nowPlaying = state.nowPlaying.get(guildId);
            if (!nowPlaying) return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Nothing is playing right now.").setColor(Colors.INFO)] });
            return message.channel.send({ embeds: [NowPlayingEmbed.build(nowPlaying, null)] });
          }
          case "volume": {
            const player = MusicService.getEngine(guildId).player;
            if (!player) return message.channel.send({ embeds: [new EmbedBuilder().setDescription("No track playing.").setColor(Colors.INFO)] });
            const vol = player.volume ?? 80;
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`Current volume: **${vol}%**`).setColor(Colors.INFO)] });
          }
          case "help":
            return message.channel.send({
              embeds: [new EmbedBuilder()
                .setTitle("AI Command Help")
                .setDescription("Say **play**, **playlist**, **skip**, **stop**, **pause**, **resume**, **queue**, **nowplaying**, **volume**, **autoplay**, **shuffle**, **loop**, **247**, **clear**, **recommend**, **info**, **ping**, **correct**, or **help**.")
                .setColor(Colors.INFO)]
            });
          default:
            return message.channel.send({ embeds: [ErrorEmbed.build("Command not supported via AI yet.")] });
        }
      }

      let reply: string;
      if (interpreted.reply) {
        reply = interpreted.reply;
      } else {
        const prefix = await getPrefix(message.guildId);
        const sysPrompt = `Current bot prefix for this server is: "${prefix}". ` +
          `User can type "${prefix}help" or "/help" to see commands. ` +
          `To change prefix, reply with: PREFIX: <new prefix> (e.g., "PREFIX: !") — I will execute it.`;
        reply = await runAIAsk(message.author.id, prompt, sysPrompt);
      }
      const prefixExec = reply.match(/^PREFIX:\s*(\S+)/im);
      if (prefixExec) {
        if (!message.member?.permissions?.has("ManageGuild")) {
          return message.channel.send({ embeds: [ErrorEmbed.build("Changing prefix requires `Manage Server` permission.")] });
        }
        const newP = prefixExec[1].substring(0, 3);
        await setPrefix(message.guildId, newP);
        return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`Prefix changed to \`${newP}\``).setColor(Colors.INFO)] });
      }
      const chunks = reply.match(/[\s\S]{1,3800}/g) || [reply];
      const embeds = chunks.map((text: string) => new EmbedBuilder().setDescription(text).setColor(Colors.INFO));
      for (let i = 0; i < embeds.length; i++) {
        await message.channel.send({ embeds: [embeds[i]] });
        if (i < embeds.length - 1) await new Promise(r => setTimeout(r, 500));
      }
    } catch (err: any) {
      Logger.error(`AI error: ${err.message}`);
      message.channel.send({ embeds: [ErrorEmbed.build("Sorry, I couldn't process that. Try again later.")] });
    }
  });
}
