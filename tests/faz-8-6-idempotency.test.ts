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

describe("FAZ 8.6: Idempotency Protection for COD and PayTR Payments", () => {
  const cleanupTestData = async () => {
    const testOrders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            variantId: { startsWith: "test-faz86-idem" },
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
      where: { id: { startsWith: "test-faz86-idem" } },
    });
    await prisma.productColor.deleteMany({
      where: { id: { startsWith: "test-faz86-idem" } },
    });
    await prisma.productSize.deleteMany({
      where: { id: { startsWith: "test-faz86-idem" } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: "test-faz86-idem" } },
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

  // 2. KAPIDA ÖDEME (COD) İDEMPOTENCY TESTİ
  it("2.1. Aynı müşteri ve sepet ile ardışık gelen COD isteklerinde mükerrer sipariş açılmamalı ve stok tekrar düşülmemelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz86-idem-p1-${Date.now()}`,
        title: "Test Idem COD Ürünü",
        slug: `test-idem-cod-${Date.now()}`,
        description: "Test",
        basePrice: 200,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz86-idem-c1-${Date.now()}`,
            name: "Test Kahve",
            slug: "test-kahve",
            colorCode: "#663300",
          },
        },
        sizes: {
          create: {
            id: `test-faz86-idem-s1-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz86-idem-v1-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-IDEM-COD-SKU-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    const orderInput = {
      customer: {
        fullName: "Zeynep Kaya",
        email: `zeynep.idem.${Date.now()}@example.com`,
        phone: "05329998877",
        city: "Ankara",
        district: "Çankaya",
        fullAddress: "Atatürk Bulvarı No:100",
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

    // 1. COD Sipariş çağrısı
    const firstRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, orderInput);
      },
      { prisma }
    );

    expect(firstRes.success).toBe(true);
    expect(firstRes.order).toBeDefined();
    expect(firstRes.idempotent).toBeUndefined();

    // Stok 10 -> 9 olmalı
    const stockAfterFirst = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockAfterFirst).toBe(9);

    // 2. COD Sipariş çağrısı (Aynı müşteri, aynı sepet, hemen ardından)
    const secondRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, orderInput);
      },
      { prisma }
    );

    expect(secondRes.success).toBe(true);
    expect(secondRes.idempotent).toBe(true);
    expect(secondRes.order.id).toBe(firstRes.order.id);

    // Stok hâlâ 9 olmalı (Mükerrer stok düşümü ENGELLENDİ!)
    const stockAfterSecond = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockAfterSecond).toBe(9);

    // Veritabanında sadece 1 adet sipariş olmalı
    const totalMatchingOrders = await prisma.order.count({
      where: { customerEmail: orderInput.customer.email },
    });
    expect(totalMatchingOrders).toBe(1);
  });

  // 3. PAYTR CALLBACK VE ÖDEME İDEMPOTENCY TESTİ
  it("3.1. PayTR'dan gelen mükerrer success callback bildirimlerinde stok ikinci kez düşülmemeli ve OK dönmelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz86-idem-p2-${Date.now()}`,
        title: "Test Idem PayTR Ürünü",
        slug: `test-idem-paytr-${Date.now()}`,
        description: "Test",
        basePrice: 300,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz86-idem-c2-${Date.now()}`,
            name: "Test Mavi",
            slug: "test-mavi",
            colorCode: "#0000ff",
          },
        },
        sizes: {
          create: {
            id: `test-faz86-idem-s2-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz86-idem-v2-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-IDEM-PAYTR-SKU-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    // Pending Sipariş Aç
    const pendingOrderRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createPendingOrder(tx, {
          customer: {
            fullName: "Ayşe Çelik",
            email: `ayse.paytr.${Date.now()}@example.com`,
            phone: "05423334455",
            city: "İzmir",
            district: "Konak",
            fullAddress: "Kordon Boyu No:5",
          },
          items: [
            {
              productId: testProd.id,
              variantId: testVariant.id,
              sku: testVariant.sku,
              quantity: 2,
            },
          ],
        });
      },
      { prisma }
    );

    expect(pendingOrderRes.success).toBe(true);
    const order = pendingOrderRes.order;
    const merchantOid = order.orderNumber.replace(/[^a-zA-Z0-9]/g, "");

    // Ödeme Kaydı Aç
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

    // Stok henüz düşmedi (Pending olduğu için 10 adet duruyor)
    let stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(10);

    // 1. PayTR Success Bildirimi
    const firstPayRes = await executePostgresTransaction(
      async (tx) => {
        return await paymentDao.processPaymentConfirmation(tx, {
          merchantOid,
          status: "success",
          amountKurus: order.totalKurus,
        });
      },
      { prisma }
    );

    expect(firstPayRes.ok).toBe(true);
    expect(firstPayRes.idempotent).toBeUndefined();
    expect(firstPayRes.order.paymentStatus).toBe("PAID");

    // Stok 10 -> 8 düşmüş olmalı (2 adet sipariş)
    stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(8);

    // 2. PayTR Success Bildirimi (Mükerrer Webhook Teslimatı)
    const secondPayRes = await executePostgresTransaction(
      async (tx) => {
        return await paymentDao.processPaymentConfirmation(tx, {
          merchantOid,
          status: "success",
          amountKurus: order.totalKurus,
        });
      },
      { prisma }
    );

    expect(secondPayRes.ok).toBe(true);
    expect(secondPayRes.idempotent).toBe(true);

    // Stok hâlâ 8 olmalı (İkinci kez 2 adet düşülmedi!)
    stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(8);
  });

  // 4. SİPARİŞ İPTALİ (CANCEL) İDEMPOTENCY TESTİ
  it("4.1. Bir sipariş peş peşe iptal edildiğinde stok yalnızca 1 kez iade edilmeli, ikinci iptalde stok artmamalıdır", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz86-idem-p3-${Date.now()}`,
        title: "Test Idem İptal Ürünü",
        slug: `test-idem-cancel-${Date.now()}`,
        description: "Test",
        basePrice: 150,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz86-idem-c3-${Date.now()}`,
            name: "Test Yeşil",
            slug: "test-yesil",
            colorCode: "#00ff00",
          },
        },
        sizes: {
          create: {
            id: `test-faz86-idem-s3-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz86-idem-v3-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-IDEM-CANCEL-SKU-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    // COD siparişi ver (Stok 10 -> 9 olur)
    const codRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, {
          customer: {
            fullName: "Merve Yılmaz",
            email: `merve.cancel.${Date.now()}@example.com`,
            phone: "05335556677",
            city: "Bursa",
            district: "Nilüfer",
            fullAddress: "FSM Bulvarı No:12",
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

    expect(codRes.success).toBe(true);
    let stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(9);

    // 1. İptal Çağrısı (Stok 9 -> 10 geri dönmeli)
    const firstCancel = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.cancelOrder(tx, codRes.order.id, "Müşteri isteği");
      },
      { prisma }
    );

    expect(firstCancel.success).toBe(true);
    expect(firstCancel.stockRestored).toBe(true);
    expect(firstCancel.order.status).toBe("CANCELLED");

    stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(10);

    // 2. İptal Çağrısı (Mükerrer iptal: stok 10 kalmalı, 11 olmamalı!)
    const secondCancel = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.cancelOrder(tx, codRes.order.id, "Tekrar iptal denemesi");
      },
      { prisma }
    );

    expect(secondCancel.success).toBe(true);
    expect(secondCancel.idempotent).toBe(true);
    expect(secondCancel.stockRestored).toBe(false);

    stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(10);
  });
});
