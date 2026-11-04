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
  StockWriteDAO,
  IdempotencyManager,
} from "../src/lib/server/dao";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const BETUL_ID = "prod-1793185888547";

let prisma: PrismaClient;
let testDbUrl: string;
const orderDao = new OrderWriteDAO();
const stockDao = new StockWriteDAO();

describe("FAZ 8.7: Kalıcı İdempotency, Çakışma Önleme ve Dağıtık İstek Güvenliği", () => {
  const cleanupTestData = async () => {
    const testOrders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            variantId: { startsWith: "test-faz87-idem" },
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

    // IdempotencyKey kayıtlarını temizle
    await prisma.$executeRawUnsafe(
      `DELETE FROM "IdempotencyKey" WHERE "key" LIKE 'test-faz87-%';`
    ).catch(() => {});

    await prisma.productVariant.deleteMany({
      where: { id: { startsWith: "test-faz87-idem" } },
    });
    await prisma.productColor.deleteMany({
      where: { id: { startsWith: "test-faz87-idem" } },
    });
    await prisma.productSize.deleteMany({
      where: { id: { startsWith: "test-faz87-idem" } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: "test-faz87-idem" } },
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

  // 2. KALICI İDEMPOTENCY ANAHTARI VE AYNI SONUCUN DÖNMESİ
  it("2.1. Aynı idempotency anahtarıyla yapılan mükerrer istekte aynı sipariş dönmeli, ikinci kez stok düşülmemelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-idem-p1-${Date.now()}`,
        title: "Idem Test Ürünü 1",
        slug: `test-idem-prod-1-${Date.now()}`,
        description: "Test",
        basePrice: 180,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz87-idem-c1-${Date.now()}`,
            name: "Test Lacivert",
            slug: "test-lacivert",
            colorCode: "#000080",
          },
        },
        sizes: {
          create: {
            id: `test-faz87-idem-s1-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-idem-v1-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-IDEM-SKU1-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    const idempotencyKey = `test-faz87-key-cod-${Date.now()}`;
    const orderInput = {
      idempotencyKey,
      customer: {
        fullName: "Derya Çetin",
        email: "derya.idem@example.com",
        phone: "05324445566",
        city: "Ankara",
        district: "Çankaya",
        fullAddress: "Tunalı Hilmi Cad. No:50",
      },
      items: [
        {
          productId: testProd.id,
          variantId: testVariant.id,
          sku: testVariant.sku,
          quantity: 1,
        },
      ],
    };

    // 1. İstek
    const firstRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, orderInput);
      },
      { prisma }
    );

    expect(firstRes.success).toBe(true);
    expect(firstRes.order).toBeDefined();

    // Stok 10 -> 9
    const stockAfterFirst = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockAfterFirst).toBe(9);

    // 2. İstek (Aynı anahtar, aynı payload - örn: ağ zaman aşımı tekrarı)
    const secondRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, orderInput);
      },
      { prisma }
    );

    expect(secondRes.success).toBe(true);
    expect(secondRes.idempotent).toBe(true);
    expect(secondRes.order.id).toBe(firstRes.order.id);
    expect(secondRes.order.orderNumber).toBe(firstRes.order.orderNumber);

    // Stok hâlâ 9 olmalı (mükerrer düşüş ENGELLENDİ)
    const stockAfterSecond = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockAfterSecond).toBe(9);
  });

  // 3. FARKLI ANAHTARLARLA MEŞRU AYRI SİPARİŞLERE İZİN VERİLMESİ
  it("3.1. Aynı müşteri kısa süre içinde farklı idempotency anahtarıyla yeni sipariş verdiğinde meşru sipariş açılabilmelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-idem-p2-${Date.now()}`,
        title: "Idem Test Ürünü 2",
        slug: `test-idem-prod-2-${Date.now()}`,
        description: "Test",
        basePrice: 150,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz87-idem-c2-${Date.now()}`,
            name: "Test Bordo",
            slug: "test-bordo",
            colorCode: "#800000",
          },
        },
        sizes: {
          create: {
            id: `test-faz87-idem-s2-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-idem-v2-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-IDEM-SKU2-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    // Müşteri 1. siparişi veriyor
    const res1 = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, {
          idempotencyKey: `test-faz87-distinct-1-${Date.now()}`,
          customer: {
            fullName: "Kemal Sunal",
            email: "kemal.orders@example.com",
            phone: "05553332211",
            city: "İzmir",
            district: "Bornova",
            fullAddress: "Üniversite Cad.",
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
    expect(res1.success).toBe(true);

    // Müşteri 5 saniye sonra aynı üründen kardeşi için 2. meşru siparişi veriyor (Farklı Idempotency Key)
    const res2 = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, {
          idempotencyKey: `test-faz87-distinct-2-${Date.now()}`,
          customer: {
            fullName: "Kemal Sunal",
            email: "kemal.orders@example.com",
            phone: "05553332211",
            city: "İzmir",
            district: "Bornova",
            fullAddress: "Üniversite Cad.",
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
    expect(res2.success).toBe(true);
    expect(res2.order.id).not.toBe(res1.order.id); // Ayrı meşru sipariş açıldı!

    // Stok 10 -> 8 olmalı (her iki sipariş için 1'er adet)
    const stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(8);
  });

  // 4. AYNI ANAHTARLA FARKLI SEPET / TUTAR GÖNDERİLDİĞİNDE RET (PAYLOAD MISMATCH)
  it("4.1. Aynı idempotency anahtarıyla farklı sepet veya tutar gönderilirse IDEMPOTENCY_PAYLOAD_MISMATCH hatası verilmelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-idem-p3-${Date.now()}`,
        title: "Idem Test Ürünü 3",
        slug: `test-idem-prod-3-${Date.now()}`,
        description: "Test",
        basePrice: 100,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz87-idem-c3-${Date.now()}`,
            name: "Test Yeşil",
            slug: "test-yesil",
            colorCode: "#00ff00",
          },
        },
        sizes: {
          create: {
            id: `test-faz87-idem-s3-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-idem-v3-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-IDEM-SKU3-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    const sharedKey = `test-faz87-mismatch-key-${Date.now()}`;

    // 1. Orijinal Sipariş (1 adet)
    const res1 = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, {
          idempotencyKey: sharedKey,
          customer: {
            fullName: "Oya Başar",
            email: "oya.mismatch@example.com",
            phone: "05338887766",
            city: "Adana",
            district: "Çukurova",
            fullAddress: "Baraj Yolu",
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
    expect(res1.success).toBe(true);

    // 2. Kötü Niyetli veya Değiştirilmiş İstek (Aynı anahtar ile bu kez 2 adet talep ediliyor!)
    let mismatchErrorCaught = false;
    try {
      await executePostgresTransaction(
        async (tx) => {
          return await orderDao.createCashOnDeliveryOrder(tx, {
            idempotencyKey: sharedKey, // AYNI ANAHTAR
            customer: {
              fullName: "Oya Başar",
              email: "oya.mismatch@example.com",
              phone: "05338887766",
              city: "Adana",
              district: "Çukurova",
              fullAddress: "Baraj Yolu",
            },
            items: [
              {
                productId: testProd.id,
                variantId: testVariant.id,
                sku: testVariant.sku,
                quantity: 2, // FARKLI MİKTAR!
              },
            ],
          });
        },
        { prisma }
      );
    } catch (err: any) {
      if (err.message.includes("IDEMPOTENCY_PAYLOAD_MISMATCH")) {
        mismatchErrorCaught = true;
      }
    }

    expect(mismatchErrorCaught).toBe(true);

    // Stok yalnızca ilk sipariş kadar (1 adet) düşmüş olmalı, 9 kalmalı
    const stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(9);
  });
});

