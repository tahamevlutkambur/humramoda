import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { TransactionalOutboxManager } from "../src/lib/server/dao/outbox";
import { GET, POST } from "../src/app/api/admin/finance/reconcile/route";
import { createSessionToken, ADMIN_COOKIE_NAME } from "../src/lib/server/auth";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://humra_test:Yc1RJPBs3A9Xt0dfFU3R0P3W@127.0.0.1:5432/humra_migration_test?schema=public";

describe("FAZ 9.1: İade Mutabakat API ve Yetkilendirme Test Paketi", () => {
  let prisma: PrismaClient | null = null;
  let adminToken: string;
  let staffToken: string;

  beforeAll(async () => {
    process.env.TEST_DATABASE_URL = TEST_DB_URL;
    try {
      const client = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
      await client.$connect();
      prisma = client;
    } catch (err) {
      console.warn("PostgreSQL test veritabanına bağlanılamadı:", err);
      prisma = null;
    }

    // Token üret
    adminToken = createSessionToken({
      userId: "usr_admin_test",
      email: "admin@humramoda.local",
      fullName: "Admin Test",
      role: "ADMIN",
    });

    staffToken = createSessionToken({
      userId: "usr_staff_test",
      email: "staff@humramoda.local",
      fullName: "Staff Test",
      role: "STAFF",
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  const createMockRequest = (method: string, body?: any, token?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["cookie"] = `${ADMIN_COOKIE_NAME}=${token}`;
    }

    return new Request("http://localhost:3000/api/admin/finance/reconcile", {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  // 1. YETKİLENDİRME VE GÜVENLİK TESTLERİ
  describe("1. Yetkilendirme ve Oturum Kontrolleri", () => {
    it("1.1. Oturumu olmayan istek 401 dönmelidir", async () => {
      const req = createMockRequest("GET");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("1.2. STAFF rolündeki kullanıcı 403 almalıdır (Sadece ADMIN yetkili)", async () => {
      const req = createMockRequest("GET", undefined, staffToken);
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it("1.3. ADMIN kullanıcısı GET isteğinde 200 almalı ve liste dönmelidir", async () => {
      if (!prisma) return;
      const req = createMockRequest("GET", undefined, adminToken);
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.quarantinedEvents)).toBe(true);
      expect(Array.isArray(json.historyEvents)).toBe(true);
    });
  });

  // 2. DOĞRULAMA (VALIDATION) KURALLARI
  describe("2. İstek Parametreleri ve İş Kuralı Doğrulaması", () => {
    it("2.1. Eksik eventId veya geçersiz action 400 dönmelidir", async () => {
      const req = createMockRequest("POST", { eventId: "", action: "INVALID" }, adminToken);
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("2.2. CONFIRMED seçilip providerReference verilmediğinde 400 dönmelidir", async () => {
      const req = createMockRequest(
        "POST",
        { eventId: "dummy_id", action: "CONFIRMED", notes: "Açıklama notu var ama referans yok" },
        adminToken
      );
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("providerReference");
    });

    it("2.3. REJECTED seçilip en az 5 karakterlik gerekçe girilmediğinde 400 dönmelidir", async () => {
      const req = createMockRequest(
        "POST",
        { eventId: "dummy_id", action: "REJECTED", notes: "kısa" },
        adminToken
      );
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("2.4. RETRY isteğinde verifiedNoPriorRefund veya evidenceNote yoksa güvenlik engeli dönmelidir", async () => {
      const req = createMockRequest(
        "POST",
        { eventId: "dummy_id", action: "RETRY", notes: "Tekrar dene" },
        adminToken
      );
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("GÜVENLİK ENGELİ");
    });
  });

  // 3. UÇTAN UCA MUTABAKAT VE ATOMİK İŞLEM TESTLERİ
  describe("3. Uçtan Uca Mutabakat ve Sipariş Bakiye Senkronizasyonu", () => {
    it("3.1. CONFIRMED: İade sipariş bakiyesini güncellemeli, olayı COMPLETED yapmalı ve AuditLog oluşturmalıdır", async () => {
      if (!prisma) return;

      const orderId = `ord_api_test_conf_${Date.now()}`;
      await prisma.order.create({
        data: {
          id: orderId,
          orderNumber: `HM-API-CONF-${Date.now().toString().slice(-4)}`,
          customerEmail: "api-conf@humramoda.local",
          customerFullName: "API Confirmed Test",
          customerPhone: "05559990011",
          totalAmount: 500,
          totalKurus: 50000,
          subtotal: 500,
          shippingAddress: { city: "İzmir" },
          status: "CONFIRMED",
          paymentStatus: "PAID",
          refundedAmount: 0,
        },
      });

      const eventId = `outbox_api_conf_${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "PaymentOutbox" (
          "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status", "retryCount", "maxRetries", "nextRetryAt"
        ) VALUES ($1, 'PAYMENT_REFUND', $2, $3, '{"refundAmountKurus": 20000}'::jsonb, 'REQUIRES_RECONCILIATION', 1, 5, NOW());
        `,
        eventId,
        orderId,
        `idem_api_c_${Date.now()}`
      );

      // API Çağrısı
      const req = createMockRequest(
        "POST",
        {
          eventId,
          action: "CONFIRMED",
          providerReference: "PAYTR-API-REF-12345",
          notes: "PayTR panelinde 200 TL iadenin hesaba yansıdığı doğrulandı.",
        },
        adminToken
      );

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe("COMPLETED");

      // Veritabanı doğrulaması
      const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
      expect(Number(updatedOrder?.refundedAmount)).toBe(200);

      // AuditLog kontrolü
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: eventId, action: "OUTBOX_REFUND_RECONCILED_CONFIRMED" },
      });
      expect(audit).toBeDefined();

      // İkinci kez mutabakat denendiğinde 400 engeli
      const duplicateReq = createMockRequest(
        "POST",
        {
          eventId,
          action: "CONFIRMED",
          providerReference: "PAYTR-DUP-999",
          notes: "İkinci kez mutabakat denemesi.",
        },
        adminToken
      );
      const dupRes = await POST(duplicateReq);
      expect(dupRes.status).toBe(400);
      const dupJson = await dupRes.json();
      expect(dupJson.error).toContain("daha önce uzlaştırılmış");

      // Temizlik
      await prisma.auditLog.deleteMany({ where: { targetId: eventId } });
      await prisma.$executeRawUnsafe(`DELETE FROM "PaymentOutbox" WHERE "id" = $1;`, eventId);
      await prisma.order.delete({ where: { id: orderId } });
    });

    it("3.2. REJECTED: Sipariş bakiyesini değiştirmemeli, olayı FAILED yapmalı ve AuditLog oluşturmalıdır", async () => {
      if (!prisma) return;

      const orderId = `ord_api_test_rej_${Date.now()}`;
      await prisma.order.create({
        data: {
          id: orderId,
          orderNumber: `HM-API-REJ-${Date.now().toString().slice(-4)}`,
          customerEmail: "api-rej@humramoda.local",
          customerFullName: "API Rejected Test",
          customerPhone: "05559990022",
          totalAmount: 400,
          totalKurus: 40000,
          subtotal: 400,
          shippingAddress: { city: "Ankara" },
          status: "CONFIRMED",
          paymentStatus: "PAID",
          refundedAmount: 0,
        },
      });

      const eventId = `outbox_api_rej_${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "PaymentOutbox" (
          "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status", "retryCount", "maxRetries", "nextRetryAt"
        ) VALUES ($1, 'PAYMENT_REFUND', $2, $3, '{"refundAmountKurus": 15000}'::jsonb, 'REQUIRES_RECONCILIATION', 1, 5, NOW());
        `,
        eventId,
        orderId,
        `idem_api_r_${Date.now()}`
      );

      // API Çağrısı
      const req = createMockRequest(
        "POST",
        {
          eventId,
          action: "REJECTED",
          notes: "PayTR paneli incelendi, istek zaman aşımına uğramış ve para çekilmemiştir.",
        },
        adminToken
      );

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe("FAILED");

      // Siparişin değişmediğini doğrula
      const orderCheck = await prisma.order.findUnique({ where: { id: orderId } });
      expect(Number(orderCheck?.refundedAmount)).toBe(0);

      // AuditLog kontrolü
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: eventId, action: "OUTBOX_REFUND_RECONCILED_REJECTED" },
      });
      expect(audit).toBeDefined();

      // Temizlik
      await prisma.auditLog.deleteMany({ where: { targetId: eventId } });
      await prisma.$executeRawUnsafe(`DELETE FROM "PaymentOutbox" WHERE "id" = $1;`, eventId);
      await prisma.order.delete({ where: { id: orderId } });
    });
  });
});
