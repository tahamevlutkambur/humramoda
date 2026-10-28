import { prisma } from "@/lib/server/db";
import {
  getStoreData,
  usePersistentStoreData,
  type AppStoreData,
} from "@/lib/server/store";

let tableReady: Promise<void> | undefined;

async function ensureStoreTable(): Promise<void> {
  tableReady ??= prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "HumraStoreSnapshot" (
      "id" TEXT PRIMARY KEY,
      "data" JSONB NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.then(() => undefined).catch((error) => {
    tableReady = undefined;
    throw error;
  });
  await tableReady;
}

/** Reads the shared catalog snapshot so every Vercel instance sees the same data. */
export async function getPersistentStoreData(): Promise<AppStoreData> {
  await ensureStoreTable();
  const rows = await prisma.$queryRaw<Array<{ data: AppStoreData }>>`
    SELECT "data" FROM "HumraStoreSnapshot" WHERE "id" = 'main' LIMIT 1
  `;

  if (rows[0]?.data) {
    usePersistentStoreData(rows[0].data);
    return rows[0].data;
  }

  const initialData = getStoreData();
  await savePersistentStoreData(initialData);
  return initialData;
}

/** Writes the full store atomically to PostgreSQL, which persists across deploys. */
export async function savePersistentStoreData(data: AppStoreData): Promise<void> {
  await ensureStoreTable();
  const serialized = JSON.stringify(data);
  await prisma.$executeRaw`
    INSERT INTO "HumraStoreSnapshot" ("id", "data", "updatedAt")
    VALUES ('main', ${serialized}::jsonb, NOW())
    ON CONFLICT ("id") DO UPDATE
    SET "data" = EXCLUDED."data", "updatedAt" = NOW()
  `;
  usePersistentStoreData(data);
}
