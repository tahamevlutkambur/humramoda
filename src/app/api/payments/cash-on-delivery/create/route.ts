import { NextResponse } from "next/server";
import { createCashOnDeliveryOrder, getStoreData } from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";
import { notifyCustomer } from "@/lib/server/notifications";
import { logAdminAudit, logSiteActivity } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const { customer, items, campaignCode } = body;

    const forwardedFor = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";

    // 1. Kapıda ödeme siparişini doğrula, oluştur, onayla ve stokları düş
    const result = createCashOnDeliveryOrder({
      customer,
      items,
      campaignCode,
    });

    if (!result.success || !result.order) {
      return NextResponse.json(
        { error: result.error || "Sipariş oluşturulamadı." },
        { status: 400 }
      );
    }

    const order = result.order;

    // 2. Kalıcı depolamaya kaydet
    await savePersistentStoreData(getStoreData()).catch(() => {});

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
      totalAmount: order.totalAmount,
      paymentProvider: "CASH_ON_DELIVERY",
    });
  } catch (err) {
    console.error("Cash on delivery create API error:", err);
    return NextResponse.json(
      { error: "Kapıda ödeme siparişi oluşturulurken bir hata oluştu. Lütfen tekrar deneyiniz." },
      { status: 500 }
    );
  }
}

