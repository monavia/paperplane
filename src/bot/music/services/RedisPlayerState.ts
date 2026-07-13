// Stub for position sync (Redis) — not used in single node
import { EventEmitter } from "events";

class RedisPlayerState extends EventEmitter {
  private static instance: RedisPlayerState;
  static getInstance(): RedisPlayerState {
    if (!RedisPlayerState.instance) RedisPlayerState.instance = new RedisPlayerState();
    return RedisPlayerState.instance;
  }
  async saveState(_guildId: string, _data: any): Promise<void> {}
  async deleteState(_guildId: string): Promise<void> {}
  async startPositionSync(_guildId: string, _fn: () => number): Promise<void> {}
  async updatePlayingStatus(_guildId: string, _playing: boolean): Promise<void> {}
  disconnect(): void {}
}

export const playerState = RedisPlayerState.getInstance();
