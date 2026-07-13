import QueueStore from "./QueueStore";
import NowPlayingStore from "./NowPlayingStore";
import LoopStore from "./LoopStore";
import TwentyFourSevenStore from "./TwentyFourSevenStore";
import VoiceChannelStore from "./VoiceChannelStore";
import ShuffleStore from "./ShuffleStore";

class StateManager {
  queues: QueueStore;
  nowPlaying: NowPlayingStore;
  loop: LoopStore;
  twentyFourSeven: TwentyFourSevenStore;
  voiceChannels: VoiceChannelStore;
  shuffle: ShuffleStore;

  constructor() {
    this.queues = new QueueStore();
    this.nowPlaying = new NowPlayingStore();
    this.loop = new LoopStore();
    this.twentyFourSeven = new TwentyFourSevenStore();
    this.voiceChannels = new VoiceChannelStore();
    this.shuffle = new ShuffleStore();
  }
}

const state = new StateManager();
export = state;
