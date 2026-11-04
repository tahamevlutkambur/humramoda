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
} from "../src/lib/server/dao";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const BETUL_ID = "prod-1793185888547";

let prisma: PrismaClient;
let testDbUrl: string;
const orderDao = new OrderWriteDAO();
const paymentDao = new PaymentWriteDAO();
const stockDao = new StockWriteDAO();

describe("FAZ 8.6: Transaction Rollback & Partial Failure Scenarios", () => {
  const cleanupTestData = async () => {
    const testOrders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            variantId: { startsWith: "test-faz86-rb" },
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
      where: { id: { startsWith: "test-faz86-rb" } },
    });
    await prisma.productColor.deleteMany({
      where: { id: { startsWith: "test-faz86-rb" } },
    });
    await prisma.productSize.deleteMany({
      where: { id: { startsWith: "test-faz86-rb" } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: "test-faz86-rb" } },
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

  // 1. DATA/STORE.JSON VE BETÜL TRENÇKOT VERİ GÜVENCESİ
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

  // 2. ORTA AŞAMADA HATA OLUŞMASI DURUMUNDA SIFIR KAYIT ROLLBACK
  it("2.1. Sipariş oluşturulduktan sonra ara aşamada hata fırlatıldığında veritabanında hiçbir artık kayıt kalmamalıdır", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz86-rb-p1-${Date.now()}`,
        title: "Test Rollback Ürünü 1",
        slug: `test-rb-prod-1-${Date.now()}`,
        description: "Test",
        basePrice: 250,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz86-rb-c1-${Date.now()}`,
            name: "Test Lacivert",
            slug: "test-lacivert",
            colorCode: "#000080",
          },
        },
        sizes: {
          create: {
            id: `test-faz86-rb-s1-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz86-rb-v1-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-RB-SKU1-${Date.now()}`,
        stockQuantity: 15,
      },
    });

    let generatedOrderId = "";
    let errorThrown = false;

    try {
      await executePostgresTransaction(
        async (tx) => {
          const res = await orderDao.createPendingOrder(tx, {
            customer: {
              fullName: "Canan Aksoy",
              email: "canan.rollback@example.com",
              phone: "05334445566",
              city: "Antalya",
              district: "Muratpaşa",
              fullAddress: "Lara Cad. No:20",
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

          expect(res.success).toBe(true);
          generatedOrderId = res.order.id;

          // Hata fırlatarak transaction'ı yarıda kes
          throw new Error("ÖDEME_AĞI_SIMULE_HATA");
        },
        { prisma }
      );
    } catch (err: any) {
      if (err.message.includes("ÖDEME_AĞI_SIMULE_HATA")) {
        errorThrown = true;
      }
    }

    expect(errorThrown).toBe(true);
    expect(generatedOrderId).toBeTruthy();

    // Veritabanı sorgusu: Sipariş ASLA kaydedilmemiş olmalıdır (Rollback tam çalıştı)
    const checkOrder = await prisma.order.findUnique({
      where: { id: generatedOrderId },
    });
    expect(checkOrder).toBeNull();

    const checkItems = await prisma.orderItem.findMany({
      where: { orderId: generatedOrderId },
    });
    expect(checkItems).toHaveLength(0);

    // Stok da 15 olarak kalmalıdır
    const stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(15);
  });

  // 3. ÇOK KALEMLİ SİPARİŞTE BİR ÜRÜNÜN STOK YETERSİZLİĞİ VE BÜTÜNSEL ROLLBACK
  it("3.1. İki ürünlü siparişte 1. ürünün stoku varken 2. ürünün stoku yetersizse 1. ürünün stoku düşmemeli ve sipariş açılmamalıdır", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz86-rb-p2-${Date.now()}`,
        title: "Test Rollback Ürünü 2",
        slug: `test-rb-prod-2-${Date.now()}`,
        description: "Test",
        basePrice: 100,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz86-rb-c2-${Date.now()}`,
            name: "Test Bordo",
            slug: "test-bordo",
            colorCode: "#800000",
          },
        },
        sizes: {
          create: {
            id: `test-faz86-rb-s2-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    // 1. varyant: 10 stok (yeterli)
    const varAmple = await prisma.productVariant.create({
      data: {
        id: `test-faz86-rb-va-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-RB-AMPLE-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    // 2. varyant: 0 stok (yetersiz)
    const varEmpty = await prisma.productVariant.create({
      data: {
        id: `test-faz86-rb-ve-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-RB-EMPTY-${Date.now()}`,
        stockQuantity: 0,
      },
    });

    let failedWithError = false;

    try {
      await executePostgresTransaction(
        async (tx) => {
          // COD siparişi oluşturmayı dene
          const res = await orderDao.createCashOnDeliveryOrder(tx, {
            customer: {
              fullName: "Burak Taş",
              email: "burak.partial@example.com",
              phone: "05352223344",
              city: "Adana",
              district: "Seyhan",
              fullAddress: "Ziyapaşa Bulv. No:1",
            },
            items: [
              {
                productId: testProd.id,
                variantId: varAmple.id,
                sku: varAmple.sku,
                quantity: 2,
              },
              {
                productId: testProd.id,
                variantId: varEmpty.id,
                sku: varEmpty.sku,
                quantity: 1, // Yetersiz stok!
              },
            ],
          });

          if (!res.success) {
            throw new Error(res.error || "Sipariş başarısız");
          }
        },
        { prisma }
      );
    } catch (err: any) {
      failedWithError = true;
      expect(err.message).toMatch(/yeterli stok|Yetersiz stok/);
    }

    expect(failedWithError).toBe(true);

    // Bütünsel Rollback Kontrolü:
    // 1. Ürünün stoku ASLA 8'e düşmemeli, 10 olarak kalmalıdır
    const stockAmple = await stockDao.getVariantStock(prisma as any, varAmple.id);
    expect(stockAmple).toBe(10);

    // 2. Ürünün stoku da 0 kalmalıdır
    const stockEmpty = await stockDao.getVariantStock(prisma as any, varEmpty.id);
    expect(stockEmpty).toBe(0);

    // Veritabanında Burak Taş adına hiçbir sipariş oluşmamış olmalıdır
    const burakOrder = await prisma.order.findFirst({
      where: { customerEmail: "burak.partial@example.com" },
    });
    expect(burakOrder).toBeNull();
  });

  // 4. TUTAR UYUŞMAZLIĞINDA ÖDEME REDDİ VE STOK DOKUNULMAZLIĞI
  it("4.1. PayTR tutarı sipariş tutarıyla uyuşmadığında ödeme reddedilmeli, sipariş PAID olmamalı ve stok düşülmemelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz86-rb-p3-${Date.now()}`,
        title: "Test Rollback Ürünü 3",
        slug: `test-rb-prod-3-${Date.now()}`,
        description: "Test",
        basePrice: 500,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz86-rb-c3-${Date.now()}`,
            name: "Test Gri",
            slug: "test-gri",
            colorCode: "#888888",
          },
        },
        sizes: {
          create: {
            id: `test-faz86-rb-s3-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz86-rb-v3-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-RB-PAYMISMATCH-${Date.now()}`,
        stockQuantity: 20,
      },
    });

    // Sipariş aç: 500 TL ürün + 150 TL kargo = 650 TL = 65000 kuruş
    const pendingRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createPendingOrder(tx, {
          customer: {
            fullName: "Emre Er",
            email: "emre.mismatch@example.com",
            phone: "05312345678",
            city: "Eskişehir",
            district: "Tepebaşı",
            fullAddress: "İsmet İnönü Cad.",
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

    expect(pendingRes.success).toBe(true);
    const order = pendingRes.order;
    expect(order.totalKurus).toBe(65000);

    const merchantOid = order.orderNumber.replace(/[^a-zA-Z0-9]/g, "");

    // Ödeme kaydı aç
    await executePostgresTransaction(
      async (tx) => {
        return await paymentDao.recordPaymentTransaction(tx, {
          orderId: order.id,
          merchantOid,
          amountKurus: order.totalKurus,
        });
      },
      { prisma }
    );

    // PayTR callback tutar uyuşmazlığı: 65000 kuruş yerine 30000 kuruş bildirildi
    const payRes = await executePostgresTransaction(
      async (tx) => {
        return await paymentDao.processPaymentConfirmation(tx, {
          merchantOid,
          status: "success",
          amountKurus: 30000, // UYUŞMAZLIK!
        });
      },
      { prisma }
    );

    expect(payRes.ok).toBe(false);
    expect(payRes.error).toMatch(/Tutar uyuşmazlığı/);

    // Sipariş durumu PAID olmamalı
    const orderAfter = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(orderAfter?.paymentStatus).toBe("PENDING");
    expect(orderAfter?.stockDeducted).toBe(false);

    // Stok 20 olarak korunmalı
    const stockAfter = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockAfter).toBe(20);
  });
});

