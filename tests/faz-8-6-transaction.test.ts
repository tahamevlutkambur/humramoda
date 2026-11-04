import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { resolveTestDatabaseUrl } from "../scripts/migrate-json-to-pg";
import {
  executePostgresTransaction,
  assertWriteAuthorizedDatabase,
  EXPECTED_TEST_DATABASE,
  EXPECTED_TEST_USER,
  OrderWriteDAO,
  StockWriteDAO,
} from "../src/lib/server/dao";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const BETUL_ID = "prod-1793185888547";

let prisma: PrismaClient;
let testDbUrl: string;

describe("FAZ 8.6: PostgreSQL Transaction Runner & ACID Guarantees", () => {
  beforeAll(async () => {
    testDbUrl = resolveTestDatabaseUrl();
    prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await prisma.$connect();
    await assertWriteAuthorizedDatabase(prisma);
  });

  afterAll(async () => {
    // Sentetik test verilerini temizle
    await prisma.paymentTransaction.deleteMany({
      where: { orderId: { startsWith: "test-faz86" } },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: { startsWith: "test-faz86" } },
    });
    await prisma.order.deleteMany({
      where: { id: { startsWith: "test-faz86" } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { startsWith: "test-faz86" } },
    });
    await prisma.productColor.deleteMany({
      where: { id: { startsWith: "test-faz86" } },
    });
    await prisma.productSize.deleteMany({
      where: { id: { startsWith: "test-faz86" } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: "test-faz86" } },
    });

    await prisma.$disconnect();
  });

  // 1. DATA/STORE.JSON VE MAĞAZA GÜVENLİĞİ
  it("1.1. data/store.json SHA256 değeri ve Betül Trençkot stokları değişmemiş olmalıdır", async () => {
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

  // 2. GÜVENLİK KİMLİK DENETİMİ (DB IDENTITY ASSERTION)
  it("2.1. assertWriteAuthorizedDatabase hedef DB ve kullanıcıyı doğrulamalı, uyumsuzlukta hata fırlatmalıdır", async () => {
    // Doğru bağlantıda başarılı olmalı
    await expect(assertWriteAuthorizedDatabase(prisma)).resolves.not.toThrow();

    // Sahte client ile yetki aşımı denemesi
    const fakeClient = {
      $queryRaw: async () => [{ current_database: "production_db", current_user: "postgres" }],
    } as any;

    await expect(assertWriteAuthorizedDatabase(fakeClient)).rejects.toThrow(
      /GÜVENLİK ENGELİ/
    );
  });

  // 3. TRANSACTION ÇALIŞTIRMA VE BAŞARILI COMMIT
  it("3.1. executePostgresTransaction içinde çalıştırılan işlemler başarılı olduğunda commit edilmelidir", async () => {
    const result = await executePostgresTransaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ result: number }>>`SELECT 1 + 1 as result;`;
        return rows[0].result;
      },
      { prisma }
    );

    expect(result).toBe(2);
  });

  // 4. ATOMICITY VE HATA ANINDA TAM ROLLBACK
  it("4.1. Sipariş kaydı açılıp ardından hata fırlatıldığında hiçbir sipariş veya sipariş kalemi kalmamalıdır", async () => {
    const testOrderId = `test-faz86-tx-${Date.now()}`;
    const testOrderNumber = `HM-TEST-TX-${Date.now()}`;

    // Category tespit et
    const cat = await prisma.category.findFirst();
    expect(cat).toBeTruthy();

    // Sentetik ürün ve varyant oluştur
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz86-p-${Date.now()}`,
        title: "Test Transaction Ürünü",
        slug: `test-tx-prod-${Date.now()}`,
        description: "Test açıklaması",
        basePrice: 500,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz86-c-${Date.now()}`,
            name: "Test Siyah",
            slug: "test-siyah",
            colorCode: "#000000",
          },
        },
        sizes: {
          create: {
            id: `test-faz86-s-${Date.now()}`,
            name: "Test S",
            slug: "test-s",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz86-v-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-TX-SKU-${Date.now()}`,
        stockQuantity: 20,
      },
    });

    // Transaction başlat, sipariş yaz, ortasında hata fırlat
    let errorCaught = false;
    try {
      await executePostgresTransaction(
        async (tx) => {
          await tx.order.create({
            data: {
              id: testOrderId,
              orderNumber: testOrderNumber,
              customerFullName: "Test Müşteri",
              customerEmail: "test@humramoda.com",
              customerPhone: "05551112233",
              subtotal: 500,
              totalAmount: 650,
              totalKurus: 65000,
              shippingAddress: { city: "İstanbul", district: "Kadıköy", fullAddress: "Test Cad." },
              items: {
                create: {
                  productId: testProd.id,
                  variantId: testVariant.id,
                  productName: testProd.title,
                  colorName: "Test Siyah",
                  sizeName: "Test S",
                  sku: testVariant.sku,
                  price: 500,
                  quantity: 1,
                  totalPrice: 500,
                },
              },
            },
          });

          // Simüle edilmiş ara hata
          throw new Error("SİMÜLE_EDİLMİŞ_TRANSACTION_HATASI");
        },
        { prisma }
      );
    } catch (err: any) {
      if (err.message.includes("SİMÜLE_EDİLMİŞ_TRANSACTION_HATASI")) {
        errorCaught = true;
      }
    }

    expect(errorCaught).toBe(true);

    // Rollback kontrolü: Veritabanında sipariş veya kalemi bulunmamalıdır
    const savedOrder = await prisma.order.findUnique({
      where: { id: testOrderId },
    });
    expect(savedOrder).toBeNull();

    const savedItems = await prisma.orderItem.findMany({
      where: { orderId: testOrderId },
    });
    expect(savedItems).toHaveLength(0);

    // Stok da asla değişmemiş olmalıdır
    const variantAfter = await prisma.productVariant.findUnique({
      where: { id: testVariant.id },
    });
    expect(variantAfter?.stockQuantity).toBe(20);
  });
});

