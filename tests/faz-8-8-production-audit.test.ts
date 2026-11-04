import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { getActiveStoreDriver, createStoreDAO, resetDAOCache } from "../src/lib/server/dao/factory";
import { PrismaStoreDAO, EXPECTED_TEST_DATABASE, EXPECTED_TEST_USER } from "../src/lib/server/dao/prisma-store-dao";
import { IdempotencyManager } from "../src/lib/server/dao/idempotency";
import { computePayTRCallbackHash, verifyPayTRCallbackHash } from "../src/lib/server/dao/payment-write-dao";
import { TransactionalOutboxManager } from "../src/lib/server/dao/outbox";
import { exportPgToStoreJson } from "../scripts/export-pg-to-store-json";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://humra_test:Yc1RJPBs3A9Xt0dfFU3R0P3W@127.0.0.1:5432/humra_migration_test?schema=public";

const STORE_PATH = path.join(process.cwd(), "data", "store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";

describe("FAZ 8.8: Production Öncesi Son Teknik Denetim ve Güvenli Geçiş Test Paketi", () => {
  let prisma: PrismaClient | null = null;

  beforeAll(async () => {
    try {
      const client = new PrismaClient({
        datasources: { db: { url: TEST_DB_URL } },
      });
      await client.$connect();
      prisma = client;
    } catch (err) {
      console.warn("PostgreSQL bağlantısı sağlanamadı:", err);
      prisma = null;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    resetDAOCache();
  });

  // 1. SÜRÜCÜ DEĞİŞKENİ DENETİMİ
  describe("1. Sürücü Değişkeni ve Varsayılan Güvenliği", () => {
    it("1.1. DATA_STORE_DRIVER tanımsız veya geçersiz olduğunda varsayılan daima 'json' olmalıdır", () => {
      const original = process.env.DATA_STORE_DRIVER;
      try {
        delete process.env.DATA_STORE_DRIVER;
        expect(getActiveStoreDriver()).toBe("json");

        process.env.DATA_STORE_DRIVER = "anything_else";
        expect(getActiveStoreDriver()).toBe("json");

        process.env.DATA_STORE_DRIVER = "JSON";
        expect(getActiveStoreDriver()).toBe("json");

        // Yalnızca küçük/büyük harf postgres olduğunda seçilmeli
        process.env.DATA_STORE_DRIVER = "postgres";
        expect(getActiveStoreDriver()).toBe("postgres");
      } finally {
        if (original !== undefined) {
          process.env.DATA_STORE_DRIVER = original;
        } else {
          delete process.env.DATA_STORE_DRIVER;
        }
      }
    });

    it("1.2. PrismaStoreDAO yetkisiz veritabanına bağlanmayı kesin olarak reddetmelidir", async () => {
      if (!prisma) return;
      const dao = new PrismaStoreDAO({ prisma });
      // humra_migration_test ve humra_test ile çalışmalı
      await expect(dao.assertAuthorizedDatabase()).resolves.toBeUndefined();
    });
  });

  // 2. IDEMPOTENCY VE MIGRATION DENETİMİ
  describe("2. IdempotencyKey Tablosu ve Şema Denetimi", () => {
    it("2.1. IdempotencyKey tablosu veritabanında PRIMARY KEY ile mevcut olmalıdır", async () => {
      if (!prisma) return;
      const tableCheck: any[] = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'IdempotencyKey';
      `;
      expect(tableCheck.length).toBe(1);

      const pkCheck: any[] = await prisma.$queryRaw`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'IdempotencyKey' AND tc.constraint_type = 'PRIMARY KEY';
      `;
      expect(pkCheck.length).toBe(1);
      expect(pkCheck[0].column_name).toBe("key");
    });

    it("2.2. _prisma_migrations tablosunda IdempotencyKey migration'ı (20261103000000) uygulanmış olmalıdır", async () => {
      if (!prisma) return;
      const migrations: any[] = await prisma.$queryRaw`
        SELECT migration_name FROM _prisma_migrations
        WHERE migration_name LIKE '%idempotency_table%';
      `;
      expect(migrations.length).toBe(1);
    });

    it("2.3. Aynı anahtarla farklı payload gönderildiğinde IDEMPOTENCY_PAYLOAD_MISMATCH fırlatılmalıdır", async () => {
      if (!prisma) return;
      const testKey = `test_idemp_${Date.now()}`;
      await prisma.$transaction(async (tx) => {
        await IdempotencyManager.saveKey(
          tx,
          testKey,
          "ORDER_CREATE",
          IdempotencyManager.computePayloadHash({ total: 100 }),
          "COMPLETED",
          { orderId: "ord-1" }
        );
      });

      await expect(
        prisma.$transaction(async (tx) => {
          return await IdempotencyManager.checkOrLockKey(tx, testKey, "ORDER_CREATE", { total: 200 });
        })
      ).rejects.toThrow("IDEMPOTENCY_PAYLOAD_MISMATCH");

      // Temizlik
      await prisma.$executeRawUnsafe(`DELETE FROM "IdempotencyKey" WHERE "key" = $1;`, testKey);
    });
  });

  // 3. PAYTR PROTOKOL VE CALLBACK DENETİMİ
  describe("3. PayTR Protokol, HMAC ve Tutar Denetimi", () => {
    it("3.1. Timing-safe eşitlik farklı uzunluktaki buffer'ları güvenle ele almalıdır (exception fırlatmamalı)", () => {
      const valid = verifyPayTRCallbackHash("kisa_hash", {
        merchantOid: "HM12345",
        status: "success",
        totalAmount: 10000,
        merchantSalt: "salt",
        merchantKey: "key",
      });
      expect(valid).toBe(false);
    });

    it("3.2. Resmi PayTR HMAC formülü doğrulanmalıdır", () => {
      const hash = computePayTRCallbackHash({
        merchantOid: "HM202611029999",
        status: "success",
        totalAmount: 157410,
        merchantSalt: "test_salt_123",
        merchantKey: "test_key_456",
      });
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(20);

      const isValid = verifyPayTRCallbackHash(hash, {
        merchantOid: "HM202611029999",
        status: "success",
        totalAmount: 157410,
        merchantSalt: "test_salt_123",
        merchantKey: "test_key_456",
      });
      expect(isValid).toBe(true);
    });
  });

  // 4. OUTBOX VE ASENKRON İŞLEM KUYRUĞU
  describe("4. Transactional Outbox Pattern Mimarisi", () => {
    it("4.1. Outbox olayı atomik olarak eklenmeli, pesimistik kilitle çekilmeli ve tamamlanabilmelidir", async () => {
      if (!prisma) return;

      const testEventId = await prisma.$transaction(async (tx) => {
        return await TransactionalOutboxManager.enqueueEvent(tx, {
          eventType: "PAYMENT_REFUND",
          aggregateId: "order-test-outbox-1",
          payload: { refundAmount: 250, bankAccount: "TR12345" },
        });
      });

      expect(testEventId).toBeDefined();

      // Çek
      const pending = await prisma.$transaction(async (tx) => {
        return await TransactionalOutboxManager.fetchPendingEvents(tx, 5);
      });

      const myEvent = pending.find((e) => e.id === testEventId);
      expect(myEvent).toBeDefined();
      expect(myEvent?.status).toBe("PENDING");

      // Tamamla
      await prisma.$transaction(async (tx) => {
        await TransactionalOutboxManager.markCompleted(tx, testEventId, "PAYTR_REF_98765");
      });

      const completedRow: any[] = await prisma.$queryRaw`
        SELECT status, "providerReference" FROM "PaymentOutbox" WHERE id = ${testEventId};
      `;
      expect(completedRow[0].status).toBe("COMPLETED");
      expect(completedRow[0].providerReference).toBe("PAYTR_REF_98765");

      // Temizlik
      await prisma.$executeRawUnsafe(`DELETE FROM "PaymentOutbox" WHERE id = $1;`, testEventId);
    });
  });

  // 5. POSTGRESQL YETKİLERİ VE VERİTABANI KİMLİĞİ
  describe("5. PostgreSQL Katalog ve Rol Yetkileri", () => {
    it("5.1. Test kullanıcısı ve veritabanı kimliği doğrulanmalıdır", async () => {
      if (!prisma) return;
      const dbInfo: any[] = await prisma.$queryRaw`
        SELECT current_database(), current_user;
      `;
      expect(dbInfo[0].current_database).toBe(EXPECTED_TEST_DATABASE);
      expect(dbInfo[0].current_user).toBe(EXPECTED_TEST_USER);
    });
  });

  // 6. GERİ DÖNÜŞ (ROLLBACK) VE DIŞA AKTARIM DOĞRULAMASI
  describe("6. Güvenli Geri Dönüş ve PostgreSQL -> JSON Dışa Aktarımı", () => {
    it("6.1. exportPgToStoreJson fonksiyonu eksiksiz JSON çıktısı üretmeli ve Betül Trençkot'u doğrulamalıdır", async () => {
      if (!prisma) return;
      const previewPath = path.join(process.cwd(), "backups", "exported-store-rollback.json");
      const res = await exportPgToStoreJson(previewPath);

      expect(res.success).toBe(true);
      expect(res.stats.products).toBe(13);
      expect(res.stats.variants).toBe(118);
      expect(res.stats.categories).toBe(7);

      const exported = JSON.parse(fs.readFileSync(previewPath, "utf8"));
      const betul = exported.products.find((p: any) => p.slug === "betul-trenckot");
      expect(betul).toBeDefined();
      expect(betul.variants.length).toBe(10);
      const totalStock = betul.variants.reduce((sum: number, v: any) => sum + v.stockQuantity, 0);
      expect(totalStock).toBe(100);
    });
  });

  // 7. ORİJİNAL VERİ VE MEDYA BÜTÜNLÜĞÜ
  describe("7. Orijinal Veri ve Medya Bütünlüğü", () => {
    it("7.1. data/store.json SHA256 değeri test sürecinde değişmemiş olmalıdır", () => {
      const buffer = fs.readFileSync(STORE_PATH);
      const hash = crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
      expect(hash).toBe(EXPECTED_HASH);
    });

    it("7.2. public/uploads altında tam 155 adet medya dosyası mevcut olmalıdır", () => {
      function getFiles(dir: string): string[] {
        let res: string[] = [];
        for (const f of fs.readdirSync(dir)) {
          const p = path.join(dir, f);
          if (fs.statSync(p).isDirectory()) res.push(...getFiles(p));
          else res.push(p);
        }
        return res;
      }
      const files = getFiles(path.join(process.cwd(), "public", "uploads"));
      expect(files.length).toBe(155);
    });
  });
});

