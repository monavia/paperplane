import Resolver from "./Resolver.js";

class YoutubeResolver extends Resolver {
  async search(query: any, user: any): Promise<any> {
    const result = await super.search(query, user);
    return result;
  }

  isYoutubeUrl(url: any): boolean {
    return /(youtube\.com|youtu\.be)/i.test(url);
  }
}

export default YoutubeResolver;
