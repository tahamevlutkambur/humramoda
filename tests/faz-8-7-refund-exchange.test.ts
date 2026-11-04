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
  ReturnsWriteDAO,
} from "../src/lib/server/dao";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const BETUL_ID = "prod-1793185888547";

let prisma: PrismaClient;
let testDbUrl: string;
const orderDao = new OrderWriteDAO();
const paymentDao = new PaymentWriteDAO();
const stockDao = new StockWriteDAO();
const returnsDao = new ReturnsWriteDAO();

describe("FAZ 8.7: İptal, Kısmi İade, Değişim ve Bağımsız Finansal Mutabakat", () => {
  const cleanupTestData = async () => {
    const testOrders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            variantId: { startsWith: "test-faz87-ret" },
          },
        },
      },
      select: { id: true },
    });
    const testOrderIds = testOrders.map((o) => o.id);
    if (testOrderIds.length > 0) {
      // ReturnItem & ReturnRequest temizliği
      await prisma.returnItem.deleteMany({
        where: {
          returnRequest: {
            orderId: { in: testOrderIds },
          },
        },
      });
      await prisma.returnRequest.deleteMany({
        where: { orderId: { in: testOrderIds } },
      });
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
      where: { id: { startsWith: "test-faz87-ret" } },
    });
    await prisma.productColor.deleteMany({
      where: { id: { startsWith: "test-faz87-ret" } },
    });
    await prisma.productSize.deleteMany({
      where: { id: { startsWith: "test-faz87-ret" } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: "test-faz87-ret" } },
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

  // 2. KISMİ İADE TALEBİ VE ADET AŞIM ENGELİ
  it("2.1. İki adetli ürünün 1 adedi kısmi iade edilebilmeli, satın alınandan fazlası talep edilememelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-ret-p1-${Date.now()}`,
        title: "İade Test Ürünü 1",
        slug: `test-ret-prod-1-${Date.now()}`,
        description: "Test",
        basePrice: 200,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz87-ret-c1-${Date.now()}`,
            name: "Test Siyah",
            slug: "test-siyah",
            colorCode: "#000000",
          },
        },
        sizes: {
          create: {
            id: `test-faz87-ret-s1-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-ret-v1-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-RET-SKU1-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    // 2 Adet Satın Alındı ve Ödendi
    const orderRes = await executePostgresTransaction(
      async (tx) => {
        const pOrder = await orderDao.createPendingOrder(tx, {
          customer: {
            fullName: "Zehra Yurt",
            email: "zehra.return@example.com",
            phone: "05321113344",
            city: "İstanbul",
            district: "Şişli",
            fullAddress: "Halaskargazi Cad.",
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

        // Ödemeyi onayla ve stokları 10 -> 8 düş
        const merchantOid = pOrder.order!.orderNumber.replace(/[^a-zA-Z0-9]/g, "");
        await paymentDao.processPaymentConfirmation(tx, {
          merchantOid,
          status: "success",
          amountKurus: pOrder.order!.totalKurus,
        });

        return pOrder.order!;
      },
      { prisma }
    );

    const orderId = orderRes.id;
    const orderItem = await prisma.orderItem.findFirst({ where: { orderId } });
    expect(orderItem).toBeTruthy();
    expect(orderItem!.quantity).toBe(2);

    // Stok şu an 8
    let stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(8);

    // A. Hatalı Talep: 2 adet alınmışken 3 adet iade talep edilemez
    const excessiveRes = await executePostgresTransaction(
      async (tx) => {
        return await returnsDao.createReturnRequest(tx, {
          orderNumber: orderRes.orderNumber,
          customerEmail: "zehra.return@example.com",
          reason: "Beden büyük geldi",
          items: [
            {
              orderItemId: orderItem!.id,
              quantity: 3, // FAZLA ADET!
            },
          ],
        });
      },
      { prisma }
    );

    expect(excessiveRes.success).toBe(false);
    expect(excessiveRes.error).toMatch(/geçersiz adet|aşıldı/);

    // B. Geçerli Kısmi İade Talebi: 2 adetten 1 adedi iade ediliyor
    const validReturnRes = await executePostgresTransaction(
      async (tx) => {
        return await returnsDao.createReturnRequest(tx, {
          orderNumber: orderRes.orderNumber,
          customerEmail: "zehra.return@example.com",
          reason: "1 adetini iade etmek istiyorum",
          items: [
            {
              orderItemId: orderItem!.id,
              quantity: 1, // 1 Adet Kısmi
            },
          ],
        });
      },
      { prisma }
    );

    expect(validReturnRes.success).toBe(true);
    expect(Number(validReturnRes.returnRequest.requestedAmount)).toBe(200);

    // C. İade Onayı ve Yeniden Stoğa Alma (Stok 8 -> 9 olmalı)
    const approveRes = await executePostgresTransaction(
      async (tx) => {
        return await returnsDao.processReturnDecision(tx, {
          returnId: validReturnRes.returnRequest.id,
          decision: "APPROVED",
          restockDecision: "RESTOCKED",
        });
      },
      { prisma }
    );

    expect(approveRes.success).toBe(true);
    expect(approveRes.stockRestored).toBe(true);

    stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(9); // 1 Adet tam iade edildi

    // D. İdempotency Denetimi: Tekrar onay çağrıldığında stok 9'da kalmalı, 10 olmamalıdır
    const duplicateApprove = await executePostgresTransaction(
      async (tx) => {
        return await returnsDao.processReturnDecision(tx, {
          returnId: validReturnRes.returnRequest.id,
          decision: "APPROVED",
          restockDecision: "RESTOCKED",
        });
      },
      { prisma }
    );

    expect(duplicateApprove.success).toBe(true);
    expect(duplicateApprove.idempotent).toBe(true);
    expect(duplicateApprove.stockRestored).toBe(false);

    stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(9);
  });

  // 3. HASARLI ÜRÜN (DAMAGED_NOT_RESTOCKED) VE REDDEDİLEN İADE
  it("3.1. Hasarlı iadede (DAMAGED_NOT_RESTOCKED) veya reddedilen iadede stok artmamalıdır", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-ret-p2-${Date.now()}`,
        title: "İade Test Ürünü 2",
        slug: `test-ret-prod-2-${Date.now()}`,
        description: "Test",
        basePrice: 300,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz87-ret-c2-${Date.now()}`,
            name: "Test Gri",
            slug: "test-gri",
            colorCode: "#888888",
          },
        },
        sizes: {
          create: {
            id: `test-faz87-ret-s2-${Date.now()}`,
            name: "Standart",
            slug: "standart",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-ret-v2-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-RET-SKU2-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    const orderRes = await executePostgresTransaction(
      async (tx) => {
        const pOrder = await orderDao.createPendingOrder(tx, {
          customer: {
            fullName: "Murat Güven",
            email: "murat.damage@example.com",
            phone: "05335554433",
            city: "Bursa",
            district: "Nilüfer",
            fullAddress: "Ataevler",
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

        const merchantOid = pOrder.order!.orderNumber.replace(/[^a-zA-Z0-9]/g, "");
        await paymentDao.processPaymentConfirmation(tx, {
          merchantOid,
          status: "success",
          amountKurus: pOrder.order!.totalKurus,
        });

        return pOrder.order!;
      },
      { prisma }
    );

    const orderItem = await prisma.orderItem.findFirst({ where: { orderId: orderRes.id } });
    let stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(8); // 10 - 2

    // 1. Talep: Hasarlı Ürün (Kullanıcı ürünü yırtmış, kabul edildi ama stoğa alınamaz)
    const ret1 = await executePostgresTransaction(
      async (tx) => {
        const created = await returnsDao.createReturnRequest(tx, {
          orderNumber: orderRes.orderNumber,
          customerEmail: "murat.damage@example.com",
          reason: "Kumaş yırtık",
          items: [{ orderItemId: orderItem!.id, quantity: 1 }],
        });

        return await returnsDao.processReturnDecision(tx, {
          returnId: created.returnRequest.id,
          decision: "APPROVED",
          restockDecision: "DAMAGED_NOT_RESTOCKED", // Hasarlı, stoka eklenemez!
        });
      },
      { prisma }
    );

    expect(ret1.success).toBe(true);
    expect(ret1.stockRestored).toBe(false);

    // Stok 8 kalmalı (hasarlı ürün stoka girmedi)
    stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(8);

    // 2. Talep: Kalan 1 adet için keyfi iade talebi -> REDDEDİLDİ
    const ret2 = await executePostgresTransaction(
      async (tx) => {
        const created = await returnsDao.createReturnRequest(tx, {
          orderNumber: orderRes.orderNumber,
          customerEmail: "murat.damage@example.com",
          reason: "Keyfi ret denemesi",
          items: [{ orderItemId: orderItem!.id, quantity: 1 }],
        });

        return await returnsDao.processReturnDecision(tx, {
          returnId: created.returnRequest.id,
          decision: "REJECTED",
          restockDecision: "REJECTED",
        });
      },
      { prisma }
    );

    expect(ret2.success).toBe(true);
    expect(ret2.stockRestored).toBe(false);
    expect(ret2.returnRequest.status).toBe("REJECTED");

    // Stok hâlâ 8 kalmalı
    stock = await stockDao.getVariantStock(prisma as any, testVariant.id);
    expect(stock).toBe(8);
  });

  // 4. DEĞİŞİM (EXCHANGE) AKIŞI VE HEDEF ÜRÜN STOK KONTROLÜ
  it("4.1. Değişim talebinde yeni varyantın stoku yetersizse talep reddedilmeli, yeterliyse yeni ürün düşülüp eski ürün iade edilmelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-ret-p3-${Date.now()}`,
        title: "Değişim Test Ürünü",
        slug: `test-ret-exchange-${Date.now()}`,
        description: "Test",
        basePrice: 250,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz87-ret-c3-${Date.now()}`,
            name: "Test Haki",
            slug: "test-haki",
            colorCode: "#4B5320",
          },
        },
        sizes: {
          create: [
            { id: `test-faz87-ret-s3a-${Date.now()}`, name: "S Beden", slug: "s" },
            { id: `test-faz87-ret-s3b-${Date.now()}`, name: "M Beden", slug: "m" },
            { id: `test-faz87-ret-s3c-${Date.now()}`, name: "L Beden", slug: "l" },
          ],
        },
      },
      include: { colors: true, sizes: true },
    });

    // Eski varyant: S beden (stok: 10)
    const varS = await prisma.productVariant.create({
      data: {
        id: `test-faz87-ret-vs-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-EXCH-S-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    // Hedef varyant 1: M beden (stok: 0 - YETERSİZ)
    const varEmpty = await prisma.productVariant.create({
      data: {
        id: `test-faz87-ret-vm-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[1].id,
        sku: `TEST-EXCH-M-${Date.now()}`,
        stockQuantity: 0,
      },
    });

    // Hedef varyant 2: L beden (stok: 5 - YETERLİ)
    const varAmple = await prisma.productVariant.create({
      data: {
        id: `test-faz87-ret-vl-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[2].id,
        sku: `TEST-EXCH-L-${Date.now()}`,
        stockQuantity: 5,
      },
    });

    // Müşteri S bedeni satın alıyor (Stok S: 10 -> 9)
    const orderRes = await executePostgresTransaction(
      async (tx) => {
        const pOrder = await orderDao.createPendingOrder(tx, {
          customer: {
            fullName: "Elif Korkmaz",
            email: "elif.exchange@example.com",
            phone: "05327778899",
            city: "Antalya",
            district: "Konyaaltı",
            fullAddress: "Liman Mah.",
          },
          items: [{ productId: testProd.id, variantId: varS.id, sku: varS.sku, quantity: 1 }],
        });

        const merchantOid = pOrder.order!.orderNumber.replace(/[^a-zA-Z0-9]/g, "");
        await paymentDao.processPaymentConfirmation(tx, {
          merchantOid,
          status: "success",
          amountKurus: pOrder.order!.totalKurus,
        });

        return pOrder.order!;
      },
      { prisma }
    );

    const orderItem = await prisma.orderItem.findFirst({ where: { orderId: orderRes.id } });
    let stockS = await stockDao.getVariantStock(prisma as any, varS.id);
    expect(stockS).toBe(9);

    // Müşteri S bedeni M bedenle (stoku 0 olan) değiştirmek istiyor
    const exchReq1 = await executePostgresTransaction(
      async (tx) => {
        return await returnsDao.createReturnRequest(tx, {
          orderNumber: orderRes.orderNumber,
          customerEmail: "elif.exchange@example.com",
          requestType: "EXCHANGE",
          reason: "Beden dar geldi",
          items: [{ orderItemId: orderItem!.id, quantity: 1 }],
        });
      },
      { prisma }
    );

    // A. Stok yetersiz olduğu için M beden değişimi ONAYLANAMAZ
    const failExch = await executePostgresTransaction(
      async (tx) => {
        return await returnsDao.processExchangeDecision(tx, {
          returnId: exchReq1.returnRequest.id,
          targetVariantId: varEmpty.id,
          targetQuantity: 1,
          decision: "APPROVED",
        });
      },
      { prisma }
    );

    expect(failExch.success).toBe(false);
    expect(failExch.error).toMatch(/DEĞİŞİM_STOK_YETERSİZ/);

    // B. Yeterli stoğu olan L beden ile değişim onaylanıyor
    const successExch = await executePostgresTransaction(
      async (tx) => {
        return await returnsDao.processExchangeDecision(tx, {
          returnId: exchReq1.returnRequest.id,
          targetVariantId: varAmple.id, // L beden (5 adet var)
          targetQuantity: 1,
          decision: "APPROVED",
        });
      },
      { prisma }
    );

    expect(successExch.success).toBe(true);
    expect(successExch.returnRequest.status).toBe("APPROVED");

    // Stok Kontrolleri:
    // S beden iade edildi: 9 -> 10 oldu
    stockS = await stockDao.getVariantStock(prisma as any, varS.id);
    expect(stockS).toBe(10);

    // L beden müşteriye verildi: 5 -> 4 oldu
    const stockL = await stockDao.getVariantStock(prisma as any, varAmple.id);
    expect(stockL).toBe(4);
  });

  // 5. BAĞIMSIZ FİNANSAL MUTABAKAT (REFUND VERIFICATION)
  it("5.1. Para iadesi banka referansı olmadan REFUND_COMPLETED olamaz; doğrulandığında sipariş iade tutarı güncellenmelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-ret-p4-${Date.now()}`,
        title: "Finansal İade Ürünü",
        slug: `test-ret-refund-${Date.now()}`,
        description: "Test",
        basePrice: 500,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz87-ret-c4-${Date.now()}`,
            name: "Test Mavi",
            slug: "test-mavi",
            colorCode: "#0000ff",
          },
        },
        sizes: {
          create: { id: `test-faz87-ret-s4-${Date.now()}`, name: "Standart", slug: "standart" },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-ret-v4-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-REFUND-SKU-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    // 500 TL ürün + 150 TL kargo = 650 TL sipariş
    const orderRes = await executePostgresTransaction(
      async (tx) => {
        const pOrder = await orderDao.createPendingOrder(tx, {
          customer: {
            fullName: "Hasan Can",
            email: "hasan.refund@example.com",
            phone: "05319998877",
            city: "Trabzon",
            district: "Ortahisar",
            fullAddress: "Meydan Parkı",
          },
          items: [{ productId: testProd.id, variantId: testVariant.id, sku: testVariant.sku, quantity: 1 }],
        });

        const merchantOid = pOrder.order!.orderNumber.replace(/[^a-zA-Z0-9]/g, "");
        await paymentDao.processPaymentConfirmation(tx, {
          merchantOid,
          status: "success",
          amountKurus: pOrder.order!.totalKurus,
        });

        return pOrder.order!;
      },
      { prisma }
    );

    const orderItem = await prisma.orderItem.findFirst({ where: { orderId: orderRes.id } });

    // İade talebi oluştur: 500 TL
    const retReq = await executePostgresTransaction(
      async (tx) => {
        return await returnsDao.createReturnRequest(tx, {
          orderNumber: orderRes.orderNumber,
          customerEmail: "hasan.refund@example.com",
          reason: "Beğenmedim",
          items: [{ orderItemId: orderItem!.id, quantity: 1 }],
        });
      },
      { prisma }
    );

    // A. Doğrulama olmaksızın REFUND_COMPLETED denemesi -> RED
    const unverifiedRefund = await executePostgresTransaction(
      async (tx) => {
        return await returnsDao.processRefundVerification(tx, {
          returnId: retReq.returnRequest.id,
          actualRefundVerified: false, // DOĞRULANMADI
          refundTransactionRef: "",
        });
      },
      { prisma }
    );

    expect(unverifiedRefund.success).toBe(false);

    // B. Gerçek banka / PayTR iade referansı ile doğrulama -> BAŞARILI
    const verifiedRefund = await executePostgresTransaction(
      async (tx) => {
        return await returnsDao.processRefundVerification(tx, {
          returnId: retReq.returnRequest.id,
          actualRefundVerified: true,
          refundTransactionRef: "PAYTR_REFUND_TX_987654321",
        });
      },
      { prisma }
    );

    expect(verifiedRefund.success).toBe(true);
    expect(verifiedRefund.returnRequest.status).toBe("REFUND_COMPLETED");
    expect(verifiedRefund.returnRequest.actualRefundVerified).toBe(true);

    // Siparişteki iade tutarı 500 TL olmalı
    const orderAfter = await prisma.order.findUnique({ where: { id: orderRes.id } });
    expect(Number(orderAfter?.refundedAmount)).toBe(500);
  });
});

