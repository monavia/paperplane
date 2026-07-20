import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

let _prisma: any = null;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL || "";
  if (!connectionString.startsWith("postgresql://")) {
    return null;
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function getPrisma() {
  if (!_prisma) _prisma = createPrismaClient();
  return _prisma;
}

// Proxy so `const prisma = (await import("./prisma")).default` → prisma.model.method() works
// Returns null (no-op) when DATABASE_URL is not PostgreSQL
export default new Proxy({} as any, {
  get(_target, prop, _receiver) {
    const client = getPrisma();
    if (!client) return () => Promise.resolve(null);
    const val = (client as any)[prop];
    if (typeof val === "function") return val.bind(client);
    return val;
  },
});
