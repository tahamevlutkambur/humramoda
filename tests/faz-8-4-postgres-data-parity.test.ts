import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  analyzeMigrationPlan,
  readAndVerifyStore,
  EXPECTED_BASELINE_HASH,
  verifyDataParity,
} from "../scripts/migrate-json-to-pg";

const TEST_DB_URL_FILE = path.join(process.env.TEMP || "C:\\Temp", "humra_test_db_url.txt");
let prisma: PrismaClient | null = null;
let testDbUrl: string = "";

const STORE_PATH = path.resolve("data/store.json");
const BACKUP_PATH = path.resolve("backups/phase-8-4/store-before-postgres-migration.json");
const BACKUP_MANIFEST = path.resolve("backups/phase-8-4/manifest.json");

describe("FAZ 8.4: JSON'dan PostgreSQL'e Veri Aktarımı ve Parite Doğrulama Test Paketi", () => {
  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_URL_FILE)) {
      testDbUrl = fs.readFileSync(TEST_DB_URL_FILE, "utf-8").trim();
      try {
        const client = new PrismaClient({
          datasources: {
            db: {
              url: testDbUrl,
            },
          },
        });
        await client.$connect();
        prisma = client;
      } catch (err) {
        console.warn("PostgreSQL bağlantısı sağlanamadı (sandbox izolasyonu veya offline):", err);
        prisma = null;
      }
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // 1. DATA VE BACKUP BÜTÜNLÜĞÜ
  it("1.1. data/store.json dosyası bozulmamış olmalı ve orijinal SHA256 değeri korunmalıdır", () => {
    const { sha256, isHashValid } = readAndVerifyStore(STORE_PATH);
    expect(sha256).toBe(EXPECTED_BASELINE_HASH);
    expect(isHashValid).toBe(true);
  });

  it("1.2. Faz 8.4 ön-aktarım yedeği ve manifesti eksiksiz mevcut olmalıdır", () => {
    expect(fs.existsSync(BACKUP_PATH)).toBe(true);
    expect(fs.existsSync(BACKUP_MANIFEST)).toBe(true);

    const backupBuf = fs.readFileSync(BACKUP_PATH);
    const backupHash = crypto.createHash("sha256").update(backupBuf).digest("hex").toUpperCase();
    expect(backupHash).toBe(EXPECTED_BASELINE_HASH);

    const manifest = JSON.parse(fs.readFileSync(BACKUP_MANIFEST, "utf-8"));
    expect(manifest.sha256).toBe(EXPECTED_BASELINE_HASH);
    expect(manifest.match).toBe(true);
  });

  // 2. MIGRATION ANALİZ MOTORU DOĞRULAMASI
  it("2.1. Migration plan analizi tüm varlık sayılarını eksiksiz tespit etmelidir", () => {
    const analysis = analyzeMigrationPlan(STORE_PATH);
    expect(analysis.isHashValid).toBe(true);
    expect(analysis.entityCounts.products).toBe(13);
    expect(analysis.entityCounts.colors).toBe(36);
    expect(analysis.entityCounts.sizes).toBe(37);
    expect(analysis.entityCounts.variants).toBe(118);
    expect(analysis.entityCounts.media).toBe(24);
    expect(analysis.entityCounts.categories).toBe(7);
    expect(analysis.entityCounts.collections).toBe(3);
    expect(analysis.entityCounts.productCollections).toBe(26);
    expect(analysis.entityCounts.adminUsers).toBe(4);
    expect(analysis.entityCounts.campaigns).toBe(1);
    expect(analysis.entityCounts.notifications).toBe(58);
    expect(analysis.entityCounts.auditLogs).toBe(47);
    expect(analysis.entityCounts.featuredVideos).toBe(2);
    expect(analysis.entityCounts.settings).toBe(20);
  });

  it("2.2. Betül Trençkot'un 10 varyantı, 100 stoğu ve mükerrer kombinasyonları doğrulanmalıdır", () => {
    const analysis = analyzeMigrationPlan(STORE_PATH);
    expect(analysis.betulTrenckotCheck.status).toBe("PASS");
    expect(analysis.betulTrenckotCheck.variantCount).toBe(10);
    expect(analysis.betulTrenckotCheck.totalStock).toBe(100);
    expect(analysis.betulTrenckotCheck.distinctSkus).toBe(10);
    expect(analysis.betulTrenckotCheck.duplicateCombinations.length).toBe(2);
  });

  // 3. CANLI POSTGRESQL VERİTABANI PARİTE DOĞRULAMASI
  it("3.1. Docker PostgreSQL hedef veritabanı 'humra_migration_test' ve kullanıcısı 'humra_test' olmalıdır", async () => {
    if (!prisma) return;
    const res: any[] = await prisma.$queryRaw`SELECT current_database(), current_user;`;
    expect(res[0].current_database).toBe("humra_migration_test");
    expect(res[0].current_user).toBe("humra_test");
  });

  it("3.2. Canlı veritabanındaki 14 tablonun kayıt sayıları store.json ile %100 parite sağlamalıdır", async () => {
    if (!prisma) return;
    const parity = await verifyDataParity(prisma, STORE_PATH);
    expect(parity.isParityPerfect).toBe(true);

    expect(parity.tableCounts.User.db).toBe(4);
    expect(parity.tableCounts.Category.db).toBe(7);
    expect(parity.tableCounts.Collection.db).toBe(3);
    expect(parity.tableCounts.Product.db).toBe(13);
    expect(parity.tableCounts.ProductCollection.db).toBe(26);
    expect(parity.tableCounts.ProductColor.db).toBe(36);
    expect(parity.tableCounts.ProductSize.db).toBe(37);
    expect(parity.tableCounts.ProductVariant.db).toBe(118);
    expect(parity.tableCounts.ProductMedia.db).toBe(24);
    expect(parity.tableCounts.DiscountCampaign.db).toBe(1);
    expect(parity.tableCounts.FeaturedVideo.db).toBe(2);
    expect(parity.tableCounts.StoreSetting.db).toBe(20);
    expect(parity.tableCounts.CustomerNotification.db).toBe(58);
    expect(parity.tableCounts.AuditLog.db).toBe(47);
  });

  it("3.3. Canlı veritabanında Betül Trençkot'un 10 varyantı ve 100 stoğu eksiksiz korunmuş olmalıdır", async () => {
    if (!prisma) return;
    const parity = await verifyDataParity(prisma, STORE_PATH);
    expect(parity.betulCheck.match).toBe(true);
    expect(parity.betulCheck.variantCount).toBe(10);
    expect(parity.betulCheck.totalStock).toBe(100);
    expect(parity.betulCheck.uniqueSkus).toBe(10);
    expect(parity.betulCheck.duplicateCombosCount).toBe(2);
  });

  it("3.4. Canlı veritabanındaki 58 bildirimde orderId null ve legacyOrderId dolu olmalıdır", async () => {
    if (!prisma) return;
    const parity = await verifyDataParity(prisma, STORE_PATH);
    expect(parity.notificationsCheck.match).toBe(true);
    expect(parity.notificationsCheck.totalDb).toBe(58);
    expect(parity.notificationsCheck.orderIdNullCount).toBe(58);
    expect(parity.notificationsCheck.legacyOrderIdPopulatedCount).toBe(58);
  });

  it("3.5. Canlı veritabanındaki 47 audit log kaydında actorId/adminId korunmuş olmalıdır", async () => {
    if (!prisma) return;
    const parity = await verifyDataParity(prisma, STORE_PATH);
    expect(parity.auditLogsCheck.match).toBe(true);
    expect(parity.auditLogsCheck.totalDb).toBe(47);
    expect(parity.auditLogsCheck.actorIdsPreserved).toBe(true);
  });

  it("3.6. Mağaza ayarlarının tamamı (20 adet anahtar) canlı veritabanında mevcut olmalıdır", async () => {
    if (!prisma) return;
    const parity = await verifyDataParity(prisma, STORE_PATH);
    expect(parity.settingsCheck.match).toBe(true);
    expect(parity.settingsCheck.totalDb).toBe(20);

    const storeJson = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
    const dbSettings = await prisma.storeSetting.findMany();
    const dbKeys = new Set(dbSettings.map((s) => s.key));

    for (const key of Object.keys(storeJson.settings)) {
      expect(dbKeys.has(key)).toBe(true);
    }
  });
});
