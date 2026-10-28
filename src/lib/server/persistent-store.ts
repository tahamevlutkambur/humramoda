import { prisma } from "@/lib/server/db";
import {
  getStoreData,
  usePersistentStoreData,
  type AppStoreData,
} from "@/lib/server/store";

let isDbAvailable: boolean | null = null;
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
  if (isDbAvailable === false) return false;

  try {
    let checkSuccess = true;
    tableReady ??= prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "HumraStoreSnapshot" (
        "id" TEXT PRIMARY KEY,
        "data" JSONB NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
      .then(() => undefined)
      .catch((error) => {
        tableReady = undefined;
        checkSuccess = false;
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

    const rows = await prisma.$queryRaw<Array<{ data: AppStoreData }>>`
      SELECT "data" FROM "HumraStoreSnapshot" WHERE "id" = 'main' LIMIT 1
    `;

    if (rows && rows[0]?.data) {
      usePersistentStoreData(rows[0].data);
      return rows[0].data;
    }

    const initialData = getStoreData();
    await savePersistentStoreData(initialData);
    return initialData;
  } catch (error) {
    console.warn("getPersistentStoreData error, fallback to local store:", error);
    isDbAvailable = false;
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
    await prisma.$executeRaw`
      INSERT INTO "HumraStoreSnapshot" ("id", "data", "updatedAt")
      VALUES ('main', ${serialized}::jsonb, NOW())
      ON CONFLICT ("id") DO UPDATE
      SET "data" = EXCLUDED."data", "updatedAt" = NOW()
    `;
    usePersistentStoreData(data);
  } catch (error) {
    console.warn("savePersistentStoreData error, data kept in local store:", error);
  }
}
