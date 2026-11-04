import crypto from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";

export type OutboxEventType = "PAYMENT_REFUND" | "PAYMENT_CAPTURE" | "CUSTOMER_NOTIFICATION";
export type OutboxEventStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "REQUIRES_RECONCILIATION";

export interface OutboxEvent {
  id: string;
  eventType: OutboxEventType;
  aggregateId: string;
  idempotencyKey: string;
  payload: any;
  status: OutboxEventStatus;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date;
  errorMessage?: string;
  processedAt?: Date;
  providerReference?: string;
  createdAt: Date;
}

export interface EnqueueOutboxInput {
  eventType: OutboxEventType;
  aggregateId: string;
  idempotencyKey?: string;
  payload: any;
  maxRetries?: number;
}

export interface RefundGatewayCaller {
  (params: {
    merchantOid: string;
    returnAmountKurus: number;
    referenceKey: string;
  }): Promise<{
    status: "success" | "error" | "timeout" | "network_error";
    providerRef?: string;
    errorMessage?: string;
  }>;
}

/**
 * TransactionalOutboxManager
 * 
 * Harici ödeme ağ geçitleri (PayTR vb.) için Transactional Outbox Pattern mimarisi.
 * 
 * KESİN GÜVENLİK İLKELERİ:
 * 1. PayTR İade API'sinde istemci tarafı idempotency anahtarı desteği resmi olarak garanti edilmemektedir.
 *    Aynı iade isteği tekrar gönderilirse sağlayıcı mükerrer iade (çift para çıkışı) yapabilir.
 * 2. Ağ zaman aşımı veya belirsiz yanıtlarda KESİNLİKLE KÖRLEMESİNE RETRY YAPILMAZ.
 *    Kayıt 'REQUIRES_RECONCILIATION' durumuna alınır ve manuel veya durum sorgulama mutabakatı beklenir.
 * 3. Kısmi iadelerde toplam iade tutarı asla sipariş tutarını aşamaz.
 * 4. Çoklu worker senaryolarında satırlar 'FOR UPDATE SKIP LOCKED' ile kilitlenir; aynı kayıt iki worker tarafından işlenemez.
 */
export class TransactionalOutboxManager {
  private static tableEnsured = false;

  /**
   * Outbox tablosunun varlığını doğrular veya oluşturur.
   */
  public static async ensureTable(client: Prisma.TransactionClient | PrismaClient): Promise<void> {
    if (this.tableEnsured) return;

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PaymentOutbox" (
        "id" TEXT PRIMARY KEY,
        "eventType" TEXT NOT NULL,
        "aggregateId" TEXT NOT NULL,
        "idempotencyKey" TEXT NOT NULL UNIQUE,
        "payload" JSONB NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "retryCount" INT NOT NULL DEFAULT 0,
        "maxRetries" INT NOT NULL DEFAULT 5,
        "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "errorMessage" TEXT,
        "processedAt" TIMESTAMP(3),
        "providerReference" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
      );
    `);

    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_outbox_status_retry" ON "PaymentOutbox"("status", "nextRetryAt");
    `);

    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_outbox_aggregate" ON "PaymentOutbox"("aggregateId");
    `);

    this.tableEnsured = true;
  }

  /**
   * Bir DB transaction'ı içinde yeni bir outbox olayı kuyruğa ekler.
   */
  public static async enqueueEvent(
    tx: Prisma.TransactionClient,
    input: EnqueueOutboxInput
  ): Promise<string> {
    await this.ensureTable(tx);

    const eventId = `outbox_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const idempotencyKey =
      input.idempotencyKey || `idemp_outbox_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const maxRetries = input.maxRetries ?? 5;
    const payloadJson = JSON.stringify(input.payload);

    await tx.$executeRawUnsafe(
      `
      INSERT INTO "PaymentOutbox" (
        "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status", "retryCount", "maxRetries", "nextRetryAt"
      ) VALUES ($1, $2, $3, $4, $5::jsonb, 'PENDING', 0, $6, NOW())
      ON CONFLICT ("idempotencyKey") DO NOTHING;
      `,
      eventId,
      input.eventType,
      input.aggregateId,
      idempotencyKey,
      payloadJson,
      maxRetries
    );

    return eventId;
  }

  /**
   * İşlenmeyi bekleyen olayları pesimistik satır kilidi (FOR UPDATE SKIP LOCKED) ile sorgular.
   */
  public static async fetchPendingEvents(
    tx: Prisma.TransactionClient,
    limit = 10
  ): Promise<OutboxEvent[]> {
    await this.ensureTable(tx);

    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        eventType: OutboxEventType;
        aggregateId: string;
        idempotencyKey: string;
        payload: any;
        status: OutboxEventStatus;
        retryCount: number;
        maxRetries: number;
        nextRetryAt: Date;
        errorMessage: string | null;
        processedAt: Date | null;
        providerReference: string | null;
        createdAt: Date;
      }>
    >`
      SELECT "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status",
             "retryCount", "maxRetries", "nextRetryAt", "errorMessage", "processedAt",
             "providerReference", "createdAt"
      FROM "PaymentOutbox"
      WHERE "status" = 'PENDING' AND "nextRetryAt" <= NOW()
      ORDER BY "nextRetryAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED;
    `;

    return rows.map((r) => ({
      ...r,
      errorMessage: r.errorMessage || undefined,
      processedAt: r.processedAt || undefined,
      providerReference: r.providerReference || undefined,
    }));
  }

  /**
   * İşlenmeyi bekleyen olayları pesimistik satır kilidi (FOR UPDATE SKIP LOCKED) ile çeker
   * ve hemen PROCESSING durumuna geçirir (Worker kullanımına özel).
   */
  public static async fetchAndLockPendingEvents(
    tx: Prisma.TransactionClient,
    limit = 10
  ): Promise<OutboxEvent[]> {
    await this.ensureTable(tx);

    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        eventType: OutboxEventType;
        aggregateId: string;
        idempotencyKey: string;
        payload: any;
        status: OutboxEventStatus;
        retryCount: number;
        maxRetries: number;
        nextRetryAt: Date;
        errorMessage: string | null;
        processedAt: Date | null;
        providerReference: string | null;
        createdAt: Date;
      }>
    >`
      SELECT "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status",
             "retryCount", "maxRetries", "nextRetryAt", "errorMessage", "processedAt",
             "providerReference", "createdAt"
      FROM "PaymentOutbox"
      WHERE ("status" = 'PENDING' AND "nextRetryAt" <= NOW())
         OR ("status" = 'PROCESSING' AND "nextRetryAt" <= NOW() - INTERVAL '5 minutes')
      ORDER BY "nextRetryAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED;
    `;

    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      await tx.$executeRawUnsafe(
        `
        UPDATE "PaymentOutbox"
        SET "status" = 'PROCESSING',
            "nextRetryAt" = NOW()
        WHERE "id" = ANY($1::text[]);
        `,
        ids
      );
    }

    return rows.map((r) => ({
      ...r,
      status: "PROCESSING" as const,
      errorMessage: r.errorMessage || undefined,
      processedAt: r.processedAt || undefined,
      providerReference: r.providerReference || undefined,
    }));
  }

  /**
   * Olayın başarıyla tamamlandığını kaydeder.
   */
  public static async markCompleted(
    tx: Prisma.TransactionClient,
    eventId: string,
    providerReference?: string
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `
      UPDATE "PaymentOutbox"
      SET "status" = 'COMPLETED',
          "processedAt" = NOW(),
          "providerReference" = $2,
          "errorMessage" = NULL
      WHERE "id" = $1;
      `,
      eventId,
      providerReference || null
    );
  }

  /**
   * Olayın başarısız olduğunu kaydeder.
   * Eğer hata belirsiz ağ/zaman aşımı hatası ise 'REQUIRES_RECONCILIATION' yapılır; körlemesine tekrar denenmez.
   */
  public static async markFailed(
    tx: Prisma.TransactionClient,
    eventId: string,
    errorMessage: string,
    isAmbiguousNetworkError = false
  ): Promise<void> {
    if (isAmbiguousNetworkError) {
      // PayTR iade API'sinde ağ zaman aşımı: Sağlayıcı işlemi yapmış olabilir, kör tekrar yasaktır!
      await tx.$executeRawUnsafe(
        `
        UPDATE "PaymentOutbox"
        SET "status" = 'REQUIRES_RECONCILIATION',
            "errorMessage" = $2,
            "processedAt" = NOW()
        WHERE "id" = $1;
        `,
        eventId,
        `MUTABAKAT_GEREKLİ: ${errorMessage}`
      );
    } else {
      await tx.$executeRawUnsafe(
        `
        UPDATE "PaymentOutbox"
        SET "status" = 'FAILED',
            "errorMessage" = $2,
            "processedAt" = NOW()
        WHERE "id" = $1;
        `,
        eventId,
        errorMessage
      );
    }
  }

  /**
   * İade Outbox Olayını Güvenle İşler (Worker Mantığı):
   * 1. Siparişin toplam tutarını ve daha önce iade edilmiş tutarını kontrol eder.
   * 2. Tutar aşımı varsa işlemi kesin olarak reddeder.
   3. Harici çağrıyı yürütür.
   4. Ağ zaman aşımı olursa 'REQUIRES_RECONCILIATION' statüsüne alır.
   */
  public static async processRefundOutboxItem(
    prisma: PrismaClient,
    outboxItem: OutboxEvent,
    caller: RefundGatewayCaller
  ): Promise<{ success: boolean; status: OutboxEventStatus; error?: string }> {
    const payload = outboxItem.payload;
    const orderId = outboxItem.aggregateId;
    const requestedKurus = Number(payload.refundAmountKurus);

    if (isNaN(requestedKurus) || requestedKurus <= 0) {
      await prisma.$transaction(async (tx) => {
        await this.markFailed(tx, outboxItem.id, "Geçersiz iade tutarı.", false);
      });
      return { success: false, status: "FAILED", error: "Geçersiz iade tutarı." };
    }

    // 1. Sipariş Bakiye Kontrolü
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, totalKurus: true, refundedAmount: true, totalAmount: true },
    });

    if (!order) {
      await prisma.$transaction(async (tx) => {
        await this.markFailed(tx, outboxItem.id, "İlgili sipariş veritabanında bulunamadı.", false);
      });
      return { success: false, status: "FAILED", error: "Sipariş bulunamadı." };
    }

    const currentRefundedKurus = Math.round(Number(order.refundedAmount) * 100);
    if (currentRefundedKurus + requestedKurus > order.totalKurus) {
      const err = `İADE_LIMITI_AŞILDI: Talep (${requestedKurus} kuruş) + Mevcut İade (${currentRefundedKurus} kuruş) > Sipariş Toplamı (${order.totalKurus} kuruş).`;
      await prisma.$transaction(async (tx) => {
        await this.markFailed(tx, outboxItem.id, err, false);
      });
      return { success: false, status: "FAILED", error: err };
    }

    // 2. Harici Sağlayıcı Çağrısı (Transaction dışında yürütülür!)
    const cleanOid = order.orderNumber.replace(/[^a-zA-Z0-9]/g, "");
    const gatewayRes = await caller({
      merchantOid: cleanOid,
      returnAmountKurus: requestedKurus,
      referenceKey: outboxItem.idempotencyKey,
    });

    // 3. Sonucu Veritabanına Atomik İşle
    if (gatewayRes.status === "success") {
      await prisma.$transaction(async (tx) => {
        await this.markCompleted(tx, outboxItem.id, gatewayRes.providerRef);

        const newRefundedKurus = currentRefundedKurus + requestedKurus;
        const newRefundedAmount = new Prisma.Decimal(newRefundedKurus / 100);
        const isFullyRefunded = newRefundedKurus >= order.totalKurus;

        await tx.order.update({
          where: { id: order.id },
          data: {
            refundedAmount: newRefundedAmount,
            paymentStatus: isFullyRefunded ? "REFUNDED" : "PAID",
          },
        });
      });

      return { success: true, status: "COMPLETED" };
    } else if (gatewayRes.status === "timeout" || gatewayRes.status === "network_error") {
      // Belirsiz ağ hatası: Çift iadeyi önlemek için MUTABAKAT durumuna al
      await prisma.$transaction(async (tx) => {
        await this.markFailed(
          tx,
          outboxItem.id,
          gatewayRes.errorMessage || "Sağlayıcı çağrısında ağ zaman aşımı oluştu.",
          true // ambiguous
        );
      });

      return {
        success: false,
        status: "REQUIRES_RECONCILIATION",
        error: "Ağ zaman aşımı nedeniyle işlem mutabakat durumuna alındı.",
      };
    } else {
      // Kesin hata (örn: yetersiz bakiye, geçersiz kart)
      await prisma.$transaction(async (tx) => {
        await this.markFailed(
          tx,
          outboxItem.id,
          gatewayRes.errorMessage || "Ödeme sağlayıcısı iade isteğini reddetti.",
          false
        );
      });

      return { success: false, status: "FAILED", error: gatewayRes.errorMessage };
    }
  }

  /**
   * Manuel mutabakat bekleyen (karantinaya alınmış) olayları listeler.
   */
  public static async fetchQuarantinedEvents(
    client: Prisma.TransactionClient | PrismaClient,
    limit = 50
  ): Promise<OutboxEvent[]> {
    await this.ensureTable(client);

    const rows = await client.$queryRaw<
      Array<{
        id: string;
        eventType: OutboxEventType;
        aggregateId: string;
        idempotencyKey: string;
        payload: any;
        status: OutboxEventStatus;
        retryCount: number;
        maxRetries: number;
        nextRetryAt: Date;
        errorMessage: string | null;
        processedAt: Date | null;
        providerReference: string | null;
        createdAt: Date;
      }>
    >`
      SELECT "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status",
             "retryCount", "maxRetries", "nextRetryAt", "errorMessage", "processedAt",
             "providerReference", "createdAt"
      FROM "PaymentOutbox"
      WHERE "status" = 'REQUIRES_RECONCILIATION'
      ORDER BY "createdAt" DESC
      LIMIT ${limit};
    `;

    return rows.map((r) => ({
      ...r,
      errorMessage: r.errorMessage || undefined,
      processedAt: r.processedAt || undefined,
      providerReference: r.providerReference || undefined,
    }));
  }

  /**
   * Manuel Mutabakat İşlemi (Admin / Operatör Kararı):
   * 
   * 'REQUIRES_RECONCILIATION' durumunda takılmış bir olayı güvenle çözer.
   * - CONFIRMED: PayTR panelinde iadenin gerçekleştiği görülmüşse; sipariş bakiyesini günceller ve olayı COMPLETED yapar.
   * - REJECTED: PayTR panelinde işlemin hiç gerçekleşmediği görülmüşse; olayı FAILED yapar, sipariş bakiyesine dokunmaz.
   * - RETRY: İşlemin güvenle yeniden kuyruğa alınması isteniyorsa; durumu PENDING yapar ve sayacı sıfırlar.
   */
  public static async reconcileRefundEvent(
    prisma: PrismaClient,
    eventId: string,
    decision: {
      action: "CONFIRMED" | "REJECTED" | "RETRY";
      adminEmail?: string;
      providerReference?: string;
      notes?: string;
      evidenceNote?: string;
      verifiedNoPriorRefund?: boolean;
    }
  ): Promise<{ success: boolean; status: OutboxEventStatus; message: string }> {
    await this.ensureTable(prisma);

    return await prisma.$transaction(async (tx) => {
      // 1. Olayı kilitleyerek çek
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          eventType: OutboxEventType;
          aggregateId: string;
          idempotencyKey: string;
          payload: any;
          status: OutboxEventStatus;
          retryCount: number;
        }>
      >`
        SELECT "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status", "retryCount"
        FROM "PaymentOutbox"
        WHERE "id" = ${eventId}
        FOR UPDATE;
      `;

      if (rows.length === 0) {
        throw new Error(`Mutabakat için kayıt bulunamadı: ${eventId}`);
      }

      const item = rows[0];
      if (item.status !== "REQUIRES_RECONCILIATION" && item.status !== "FAILED") {
        throw new Error(
          `Sadece 'REQUIRES_RECONCILIATION' veya 'FAILED' durumundaki olaylar uzlaştırılabilir. Mevcut: ${item.status}`
        );
      }

      const orderId = item.aggregateId;
      const requestedKurus = Number(item.payload?.refundAmountKurus || 0);

      if (decision.action === "CONFIRMED") {
        if (!decision.providerReference || decision.providerReference.trim().length === 0) {
          throw new Error("MUTABAKAT_HATASI: Onaylanan iadeler için sağlayıcı referansı (PayTR referans kodu) zorunludur.");
        }

        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { id: true, totalKurus: true, refundedAmount: true, paymentStatus: true },
        });

        if (!order) {
          throw new Error(`İlişkili sipariş bulunamadı: ${orderId}`);
        }

        const currentRefundedKurus = Math.round(Number(order.refundedAmount) * 100);
        const newRefundedKurus = currentRefundedKurus + requestedKurus;

        if (newRefundedKurus > order.totalKurus) {
          throw new Error(
            `İADE_LIMITI_AŞILDI: Talep (${requestedKurus} kuruş) + Mevcut İade (${currentRefundedKurus} kuruş) > Sipariş Toplamı (${order.totalKurus} kuruş).`
          );
        }

        const newRefundedAmount = new Prisma.Decimal(newRefundedKurus / 100);
        const isFullyRefunded = newRefundedKurus >= order.totalKurus;

        await tx.order.update({
          where: { id: order.id },
          data: {
            refundedAmount: newRefundedAmount,
            paymentStatus: isFullyRefunded ? "REFUNDED" : "PAID",
          },
        });

        await tx.$executeRawUnsafe(
          `
          UPDATE "PaymentOutbox"
          SET "status" = 'COMPLETED',
              "providerReference" = $2,
              "errorMessage" = $3,
              "processedAt" = NOW()
          WHERE "id" = $1;
          `,
          eventId,
          decision.providerReference || "MANUAL_RECONCILIATION",
          decision.notes ? `Uzlaşma Notu: ${decision.notes}` : null
        );

        // AuditLog kaydı oluştur
        await tx.auditLog.create({
          data: {
            adminEmail: decision.adminEmail || "system@humramoda.local",
            action: "OUTBOX_REFUND_RECONCILED_CONFIRMED",
            targetType: "PaymentOutbox",
            targetId: eventId,
            result: "SUCCESS",
            details: {
              orderId,
              requestedKurus,
              providerReference: decision.providerReference,
              notes: decision.notes,
            },
          },
        });

        return {
          success: true,
          status: "COMPLETED",
          message: `İade mutabakatı onaylandı. Sipariş bakiyesi ${newRefundedKurus / 100} TL olarak güncellendi.`,
        };
      } else if (decision.action === "REJECTED") {
        if (!decision.notes || decision.notes.trim().length === 0) {
          throw new Error("MUTABAKAT_HATASI: Reddedilen iadeler için ret gerekçesi zorunludur.");
        }

        await tx.$executeRawUnsafe(
          `
          UPDATE "PaymentOutbox"
          SET "status" = 'FAILED',
              "errorMessage" = $2,
              "processedAt" = NOW()
          WHERE "id" = $1;
          `,
          eventId,
          `Manuel mutabakat ile reddedildi: ${decision.notes}`
        );

        await tx.auditLog.create({
          data: {
            adminEmail: decision.adminEmail || "system@humramoda.local",
            action: "OUTBOX_REFUND_RECONCILED_REJECTED",
            targetType: "PaymentOutbox",
            targetId: eventId,
            result: "SUCCESS",
            details: {
              orderId,
              requestedKurus,
              notes: decision.notes,
            },
          },
        });

        return {
          success: true,
          status: "FAILED",
          message: "İade mutabakatı reddedildi. Sipariş bakiyesi değiştirilmedi.",
        };
      } else {
        // RETRY (Yalnızca önceki iadenin gerçekleşmediği kesin kanıtlandığında)
        const evidence = (decision as any).evidenceNote;
        const verified = (decision as any).verifiedNoPriorRefund;
        if (!verified || !evidence || String(evidence).trim().length < 10) {
          throw new Error(
            "GÜVENLİK ENGELİ: PayTR iade API'si mükerrer iade riski taşıdığından, önceki iadenin kesinlikle gerçekleşmediği doğrulanmadan ('verifiedNoPriorRefund: true') ve en az 10 karakterlik kanıt notu ('evidenceNote') sunulmadan RETRY yapılamaz."
          );
        }

        await tx.$executeRawUnsafe(
          `
          UPDATE "PaymentOutbox"
          SET "status" = 'PENDING',
              "retryCount" = 0,
              "nextRetryAt" = NOW(),
              "errorMessage" = $2
          WHERE "id" = $1;
          `,
          eventId,
          `Manuel yeniden deneme (Kanıt: ${evidence}): ${decision.notes}`
        );

        await tx.auditLog.create({
          data: {
            adminEmail: decision.adminEmail || "system@humramoda.local",
            action: "OUTBOX_REFUND_RECONCILED_RETRY",
            targetType: "PaymentOutbox",
            targetId: eventId,
            result: "SUCCESS",
            details: {
              orderId,
              requestedKurus,
              notes: decision.notes,
              evidenceNote: evidence,
              verifiedNoPriorRefund: true,
            },
          },
        });

        return {
          success: true,
          status: "PENDING",
          message: "Olay yeniden deneme kuyruğuna alındı.",
        };
      }
    });
  }
}
