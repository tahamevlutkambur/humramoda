import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { resolveTestDatabaseUrl } from "../scripts/migrate-json-to-pg";
import {
  executePostgresTransaction,
  assertWriteAuthorizedDatabase,
  StockWriteDAO,
} from "../src/lib/server/dao";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const BETUL_ID = "prod-1793185888547";

let prisma: PrismaClient;
let testDbUrl: string;
const stockDao = new StockWriteDAO();

describe("FAZ 8.6: Pessimistic Row-Level Locking & Concurrency Tests", () => {
  beforeAll(async () => {
    testDbUrl = resolveTestDatabaseUrl();
    prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    await prisma.$connect();
    await assertWriteAuthorizedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.productVariant.deleteMany({
      where: { id: { startsWith: "test-faz86-stock" } },
    });
    await prisma.productColor.deleteMany({
      where: { id: { startsWith: "test-faz86-stock" } },
    });
    await prisma.productSize.deleteMany({
      where: { id: { startsWith: "test-faz86-stock" } },
    });
    await prisma.product.deleteMany({
      where: { id: { startsWith: "test-faz86-stock" } },
    });

    await prisma.$disconnect();
  });

  // 1. MAĞAZA VE BETÜL TRENÇKOT VERİ GÜVENCESİ
  it("1.1. data/store.json hash'i ve Betül Trençkot varyant ve stokları korunmalıdır", async () => {
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

  // 2. YÜKSEK EŞZAMANLI YARIŞ DURUMU (RACE CONDITION) VE SIFIR NEGATİF STOK TESTİ
  it("2.1. 5 stoklu varyanta aynı anda gelen 10 eşzamanlı işlemden tam 5'i başarılı olmalı, kalan 5'i hata almalı ve stok tam 0 kalmalıdır", async () => {
    const cat = await prisma.category.findFirst();
    expect(cat).toBeTruthy();

    const testProd = await prisma.product.create({
      data: {
        id: `test-faz86-stock-p-${Date.now()}`,
        title: "Test Stok Yarış Ürünü",
        slug: `test-stock-race-${Date.now()}`,
        description: "Test",
        basePrice: 100,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz86-stock-c-${Date.now()}`,
            name: "Test Renk",
            slug: "test-renk",
            colorCode: "#333333",
          },
        },
        sizes: {
          create: {
            id: `test-faz86-stock-s-${Date.now()}`,
            name: "Test Beden",
            slug: "test-beden",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    const testVariant = await prisma.productVariant.create({
      data: {
        id: `test-faz86-stock-v-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-RACE-SKU-${Date.now()}`,
        stockQuantity: 5, // Yalnızca 5 adet stok var!
      },
    });

    // 10 adet eşzamanlı istek başlat
    const concurrentCount = 10;
    const promises = Array.from({ length: concurrentCount }).map(async (_, idx) => {
      try {
        return await executePostgresTransaction(
          async (tx) => {
            return await stockDao.lockAndDeductVariantStock(tx, [
              { variantId: testVariant.id, quantity: 1 },
            ]);
          },
          { prisma }
        );
      } catch (err: any) {
        return { error: err.message };
      }
    });

    const results = await Promise.all(promises);

    const successCount = results.filter((r: any) => r.success === true).length;
    const failedCount = results.filter((r: any) => Boolean(r.error)).length;

    expect(successCount).toBe(5);
    expect(failedCount).toBe(5);

    // Başarısız olanların tümü yetersiz stok hatası almış olmalıdır
    const failedResults = results.filter((r: any) => Boolean(r.error));
    for (const f of failedResults) {
      expect((f as any).error).toMatch(/Yetersiz stok/);
    }

    // Veritabanındaki son stok miktarı tam 0 olmalıdır (Asla negatif olamaz!)
    const finalStock = await prisma.productVariant.findUnique({
      where: { id: testVariant.id },
      select: { stockQuantity: true },
    });

    expect(finalStock?.stockQuantity).toBe(0);
  });

  // 3. ÇOKLU VARYANT VE DEADLOCK ÖNLEME TESTİ
  it("3.1. Ters sırada çoklu varyant kilitlemeye çalışan eşzamanlı işlemler deadlock olmadan sıralı tamamlanmalıdır", async () => {
    const cat = await prisma.category.findFirst();
    const testProd = await prisma.product.create({
      data: {
        id: `test-faz86-stock-p2-${Date.now()}`,
        title: "Test Deadlock Önleme Ürünü",
        slug: `test-deadlock-${Date.now()}`,
        description: "Test",
        basePrice: 100,
        categoryId: cat!.id,
        colors: {
          create: {
            id: `test-faz86-stock-c2-${Date.now()}`,
            name: "Test Renk 2",
            slug: "test-renk-2",
            colorCode: "#555555",
          },
        },
        sizes: {
          create: {
            id: `test-faz86-stock-s2-${Date.now()}`,
            name: "Test Beden 2",
            slug: "test-beden-2",
          },
        },
      },
      include: { colors: true, sizes: true },
    });

    // İki varyant: VarA ve VarB
    const varA = await prisma.productVariant.create({
      data: {
        id: `test-faz86-stock-va-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-DEADLOCK-A-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    const varB = await prisma.productVariant.create({
      data: {
        id: `test-faz86-stock-vb-${Date.now()}`,
        productId: testProd.id,
        colorId: testProd.colors[0].id,
        sizeId: testProd.sizes[0].id,
        sku: `TEST-DEADLOCK-B-${Date.now()}`,
        stockQuantity: 10,
      },
    });

    // Tx1: [varA, varB] kilitler
    // Tx2: [varB, varA] kilitler (ters sıra!)
    const p1 = executePostgresTransaction(
      async (tx) => {
        return await stockDao.lockAndDeductVariantStock(tx, [
          { variantId: varA.id, quantity: 1 },
          { variantId: varB.id, quantity: 1 },
        ]);
      },
      { prisma }
    );

    const p2 = executePostgresTransaction(
      async (tx) => {
        return await stockDao.lockAndDeductVariantStock(tx, [
          { variantId: varB.id, quantity: 2 },
          { variantId: varA.id, quantity: 2 },
        ]);
      },
      { prisma }
    );

    // Her ikisi de deadlock hatası almadan başarıyla bitmelidir
    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    // Stok kontrolleri:
    // varA: 10 - 1 - 2 = 7
    // varB: 10 - 1 - 2 = 7
    const varAAfter = await stockDao.getVariantStock(prisma as any, varA.id);
    const varBAfter = await stockDao.getVariantStock(prisma as any, varB.id);

    expect(varAAfter).toBe(7);
    expect(varBAfter).toBe(7);

    // 4. STOK İADESİ (RESTORE) TESTİ
    const restoreRes = await executePostgresTransaction(
      async (tx) => {
        return await stockDao.restoreVariantStock(tx, [
          { variantId: varA.id, quantity: 3 },
          { variantId: varB.id, quantity: 3 },
        ]);
      },
      { prisma }
    );

    expect(restoreRes.success).toBe(true);
    const varARestored = await stockDao.getVariantStock(prisma as any, varA.id);
    const varBRestored = await stockDao.getVariantStock(prisma as any, varB.id);
    expect(varARestored).toBe(10);
    expect(varBRestored).toBe(10);
  });
});

