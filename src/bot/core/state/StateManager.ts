import QueueStore from "./QueueStore";
import NowPlayingStore from "./NowPlayingStore";
import LoopStore from "./LoopStore";
import TwentyFourSevenStore from "./TwentyFourSevenStore";
import VoiceChannelStore from "./VoiceChannelStore";
import ShuffleStore from "./ShuffleStore";
import AutoplayStore from "./AutoplayStore";
import FilterStore from "./FilterStore";
import EqualizerStore from "./EqualizerStore";

class StateManager {
  queues: QueueStore;
  nowPlaying: NowPlayingStore;
  loop: LoopStore;
  twentyFourSeven: TwentyFourSevenStore;
  voiceChannels: VoiceChannelStore;
  shuffle: ShuffleStore;
  autoplay: AutoplayStore;
  filter: FilterStore;
  equalizer: EqualizerStore;

  constructor() {
    this.queues = new QueueStore();
    this.nowPlaying = new NowPlayingStore();
    this.loop = new LoopStore();
    this.twentyFourSeven = new TwentyFourSevenStore();
    this.voiceChannels = new VoiceChannelStore();
    this.shuffle = new ShuffleStore();
    this.autoplay = new AutoplayStore();
    this.filter = new FilterStore();
    this.equalizer = new EqualizerStore();
  }
}

const state = new StateManager();
export = state;
