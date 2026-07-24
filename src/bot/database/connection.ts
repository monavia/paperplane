import mongoose from "mongoose";
import Logger from "../core/utils/Logger.js";

const dbConfig = {
  uri: process.env.MONGO_URI || "mongodb://localhost:27017/paperplane",
  options: { serverSelectionTimeoutMS: 8000 },
};

let _usingPrisma = false;

export function isUsingPrisma(): boolean {
  return _usingPrisma;
}

export async function connect(): Promise<void> {
  const pgUrl = process.env.DATABASE_URL;
  if (pgUrl && (pgUrl.startsWith("postgresql://") || pgUrl.startsWith("postgres://"))) {
    _usingPrisma = true;
    try {
      const prisma: any = await import("./prisma.js");
      await prisma.$connect();
      Logger.ready("Database connected (Prisma/PostgreSQL)");
    } catch (err: any) {
      Logger.error("Prisma connection failed:", err.message);
      throw err;
    }
    return;
  }

  await mongoose.connect(dbConfig.uri, dbConfig.options);
  Logger.ready("Database connected (Mongoose/MongoDB)");
}

export async function disconnect(): Promise<void> {
  if (_usingPrisma) {
    try {
      const prisma: any = await import("./prisma.js");
      await prisma.$disconnect();
    } catch {}
    return;
  }
  await mongoose.disconnect();
}
