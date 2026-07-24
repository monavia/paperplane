import Resolver from "./Resolver.js";

class SpotifyResolver extends Resolver {
  async search(query: any, user: any): Promise<any> {
    const result = await super.search(query, user);
    return result;
  }

  static isSpotifyUrl(url: any): boolean {
    return /open\.spotify\.com/i.test(url);
  }
}

export default SpotifyResolver;
