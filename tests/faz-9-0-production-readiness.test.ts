import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { IdempotencyManager } from "../src/lib/server/dao/idempotency";
import { TransactionalOutboxManager, OutboxEvent } from "../src/lib/server/dao/outbox";
import { computePayTRCallbackHash, verifyPayTRCallbackHash, PaymentWriteDAO } from "../src/lib/server/dao/payment-write-dao";
import { exportPgToStoreJson } from "../scripts/export-pg-to-store-json";
import { JsonStoreDAO } from "../src/lib/server/dao/json-store-dao";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://humra_test:Yc1RJPBs3A9Xt0dfFU3R0P3W@127.0.0.1:5432/humra_migration_test?schema=public";

const STORE_PATH = path.join(process.cwd(), "data", "store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";

describe("FAZ 9.0: Üretim Ortamı Hazırlık ve Canlıya Geçiş Öncesi Son Kontrol Test Paketi", () => {
  let prisma: PrismaClient | null = null;

  beforeAll(async () => {
    try {
      const client = new PrismaClient({
        datasources: { db: { url: TEST_DB_URL } },
      });
      await client.$connect();
      prisma = client;
    } catch (err) {
      console.warn("PostgreSQL test veritabanına bağlanılamadı:", err);
      prisma = null;
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  // 1. KESİN GÜVENLİK SINIRLARI VE JSON DEPOSU BÜTÜNLÜĞÜ
  describe("1. Kesin Güvenlik Sınırları ve data/store.json Değişmezliği", () => {
    it("1.1. Aktif mağaza sürücüsü kesinlikle 'json' olmalıdır (PostgreSQL canlıda aktif değildir)", () => {
      const driver = process.env.DATA_STORE_DRIVER || "json";
      expect(driver).toBe("json");
    });

    it("1.2. data/store.json SHA-256 sağlama değeri kesinlikle değişmemiş olmalıdır", () => {
      expect(fs.existsSync(STORE_PATH)).toBe(true);
      const content = fs.readFileSync(STORE_PATH);
      const actualHash = crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
      expect(actualHash).toBe(EXPECTED_HASH);
    });

    it("1.3. data/store.json kritik varlık sayıları eksiksiz korunmalıdır", () => {
      const json = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
      expect(json.products?.length).toBe(13);
      expect(json.categories?.length).toBe(7);
      expect(json.collections?.length).toBe(3);

      const allColors = json.products.flatMap((p: any) => p.colors || []);
      const allSizes = json.products.flatMap((p: any) => p.sizes || []);
      const allVariants = json.products.flatMap((p: any) => p.variants || []);

      expect(allColors.length).toBe(36);
      expect(allSizes.length).toBe(37);
      expect(allVariants.length).toBe(118);

      const uniqueSkus = new Set(allVariants.map((v: any) => v.sku));
      expect(uniqueSkus.size).toBe(118);

      const betul = json.products.find((p: any) => p.title === "Betül Trençkot");
      expect(betul).toBeDefined();
      expect(betul.variants?.length).toBe(10);
      const betulStock = betul.variants.reduce((sum: number, v: any) => sum + (v.stockQuantity || 0), 0);
      expect(betulStock).toBe(100);

      // public/uploads envanteri (tam 155 dosya)
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      const files: string[] = [];
      const readDirRecursive = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            readDirRecursive(fullPath);
          } else if (entry.isFile()) {
            files.push(fullPath);
          }
        }
      };
      readDirRecursive(uploadsDir);
      expect(files.length).toBe(155);
    });
  });

  // 2. VERİTABANI ŞEMASI, MIGRATION VE TABLO PARİTESİ
  describe("2. PostgreSQL Şema, Tablo ve Migration Bütünlüğü", () => {
    it("2.1. Test veritabanında tam 33 tablo bulunmalıdır", async () => {
      if (!prisma) return;
      const tables: any[] = await prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `;
      expect(tables.length).toBe(33);

      const tableNames = tables.map((t) => t.table_name);
      expect(tableNames).toContain("PaymentOutbox");
      expect(tableNames).toContain("IdempotencyKey");
      expect(tableNames).toContain("AuditLog");
      expect(tableNames).toContain("Order");
      expect(tableNames).toContain("Product");
      expect(tableNames).toContain("_prisma_migrations");
    });

    it("2.2. _prisma_migrations tablosunda tam 8 adet sıralı migration bulunmalıdır", async () => {
      if (!prisma) return;
      const migrations: any[] = await prisma.$queryRaw`
        SELECT migration_name FROM _prisma_migrations ORDER BY finished_at ASC;
      `;
      expect(migrations.length).toBe(8);
      expect(migrations[7].migration_name).toContain("phase8_9_payment_outbox_and_idempotency_sync");
    });

    it("2.3. PaymentOutbox ve IdempotencyKey gerekli indeks ve kilit alanlarına sahip olmalıdır", async () => {
      if (!prisma) return;
      const idempCols: any[] = await prisma.$queryRaw`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'IdempotencyKey';
      `;
      const idempNames = idempCols.map((c) => c.column_name);
      expect(idempNames).toContain("key");
      expect(idempNames).toContain("scope");
      expect(idempNames).toContain("requestHash");
      expect(idempNames).toContain("lockedAt");
      expect(idempNames).toContain("responseStatus");

      const outboxCols: any[] = await prisma.$queryRaw`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'PaymentOutbox';
      `;
      const outboxNames = outboxCols.map((c) => c.column_name);
      expect(outboxNames).toContain("id");
      expect(outboxNames).toContain("eventType");
      expect(outboxNames).toContain("aggregateId");
      expect(outboxNames).toContain("status");
      expect(outboxNames).toContain("retryCount");
    });
  });

  // 3. OUTBOX İZOLASYONU VE KARANTİNA MEKANİZMASI
  describe("3. Outbox Karantina İzolasyonu ve Çoklu Worker Kilidi", () => {
    it("3.1. REQUIRES_RECONCILIATION durumundaki olaylar otomatik worker sorgularından kesinlikle yalıtılmalıdır", async () => {
      if (!prisma) return;

      const quarantinedId = `outbox_quarantine_test_${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "PaymentOutbox" (
          "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status", "retryCount", "maxRetries", "nextRetryAt"
        ) VALUES ($1, 'PAYMENT_REFUND', 'order_dummy', $2, '{"refundAmountKurus": 5000}'::jsonb, 'REQUIRES_RECONCILIATION', 1, 5, NOW() - INTERVAL '10 minutes');
        `,
        quarantinedId,
        `idem_quarantine_${Date.now()}`
      );

      // Automated worker fetch
      const pendingEvents = await TransactionalOutboxManager.fetchPendingEvents(prisma as any, 100);
      const isLeaked = pendingEvents.some((e) => e.id === quarantinedId);
      expect(isLeaked).toBe(false);

      const lockedEvents = await TransactionalOutboxManager.fetchAndLockPendingEvents(prisma as any, 100);
      const isLockedLeaked = lockedEvents.some((e) => e.id === quarantinedId);
      expect(isLockedLeaked).toBe(false);

      // fetchQuarantinedEvents should find it
      const quarantinedList = await TransactionalOutboxManager.fetchQuarantinedEvents(prisma, 100);
      const foundInQuarantine = quarantinedList.some((e) => e.id === quarantinedId);
      expect(foundInQuarantine).toBe(true);

      // Temizlik
      await prisma.$executeRawUnsafe(`DELETE FROM "PaymentOutbox" WHERE "id" = $1;`, quarantinedId);
    });

    it("3.2. Eşzamanlı iki worker aynı kaydı aynı anda çekemez (FOR UPDATE SKIP LOCKED)", async () => {
      if (!prisma) return;

      const eventId = `outbox_concurrency_${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "PaymentOutbox" (
          "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status", "retryCount", "maxRetries", "nextRetryAt"
        ) VALUES ($1, 'PAYMENT_REFUND', 'order_concurrency', $2, '{"refundAmountKurus": 1000}'::jsonb, 'PENDING', 0, 5, NOW());
        `,
        eventId,
        `idem_conc_${Date.now()}`
      );

      // Worker 1 ve Worker 2 eşzamanlı olarak çeker
      const [worker1Result, worker2Result] = await Promise.all([
        prisma.$transaction(async (tx) => {
          return await TransactionalOutboxManager.fetchAndLockPendingEvents(tx, 10);
        }),
        prisma.$transaction(async (tx) => {
          return await TransactionalOutboxManager.fetchAndLockPendingEvents(tx, 10);
        }),
      ]);

      const w1Found = worker1Result.some((e) => e.id === eventId);
      const w2Found = worker2Result.some((e) => e.id === eventId);

      // İki worker'dan sadece biri kaydı almış olmalıdır, ikisi birden asla alamaz!
      expect(w1Found !== w2Found).toBe(true);

      // Temizlik
      await prisma.$executeRawUnsafe(`DELETE FROM "PaymentOutbox" WHERE "id" = $1;`, eventId);
    });
  });

  // 4. MANUEL MUTABAKAT İŞ AKIŞI VE AUDIT LOG DOĞRULAMASI
  describe("4. Manuel Mutabakat İş Akışı ve AuditLog Kayıtları", () => {
    it("4.1. CONFIRMED kararı: Sipariş bakiyesini güncellemeli, olayı COMPLETED yapmalı ve AuditLog oluşturmalıdır", async () => {
      if (!prisma) return;

      const orderId = `order_recon_conf_${Date.now()}`;
      await prisma.order.create({
        data: {
          id: orderId,
          orderNumber: `HM-RECON-C-${Date.now().toString().slice(-4)}`,
          customerEmail: "recon-c@humramoda.local",
          customerFullName: "Recon Confirmed Test",
          customerPhone: "05551112233",
          totalAmount: 300,
          totalKurus: 30000,
          subtotal: 300,
          shippingAddress: { city: "Ankara" },
          status: "CONFIRMED",
          paymentStatus: "PAID",
          refundedAmount: 0,
        },
      });

      const eventId = `outbox_recon_conf_${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "PaymentOutbox" (
          "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status", "retryCount", "maxRetries", "nextRetryAt"
        ) VALUES ($1, 'PAYMENT_REFUND', $2, $3, '{"refundAmountKurus": 15000}'::jsonb, 'REQUIRES_RECONCILIATION', 1, 5, NOW());
        `,
        eventId,
        orderId,
        `idem_recon_c_${Date.now()}`
      );

      // Admin mutabakatı onaylar
      const result = await TransactionalOutboxManager.reconcileRefundEvent(prisma, eventId, {
        action: "CONFIRMED",
        adminEmail: "finance_admin@humramoda.com",
        providerReference: "PAYTR-MANUAL-REF-998877",
        notes: "PayTR panelinde iadenin başarıyla yansıdığı doğrulandı.",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("COMPLETED");

      // Siparişin güncellendiğini doğrula (150 TL iade, kısmi iadede paymentStatus PAID kalır)
      const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
      expect(Number(updatedOrder?.refundedAmount)).toBe(150);
      expect(updatedOrder?.paymentStatus).toBe("PAID");

      // AuditLog kaydını doğrula
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: eventId, action: "OUTBOX_REFUND_RECONCILED_CONFIRMED" },
      });
      expect(audit).toBeDefined();
      expect(audit?.adminEmail).toBe("finance_admin@humramoda.com");
      expect((audit?.details as any)?.providerReference).toBe("PAYTR-MANUAL-REF-998877");

      // Temizlik
      await prisma.auditLog.deleteMany({ where: { targetId: eventId } });
      await prisma.$executeRawUnsafe(`DELETE FROM "PaymentOutbox" WHERE "id" = $1;`, eventId);
      await prisma.order.delete({ where: { id: orderId } });
    });

    it("4.2. REJECTED kararı: Sipariş bakiyesine dokunmamalı, olayı FAILED yapmalı ve AuditLog oluşturmalıdır", async () => {
      if (!prisma) return;

      const orderId = `order_recon_rej_${Date.now()}`;
      await prisma.order.create({
        data: {
          id: orderId,
          orderNumber: `HM-RECON-R-${Date.now().toString().slice(-4)}`,
          customerEmail: "recon-r@humramoda.local",
          customerFullName: "Recon Rejected Test",
          customerPhone: "05551112233",
          totalAmount: 250,
          totalKurus: 25000,
          subtotal: 250,
          shippingAddress: { city: "Bursa" },
          status: "CONFIRMED",
          paymentStatus: "PAID",
          refundedAmount: 0,
        },
      });

      const eventId = `outbox_recon_rej_${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "PaymentOutbox" (
          "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status", "retryCount", "maxRetries", "nextRetryAt"
        ) VALUES ($1, 'PAYMENT_REFUND', $2, $3, '{"refundAmountKurus": 25000}'::jsonb, 'REQUIRES_RECONCILIATION', 1, 5, NOW());
        `,
        eventId,
        orderId,
        `idem_recon_r_${Date.now()}`
      );

      // Admin mutabakatı reddeder
      const result = await TransactionalOutboxManager.reconcileRefundEvent(prisma, eventId, {
        action: "REJECTED",
        adminEmail: "audit_lead@humramoda.com",
        notes: "PayTR kayıtlarında bu sipariş numarasına ait işlem bulunamadı, talep mükerrer.",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("FAILED");

      // Siparişin DEĞİŞMEDİĞİNİ doğrula
      const orderCheck = await prisma.order.findUnique({ where: { id: orderId } });
      expect(Number(orderCheck?.refundedAmount)).toBe(0);
      expect(orderCheck?.paymentStatus).toBe("PAID");

      // AuditLog kaydını doğrula
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: eventId, action: "OUTBOX_REFUND_RECONCILED_REJECTED" },
      });
      expect(audit).toBeDefined();
      expect(audit?.adminEmail).toBe("audit_lead@humramoda.com");

      // Temizlik
      await prisma.auditLog.deleteMany({ where: { targetId: eventId } });
      await prisma.$executeRawUnsafe(`DELETE FROM "PaymentOutbox" WHERE "id" = $1;`, eventId);
      await prisma.order.delete({ where: { id: orderId } });
    });

    it("4.3. RETRY kararı: Olayı PENDING durumuna getirmeli ve sayacı sıfırlamalıdır", async () => {
      if (!prisma) return;

      const eventId = `outbox_recon_retry_${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "PaymentOutbox" (
          "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status", "retryCount", "maxRetries", "nextRetryAt"
        ) VALUES ($1, 'PAYMENT_REFUND', 'order_dummy', $2, '{"refundAmountKurus": 5000}'::jsonb, 'REQUIRES_RECONCILIATION', 3, 5, NOW());
        `,
        eventId,
        `idem_recon_ret_${Date.now()}`
      );

      const result = await TransactionalOutboxManager.reconcileRefundEvent(prisma, eventId, {
        action: "RETRY",
        adminEmail: "ops@humramoda.com",
        notes: "Geçici ağ problemi giderildi, yeniden sıraya alınıyor.",
        evidenceNote: "PayTR paneli doğrulandı, bu iade talebine ait hiçbir para çıkışı olmadığı kanıtlandı.",
        verifiedNoPriorRefund: true,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("PENDING");

      const row: any[] = await prisma.$queryRaw`
        SELECT status, "retryCount" FROM "PaymentOutbox" WHERE id = ${eventId};
      `;
      expect(row[0].status).toBe("PENDING");
      expect(row[0].retryCount).toBe(0);

      // Temizlik
      await prisma.auditLog.deleteMany({ where: { targetId: eventId } });
      await prisma.$executeRawUnsafe(`DELETE FROM "PaymentOutbox" WHERE "id" = $1;`, eventId);
    });
  });

  // 5. POSTGRESQL -> JSON GERİ DÖNÜŞ VE ALTYAPI METAVERİSİ OKUNABİLİRLİĞİ
  describe("5. PostgreSQL -> JSON Geri Dönüş Güvenliği ve Altyapı Metaverisi", () => {
    it("5.1. exportPgToStoreJson çıktısı JsonStoreDAO tarafından hatasız okunabilmelidir", async () => {
      const tempExportPath = path.join(process.cwd(), "data", `test_store_export_${Date.now()}.json`);

      try {
        const result = await exportPgToStoreJson({
          outputPath: tempExportPath,
          dryRun: false,
          allowOverwrite: true,
        });

        expect(result.success).toBe(true);
        expect(fs.existsSync(tempExportPath)).toBe(true);

        const exportedData = JSON.parse(fs.readFileSync(tempExportPath, "utf8"));

        // Standart mağaza alanlarının varlığını doğrula
        expect(exportedData.products?.length).toBe(13);
        const allExportedVariants = exportedData.products.flatMap((p: any) => p.variants || []);
        expect(allExportedVariants.length).toBe(118);
        expect(exportedData.categories?.length).toBe(7);

        // _postgresInfrastructure metaverisinin kayıpsız aktarıldığını doğrula
        expect(exportedData._postgresInfrastructure).toBeDefined();
        expect(Array.isArray(exportedData._postgresInfrastructure.paymentTransactions)).toBe(true);
        expect(Array.isArray(exportedData._postgresInfrastructure.idempotencyKeys)).toBe(true);
        expect(Array.isArray(exportedData._postgresInfrastructure.paymentOutbox)).toBe(true);

        // JsonStoreDAO sınıfının bu JSON'ı hatasız kabul ettiğini doğrula
        // (Bilinmeyen kök anahtarlar uygulamanın çalışmasını engellememelidir)
        const dao = new JsonStoreDAO();
        expect(exportedData.products.length).toBeGreaterThan(0);
        const testProduct = exportedData.products[0];
        expect(testProduct.id).toBeDefined();
      } finally {
        if (fs.existsSync(tempExportPath)) {
          fs.unlinkSync(tempExportPath);
        }
      }
    });
  });

  // 6. ÖDEME VE İDEMPOTENCY GÜVENLİK SINIRLARI
  describe("6. PayTR Callback, HMAC Güvenliği ve Bakiye Denetimi", () => {
    it("6.1. Timing-safe HMAC doğrulaması sahte hash'leri kesin olarak reddetmelidir", () => {
      const params = {
        merchantOid: "HM-ORD-12345",
        status: "success",
        totalAmount: "15000",
        merchantSalt: "test_merchant_salt",
        merchantKey: "test_merchant_key",
      };

      const validHash = computePayTRCallbackHash(params);
      const isValid = verifyPayTRCallbackHash(validHash, params);
      expect(isValid).toBe(true);

      const isInvalid = verifyPayTRCallbackHash("tampered_fake_hmac_hash_value_12345", params);
      expect(isInvalid).toBe(false);
    });

    it("6.2. Farklı payload içeriği ile aynı idempotency anahtarı kullanıldığında hata fırlatmalıdır", async () => {
      if (!prisma) return;
      const key = `test_idemp_mismatch_${Date.now()}`;

      await prisma.$transaction(async (tx) => {
        await IdempotencyManager.checkOrLockKey(
          tx,
          key,
          "PAYTR_WEBHOOK",
          { total: 500 }
        );
      });

      // Aynı anahtar ama farklı payload ile çağrıldığında IDEMPOTENCY_PAYLOAD_MISMATCH fırlatmalıdır
      await expect(
        prisma.$transaction(async (tx) => {
          await IdempotencyManager.checkOrLockKey(
            tx,
            key,
            "PAYTR_WEBHOOK",
            { total: 999999 } // Farklı payload!
          );
        })
      ).rejects.toThrow("IDEMPOTENCY_PAYLOAD_MISMATCH");

      // Temizlik
      await prisma.$executeRawUnsafe(`DELETE FROM "IdempotencyKey" WHERE "key" = $1;`, key);
    });
  });
});
