import { EmbedBuilder, MessageType } from "discord.js";
import Config from "../config/bot.js";
import { runAIAsk, runAIAskFresh, runAIInterpret } from "../ai/services/AITaskQueue.js";
import { checkPrompt } from "../ai/services/PromptFilter.js";
import MemoryService from "../ai/services/MemoryService.js";
import { buildPersona } from "../ai/config/persona.js";
import { CONFIRMATION_MODE, fallbackPhrase, normalizeConfirmation, withTimeout } from "../ai/config/confirmationPrompts.js";
import Logger from "../core/utils/Logger.js";
import { incCommandsExecuted, observeCommandLatency } from "../telemetry/MetricsCollector.js";
import Colors from "../core/constants/Colors.js";
import * as ErrorEmbed from "../ui/embeds/ErrorEmbed.js";
import * as AIEmbed from "../ui/embeds/AIEmbed.js";
import { getPrefix, setPrefix } from "../database/repositories/GuildRepository.js";
import * as MusicService from "../music/services/MusicService.js";
import { getQueue } from "../music/services/QueueService.js";
import { isLavalinkReady } from "../music/services/MusicService.js";
import state from "../core/state/StateManager.js";
import { get } from "../music/engine/lavalink.js";
import { setTextChannelId } from "../music/services/TextChannelStore.js";
import { withQueueLock } from "../core/state/QueueLock.js";
import { markTrackStartSuppressed, markStopDisconnect } from "../music/engine/musicEvents.js";
import { saveState } from "../music/services/StateService.js";
import { pickBestTrack } from "../music/services/SearchService.js";
import * as NowPlayingEmbed from "../ui/embeds/NowPlayingEmbed.js";
import { build as buildQueueEmbed } from "../ui/embeds/QueueEmbed.js";
import CooldownManager from "../core/utils/CooldownManager.js";
import { classifyError } from "../core/errors/ErrorClassifier.js";

const AI_CONFIRM_TIMEOUT = parseInt(process.env.AI_CONFIRM_TIMEOUT || "4000", 10);

async function confirmReply(message: any, opts: { summary: string; poolKey: string; poolVars?: Record<string, string | number>; color?: number }): Promise<void> {
  await message.channel.sendTyping().catch(Logger.safe("bot/events/messageCreate.ts"));
  const userName = message.member?.displayName || message.author.username;
  const sysPrompt = buildPersona({ userName, nowPlaying: state.nowPlaying.get(message.guildId)?.info?.title }) + "\n\n" + CONFIRMATION_MODE;
  const aiText = await withTimeout(runAIAskFresh(message.author.id, opts.summary, sysPrompt, { maxTokens: 48, temperature: 1.0 }), AI_CONFIRM_TIMEOUT);
  const text = aiText ? normalizeConfirmation(aiText) || fallbackPhrase(opts.poolKey, opts.poolVars) : fallbackPhrase(opts.poolKey, opts.poolVars);
  return message.channel.send({ embeds: [new EmbedBuilder().setDescription(text).setColor(opts.color ?? Colors.SUCCESS)] });
}

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
          const startA = Date.now(); try { const r = await found.execute(message, args); incCommandsExecuted({ command: found.name, status: "success" }); observeCommandLatency(found.name, Date.now() - startA); return r; } catch (e: any) { incCommandsExecuted({ command: found.name, status: "failure" }); const cls = classifyError(e); if (cls.kind === "user") Logger.warn(`Prefix command "${commandName}" user error: ${e.message}`); else { Logger.error(`Prefix command alias "${commandName}" error:`, e); import("@sentry/node").then((S) => S.captureException(e, { tags: { command: found.name } })).catch(() => {}); } return message.channel.send(cls.message).catch(Logger.safe("bot/events/messageCreate.ts")); }
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
      const startB = Date.now(); try { const r = await cmd.execute(message, args); incCommandsExecuted({ command: cmd.name, status: "success" }); observeCommandLatency(cmd.name, Date.now() - startB); return r; } catch (e: any) { incCommandsExecuted({ command: cmd.name, status: "failure" }); const cls = classifyError(e); if (cls.kind === "user") Logger.warn(`Prefix command "${commandName}" user error: ${e.message}`); else { Logger.error(`Prefix command "${commandName}" error:`, e); import("@sentry/node").then((S) => S.captureException(e, { tags: { command: cmd.name } })).catch(() => {}); } return message.channel.send(cls.message).catch(Logger.safe("bot/events/messageCreate.ts")); }
    }

    // AI trigger: bot mention, trigger word, or reply to a bot message
    const trigger = Config.trigger;
    const text = isMention ? content.replace(botMention, "").replace(botMentionNick, "").trim() : content;
    let isReplyToBot = false;
    if (message.type === MessageType.Reply && message.reference?.messageId) {
      try {
        const ref = message.referencedMessage ?? (await message.fetchReference());
        isReplyToBot = ref?.author?.id === client.user.id;
      } catch {}
    }
    const isAI = isMention || text.toLowerCase().startsWith(trigger) || isReplyToBot;

    if (!isAI) return;

    const MAX_AI_LENGTH = 1500;
    const prompt = (isMention ? text : text.slice(trigger.length).trim()).slice(0, MAX_AI_LENGTH);
    if (!prompt) return;

    // Check filter
    const filter = checkPrompt(prompt);
    if (filter.blocked) {
      return message.channel.send(filter.reason || "I can't help with that.");
    }

    // Cooldown for AI — 10s per user
    if (!CooldownManager.check(message.author.id, "ai", 10000)) {
      const remain = CooldownManager.getRemaining(message.author.id, "ai", 10000);
      return message.channel.send({ embeds: [ErrorEmbed.build(`Jangan spam dulu ya — tunggu ${Math.ceil(remain / 1000)} detik lagi.`)] });
    }
    CooldownManager.set(message.author.id, "ai");

    // Show typing indicator
    await message.channel.sendTyping().catch(Logger.safe("bot/events/messageCreate.ts"));

    try {
      const interpreted = await runAIInterpret(message.author.id, prompt);
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
          let firstTrack: any = null;
          for (let i = 0; i < queries.length; i++) {
            const q = queries[i];
            const result = await player.search({ query: `ytmsearch:${q}` }, message.author);
            const track = result?.tracks?.[0] ? pickBestTrack(result.tracks, q) : null;
            if (!track) continue;
            if (i === 0) firstTrack = track;
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
          if (queries.length > 1) {
            const firstTitle = firstTrack?.info?.title;
            return confirmReply(message, {
              summary: `Queued ${queries.length} tracks${firstTitle ? `, first: "${firstTitle}"` : ""}.`,
              poolKey: "queued",
              poolVars: { n: queries.length },
            });
          }
          return message.channel.send({ embeds: [NowPlayingEmbed.build(firstTrack, null)] });
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
            return confirmReply(message, { summary: "Queue is empty after skip.", poolKey: "queueEmpty" });
          }
          case "stop": {
            const engine = MusicService.getEngine(guildId);
            if (!engine.player) return message.channel.send({ embeds: [ErrorEmbed.build("Nothing to stop.")] });
            markStopDisconnect(guildId);
            await MusicService.stop(guildId, message.author.id, name);
            return confirmReply(message, { summary: "Playback stopped.", poolKey: "stopped" });
          }
          case "pause": {
            if (!MusicService.getEngine(guildId).player) return message.channel.send({ embeds: [ErrorEmbed.build("No track playing.")] });
            const paused = await MusicService.pause(guildId, message.author.id, name);
            if (!paused) return message.channel.send({ embeds: [ErrorEmbed.build("Failed to pause.")] });
            return confirmReply(message, { summary: "Playback paused.", poolKey: "paused" });
          }
          case "resume": {
            if (!MusicService.getEngine(guildId).player) return message.channel.send({ embeds: [ErrorEmbed.build("No track playing.")] });
            const resumed = await MusicService.resume(guildId, message.author.id, name);
            if (!resumed) return message.channel.send({ embeds: [ErrorEmbed.build("Failed to resume.")] });
            return confirmReply(message, { summary: "Playback resumed.", poolKey: "resumed" });
          }
          case "autoplay": {
            const newState = !state.autoplay.get(guildId);
            state.autoplay.set(guildId, newState);
            return confirmReply(message, { summary: `Autoplay ${newState ? "on" : "off"}.`, poolKey: newState ? "autoplayOn" : "autoplayOff" });
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
            return confirmReply(message, { summary: `Shuffle ${newState ? "on" : "off"}.`, poolKey: newState ? "shuffleOn" : "shuffleOff" });
          }
          case "loop": {
            const modes = ["off", "track", "playlist"] as const;
            const cur = state.loop.get(guildId);
            const idx = modes.indexOf(cur);
            const next = modes[(idx + 1) % modes.length];
            state.loop.set(guildId, next);
            return confirmReply(message, { summary: `Loop mode: ${next}.`, poolKey: "loop", poolVars: { mode: next } });
          }
          case "247": {
            const newState = !state.twentyFourSeven.isEnabled(guildId);
            state.twentyFourSeven.set(guildId, newState);
            return confirmReply(message, { summary: `24/7 mode ${newState ? "on" : "off"}.`, poolKey: newState ? "stayOn" : "stayOff" });
          }
          case "clear": {
            state.queues.clear(guildId);
            return confirmReply(message, { summary: "Queue cleared.", poolKey: "cleared" });
          }
          case "recommend": {
            state.autoplay.set(guildId, true);
            return confirmReply(message, { summary: "Recommendations enabled (autoplay).", poolKey: "recommend" });
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
            const cTitle = track.info?.title || keyword;
            const cUrl = (track.info as any)?.originalUrl || track.info?.uri || "";
            return message.channel.send({ embeds: [new EmbedBuilder().setDescription(cUrl ? `Changed to [${cTitle}](${cUrl})` : `Changed to **${cTitle}**`).setColor(Colors.SUCCESS)] });
          }
          case "queue": {
            const tracks = getQueue(guildId);
            if (!tracks?.length) return confirmReply(message, { summary: "Queue is empty.", poolKey: "queueEmpty" });
            const { embed } = buildQueueEmbed(tracks, 1);
            return message.channel.send({ embeds: [embed] });
          }
          case "nowplaying": {
            const nowPlaying = state.nowPlaying.get(guildId);
            if (!nowPlaying) return confirmReply(message, { summary: "Nothing is playing.", poolKey: "nothingPlaying" });
            return message.channel.send({ embeds: [NowPlayingEmbed.build(nowPlaying, null)] });
          }
          case "volume": {
            const player = MusicService.getEngine(guildId).player;
            if (!player) return message.channel.send({ embeds: [new EmbedBuilder().setDescription("No track playing.").setColor(Colors.INFO)] });
            const vol = player.volume ?? 80;
            return confirmReply(message, { summary: `Volume is ${vol}%.`, poolKey: "volume", poolVars: { vol } });
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

      if (interpreted.type === "prefix" && interpreted.prefix) {
        if (!message.member?.permissions?.has("ManageGuild")) {
          return message.channel.send({ embeds: [ErrorEmbed.build("Changing prefix requires `Manage Server` permission.")] });
        }
        const newP = String(interpreted.prefix).substring(0, 3);
        await setPrefix(message.guildId, newP);
        return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`Prefix changed to \`${newP}\``).setColor(Colors.SUCCESS)] });
      }

      let reply: string;
      if (interpreted.reply) {
        reply = interpreted.reply;
      } else {
        const prefix = await getPrefix(message.guildId);
        const userName = message.member?.displayName || message.author.username;
        const sysPrompt = buildPersona({
          userName,
          guildName: message.guild?.name,
          nowPlaying: state.nowPlaying.get(message.guildId)?.info?.title,
          prefix,
        }) + "\nTo change prefix, reply with: PREFIX: <new prefix> (e.g., \"PREFIX: !\") — I will execute it.";
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
      MemoryService.saveMemory(message.author.id, prompt, reply).catch(() => {});
      const chunks = reply.match(/[\s\S]{1,3800}/g) || [reply];
      const embeds = chunks.map((text: string) => AIEmbed.build(text));
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
