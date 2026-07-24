import { getEngine } from "./PlayerService.js";
import { saveState } from "./StateService.js";
import ActivityService from "../../services/ActivityService.js";
import state from "../../core/state/StateManager.js";
import { withQueueLock } from "../../core/state/QueueLock.js";

function getNowPlaying(guildId: string) {
  return state.nowPlaying.get(guildId);
}

function getQueue(guildId: string) {
  const engine = getEngine(guildId);
  const current = getNowPlaying(guildId);
  const upcoming = engine.queue.getAll();
  if (!current) return upcoming;
  return [current, ...upcoming];
}

function removeFromQueue(guildId: string, index: number): Promise<boolean> {
  return withQueueLock(guildId, () => {
    const engine = getEngine(guildId);
    const current = getNowPlaying(guildId);
    const upcoming = engine.queue.getAll();

    if (index === 0 && current) return false;
    const upcomingIndex = current ? index - 1 : index;
    if (upcomingIndex < 0 || upcomingIndex >= upcoming.length) return false;
    engine.queue.remove(upcomingIndex);
    saveState(guildId);
    return true;
  });
}

function swapTracks(guildId: string, indexA: number, indexB: number): Promise<boolean> {
  return withQueueLock(guildId, async () => {
    const engine = getEngine(guildId);
    const current = getNowPlaying(guildId);
    if (indexA === 0 || indexB === 0) return false;
    const result = engine.queue.swap(current ? indexA - 1 : indexA, current ? indexB - 1 : indexB);
    if (result) await saveState(guildId);
    return result;
  });
}

function clearQueue(guildId: string): Promise<void> {
  return withQueueLock(guildId, async () => {
    const engine = getEngine(guildId);
    engine.queue.clear();
    await saveState(guildId);
  });
}

async function shuffle(guildId: string, userId: string, userName: string): Promise<void> {
  return withQueueLock(guildId, async () => {
    const engine = getEngine(guildId);
    engine.queue.shuffle();
    await ActivityService.log({ guildId, userId, userName, action: "shuffle", detail: "Shuffled the queue" });
    await saveState(guildId);
  });
}

function moveTrack(guildId: string, fromIndex: number, toIndex: number): Promise<boolean> {
  return withQueueLock(guildId, async () => {
    const engine = getEngine(guildId);
    const current = getNowPlaying(guildId);
    if (fromIndex === 0 || toIndex === 0) return false;
    const result = engine.queue.move(current ? fromIndex - 1 : fromIndex, current ? toIndex - 1 : toIndex);
    if (result) await saveState(guildId);
    return result;
  });
}

function removeByQuery(guildId: string, query: string): Promise<number> {
  return withQueueLock(guildId, async () => {
    const engine = getEngine(guildId);
    const current = getNowPlaying(guildId);
    const q = query.toLowerCase();
    const matched = engine.queue.getAll().filter((t: any) => (t.info?.title || "").toLowerCase().includes(q));
    if (!matched.length) return 0;
    const remaining = engine.queue.getAll().filter((t: any) => !matched.includes(t));
    engine.queue.clear();
    for (const t of remaining) engine.queue.add(t);
    if (current) state.nowPlaying.set(guildId, current);
    await saveState(guildId);
    return matched.length;
  });
}

function removeRange(guildId: string, from: number, to: number): Promise<number> {
  return withQueueLock(guildId, async () => {
    const engine = getEngine(guildId);
    const current = getNowPlaying(guildId);
    if (from === 0 && current) return 0;
    const result = engine.queue.removeRange(current ? from - 1 : from, current ? to - 1 : to);
    if (result > 0) await saveState(guildId);
    return result;
  });
}

function jumpTo(guildId: string, index: number): Promise<boolean> {
  return withQueueLock(guildId, () => {
    const engine = getEngine(guildId);
    const player = engine.player;
    if (!player) return false;
    const current = getNowPlaying(guildId);
    if (index === 0) return false;
    const upcomingIndex = current ? index - 1 : index;
    const upcoming = engine.queue.getAll();
    if (upcomingIndex < 0 || upcomingIndex >= upcoming.length) return false;
    const target = upcoming[upcomingIndex];
    if (!target) return false;
    engine.queue.clear();
    engine.queue.add(target);
    player.stopPlaying();
    saveState(guildId);
    return true;
  });
}

function addTracks(guildId: string, tracks: any[]): Promise<void> {
  return withQueueLock(guildId, async () => {
    if (!tracks.length) return;
    const q = state.queues.get(guildId) || [];
    state.queues.set(guildId, [...q, ...tracks]);
    await saveState(guildId);
  });
}

export { getQueue, removeFromQueue, swapTracks, clearQueue, shuffle, moveTrack, removeByQuery, removeRange, jumpTo, addTracks };
