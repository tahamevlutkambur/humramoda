import { prisma } from "@/lib/server/db";
import {
  getStoreData,
  usePersistentStoreData,
  type AppStoreData,
} from "@/lib/server/store";

let isDbAvailable: boolean | null = null;
let lastFailureAt = 0;
let tableReady: Promise<void> | undefined;

function isRemoteDatabaseConfigured(): boolean {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL;
  if (!dbUrl) return false;
  const lower = dbUrl.toLowerCase();
  if (lower.includes("localhost") || lower.includes("127.0.0.1")) {
    return false;
  }
  return lower.startsWith("postgres://") || lower.startsWith("postgresql://");
}

async function ensureStoreTable(): Promise<boolean> {
  if (!isRemoteDatabaseConfigured()) return false;
  if (isDbAvailable === false && Date.now() - lastFailureAt < 15_000) {
    return false;
  }

  try {
    let checkSuccess = true;
    tableReady ??= prisma
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "HumraStoreSnapshot" (
          "id" TEXT PRIMARY KEY,
          "data" JSONB NOT NULL,
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        tableReady = undefined;
        checkSuccess = false;
        lastFailureAt = Date.now();
        console.warn("Database snapshot table check failed, falling back to local store:", error);
      });

    await tableReady;
    if (!checkSuccess) {
      isDbAvailable = false;
      return false;
    }
    isDbAvailable = true;
    return true;
  } catch (err) {
    isDbAvailable = false;
    lastFailureAt = Date.now();
    console.warn("Database connection failed, falling back to local store:", err);
    return false;
  }
}

/** Reads the shared catalog snapshot so every Vercel instance sees the same data. */
export async function getPersistentStoreData(): Promise<AppStoreData> {
  try {
    const ready = await ensureStoreTable();
    if (!ready) {
      return getStoreData();
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ data: AppStoreData }>>(
      `SELECT "data" FROM "HumraStoreSnapshot" WHERE "id" = 'main' LIMIT 1`
    );

    const localData = getStoreData();

    if (rows && rows[0]?.data) {
      const dbData = rows[0].data;
      const dbTime = dbData.updatedAt || 0;
      const localTime = localData.updatedAt || 0;

      if (dbTime >= localTime) {
        usePersistentStoreData(dbData);
        return dbData;
      } else {
        await savePersistentStoreData(localData);
        return localData;
      }
    }

    await savePersistentStoreData(localData);
    return localData;
  } catch (error) {
    console.warn("getPersistentStoreData error, fallback to local store:", error);
    isDbAvailable = false;
    lastFailureAt = Date.now();
    return getStoreData();
  }
}

/** Writes the full store atomically to PostgreSQL, which persists across deploys. */
export async function savePersistentStoreData(data: AppStoreData): Promise<void> {
  try {
    const ready = await ensureStoreTable();
    if (!ready) {
      return;
    }

    const serialized = JSON.stringify(data);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "HumraStoreSnapshot" ("id", "data", "updatedAt")
       VALUES ('main', $1::jsonb, NOW())
       ON CONFLICT ("id") DO UPDATE
       SET "data" = EXCLUDED."data", "updatedAt" = NOW()`,
      serialized
    );
    usePersistentStoreData(data);
  } catch (error) {
    console.warn("savePersistentStoreData error, data kept in local store:", error);
  }
}
