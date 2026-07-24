import * as lavalink from "./lavalink.js";

class Resolver {
  guildId: any;
  private playerRef: any = null;

  constructor(guildId?: any) {
    this.guildId = guildId;
  }

  setPlayer(player: any) {
    this.playerRef = player;
  }

  async search(query: any, user: any): Promise<any> {
    if (this.playerRef) {
      return this.playerRef.search({ query }, user);
    }
    const nodes = lavalink.get()?.nodeManager?.nodes;
    if (!nodes?.size) throw new Error("No Lavalink node available");
    const node = nodes.values().next().value as any;
    if (!node) throw new Error("No Lavalink node available");
    return node.search({ query }, user);
  }
}

export default Resolver;
