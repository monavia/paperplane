import { LavalinkManager } from "lavalink-client";
import { getEngine, destroyEngine, play, skip, stop, seek, pause, resume, setVolume, resolveAndQueueTracks, setFilter, setEqualizer, resetFilters, getFilterState, playSoundboard, search } from "./PlayerService";
export { getEngine, destroyEngine, play, skip, stop, seek, pause, resume, setVolume, resolveAndQueueTracks, setFilter, setEqualizer, resetFilters, getFilterState, playSoundboard, search } from "./PlayerService";
export { saveState } from "./StateService";
export { setTextChannelId } from "./TextChannelStore";
export { getQueue, clearQueue, removeFromQueue, swapTracks, moveTrack, removeByQuery, removeRange, jumpTo } from "./QueueService";

let lavalinkManager: LavalinkManager | null = null;

export function setLavalinkManager(manager: LavalinkManager) {
  lavalinkManager = manager;
}

export function isLavalinkReady(): boolean {
  if (!lavalinkManager?.nodeManager) return false;
  const nodes = lavalinkManager.nodeManager.nodes;
  if (!nodes || nodes.size === 0) return false;
  return Array.from(nodes.values()).some((node: any) => node.connected);
}
