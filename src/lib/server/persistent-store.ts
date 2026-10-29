import { prisma } from "@/lib/server/db";
import { PRODUCTS } from "@/lib/catalog";
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

      // Eksik ürünleri koru ve birleştir (merge): Yerelde veya katalogda tanımlı tüm ürünleri veritabanına ekle
      const allKnownProducts = [...(localData.products || []), ...PRODUCTS];
      dbData.products = dbData.products || [];
      const dbProductIds = new Set(dbData.products.map((p) => p.id));
      let merged = false;
      for (const lp of allKnownProducts) {
        if (!dbProductIds.has(lp.id)) {
          dbData.products.push(lp);
          dbProductIds.add(lp.id);
          merged = true;
        }
      }
      if (merged) {
        dbData.updatedAt = Date.now();
        await savePersistentStoreData(dbData).catch(() => {});
      }

      // Yönetici ve kargo kullanıcılarını koru ve birleştir (merge)
      if (Array.isArray(localData.adminUsers) && localData.adminUsers.length > 0) {
        dbData.adminUsers = dbData.adminUsers || [];
        const dbAdminEmails = new Set(dbData.adminUsers.map((u) => u.email.toLowerCase()));
        let adminsMerged = false;
        for (const la of localData.adminUsers) {
          if (!dbAdminEmails.has(la.email.toLowerCase())) {
            dbData.adminUsers.push(la);
            dbAdminEmails.add(la.email.toLowerCase());
            adminsMerged = true;
          }
        }
        if (adminsMerged) {
          dbData.updatedAt = Date.now();
          await savePersistentStoreData(dbData).catch(() => {});
        }
      }

      // Siparişleri koru ve çift yönlü birleştir (merge)
      if (Array.isArray(localData.orders) && localData.orders.length > 0) {
        dbData.orders = dbData.orders || [];
        const dbOrderKeys = new Set(dbData.orders.map((o) => o.id || o.orderNumber));
        let ordersMerged = false;
        for (const lo of localData.orders) {
          const key = lo.id || lo.orderNumber;
          if (!dbOrderKeys.has(key)) {
            dbData.orders.unshift(lo);
            ordersMerged = true;
          }
        }
        if (ordersMerged) {
          dbData.updatedAt = Date.now();
          await savePersistentStoreData(dbData).catch(() => {});
        }
      }

      // Denetim loglarını koru ve birleştir (merge)
      if (Array.isArray(localData.auditLogs) && localData.auditLogs.length > 0) {
        dbData.auditLogs = dbData.auditLogs || [];
        const dbLogIds = new Set(dbData.auditLogs.map((l: any) => l.id));
        let logsMerged = false;
        for (const ll of localData.auditLogs) {
          if (!dbLogIds.has(ll.id)) {
            dbData.auditLogs.push(ll);
            logsMerged = true;
          }
        }
        if (logsMerged) {
          dbData.updatedAt = Date.now();
          await savePersistentStoreData(dbData).catch(() => {});
        }
      }

      // WhatsApp ve telefon numarasını senkronize et
      if (
        (localData.settings?.whatsapp && dbData.settings?.whatsapp !== localData.settings.whatsapp) ||
        (localData.settings?.phone && dbData.settings?.phone !== localData.settings.phone)
      ) {
        dbData.settings = dbData.settings || {};
        if (localData.settings?.whatsapp) dbData.settings.whatsapp = localData.settings.whatsapp;
        if (localData.settings?.phone) dbData.settings.phone = localData.settings.phone;
        dbData.updatedAt = Date.now();
        await savePersistentStoreData(dbData).catch(() => {});
      }

      usePersistentStoreData(dbData);
      return dbData;
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
