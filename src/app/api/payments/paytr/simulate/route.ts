import { NextResponse } from "next/server";
import {
  processPayTRCallback,
  getPayTRConfig,
  computePayTRCallbackHash,
  isPayTRSimulationAllowed,
} from "@/lib/server/paytr";
import { getOrderById, executeWithOrderLock } from "@/lib/server/store";

/**
 * PayTR Test ve Simülasyon Webhook Tetikleyicisi
 * Yalnızca üretim dışı izole test ortamında ve ALLOW_PAYTR_SIMULATION="true" açıkken çalışır.
 * Canlı ortamda (production) PAYTR_TEST_MODE=1 olsa dahi kesinlikle reddedilir.
 */
export async function POST(req: Request) {
  if (!isPayTRSimulationAllowed()) {
    return NextResponse.json(
      { error: "Simülasyon uç noktası devre dışıdır." },
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

    const config = getPayTRConfig();
    const status = action === "success" ? "success" : "failed";
    const totalAmount = order.totalKurus;

    // İzole simülasyon ortamında gerçek HMAC-SHA256 imzası hesapla (sim_hash_ bypass kullanılmaz)
    const validHash = computePayTRCallbackHash({
      merchantOid: order.orderNumber,
      status,
      totalAmount,
      merchantSalt: config.merchantSalt,
      merchantKey: config.merchantKey,
    });

    const callbackResult = await executeWithOrderLock(async () => {
      return processPayTRCallback(
        {
          merchantOid: order.orderNumber,
          status,
          totalAmount,
          hash: validHash,
          failedReasonCode: status === "failed" ? "TEST_ERR_01" : undefined,
          failedReasonMsg:
            status === "failed"
              ? failedReasonMsg || "Test simülasyonu: Yetersiz bakiye veya kullanıcı iptali."
              : undefined,
        },
        "127.0.0.1"
      );
    });

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
