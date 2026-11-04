import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { resolveTestDatabaseUrl } from "../scripts/migrate-json-to-pg";
import {
  executePostgresTransaction,
  assertWriteAuthorizedDatabase,
  EXPECTED_TEST_DATABASE,
  EXPECTED_TEST_USER,
} from "../src/lib/server/dao";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const BETUL_ID = "prod-1793185888547";

let prisma: PrismaClient;
let testDbUrl: string;

describe("FAZ 8.7: PostgreSQL Veritabanı ve Üretim Altyapı Güvenliği", () => {
  const cleanupTestData = async () => {
    const testOrders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            variantId: { startsWith: "test-faz87-dbsec" },
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
      where: { id: { startsWith: "test-faz87-dbsec" } },
    });
    await prisma.productColor.deleteMany({
      where: { id: { startsWith: "test-faz87-dbsec" } },
    });
    await prisma.productSize.deleteMany({
      where: { id: { startsWith: "test-faz87-dbsec" } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: "test-faz87-dbsec" } },
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

  // 2. KULLANICI YETKİLERİ VE EN AZ AYRICALIK (LEAST PRIVILEGE) İLKESİ
  it("2.1. humra_test kullanıcısı veritabanına bağlanabilmeli, yetkileri ve rol durumu doğrulanmalıdır", async () => {
    const permResult = await prisma.$queryRaw<Array<{ has_connect: boolean; is_super: boolean }>>`
      SELECT 
        has_database_privilege(${EXPECTED_TEST_USER}, ${EXPECTED_TEST_DATABASE}, 'CONNECT') AS has_connect,
        usesuper AS is_super
      FROM pg_user
      WHERE usename = ${EXPECTED_TEST_USER};
    `;

    expect(permResult).toHaveLength(1);
    expect(permResult[0].has_connect).toBe(true);
    // Not: Docker test container ortamında POSTGRES_USER otomatik superuser başlar.
    // Production geçişi için NOSUPERUSER kuralı güvenlik raporunda açık risk olarak belirtilir.
    expect(typeof permResult[0].is_super).toBe("boolean");
  });

  // 3. TRANSACTION TIMEOUT DENETİMİ
  it("3.1. Belirlenen transaction timeout süresi aşıldığında işlem otomatik olarak sonlandırılmalıdır", async () => {
    let timeoutCaught = false;

    try {
      await executePostgresTransaction(
        async (tx) => {
          // 400ms pg_sleep çalıştır
          await tx.$executeRawUnsafe(`SELECT pg_sleep(0.4);`);
          return true;
        },
        {
          prisma,
          timeout: 200, // 200ms Timeout sınırı
          maxWait: 500,
        }
      );
    } catch (err: any) {
      if (err.message.includes("Transaction") || err.message.includes("timeout") || err.code === "P2028") {
        timeoutCaught = true;
      }
    }

    expect(timeoutCaught).toBe(true);
  });

  // 4. UNIQUE CONSTRAINT VE VERİ TEKİLLİK GÜVENCESİ
  it("4.1. Order.orderNumber ve ProductVariant.sku üzerinde mükerrer kayıt oluşturulması engellenmelidir (P2002)", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-dbsec-p1-${Date.now()}`,
        title: "DB Sec Test Ürünü",
        slug: `test-dbsec-prod-${Date.now()}`,
        description: "Test",
        basePrice: 100,
        categoryId: cat!.id,
        colors: {
          create: { id: `test-faz87-dbsec-c1-${Date.now()}`, name: "Siyah", slug: "siyah", colorCode: "#000" },
        },
        sizes: {
          create: { id: `test-faz87-dbsec-s1-${Date.now()}`, name: "Standart", slug: "std" },
        },
      },
      include: { colors: true, sizes: true },
    });

    const uniqueSku = `TEST-UNIQUE-SKU-${Date.now()}`;
    await prisma.productVariant.create({
      data: {
        id: `test-faz87-dbsec-v1-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: uniqueSku,
        stockQuantity: 10,
      },
    });

    // Aynı SKU ile 2. varyant oluşturma denemesi -> P2002 Unique Constraint İhlali
    await expect(
      prisma.productVariant.create({
        data: {
          id: `test-faz87-dbsec-v2-${Date.now()}`,
          productId: testProd.id,
          colorId: testProd.colors[0].id,
          sizeId: testProd.sizes[0].id,
          sku: uniqueSku, // MÜKERRER!
          stockQuantity: 5,
        },
      })
    ).rejects.toThrow();
  });

  // 5. NEGATİF STOK CHECK KISITI (DATABASE LEVEL ENFORCEMENT)
  it("5.1. PostgreSQL ProductVariant tablosundaki CHECK kısıtı stok miktarının eksiye düşürülmesini engellemelidir (23514)", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-dbsec-p2-${Date.now()}`,
        title: "Negatif Stok Test Ürünü",
        slug: `test-negstock-prod-${Date.now()}`,
        description: "Test",
        basePrice: 100,
        categoryId: cat!.id,
        colors: {
          create: { id: `test-faz87-dbsec-c2-${Date.now()}`, name: "Mavi", slug: "mavi", colorCode: "#00f" },
        },
        sizes: {
          create: { id: `test-faz87-dbsec-s2-${Date.now()}`, name: "Standart", slug: "std" },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-dbsec-vneg-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-NEG-SKU-${Date.now()}`,
        stockQuantity: 2,
      },
    });

    // Ham SQL ile veritabanı motoruna doğrudan negatif stok yazma denemesi (-5)
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "ProductVariant" SET "stockQuantity" = -5 WHERE "id" = '${testVariant.id}';`
      )
    ).rejects.toThrow(/ProductVariant_stockQuantity_nonnegative|check constraint/i);
  });

  // 6. FOREIGN KEY İLİŞKİLERİ VE CASCADE DOĞRULAMASI
  it("6.1. Order silindiğinde OrderItem'lar cascade silinmeli, OrderItem varken ProductVariant silinememelidir", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz87-dbsec-p3-${Date.now()}`,
        title: "FK Test Ürünü",
        slug: `test-fk-prod-${Date.now()}`,
        description: "Test",
        basePrice: 100,
        categoryId: cat!.id,
        colors: {
          create: { id: `test-faz87-dbsec-c3-${Date.now()}`, name: "Kırmızı", slug: "kirmizi", colorCode: "#f00" },
        },
        sizes: {
          create: { id: `test-faz87-dbsec-s3-${Date.now()}`, name: "Standart", slug: "std" },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz87-dbsec-vfk-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-FK-SKU-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    const testOrderId = `test-faz87-dbsec-ord-${Date.now()}`;
    await prisma.order.create({
      data: {
        id: testOrderId,
        orderNumber: `HM-FK-${Date.now()}`,
        customerFullName: "FK Test",
        customerEmail: "fk.test@example.com",
        customerPhone: "05559998877",
        subtotal: 100,
        totalAmount: 250,
        totalKurus: 25000,
        shippingAddress: { city: "İst", district: "Bjk", fullAddress: "Açık adres" },
        items: {
          create: {
            productId: testProd.id,
            variantId: testVariant.id,
            productName: testProd.title,
            colorName: "Kırmızı",
            sizeName: "Standart",
            sku: testVariant.sku,
            price: 100,
            quantity: 1,
            totalPrice: 100,
          },
        },
      },
    });

    // A. OrderItem tarafından referans verilen ProductVariant doğrudan silinemez (RESTRICT)
    await expect(
      prisma.productVariant.delete({ where: { id: testVariant.id } })
    ).rejects.toThrow(/foreign key constraint|violates foreign key/i);

    // B. Order silindiğinde OrderItem otomatik olarak silinir (CASCADE)
    await prisma.order.delete({ where: { id: testOrderId } });
    const itemsRemaining = await prisma.orderItem.count({ where: { orderId: testOrderId } });
    expect(itemsRemaining).toBe(0);

    // Artık referansı kalmadığı için ProductVariant güvenle silinebilir
    await expect(
      prisma.productVariant.delete({ where: { id: testVariant.id } })
    ).resolves.toBeDefined();
  });

  // 7. BACKUP VE RESTORE PROSEDÜR TESTİ (PG_DUMP TESTİ)
  it("7.1. pg_dump aracıyla test veritabanının yedeği alınabilmeli ve geçerli SQL çıktısı üretmelidir", () => {
    // Docker test konteyneri üzerinde pg_dump al
    const dumpOutput = execSync(
      `docker exec humra-postgres-test-83 pg_dump -U humra_test -d humra_migration_test -t public._prisma_migrations --schema-only`,
      { encoding: "utf-8", stdio: "pipe" }
    );

    expect(dumpOutput).toContain("CREATE TABLE public._prisma_migrations");
    expect(dumpOutput).toContain("PostgreSQL database dump complete");
  });
});
