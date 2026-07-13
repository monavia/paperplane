import { getEngine } from "./PlayerService";
import { saveState } from "./StateService";
import ActivityService from "../../services/ActivityService";
import state from "../../core/state/StateManager";
import { withQueueLock } from "../../core/state/QueueLock";

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

function removeFromQueue(guildId: string, index: number): boolean {
  const engine = getEngine(guildId);
  const current = getNowPlaying(guildId);
  const upcoming = engine.queue.getAll();

  if (index === 0 && current) return false;
  const upcomingIndex = current ? index - 1 : index;
  if (upcomingIndex < 0 || upcomingIndex >= upcoming.length) return false;
  engine.queue.remove(upcomingIndex);
  return true;
}

function swapTracks(guildId: string, indexA: number, indexB: number): boolean {
  const engine = getEngine(guildId);
  const current = getNowPlaying(guildId);
  if (indexA === 0 || indexB === 0) return false;
  return engine.queue.swap(current ? indexA - 1 : indexA, current ? indexB - 1 : indexB);
}

function clearQueue(guildId: string): void {
  const engine = getEngine(guildId);
  engine.queue.clear();
}

async function shuffle(guildId: string, userId: string, userName: string) {
  const engine = getEngine(guildId);
  engine.queue.shuffle();
  await ActivityService.log({ guildId, userId, userName, action: "shuffle", detail: "Shuffled the queue" });
  await saveState(guildId);
}

function moveTrack(guildId: string, fromIndex: number, toIndex: number): boolean {
  const engine = getEngine(guildId);
  const current = getNowPlaying(guildId);
  if (fromIndex === 0 || toIndex === 0) return false;
  return engine.queue.move(current ? fromIndex - 1 : fromIndex, current ? toIndex - 1 : toIndex);
}

function removeByQuery(guildId: string, query: string): number {
  const engine = getEngine(guildId);
  const current = getNowPlaying(guildId);
  const q = query.toLowerCase();
  const matched = engine.queue.getAll().filter((t: any) => (t.info?.title || "").toLowerCase().includes(q));
  if (!matched.length) return 0;
  const remaining = engine.queue.getAll().filter((t: any) => !matched.includes(t));
  engine.queue.clear();
  for (const t of remaining) engine.queue.add(t);
  if (current) state.nowPlaying.set(guildId, current);
  return matched.length;
}

function removeRange(guildId: string, from: number, to: number): number {
  const engine = getEngine(guildId);
  const current = getNowPlaying(guildId);
  if (from === 0 && current) return 0;
  return engine.queue.removeRange(current ? from - 1 : from, current ? to - 1 : to);
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

export { getQueue, removeFromQueue, swapTracks, clearQueue, shuffle, moveTrack, removeByQuery, removeRange, jumpTo };
