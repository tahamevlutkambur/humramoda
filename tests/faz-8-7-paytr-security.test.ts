import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { resolveTestDatabaseUrl } from "../scripts/migrate-json-to-pg";
import {
  executePostgresTransaction,
  assertWriteAuthorizedDatabase,
  OrderWriteDAO,
  PaymentWriteDAO,
  StockWriteDAO,
  computePayTRCallbackHash,
  verifyPayTRCallbackHash,
} from "../src/lib/server/dao";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const BETUL_ID = "prod-1793185888547";

const MOCK_MERCHANT_KEY = "test_merchant_key_1234567890123456";
const MOCK_MERCHANT_SALT = "test_salt_123456";

let prisma: PrismaClient;
let testDbUrl: string;
const orderDao = new OrderWriteDAO();
const paymentDao = new PaymentWriteDAO();
const stockDao = new StockWriteDAO();

describe("FAZ 8.7: PayTR Callback Güvenliği, HMAC Doğrulaması ve İdempotency Denetimi", () => {
  const cleanupTestData = async () => {
    const testOrders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            variantId: { startsWith: "test-faz87-paytr" },
          },
        },
      },
      select: { id: true },
    });
    const testOrderIds = testOrders.map((o) => o.id);
    if (testOrderIds.length > 0) {
      await prisma.paymentTransaction.deleteMany({
        where: { orderId: { in: testOrderIds } },
      });
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: testOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: testOrderIds } },
      });
    }

    await prisma.productVariant.deleteMany({
      where: { id: { startsWith: "test-faz87-paytr" } },
    });
    await prisma.productColor.deleteMany({
      where: { id: { startsWith: "test-faz87-paytr" } },
    });
    await prisma.productSize.deleteMany({
      where: { id: { startsWith: "test-faz87-paytr" } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: "test-faz87-paytr" } },
    });
  };

  beforeAll(async () => {
    testDbUrl = resolveTestDatabaseUrl();
    prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await prisma.$connect();
    await assertWriteAuthorizedDatabase(prisma);
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  // 1. DATA/STORE.JSON VE MAĞAZA GÜVENCESİ
  it("1.1. data/store.json SHA256 değeri ve Betül Trençkot stokları korunmalıdır", async () => {
    const raw = fs.readFileSync(STORE_PATH);
    const sha256 = crypto.createHash("sha256").update(raw).digest("hex").toUpperCase();
    expect(sha256).toBe(EXPECTED_HASH);

    const betulVariants = await prisma.productVariant.findMany({
      where: { productId: BETUL_ID },
    });
    expect(betulVariants).toHaveLength(10);
    const totalStock = betulVariants.reduce((sum, v) => sum + v.stockQuantity, 0);
    expect(totalStock).toBe(100);
  });

  // 2. RESMİ PAYTR HMAC PROTOKOLÜ VE TİMİNG-SAFE KARŞILAŞTIRMA
  it("2.1. HMAC formülü PayTR resmi sıralamasına (merchant_oid + merchant_salt + status + total_amount) uymalı ve timing-safe doğrulanmalıdır", () => {
    const merchantOid = "HM202611021234";
    const status = "success";
    const totalAmount = "35000"; // 350 TL = 35000 kuruş

    // Manuel beklenen HMAC
    const expectedStr = merchantOid + MOCK_MERCHANT_SALT + status + totalAmount;
    const manualHmac = crypto
      .createHmac("sha256", MOCK_MERCHANT_KEY)
      .update(expectedStr, "utf-8")
      .digest("base64");

    const computedHmac = computePayTRCallbackHash({
      merchantOid,
      status,
      totalAmount,
      merchantSalt: MOCK_MERCHANT_SALT,
      merchantKey: MOCK_MERCHANT_KEY,
    });

    expect(computedHmac).toBe(manualHmac);

    // Timing-safe doğrulama testi:
    const isValid = verifyPayTRCallbackHash(computedHmac, {
      merchantOid,
      status,
      totalAmount,
      merchantSalt: MOCK_MERCHANT_SALT,
      merchantKey: MOCK_MERCHANT_KEY,
    });
    expect(isValid).toBe(true);

    // Bozuk veya sahte imza reddedilmelidir:
    const isInvalid = verifyPayTRCallbackHash("sahte_hash_degeri", {
      merchantOid,
      status,
      totalAmount,
      merchantSalt: MOCK_MERCHANT_SALT,
      merchantKey: MOCK_MERCHANT_KEY,
    });
    expect(isInvalid).toBe(false);
  });

  // 3. DOĞRULANMIŞ CALLBACK İLE SİPARİŞ ONAYI VE STOK DÜŞÜMÜ
  it("3.1. Geçerli HMAC imzalı başarılı callback siparişi PAID yapmalı ve stokları atomik olarak tam 1 kez düşmelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-paytr-p1-${Date.now()}`,
        title: "PayTR Test Ürünü 1",
        slug: `test-paytr-prod-1-${Date.now()}`,
        description: "Test",
        basePrice: 200,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz87-paytr-c1-${Date.now()}`,
            name: "Test Siyah",
            slug: "test-siyah",
            colorCode: "#000000",
          },
        },
        sizes: {
          create: {
            id: `test-faz87-paytr-s1-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-paytr-v1-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-PAYTR-SKU1-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    // PENDING sipariş oluştur (200 TL + 150 TL kargo = 350 TL = 35000 kuruş)
    const orderRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createPendingOrder(tx, {
          customer: {
            fullName: "Buse Aydın",
            email: "buse.paytr@example.com",
            phone: "05321112233",
            city: "İstanbul",
            district: "Beşiktaş",
            fullAddress: "Barbaros Bulvarı No:1",
          },
          items: [
            {
              productId: testProd.id,
              variantId: testVariant.id,
              sku: testVariant.sku,
              quantity: 1,
            },
          ],
        });
      },
      { prisma }
    );

    expect(orderRes.success).toBe(true);
    const order = orderRes.order;
    const merchantOid = order.orderNumber.replace(/[^a-zA-Z0-9]/g, "");

    // Başarılı callback için gerçek HMAC üret
    const validHash = computePayTRCallbackHash({
      merchantOid,
      status: "success",
      totalAmount: order.totalKurus,
      merchantSalt: MOCK_MERCHANT_SALT,
      merchantKey: MOCK_MERCHANT_KEY,
    });

    // Callback'i uçtan uca doğrula ve işle
    const callbackRes = await executePostgresTransaction(
      async (tx) => {
        return await paymentDao.verifyAndProcessCallback(tx, {
          merchantOid,
          status: "success",
          totalAmount: order.totalKurus,
          hash: validHash,
          merchantKey: MOCK_MERCHANT_KEY,
          merchantSalt: MOCK_MERCHANT_SALT,
        });
      },
      { prisma }
    );

    expect(callbackRes.ok).toBe(true);
    expect(callbackRes.order.paymentStatus).toBe("PAID");
    expect(callbackRes.order.status).toBe("CONFIRMED");

    // Stok 10 -> 9 düşmüş olmalı
    const stockAfter = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockAfter).toBe(9);

    // 4. MÜKERRER CALLBACK İDempotency: İkinci kez geldiğinde stok tekrar düşülmemeli
    const duplicateRes = await executePostgresTransaction(
      async (tx) => {
        return await paymentDao.verifyAndProcessCallback(tx, {
          merchantOid,
          status: "success",
          totalAmount: order.totalKurus,
          hash: validHash,
          merchantKey: MOCK_MERCHANT_KEY,
          merchantSalt: MOCK_MERCHANT_SALT,
        });
      },
      { prisma }
    );

    expect(duplicateRes.ok).toBe(true);
    expect(duplicateRes.idempotent).toBe(true);

    const stockAfterDuplicate = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockAfterDuplicate).toBe(9); // Mükerrer stok düşüşü engellendi!
  });

  // 5. BAŞARISIZ ÖDEME BİLDİRİMİ VE SAHTE İMZA SALDIRISI
  it("5.1. Başarısız ödeme bildirimi siparişi asla PAID yapmamalı ve geçersiz imza derhal reddedilmelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-paytr-p2-${Date.now()}`,
        title: "PayTR Test Ürünü 2",
        slug: `test-paytr-prod-2-${Date.now()}`,
        description: "Test",
        basePrice: 400,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz87-paytr-c2-${Date.now()}`,
            name: "Test Beyaz",
            slug: "test-beyaz",
            colorCode: "#ffffff",
          },
        },
        sizes: {
          create: {
            id: `test-faz87-paytr-s2-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-paytr-v2-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-PAYTR-SKU2-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    const orderRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createPendingOrder(tx, {
          customer: {
            fullName: "Serkan Varol",
            email: "serkan.paytr@example.com",
            phone: "05332223344",
            city: "Bursa",
            district: "Osmangazi",
            fullAddress: "Heykel Meydanı",
          },
          items: [
            {
              productId: testProd.id,
              variantId: testVariant.id,
              sku: testVariant.sku,
              quantity: 1,
            },
          ],
        });
      },
      { prisma }
    );

    const order = orderRes.order;
    const merchantOid = order.orderNumber.replace(/[^a-zA-Z0-9]/g, "");

    // A. Sahte imza saldırısı testi:
    const fakeHashRes = await executePostgresTransaction(
      async (tx) => {
        return await paymentDao.verifyAndProcessCallback(tx, {
          merchantOid,
          status: "success",
          totalAmount: order.totalKurus,
          hash: "sahte_ve_gecersiz_hmac_imzasi",
          merchantKey: MOCK_MERCHANT_KEY,
          merchantSalt: MOCK_MERCHANT_SALT,
        });
      },
      { prisma }
    );

    expect(fakeHashRes.ok).toBe(false);
    expect(fakeHashRes.error).toMatch(/PAYTR_BAD_HASH/);

    // B. Başarısız ödeme (failed) testi:
    const failedHash = computePayTRCallbackHash({
      merchantOid,
      status: "failed",
      totalAmount: order.totalKurus,
      merchantSalt: MOCK_MERCHANT_SALT,
      merchantKey: MOCK_MERCHANT_KEY,
    });

    const failedRes = await executePostgresTransaction(
      async (tx) => {
        return await paymentDao.verifyAndProcessCallback(tx, {
          merchantOid,
          status: "failed",
          totalAmount: order.totalKurus,
          hash: failedHash,
          merchantKey: MOCK_MERCHANT_KEY,
          merchantSalt: MOCK_MERCHANT_SALT,
          failedReasonMsg: "Banka kart limiti yetersiz",
        });
      },
      { prisma }
    );

    expect(failedRes.ok).toBe(false);
    expect(failedRes.order.paymentStatus).toBe("FAILED");
    expect(failedRes.order.status).toBe("PENDING"); // ASLA CONFIRMED OLMAMALI

    // Stok eksilmemiş olmalıdır (10 adet duruyor)
    const stockAfter = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockAfter).toBe(10);
  });
});
