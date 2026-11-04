import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { requireAdminRole } from "@/lib/server/session-guard";
import { TransactionalOutboxManager } from "@/lib/server/dao/outbox";
import { prisma as defaultPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getDbClient(): PrismaClient {
  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (testDbUrl) {
    return new PrismaClient({ datasources: { db: { url: testDbUrl } } });
  }
  return defaultPrisma;
}

/**
 * GET: Mutabakat bekleyen (karantinaya alınmış) iade olaylarını ve geçmiş kayıtları listeler.
 */
export async function GET(req: Request) {
  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const client = getDbClient();

  try {
    await TransactionalOutboxManager.ensureTable(client);

    // 1. Karantinadaki olayları çek
    const quarantinedRows: any[] = await client.$queryRaw`
      SELECT "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status",
             "retryCount", "maxRetries", "nextRetryAt", "errorMessage", "processedAt",
             "providerReference", "createdAt"
      FROM "PaymentOutbox"
      WHERE "status" = 'REQUIRES_RECONCILIATION'
      ORDER BY "createdAt" DESC
      LIMIT 100;
    `;

    // 2. Geçmiş uzlaştırılmış kayıtları çek (COMPLETED veya FAILED olan son 50 kayıt)
    const historyRows: any[] = await client.$queryRaw`
      SELECT "id", "eventType", "aggregateId", "idempotencyKey", "payload", "status",
             "retryCount", "maxRetries", "nextRetryAt", "errorMessage", "processedAt",
             "providerReference", "createdAt"
      FROM "PaymentOutbox"
      WHERE "status" IN ('COMPLETED', 'FAILED')
      ORDER BY "processedAt" DESC NULLS LAST, "createdAt" DESC
      LIMIT 50;
    `;

    // 3. İlgili siparişleri çekerek olayları zenginleştir
    const allAggregateIds = Array.from(
      new Set([...quarantinedRows, ...historyRows].map((r) => r.aggregateId))
    );

    let ordersMap: Record<string, any> = {};
    if (allAggregateIds.length > 0) {
      const orders = await client.order.findMany({
        where: { id: { in: allAggregateIds } },
        select: {
          id: true,
          orderNumber: true,
          customerFullName: true,
          customerEmail: true,
          totalAmount: true,
          totalKurus: true,
          refundedAmount: true,
          paymentStatus: true,
          status: true,
          createdAt: true,
        },
      });
      ordersMap = orders.reduce((acc, o) => {
        acc[o.id] = o;
        return acc;
      }, {} as Record<string, any>);
    }

    const enrichEvent = (row: any) => {
      const order = ordersMap[row.aggregateId];
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload || {};
      const refundAmountKurus = Number(payload.refundAmountKurus || 0);

      return {
        id: row.id,
        eventType: row.eventType,
        aggregateId: row.aggregateId,
        idempotencyKey: row.idempotencyKey,
        payload,
        status: row.status,
        retryCount: row.retryCount,
        maxRetries: row.maxRetries,
        nextRetryAt: row.nextRetryAt,
        errorMessage: row.errorMessage || null,
        processedAt: row.processedAt || null,
        providerReference: row.providerReference || null,
        createdAt: row.createdAt,
        refundAmountKurus,
        refundAmountTL: (refundAmountKurus / 100).toFixed(2),
        order: order
          ? {
              orderNumber: order.orderNumber,
              customerFullName: order.customerFullName,
              customerEmail: order.customerEmail,
              totalAmount: Number(order.totalAmount),
              totalKurus: order.totalKurus,
              refundedAmount: Number(order.refundedAmount),
              paymentStatus: order.paymentStatus,
              status: order.status,
            }
          : null,
      };
    };

    const quarantinedEvents = quarantinedRows.map(enrichEvent);
    const historyEvents = historyRows.map(enrichEvent);

    return NextResponse.json({
      success: true,
      quarantinedEvents,
      historyEvents,
      count: quarantinedEvents.length,
    });
  } catch (err: any) {
    console.error("GET /api/admin/finance/reconcile error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Mutabakat verileri alınırken veritabanı hatası oluştu.",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  } finally {
    if (process.env.TEST_DATABASE_URL) {
      await client.$disconnect().catch(() => {});
    }
  }
}

/**
 * POST: Yetkili operatörün bir karantina iade olayını kesinleştirmesi / uzlaştırması.
 */
export async function POST(req: Request) {
  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const session = auth.session;
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const correlationId = `recon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON istek gövdesi." }, { status: 400 });
  }

  // İstek Doğrulama
  const { eventId, action, providerReference, notes, verifiedNoPriorRefund, evidenceNote } = body;

  if (!eventId || typeof eventId !== "string" || eventId.trim().length === 0) {
    return NextResponse.json({ error: "Eksik veya geçersiz 'eventId' parametresi." }, { status: 400 });
  }

  if (action !== "CONFIRMED" && action !== "REJECTED" && action !== "RETRY") {
    return NextResponse.json(
      { error: "Geçersiz 'action' parametresi. ('CONFIRMED', 'REJECTED' veya 'RETRY' olmalıdır)." },
      { status: 400 }
    );
  }

  if (!notes || typeof notes !== "string" || notes.trim().length < 5) {
    return NextResponse.json(
      { error: "Operatör açıklaması ('notes') en az 5 karakter uzunluğunda olmalıdır." },
      { status: 400 }
    );
  }

  if (action === "CONFIRMED") {
    if (!providerReference || typeof providerReference !== "string" || providerReference.trim().length < 3) {
      return NextResponse.json(
        {
          error:
            "Onaylama ('CONFIRMED') için PayTR işlem veya referans kodu ('providerReference') en az 3 karakter olarak zorunludur.",
        },
        { status: 400 }
      );
    }
  }

  if (action === "RETRY") {
    if (!verifiedNoPriorRefund) {
      return NextResponse.json(
        {
          error:
            "GÜVENLİK ENGELİ: PayTR iade API'si mükerrer iade riski taşıdığından, önceki iadenin kesinlikle gerçekleşmediği doğrulanmadan ('verifiedNoPriorRefund: true') RETRY yapılamaz.",
        },
        { status: 400 }
      );
    }
    if (!evidenceNote || typeof evidenceNote !== "string" || evidenceNote.trim().length < 10) {
      return NextResponse.json(
        {
          error:
            "GÜVENLİK ENGELİ: Yeniden deneme için sağlayıcı kontrol bilgisi ve kanıt açıklaması ('evidenceNote') en az 10 karakter olarak zorunludur.",
        },
        { status: 400 }
      );
    }
  }

  const client = getDbClient();

  try {
    await TransactionalOutboxManager.ensureTable(client);

    // Kaydı kontrol et: zaten COMPLETED ise mükerrer mutabakatı engelle
    const existing: any[] = await client.$queryRaw`
      SELECT "id", "status" FROM "PaymentOutbox" WHERE "id" = ${eventId};
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: `Mutabakat yapılacak olay bulunamadı: ${eventId}` },
        { status: 404 }
      );
    }

    if (existing[0].status === "COMPLETED") {
      return NextResponse.json(
        { error: "Bu iade olayı daha önce uzlaştırılmış ve tamamlanmıştır. Tekrar işlem yapılamaz." },
        { status: 400 }
      );
    }

    // Uzlaştırma motorunu çalıştır
    const result = await TransactionalOutboxManager.reconcileRefundEvent(client, eventId, {
      action,
      adminEmail: session.email,
      providerReference: providerReference?.trim(),
      notes: notes.trim(),
      evidenceNote: evidenceNote?.trim(),
      verifiedNoPriorRefund: Boolean(verifiedNoPriorRefund),
    });

    return NextResponse.json({
      success: true,
      status: result.status,
      message: result.message,
      correlationId,
    });
  } catch (err: any) {
    console.error("POST /api/admin/finance/reconcile error:", err);
    const message = err?.message || String(err);
    const isLimitError = message.includes("İADE_LIMITI_AŞILDI");

    return NextResponse.json(
      {
        success: false,
        error: message,
        isLimitError,
      },
      { status: isLimitError ? 400 : 500 }
    );
  } finally {
    if (process.env.TEST_DATABASE_URL) {
      await client.$disconnect().catch(() => {});
    }
  }
}

