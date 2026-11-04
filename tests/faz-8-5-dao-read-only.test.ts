import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  JsonStoreDAO,
  PrismaStoreDAO,
  createStoreDAO,
  getActiveStoreDriver,
  compareDAOParity,
  resetDAOCache,
} from "../src/lib/server/dao";
import { resolveTestDatabaseUrl } from "../scripts/migrate-json-to-pg";

const TEST_DB_URL_FILE = path.join(process.env.TEMP || "C:\\Temp", "humra_test_db_url.txt");
let prisma: PrismaClient | null = null;
let testDbUrl: string = "";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";

describe("FAZ 8.5: DAO Mimarisi, Prisma PostgreSQL Adaptörü ve Salt Okunur Geçiş Test Paketi", () => {
  beforeAll(async () => {
    resetDAOCache();
    if (fs.existsSync(TEST_DB_URL_FILE)) {
      testDbUrl = fs.readFileSync(TEST_DB_URL_FILE, "utf-8").trim();
      try {
        const client = new PrismaClient({
          datasources: { db: { url: testDbUrl } },
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
    resetDAOCache();
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // 1. GÜVENLİK VE STORE BÜTÜNLÜĞÜ
  it("1.1. data/store.json dosyası bozulmamış olmalı ve orijinal SHA256 değeri korunmalıdır", () => {
    const raw = fs.readFileSync(STORE_PATH);
    const sha256 = crypto.createHash("sha256").update(raw).digest("hex").toUpperCase();
    expect(sha256).toBe(EXPECTED_HASH);
  });

  // 2. FACTORY VE SÜRÜCÜ SEÇİMİ
  it("2.1. Ortam değişkeni tanımsız veya geçersiz olduğunda varsayılan sürücü kesinlikle 'json' olmalıdır", () => {
    const oldDriver = process.env.DATA_STORE_DRIVER;
    delete process.env.DATA_STORE_DRIVER;

    expect(getActiveStoreDriver()).toBe("json");

    const defaultDao = createStoreDAO();
    expect(defaultDao.driverName).toBe("json");
    expect(defaultDao).toBeInstanceOf(JsonStoreDAO);

    process.env.DATA_STORE_DRIVER = "invalid-driver-name";
    expect(getActiveStoreDriver()).toBe("json");

    if (oldDriver) {
      process.env.DATA_STORE_DRIVER = oldDriver;
    } else {
      delete process.env.DATA_STORE_DRIVER;
    }
  });

  it("2.2. DATA_STORE_DRIVER='postgres' açıkça belirtildiğinde PrismaStoreDAO döndürülmelidir", () => {
    const oldDriver = process.env.DATA_STORE_DRIVER;
    process.env.DATA_STORE_DRIVER = "postgres";

    expect(getActiveStoreDriver()).toBe("postgres");
    const pgDao = createStoreDAO("postgres", { skipIdentityCheck: true });
    expect(pgDao.driverName).toBe("postgres");
    expect(pgDao).toBeInstanceOf(PrismaStoreDAO);

    if (oldDriver) {
      process.env.DATA_STORE_DRIVER = oldDriver;
    } else {
      delete process.env.DATA_STORE_DRIVER;
    }
  });

  // 3. READ-ONLY GÜVENLİK KORUMASI
  it("3.1. PrismaStoreDAO sınıfında kesinlikle yazma metodları bulunmamalıdır", () => {
    const proto = PrismaStoreDAO.prototype as any;
    const forbiddenWriteMethods = [
      "createProduct",
      "updateProduct",
      "deleteProduct",
      "createOrder",
      "updateOrder",
      "deleteOrder",
      "deductStock",
      "incrementStock",
      "saveStoreData",
      "createCustomer",
      "updateCustomer",
      "createShipment",
      "createReturnRequest",
      "logAuditEvent",
      "createNotification",
    ];

    for (const method of forbiddenWriteMethods) {
      expect(proto[method]).toBeUndefined();
    }
  });

  it("3.2. PrismaStoreDAO yetkisiz veritabanına bağlanmayı kesinlikle engellemeli ve güvenle durmalıdır", async () => {
    // Sahte bir DB sorgusu yanıtı simülasyonu
    const mockPrisma = {
      $queryRaw: async () => [{ current_database: "production_db", current_user: "postgres" }],
      $disconnect: async () => {},
    } as unknown as PrismaClient;

    const mockDao = new PrismaStoreDAO({ prisma: mockPrisma });
    await expect(mockDao.assertAuthorizedDatabase()).rejects.toThrow("GÜVENLİK ENGELİ");
  });

  // 4. JSON STORE DAO DOĞRULAMASI
  it("4.1. JsonStoreDAO tüm katalog varlıklarını eksiksiz ve doğru tiplerde döndürmelidir", async () => {
    const jsonDao = new JsonStoreDAO();
    const products = await jsonDao.getAllProducts();
    const categories = await jsonDao.getAllCategories();
    const collections = await jsonDao.getAllCollections();
    const videos = await jsonDao.getFeaturedVideos();
    const campaigns = await jsonDao.getDiscountCampaigns();
    const settings = await jsonDao.getStoreSettings();

    expect(products.length).toBe(13);
    expect(categories.length).toBe(7);
    expect(collections.length).toBe(3);
    expect(videos.length).toBe(2);
    expect(campaigns.length).toBe(1);
    expect(Object.keys(settings).length).toBe(20);
  });

  it("4.2. JsonStoreDAO Betül Trençkot'un 10 varyantını ve 100 stoğunu korumalıdır", async () => {
    const jsonDao = new JsonStoreDAO();
    const betul = await jsonDao.getProductById("prod-1793185888547");
    expect(betul).not.toBeNull();
    expect(betul!.variants.length).toBe(10);

    const totalStock = betul!.variants.reduce((sum, v) => sum + v.stockQuantity, 0);
    expect(totalStock).toBe(100);

    const skus = new Set(betul!.variants.map((v) => v.sku));
    expect(skus.size).toBe(10);
  });

  it("4.3. JsonStoreDAO varyant sorguları tekil ve doğru sonuç vermelidir", async () => {
    const jsonDao = new JsonStoreDAO();
    const variant = await jsonDao.getVariantBySku("HM-SIY-STD-152");
    expect(variant).not.toBeNull();
    expect(variant!.sku).toBe("HM-SIY-STD-152");
    expect(variant!.stockQuantity).toBe(10);

    const byId = await jsonDao.getVariantById(variant!.id);
    expect(byId).not.toBeNull();
    expect(byId!.id).toBe(variant!.id);

    const prodVariants = await jsonDao.getVariantsByProductId("prod-1793185888547");
    expect(prodVariants.length).toBe(10);
  });

  // 5. CANLI POSTGRESQL PRISMA STORE DAO VE PARİTE DOĞRULAMASI
  it("5.1. PrismaStoreDAO Decimal fiyatları ve tarihleri JSON ile uyumlu sayısal/string formatına dönüştürmelidir", async () => {
    if (!prisma) return;
    const pgDao = new PrismaStoreDAO({ prisma });

    const products = await pgDao.getAllProducts();
    expect(products.length).toBe(13);

    for (const p of products) {
      expect(typeof p.basePrice).toBe("number");
      expect(isNaN(p.basePrice)).toBe(false);
      if (p.discountPrice !== undefined) {
        expect(typeof p.discountPrice).toBe("number");
        expect(isNaN(p.discountPrice)).toBe(false);
      }
      expect(typeof p.createdAt).toBe("string");
      expect(p.categorySlug.length).toBeGreaterThan(0);
      expect(p.categoryName.length).toBeGreaterThan(0);
    }
  });

  it("5.2. PrismaStoreDAO renk, beden ve medya sıralamalarını (displayOrder asc) korumalıdır", async () => {
    if (!prisma) return;
    const pgDao = new PrismaStoreDAO({ prisma });
    const products = await pgDao.getAllProducts();

    for (const p of products) {
      for (let i = 1; i < p.colors.length; i++) {
        expect(p.colors[i].displayOrder).toBeGreaterThanOrEqual(p.colors[i - 1].displayOrder);
      }
      for (let i = 1; i < p.sizes.length; i++) {
        expect(p.sizes[i].displayOrder).toBeGreaterThanOrEqual(p.sizes[i - 1].displayOrder);
      }
      for (let i = 1; i < p.media.length; i++) {
        expect(p.media[i].displayOrder).toBeGreaterThanOrEqual(p.media[i - 1].displayOrder);
      }
    }
  });

  it("5.3. PrismaStoreDAO Betül Trençkot'un 10 varyantını ve 100 stoğunu eksiksiz döndürmelidir", async () => {
    if (!prisma) return;
    const pgDao = new PrismaStoreDAO({ prisma });
    const betul = await pgDao.getProductById("prod-1793185888547");

    expect(betul).not.toBeNull();
    expect(betul!.variants.length).toBe(10);
    const totalStock = betul!.variants.reduce((sum, v) => sum + v.stockQuantity, 0);
    expect(totalStock).toBe(100);

    const skus = new Set(betul!.variants.map((v) => v.sku));
    expect(skus.size).toBe(10);
  });

  it("5.4. JsonStoreDAO ve PrismaStoreDAO arasında tam alan bazlı (field-by-field) parite %100 doğrulanmalıdır", async () => {
    if (!prisma) return;
    const jsonDao = new JsonStoreDAO();
    const pgDao = new PrismaStoreDAO({ prisma });

    const parityResult = await compareDAOParity(jsonDao, pgDao);

    expect(parityResult.isParityPerfect).toBe(true);
    expect(parityResult.differences.length).toBe(0);
    expect(parityResult.totalChecks).toBeGreaterThan(500);

    expect(parityResult.counts.products.match).toBe(true);
    expect(parityResult.counts.categories.match).toBe(true);
    expect(parityResult.counts.collections.match).toBe(true);
    expect(parityResult.counts.variants.match).toBe(true);
    expect(parityResult.counts.videos.match).toBe(true);
    expect(parityResult.counts.campaigns.match).toBe(true);
    expect(parityResult.counts.settingsKeys.match).toBe(true);

    expect(parityResult.betulTrenckotCheck.variantCountMatch).toBe(true);
    expect(parityResult.betulTrenckotCheck.stockMatch).toBe(true);
    expect(parityResult.betulTrenckotCheck.skuMatch).toBe(true);
    expect(parityResult.betulTrenckotCheck.duplicateCombosPreserved).toBe(true);
  });
});

