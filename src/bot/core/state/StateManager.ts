import QueueStore from "./QueueStore.js";
import NowPlayingStore from "./NowPlayingStore.js";
import LoopStore from "./LoopStore.js";
import TwentyFourSevenStore from "./TwentyFourSevenStore.js";
import VoiceChannelStore from "./VoiceChannelStore.js";
import ShuffleStore from "./ShuffleStore.js";
import AutoplayStore from "./AutoplayStore.js";
import FilterStore from "./FilterStore.js";
import EqualizerStore from "./EqualizerStore.js";
import PositionStore from "./PositionStore.js";

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
  position: PositionStore;
  restored: Set<string>;

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
    this.position = new PositionStore();
    this.restored = new Set<string>();
  }
}

const state = new StateManager();
export default state;
