import { prisma } from "@/lib/server/db";
import { PRODUCTS } from "@/lib/catalog";
import {
  getStoreData,
  saveStoreData,
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
      const allKnownProducts = localData.products || [];
      dbData.products = dbData.products || [];
      let merged = false;

      // Eski şablon/sahte ürünleri (prod-1..4) temizle
      const mockIds = new Set(["prod-1", "prod-2", "prod-3", "prod-4"]);
      if (dbData.products.some((p) => mockIds.has(p.id))) {
        dbData.products = dbData.products.filter((p) => !mockIds.has(p.id));
        merged = true;
      }

      const dbProductIds = new Set(dbData.products.map((p) => p.id));
      for (const lp of allKnownProducts) {
        if (!mockIds.has(lp.id) && !dbProductIds.has(lp.id)) {
          dbData.products.push(lp);
          dbProductIds.add(lp.id);
          merged = true;
        }
      }

      // Kategorileri koru ve birleştir
      const allKnownCategories = localData.categories || [];
      dbData.categories = dbData.categories || [];
      const dbCatIds = new Set(dbData.categories.map((c) => c.id));
      for (const lc of allKnownCategories) {
        if (!dbCatIds.has(lc.id)) {
          dbData.categories.push(lc);
          dbCatIds.add(lc.id);
          merged = true;
        }
      }

      // Canlıya geçiş temizliği: Eski test siparişleri, iadeleri ve kargoları sıfırla (bir kerelik)
      if (!dbData.settings?.launchResetV1Done) {
        dbData.orders = [];
        dbData.returnRequests = [];
        dbData.shipments = [];
        dbData.settings = dbData.settings || {};
        dbData.settings.launchResetV1Done = true;
        if (dbData.settings.paytr) {
          dbData.settings.paytr.testMode = "0";
          dbData.settings.paytr.debugOn = "0";
        }
        merged = true;
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
        let ordersMerged = false;
        for (const lo of localData.orders) {
          const key = lo.id || lo.orderNumber;
          const existingInDb = dbData.orders.find((o) => (o.id || o.orderNumber) === key);
          if (!existingInDb) {
            dbData.orders.unshift(lo);
            ordersMerged = true;
          } else {
            // En güncel durumu koru
            const loTime = new Date(lo.updatedAt || lo.createdAt || 0).getTime();
            const dbTime = new Date(existingInDb.updatedAt || existingInDb.createdAt || 0).getTime();
            if (loTime > dbTime) {
              Object.assign(existingInDb, lo);
              ordersMerged = true;
            }
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

    const merged = await prisma.$transaction(async (tx) => {
      // Serialize full-snapshot writers across serverless instances. Merge append-only
      // records and newer order/return revisions before replacing the JSON snapshot.
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(726194031)`);
      const rows = await tx.$queryRawUnsafe<Array<{ data: AppStoreData }>>(
        `SELECT "data" FROM "HumraStoreSnapshot" WHERE "id" = 'main' LIMIT 1`
      );
      const latest = rows?.[0]?.data;
      const next: AppStoreData = { ...data };
      const forbiddenMockIds = new Set(["prod-1", "prod-2", "prod-3", "prod-4"]);
      if (next.products) {
        next.products = next.products.filter((p) => !forbiddenMockIds.has(p.id));
      }
      if (latest) {
        const mergeByRevision = <T extends { id: string; updatedAt?: string; createdAt?: string }>(
          incoming: T[] = [],
          existing: T[] = []
        ): T[] => {
          const items = new Map(existing.map((item) => [item.id, item]));
          for (const item of incoming) {
            const previous = items.get(item.id);
            const itemTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
            const previousTime = previous
              ? new Date(previous.updatedAt || previous.createdAt || 0).getTime()
              : -1;
            if (!previous || itemTime >= previousTime) items.set(item.id, item);
          }
          return Array.from(items.values());
        };
        next.orders = mergeByRevision(data.orders, latest.orders);
        next.orders.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        next.returnRequests = mergeByRevision(data.returnRequests || [], latest.returnRequests || []);
        next.shipments = mergeByRevision(data.shipments || [], latest.shipments || []);
        next.adminUsers = mergeByRevision(data.adminUsers, latest.adminUsers);
        next.siteActivityLogs = mergeByRevision(data.siteActivityLogs || [], latest.siteActivityLogs || []).slice(-5000);
        next.auditLogs = mergeByRevision(data.auditLogs || [], latest.auditLogs || []).slice(-5000);
      }
      const serialized = JSON.stringify(next);
      await tx.$executeRawUnsafe(
        `INSERT INTO "HumraStoreSnapshot" ("id", "data", "updatedAt")
         VALUES ('main', CAST($1 AS jsonb), NOW())
         ON CONFLICT ("id") DO UPDATE SET "data" = EXCLUDED."data", "updatedAt" = NOW()`,
        serialized
      );
      return next;
    });
    usePersistentStoreData(merged);
    saveStoreData(merged);
  } catch (error) {
    console.warn("savePersistentStoreData error, data kept in local store:", error);
  }
}
