class LoopStore {
  private data = new Map<string, "off" | "track" | "playlist">();

  get(guildId: string): "off" | "track" | "playlist" {
    return this.data.get(guildId) || "off";
  }

  set(guildId: string, mode: "off" | "track" | "playlist"): void {
    this.data.set(guildId, mode);
  }

  delete(guildId: string): void {
    this.data.delete(guildId);
  }
}

export = LoopStore;
