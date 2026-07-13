import { EmbedBuilder } from "discord.js";
import Colors from "../../../core/constants/Colors";
import botConfig from "../../../config/bot";

const COMMANDS = [
  { name: "play", desc: "Play a song or playlist" },
  { name: "search", desc: "Search for tracks to play" },
  { name: "skip", desc: "Skip the current track" },
  { name: "stop", desc: "Stop playback" },
  { name: "pause", desc: "Pause playback" },
  { name: "resume", desc: "Resume playback" },
  { name: "queue", desc: "Show the music queue" },
  { name: "nowplaying", desc: "Show current track" },
  { name: "loop", desc: "Set loop mode (off, track, playlist)" },
  { name: "shuffle", desc: "Shuffle the queue" },
  { name: "clear", desc: "Clear all tracks from the queue" },
  { name: "volume", desc: "Set playback volume" },
  { name: "seek", desc: "Seek to a position in current track" },
  { name: "lyrics", desc: "Show lyrics for current track" },
  { name: "remove", desc: "Remove tracks from queue" },
  { name: "move", desc: "Move a track to another position" },
  { name: "swap", desc: "Swap two tracks in the queue" },
  { name: "jump", desc: "Jump to a specific track in queue" },
  { name: "autoplay", desc: "Toggle autoplay for similar tracks" },
  { name: "filter", desc: "Apply audio filters to playback" },
  { name: "equalizer", desc: "Set equalizer preset" },
];

export default {
  name: "help",
  aliases: ["h", "commands"],
  async execute(message: any, _args: string[]) {
    const lines = COMMANDS.map((c) => `\`${botConfig.prefix}${c.name}\` — ${c.desc}`);
    const embed = new EmbedBuilder()
      .setTitle("Commands")
      .setDescription(lines.join("\n"))
      .setColor(Colors.INFO)
      .setFooter({ text: `${COMMANDS.length} commands available` });
    await message.channel.send({ embeds: [embed] });
  },
};
