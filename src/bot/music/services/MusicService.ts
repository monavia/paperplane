import { getEngine, destroyEngine, play, skip, stop, seek, pause, resume, setVolume, resolveAndQueueTracks, setFilter, setEqualizer, resetFilters, getFilterState, playSoundboard, search } from "./PlayerService";
export { getEngine, destroyEngine, play, skip, stop, seek, pause, resume, setVolume, resolveAndQueueTracks, setFilter, setEqualizer, resetFilters, getFilterState, playSoundboard, search } from "./PlayerService";
export { saveState } from "./StateService";
export { setTextChannelId } from "./TextChannelStore";
export { getQueue, clearQueue, removeFromQueue, swapTracks, moveTrack, removeByQuery, removeRange, jumpTo } from "./QueueService";
import { get as getLavalink } from "../engine/lavalink";

export function isLavalinkReady(): boolean {
  const manager = getLavalink();
  if (!manager?.nodeManager) return false;
  const nodes = manager.nodeManager.nodes;
  if (!nodes || nodes.size === 0) return false;
  return Array.from(nodes.values()).some((node: any) => node.connected);
}
