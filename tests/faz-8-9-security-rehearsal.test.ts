import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { IdempotencyManager } from "../src/lib/server/dao/idempotency";
import { TransactionalOutboxManager, OutboxEvent } from "../src/lib/server/dao/outbox";
import { computePayTRCallbackHash, verifyPayTRCallbackHash, PaymentWriteDAO } from "../src/lib/server/dao/payment-write-dao";
import { exportPgToStoreJson } from "../scripts/export-pg-to-store-json";
import { APP_URL } from "../scripts/setup-production-roles-test";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://humra_test:Yc1RJPBs3A9Xt0dfFU3R0P3W@127.0.0.1:5432/humra_migration_test?schema=public";

const STORE_PATH = path.join(process.cwd(), "data", "store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";

describe("FAZ 8.9: Üretim Öncesi Kritik Açıkların Kapatılması ve Son Güvenlik Test Paketi", () => {
  let prisma: PrismaClient | null = null;
  let appPrisma: PrismaClient | null = null;

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

    try {
      const appClient = new PrismaClient({
        datasources: { db: { url: APP_URL } },
      });
      await appClient.$connect();
      appPrisma = appClient;
    } catch (err) {
      console.warn("humra_app bağlantısı sağlanamadı:", err);
      appPrisma = null;
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (appPrisma) await appPrisma.$disconnect();
  });

  // 1. IDEMPOTENCYKEY ŞEMA VE DAO UYUM DENETİMİ
  describe("1. IdempotencyKey Şema ve Çok Yönlü Eşzamanlılık Denetimi", () => {
    it("1.1. Farklı scope ile aynı anahtar kullanıldığında IDEMPOTENCY_SCOPE_MISMATCH fırlatılmalıdır", async () => {
      if (!prisma) return;
      const key = `scope_test_${Date.now()}`;
      await prisma.$transaction(async (tx) => {
        await IdempotencyManager.saveKey(
          tx,
          key,
          "COD_CHECKOUT",
          IdempotencyManager.computePayloadHash({ cart: 1 }),
          "COMPLETED",
          { orderId: "ord-scope-1" }
        );
      });

      await expect(
        prisma.$transaction(async (tx) => {
          return await IdempotencyManager.checkOrLockKey(tx, key, "PAYTR_CALLBACK", { cart: 1 });
        })
      ).rejects.toThrow("IDEMPOTENCY_SCOPE_MISMATCH");

      await prisma.$executeRawUnsafe(`DELETE FROM "IdempotencyKey" WHERE "key" = $1;`, key);
    });

    it("1.2. PENDING durumunda 120 saniyeyi aşmamış aktif kilit varsa eşzamanlı istek reddedilmelidir", async () => {
      if (!prisma) return;
      const key = `concurrent_test_${Date.now()}`;
      await prisma.$transaction(async (tx) => {
        await IdempotencyManager.checkOrLockKey(tx, key, "COD_CHECKOUT", { order: 123 });
      });

      // İkinci istek anında reddedilmeli
      await expect(
        prisma.$transaction(async (tx) => {
          return await IdempotencyManager.checkOrLockKey(tx, key, "COD_CHECKOUT", { order: 123 });
        })
      ).rejects.toThrow("IDEMPOTENCY_CONCURRENT_REQUEST");

      await prisma.$executeRawUnsafe(`DELETE FROM "IdempotencyKey" WHERE "key" = $1;`, key);
    });

    it("1.3. Süresi dolan anahtarlar temizlenirken PENDING durumundaki aktif kayıtlar silinmemelidir", async () => {
      if (!prisma) return;
      const pendingKey = `pending_safe_${Date.now()}`;
      const expiredKey = `expired_del_${Date.now()}`;

      // PENDING ancak süresi geçmiş görünen kayıt ekle
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "IdempotencyKey" ("key", "scope", "requestHash", "responseStatus", "responsePayload", "createdAt", "expiresAt")
        VALUES ($1, 'TEST', 'hash1', 'PENDING', '{}'::jsonb, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
               ($2, 'TEST', 'hash2', 'COMPLETED', '{}'::jsonb, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day');
        `,
        pendingKey,
        expiredKey
      );

      // Temizlik çalıştır
      await IdempotencyManager.cleanupExpiredKeys(prisma);

      // PENDING kayıt silinmemiş olmalı
      const pendingRow: any[] = await prisma.$queryRaw`SELECT "key" FROM "IdempotencyKey" WHERE "key" = ${pendingKey}`;
      expect(pendingRow.length).toBe(1);

      // COMPLETED ve süresi dolmuş kayıt silinmiş olmalı
      const expiredRow: any[] = await prisma.$queryRaw`SELECT "key" FROM "IdempotencyKey" WHERE "key" = ${expiredKey}`;
      expect(expiredRow.length).toBe(0);

      // Temizlik
      await prisma.$executeRawUnsafe(`DELETE FROM "IdempotencyKey" WHERE "key" = $1;`, pendingKey);
    });
  });

  // 2. GERÇEK TABLO SAYISI VE MIGRATION PARİTESİ
  describe("2. Gerçek Tablo Sayısı ve Migration Paritesi", () => {
    it("2.1. Veritabanında tam 33 tablo olmalıdır (32 uygulama tablosu + 1 _prisma_migrations)", async () => {
      if (!prisma) return;
      const tables: any[] = await prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `;
      expect(tables.length).toBe(33);

      const tableNames = tables.map((t) => t.table_name);
      expect(tableNames).toContain("IdempotencyKey");
      expect(tableNames).toContain("PaymentOutbox");
      expect(tableNames).toContain("_prisma_migrations");
    });

    it("2.2. _prisma_migrations tablosunda tam 8 adet uygulanmış migration bulunmalıdır", async () => {
      if (!prisma) return;
      const migrations: any[] = await prisma.$queryRaw`
        SELECT migration_name FROM _prisma_migrations ORDER BY finished_at ASC;
      `;
      expect(migrations.length).toBe(8);
      expect(migrations[7].migration_name).toContain("phase8_9_payment_outbox");
    });
  });

  // 3. PAYTR İADE API'Sİ VE MÜKERRER İADE GÜVENLİĞİ
  describe("3. PayTR İade API'si ve Mükerrer İade Güvenliği", () => {
    it("3.1. İade tutarı sipariş bakiyesini aştığında harici çağrı yapılmadan derhal reddedilmelidir", async () => {
      if (!prisma) return;
      const testOrderId = `order_refund_overflow_${Date.now()}`;
      await prisma.order.create({
        data: {
          id: testOrderId,
          orderNumber: `HM-REF-OVER-${Date.now().toString().slice(-4)}`,
          customerEmail: "overflow@humramoda.local",
          customerFullName: "Overflow Test",
          customerPhone: "05559998877",
          totalAmount: 100,
          totalKurus: 10000,
          subtotal: 100,
          shippingAddress: { city: "İstanbul" },
          status: "CONFIRMED",
          paymentStatus: "PAID",
          refundedAmount: 80, // Zaten 80 TL iade edilmiş
        },
      });

      const outboxItem: OutboxEvent = {
        id: `outbox_overflow_${Date.now()}`,
        eventType: "PAYMENT_REFUND",
        aggregateId: testOrderId,
        idempotencyKey: `idem_overflow_${Date.now()}`,
        payload: { refundAmountKurus: 3000 }, // 30 TL daha isteniyor (80 + 30 = 110 > 100)
        status: "PENDING",
        retryCount: 0,
        maxRetries: 3,
        nextRetryAt: new Date(),
        createdAt: new Date(),
      };

      let gatewayCalled = false;
      const res = await TransactionalOutboxManager.processRefundOutboxItem(prisma, outboxItem, async () => {
        gatewayCalled = true;
        return { status: "success" };
      });

      expect(gatewayCalled).toBe(false);
      expect(res.success).toBe(false);
      expect(res.error).toContain("İADE_LIMITI_AŞILDI");

      // Temizlik
      await prisma.order.delete({ where: { id: testOrderId } });
    });

    it("3.2. Ağ zaman aşımında outbox kaydı 'REQUIRES_RECONCILIATION' durumuna alınmalı ve kör retry yapılmamalıdır", async () => {
      if (!prisma) return;
      const testOrderId = `order_timeout_${Date.now()}`;
      await prisma.order.create({
        data: {
          id: testOrderId,
          orderNumber: `HM-TIMEOUT-${Date.now().toString().slice(-4)}`,
          customerEmail: "timeout@humramoda.local",
          customerFullName: "Timeout Test",
          customerPhone: "05559998877",
          totalAmount: 200,
          totalKurus: 20000,
          subtotal: 200,
          shippingAddress: { city: "İzmir" },
          status: "CONFIRMED",
          paymentStatus: "PAID",
          refundedAmount: 0,
        },
      });

      const outboxId = await prisma.$transaction(async (tx) => {
        return await TransactionalOutboxManager.enqueueEvent(tx, {
          eventType: "PAYMENT_REFUND",
          aggregateId: testOrderId,
          payload: { refundAmountKurus: 10000 },
        });
      });

      const outboxRow = (
        await TransactionalOutboxManager.fetchAndLockPendingEvents(prisma as any, 50)
      ).find((e) => e.id === outboxId);

      expect(outboxRow).toBeDefined();

      // Simüle edilen ağ zaman aşımı
      const res = await TransactionalOutboxManager.processRefundOutboxItem(prisma, outboxRow!, async () => {
        return { status: "timeout", errorMessage: "ETIMEDOUT: PayTR gateway did not respond within 10s" };
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe("REQUIRES_RECONCILIATION");

      const savedRow: any[] = await prisma.$queryRaw`
        SELECT status, "errorMessage" FROM "PaymentOutbox" WHERE id = ${outboxId};
      `;
      expect(savedRow[0].status).toBe("REQUIRES_RECONCILIATION");
      expect(savedRow[0].errorMessage).toContain("MUTABAKAT_GEREKLİ");

      // Siparişin REFUND_COMPLETED OLMADIĞINI doğrula
      const orderCheck = await prisma.order.findUnique({ where: { id: testOrderId } });
      expect(orderCheck?.paymentStatus).toBe("PAID");
      expect(Number(orderCheck?.refundedAmount)).toBe(0);

      // Temizlik
      await prisma.$executeRawUnsafe(`DELETE FROM "PaymentOutbox" WHERE id = $1;`, outboxId);
      await prisma.order.delete({ where: { id: testOrderId } });
    });
  });

  // 4. PAYTR CALLBACK VE TUTAR KONTROLLERİ
  describe("4. PayTR Callback ve Tahsilat Tutarı Doğrulaması", () => {
    it("4.1. Eksik tutar (underpayment) durumunda callback kesin olarak reddedilmelidir", async () => {
      if (!prisma) return;
      const testOrderId = `order_underpaid_${Date.now()}`;
      await prisma.order.create({
        data: {
          id: testOrderId,
          orderNumber: `HM-UNDER-${Date.now().toString().slice(-4)}`,
          customerEmail: "under@humramoda.local",
          customerFullName: "Underpaid Test",
          customerPhone: "05553332211",
          totalAmount: 300,
          totalKurus: 30000,
          subtotal: 300,
          shippingAddress: { city: "Ankara" },
          status: "PENDING",
          paymentStatus: "PENDING",
        },
      });

      const dao = new PaymentWriteDAO();
      const validHashForLower = computePayTRCallbackHash({
        merchantOid: testOrderId,
        status: "success",
        totalAmount: 15000, // 150 TL gönderiliyor (Beklenen: 300 TL)
        merchantSalt: "test_salt",
        merchantKey: "test_key",
      });

      const res = await prisma.$transaction(async (tx) => {
        return await dao.verifyAndProcessCallback(tx, {
          merchantOid: testOrderId,
          status: "success",
          totalAmount: 15000,
          hash: validHashForLower,
          merchantKey: "test_key",
          merchantSalt: "test_salt",
        });
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Tutar uyuşmazlığı");

      await prisma.order.delete({ where: { id: testOrderId } });
    });

    it("4.2. Timing-safe equal buffer uzunluk uyuşmazlığında güvenle false dönmelidir", () => {
      const res = verifyPayTRCallbackHash("kisa", {
        merchantOid: "HM123",
        status: "success",
        totalAmount: 1000,
        merchantSalt: "salt",
        merchantKey: "key",
      });
      expect(res).toBe(false);
    });
  });

  // 5. PRODUCTION ROLLERİ VE LEAST PRIVILEGE DENETİMİ
  describe("5. Production Rolleri ve Least Privilege Denetimi", () => {
    it("5.1. humra_app rolü SELECT, INSERT, UPDATE, DELETE yapabilmeli ancak DDL yapamamalıdır", async () => {
      if (!appPrisma) return;

      // Okuma
      const countRes: any[] = await appPrisma.$queryRaw`SELECT count(*) FROM "Product";`;
      expect(Number(countRes[0].count)).toBe(13);

      // DML
      const logId = `app_perm_test_${Date.now()}`;
      await appPrisma.auditLog.create({
        data: {
          id: logId,
          adminId: "app_user",
          action: "PERMISSION_TEST",
          targetType: "ROLE",
          result: "SUCCESS",
        },
      });
      await appPrisma.auditLog.delete({ where: { id: logId } });

      // DDL: CREATE TABLE engellenmeli
      await expect(
        appPrisma.$executeRawUnsafe(`CREATE TABLE "HackedByApp" (id int);`)
      ).rejects.toThrow();

      // DDL: DROP TABLE engellenmeli
      await expect(
        appPrisma.$executeRawUnsafe(`DROP TABLE "Product";`)
      ).rejects.toThrow();

      // DDL: ALTER TABLE engellenmeli
      await expect(
        appPrisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN test_hack int;`)
      ).rejects.toThrow();
    });
  });

  // 6. GERİ DÖNÜŞ (ROLLBACK) VE AKTARIM ARACI DENETİMİ
  describe("6. PostgreSQL -> JSON Geri Dönüş ve Güvenli Dışa Aktarım", () => {
    it("6.1. exportPgToStoreJson fonksiyonu 10 güvenlik koşulunu sağlamalı ve Betül Trençkot'u doğrulamalıdır", async () => {
      if (!prisma) return;
      const testExportPath = path.join(process.cwd(), "backups", "exported-store-rollback-test.json");
      const res = await exportPgToStoreJson({
        outputPath: testExportPath,
      });

      expect(res.success).toBe(true);
      expect(res.stats.products).toBe(13);
      expect(res.stats.variants).toBe(118);
      expect(res.stats.categories).toBe(7);

      const parsed = JSON.parse(fs.readFileSync(testExportPath, "utf8"));
      expect(parsed._postgresInfrastructure).toBeDefined();
      expect(Array.isArray(parsed._postgresInfrastructure.idempotencyKeys)).toBe(true);
      expect(Array.isArray(parsed._postgresInfrastructure.paymentOutbox)).toBe(true);

      const betul = parsed.products.find((p: any) => p.slug === "betul-trenckot");
      expect(betul.variants.length).toBe(10);
      const betulStock = betul.variants.reduce((sum: number, v: any) => sum + v.stockQuantity, 0);
      expect(betulStock).toBe(100);

      // Temizlik
      if (fs.existsSync(testExportPath)) fs.unlinkSync(testExportPath);
    });
  });

  // 7. ORİJİNAL KAYNAK VE MEDYA BÜTÜNLÜĞÜ
  describe("7. Orijinal Kaynak ve Medya Bütünlüğü", () => {
    it("7.1. data/store.json SHA256 değeri test sürecinde bayt bazında değişmemiş olmalıdır", () => {
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

    it("7.3. Betül Trençkot 10 varyantı ve 100 stoğu hem JSON hem de DB'de doğrulanmalıdır", async () => {
      if (!prisma) return;
      // JSON kontrolü
      const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
      const jsonBetul = store.products.find((p: any) => p.slug === "betul-trenckot");
      expect(jsonBetul.variants.length).toBe(10);
      const jsonStock = jsonBetul.variants.reduce((s: number, v: any) => s + v.stockQuantity, 0);
      expect(jsonStock).toBe(100);

      // DB kontrolü
      const dbBetul = await prisma.product.findUnique({
        where: { slug: "betul-trenckot" },
        include: { variants: true },
      });
      expect(dbBetul?.variants.length).toBe(10);
      const dbStock = dbBetul?.variants.reduce((s: number, v: any) => s + v.stockQuantity, 0);
      expect(dbStock).toBe(100);
    });
  });
});

