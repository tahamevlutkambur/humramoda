import { NextResponse } from "next/server";
import { processPayTRCallback, getPayTRConfig } from "@/lib/server/paytr";
import { getOrderById } from "@/lib/server/store";

/**
 * PayTR Test ve Simülasyon Webhook Tetikleyicisi
 * Yalnızca test ortamında ve geliştirme modunda çalışır.
 * Canlı ortamda (production) PayTR test modu kapalıysa kesinlikle reddedilir.
 */
export async function POST(req: Request) {
  const config = getPayTRConfig();
  const isDev = process.env.NODE_ENV !== "production";
  const isTestMode = config.testMode === "1" || !config.isConfigured;

  if (!isDev && !isTestMode) {
    return NextResponse.json(
      { error: "Simülasyon uç noktası canlı ortamda devre dışıdır." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { orderNumber, action = "success", failedReasonMsg } = body;

    if (!orderNumber) {
      return NextResponse.json(
        { error: "orderNumber parametresi zorunludur." },
        { status: 400 }
      );
    }

    const order = getOrderById(orderNumber);
    if (!order) {
      return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
    }

    const status = action === "success" ? "success" : "failed";
    const totalAmount = order.totalKurus;

    // Simülasyon hash'i
    const simHash = `sim_hash_${order.orderNumber}_${Date.now()}`;

    const callbackResult = processPayTRCallback(
      {
        merchantOid: order.orderNumber,
        status,
        totalAmount,
        hash: simHash,
        failedReasonCode: status === "failed" ? "TEST_ERR_01" : undefined,
        failedReasonMsg:
          status === "failed"
            ? failedReasonMsg || "Test simülasyonu: Yetersiz bakiye veya kullanıcı iptali."
            : undefined,
      },
      "127.0.0.1"
    );

    return NextResponse.json({
      success: callbackResult.ok,
      httpStatus: callbackResult.httpStatus,
      statusText: callbackResult.statusText,
      idempotent: callbackResult.idempotent ?? false,
      order: callbackResult.order,
      message:
        status === "success"
          ? "Simüle edilmiş başarılı ödeme bildirimi işlendi."
          : "Simüle edilmiş başarısız ödeme bildirimi işlendi.",
    });
  } catch (err) {
    console.error("Simulation error:", err);
    return NextResponse.json({ error: "Simülasyon hatası." }, { status: 500 });
  }
}
