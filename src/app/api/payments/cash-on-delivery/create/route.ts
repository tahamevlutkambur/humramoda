import { NextResponse } from "next/server";
import { createCashOnDeliveryOrder, getStoreData, executeWithOrderLock } from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";
import { notifyCustomer } from "@/lib/server/notifications";
import { logAdminAudit, logSiteActivity } from "@/lib/server/logger";
import { createOrderTrackingToken } from "@/lib/server/shipping";
import { getAuthenticatedCustomer } from "@/lib/server/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const { customer, items, campaignCode } = body;

    const authCustomer = await getAuthenticatedCustomer(req).catch(() => null);
    const enrichedCustomer = {
      ...customer,
      userId: customer?.userId || authCustomer?.id || undefined,
    };

    const forwardedFor = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";

    // 1. Kapıda ödeme siparişini Mutex kilidi altında doğrula, oluştur, onayla ve stokları düş
    const result = await executeWithOrderLock(async () => {
      return createCashOnDeliveryOrder({
        customer: enrichedCustomer,
        items,
        campaignCode,
      });
    });

    if (!result.success || !result.order) {
      return NextResponse.json(
        { error: result.error || "Sipariş oluşturulamadı." },
        { status: 400 }
      );
    }

    const order = result.order;

    // 2. Kalıcı veritabanı (PostgreSQL) yapılandırılmışsa senkronize et
    try {
      await savePersistentStoreData(getStoreData());
    } catch (dbSyncErr) {
      console.warn("Persistent database snapshot sync notice (local store authoritative):", dbSyncErr);
    }

    // 3. Müşteriye bildirim gönder (hata olsa da sipariş bozulmaz)
    notifyCustomer({
      orderId: order.id,
      orderNumber: order.orderNumber,
      recipientEmail: order.customerEmail,
      recipientPhone: order.customerPhone,
      customerName: order.customerFullName,
      eventType: "ORDER_CREATED",
      context: {
        totalAmount: order.totalAmount,
        paymentProvider: "CASH_ON_DELIVERY",
      },
    });

    // 4. Denetim logları
    logAdminAudit({
      adminId: "customer",
      adminEmail: order.customerEmail,
      action: "ORDER_CONFIRMED",
      targetType: "ORDER",
      targetId: order.orderNumber,
      result: "SUCCESS",
      ipAddress: clientIp,
      details: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentProvider: "CASH_ON_DELIVERY",
        totalAmount: order.totalAmount,
        totalKurus: order.totalKurus,
        itemsCount: order.items.length,
      },
    });

    logSiteActivity({
      eventType: "PAYMENT_START",
      path: "/odeme",
      ipAddress: clientIp,
      details: {
        orderNumber: order.orderNumber,
        paymentProvider: "CASH_ON_DELIVERY",
        totalAmount: order.totalAmount,
      },
    });

    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      orderId: order.id,
      totalAmount: order.totalAmount,
      paymentProvider: "CASH_ON_DELIVERY",
      accessToken: createOrderTrackingToken(order),
    });
  } catch (err) {
    console.error("Cash on delivery create API error:", err);
    return NextResponse.json(
      { error: "Kapıda ödeme siparişi oluşturulurken bir hata oluştu. Lütfen tekrar deneyiniz." },
      { status: 500 }
    );
  }
}

