import { PrismaClient } from "@prisma/client";

declare global {
  var __globalPrismaClient: PrismaClient | undefined;
}

export const prisma =
  globalThis.__globalPrismaClient ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__globalPrismaClient = prisma;
}

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
