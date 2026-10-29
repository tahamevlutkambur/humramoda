import { NextResponse } from "next/server";
import { createPendingOrder, getStoreData } from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";
import { requestPayTRIFrameToken } from "@/lib/server/paytr";
import { logAdminAudit, logSiteActivity } from "@/lib/server/logger";

export async function POST(req: Request) {
  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    // GÜVENLİK: İstemciden gönderilebilecek _snapshot veya fiyat/stok verileri kesinlikle yok sayılır.
    // Checkout fiyatı ve stok yalnızca sunucunun güvenilir kayıtlarından hesaplanır.
    const { customer, items, campaignCode } = body;

    const forwardedFor = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";

    // 1. Sunucu tarafında siparişi ve tutarları doğrula, taslak sipariş oluştur
    const orderResult = createPendingOrder({
      customer,
      items,
      campaignCode,
    });

    if (!orderResult.success || !orderResult.order) {
      return NextResponse.json(
        { error: orderResult.error || "Sipariş oluşturulamadı." },
        { status: 400 }
      );
    }

    await savePersistentStoreData(getStoreData()).catch(() => {});

    const order = orderResult.order;

    // 2. PayTR'dan güvenli iFrame token'ı talep et
    const tokenResult = await requestPayTRIFrameToken(order, clientIp);

    if (!tokenResult.success || !tokenResult.token) {
      return NextResponse.json(
        { error: tokenResult.error || "Ödeme formu hazırlanamadı." },
        { status: 502 }
      );
    }

    // 3. Güvenlik ve denetim logunu oluştur
    logAdminAudit({
      adminId: "customer",
      adminEmail: order.customerEmail,
      action: "PAYMENT_INITIATED",
      targetType: "PAYMENT",
      targetId: order.orderNumber,
      result: "SUCCESS",
      ipAddress: clientIp,
      details: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        totalKurus: order.totalKurus,
        itemsCount: order.items.length,
        isSimulation: tokenResult.isSimulation,
      },
    });

    logSiteActivity({
      eventType: "PAYMENT_START",
      path: "/odeme",
      ipAddress: clientIp,
      details: {
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        totalKurus: order.totalKurus,
      },
    });

    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      totalKurus: order.totalKurus,
      token: tokenResult.token,
      iframeUrl: tokenResult.iframeUrl,
      isSimulation: tokenResult.isSimulation ?? false,
    });
  } catch (err) {
    console.error("Payment create API error:", err);
    return NextResponse.json(
      { error: "Ödeme başlatılırken bir sunucu hatası oluştu. Lütfen tekrar deneyiniz." },
      { status: 500 }
    );
  }
}
