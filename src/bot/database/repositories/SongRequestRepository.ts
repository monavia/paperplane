import { SongRequest } from "../models/SongRequest";

async function getChannelId(guildId: string): Promise<string | null> {
  const doc = await SongRequest.findOne({ guildId }).lean();
  return doc?.channelId || null;
}

async function setChannel(guildId: string, channelId: string | null): Promise<void> {
  if (channelId) {
    await SongRequest.updateOne({ guildId }, { channelId }, { upsert: true });
  } else {
    await SongRequest.deleteOne({ guildId });
  }
}

export default { getChannelId, setChannel };
