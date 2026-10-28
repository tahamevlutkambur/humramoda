import { PrismaClient } from "@prisma/client";

declare global {
  var __globalPrismaClient: PrismaClient | undefined;
}

const resolvedDbUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

export const prisma =
  globalThis.__globalPrismaClient ||
  new PrismaClient({
    ...(resolvedDbUrl ? { datasources: { db: { url: resolvedDbUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalThis.__globalPrismaClient = prisma;

/**
 * PostgreSQL veritabanı bağlantısını güvenli biçimde test eder.
 * Sessiz çökme veya hatalı durum bildirimini engeller.
 */
export async function checkDatabaseConnection(): Promise<{ isConnected: boolean; error?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { isConnected: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Veritabanı bağlantı hatası.";
    return { isConnected: false, error: message };
  }
}
