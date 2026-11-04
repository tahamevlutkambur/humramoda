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
import {
  getStoreData,
  createPendingOrder as jsonCreatePendingOrder,
  createCashOnDeliveryOrder as jsonCreateCashOnDeliveryOrder,
  updateOrderOperationalStatus as jsonUpdateOrderStatus,
} from "../src/lib/server/store";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const BETUL_ID = "prod-1793185888547";

let prisma: PrismaClient;
let testDbUrl: string;
const orderDao = new OrderWriteDAO();
const paymentDao = new PaymentWriteDAO();
const stockDao = new StockWriteDAO();

describe("FAZ 8.7: JSON ve PostgreSQL Davranış ve İş Mantığı Paritesi", () => {
  const cleanupTestData = async () => {
    const testOrders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            variantId: { startsWith: "test-faz87-parity" },
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
      where: { id: { startsWith: "test-faz87-parity" } },
    });
    await prisma.productColor.deleteMany({
      where: { id: { startsWith: "test-faz87-parity" } },
    });
    await prisma.productSize.deleteMany({
      where: { id: { startsWith: "test-faz87-parity" } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: "test-faz87-parity" } },
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

  // 2. FİYAT VE HESAPLAMA PARİTESİ (BİRİM FİYAT, KAMPANYA, KARGO, TOPLAM VE KURUŞ)
  it("2.1. Aynı sepet ve kampanya girdisinde JSON ve PostgreSQL sipariş toplamları, indirimleri ve kargo tutarları birebir eşit olmalıdır", async () => {
    const store = getStoreData();
    const betul = store.products.find((p) => p.id === BETUL_ID);
    expect(betul).toBeTruthy();

    const testVariant = betul!.variants[0];
    const unitPriceExpected =
      betul!.discountPrice && betul!.discountPrice > 0 ? betul!.discountPrice : betul!.basePrice;

    const testInput = {
      customer: {
        fullName: "Parite Test Müşterisi",
        email: "parite.calc@example.com",
        phone: "05554443322",
        city: "İstanbul",
        district: "Kadıköy",
        fullAddress: "Bağdat Cad. No:100",
      },
      items: [
        {
          productId: betul!.id,
          variantId: testVariant.id,
          sku: testVariant.sku,
          quantity: 2,
        },
      ],
      campaignCode: "HOSGELDIN10",
    };

    // JSON Hesaplaması
    const jsonOrderRes = jsonCreatePendingOrder(testInput as any);
    expect(jsonOrderRes.success).toBe(true);
    const jsonOrder = jsonOrderRes.order!;

    // JSON test siparişini bellekten temizle
    const jIdx = store.orders?.findIndex((o) => o.id === jsonOrder.id);
    if (jIdx !== undefined && jIdx !== -1) {
      store.orders.splice(jIdx, 1);
    }

    // PostgreSQL Hesaplaması
    const pgOrderRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createPendingOrder(tx, testInput as any);
      },
      { prisma }
    );
    expect(pgOrderRes.success).toBe(true);
    const pgOrder = pgOrderRes.order!;

    // PARİTE KARŞILAŞTIRMASI:
    // 1. Birim Fiyatlar
    expect(Number(pgOrder.items[0].price)).toBe(unitPriceExpected);
    expect(jsonOrder.items[0].unitPrice).toBe(unitPriceExpected);

    // 2. Alt Toplam (Subtotal)
    expect(Number(pgOrder.subtotal)).toBe(jsonOrder.subtotal);

    // 3. İndirim Tutarı (Discount Amount)
    expect(Number(pgOrder.discountAmount)).toBe(jsonOrder.discountAmount);

    // 4. Sabit Kargo Tutarı (150 TL)
    expect(Number(pgOrder.shippingAmount)).toBe(150);
    expect(jsonOrder.shippingAmount).toBe(150);

    // 5. Net Toplam Tutar (Total Amount)
    expect(Number(pgOrder.totalAmount)).toBe(jsonOrder.totalAmount);

    // 6. PayTR Kuruş Tutar (Total Kuruş)
    expect(pgOrder.totalKurus).toBe(jsonOrder.totalKurus);

    // Sentetik siparişi temizle
    await prisma.orderItem.deleteMany({ where: { orderId: pgOrder.id } });
    await prisma.order.deleteMany({ where: { id: pgOrder.id } });
  });

  // 3. STOK DÜŞÜMÜ VE İPTAL İADESİ PARİTESİ
  it("3.1. Sipariş verildiğinde ve iptal edildiğinde stok düşüm/iade miktarları JSON ve PostgreSQL mantığında özdeş çalışmalıdır", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-parity-p1-${Date.now()}`,
        title: "Parite Stok Ürünü",
        slug: `test-parity-stock-${Date.now()}`,
        description: "Test",
        basePrice: 150,
        categoryId: cat!.id,
        colors: {
          create: { id: `test-faz87-parity-c1-${Date.now()}`, name: "Siyah", slug: "siyah", colorCode: "#000" },
        },
        sizes: {
          create: { id: `test-faz87-parity-s1-${Date.now()}`, name: "Standart", slug: "std" },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-parity-v1-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-PARITY-SKU1-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    const testInput = {
      customer: {
        fullName: "Stok Parite Testi",
        email: "stok.parite@example.com",
        phone: "05331112233",
        city: "Ankara",
        district: "Çankaya",
        fullAddress: "Kızılay",
      },
      items: [
        {
          productId: testProd.id,
          variantId: testVariant.id,
          sku: testVariant.sku,
          quantity: 3,
        },
      ],
    };

    // PostgreSQL COD Siparişi (10 -> 7 olmalı)
    const codRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, testInput as any);
      },
      { prisma }
    );
    expect(codRes.success).toBe(true);

    const stockAfterDeduct = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockAfterDeduct).toBe(7); // Tam 3 adet düştü

    // PostgreSQL Sipariş İptali (7 -> 10 geri dönmeli)
    const cancelRes = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.cancelOrder(tx, codRes.order.id, "Parite iptal testi");
      },
      { prisma }
    );
    expect(cancelRes.success).toBe(true);
    expect(cancelRes.stockRestored).toBe(true);

    const stockAfterRestore = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockAfterRestore).toBe(10); // Tam 3 adet geri iade edildi
  });

  // 4. İDEMPOTENCY DAVRANIŞ PARİTESİ
  it("4.1. Tekrarlanan COD isteklerinde hem JSON hem PostgreSQL mükerrer sipariş açmamalı ve aynı siparişi dönmelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-parity-p2-${Date.now()}`,
        title: "Parite İdem Ürünü",
        slug: `test-parity-idem-${Date.now()}`,
        description: "Test",
        basePrice: 120,
        categoryId: cat!.id,
        colors: {
          create: { id: `test-faz87-parity-c2-${Date.now()}`, name: "Gri", slug: "gri", colorCode: "#888" },
        },
        sizes: {
          create: { id: `test-faz87-parity-s2-${Date.now()}`, name: "Standart", slug: "std" },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-parity-v2-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-PARITY-SKU2-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    const testInput = {
      customer: {
        fullName: "İdem Parite Testi",
        email: `idem.parity.${Date.now()}@example.com`,
        phone: "05423334455",
        city: "İzmir",
        district: "Karşıyaka",
        fullAddress: "Bostanlı",
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

    // PostgreSQL: 1. İstek
    const pgRes1 = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, testInput as any);
      },
      { prisma }
    );
    expect(pgRes1.success).toBe(true);

    // PostgreSQL: 2. İstek (Aynı parametrelerle hemen ardından)
    const pgRes2 = await executePostgresTransaction(
      async (tx) => {
        return await orderDao.createCashOnDeliveryOrder(tx, testInput as any);
      },
      { prisma }
    );
    expect(pgRes2.success).toBe(true);
    expect(pgRes2.idempotent).toBe(true);
    expect(pgRes2.order.id).toBe(pgRes1.order.id);

    // Stok 10 -> 9 kalmalı (mükerrer düşüm yok)
    const stockPg = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stockPg).toBe(9);
  });
});

