import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const isNew = !globalForPrisma.prisma;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

if (isNew) {
  // WAL mode allows concurrent readers alongside the single writer, reducing lock contention.
  // busy_timeout makes SQLite wait up to 5 s instead of returning SQLITE_BUSY immediately.
  void prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL").catch(() => {});
  void prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000").catch(() => {});
}
