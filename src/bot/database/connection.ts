import mongoose from "mongoose";
import Logger from "../core/utils/Logger";

const dbConfig = {
  uri: process.env.MONGO_URI || "mongodb://localhost:27017/paperplane",
  options: {
    serverSelectionTimeoutMS: 8000,
  },
};

export async function connect(): Promise<void> {
  await mongoose.connect(dbConfig.uri, dbConfig.options);
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}
