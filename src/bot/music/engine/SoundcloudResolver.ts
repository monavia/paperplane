import Resolver from "./Resolver";

class SoundcloudResolver extends Resolver {
  async search(query: any, user: any): Promise<any> {
    const result = await super.search(query, user);
    return result;
  }

  isSoundcloudUrl(url: any): boolean {
    return /soundcloud\.com/i.test(url);
  }
}

export default SoundcloudResolver;
