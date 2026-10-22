import { NextResponse } from "next/server";
import {
  verifyAndProcessShippingWebhook,
  CarrierCode,
  SUPPORTED_CARRIERS,
} from "@/lib/server/shipping";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ carrier: string }> }
) {
  const { carrier } = await params;
  const carrierKey = carrier.toLowerCase();

  if (!(carrierKey in SUPPORTED_CARRIERS)) {
    return NextResponse.json({ error: "Desteklenmeyen kargo sağlayıcısı." }, { status: 400 });
  }
  const carrierCode = carrierKey as CarrierCode;

  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-carrier-signature") ||
      req.headers.get("x-webhook-signature") ||
      undefined;

    let payload: {
      trackingNumber: string;
      status: string;
      description: string;
      location?: string;
      eventId?: string;
      timestamp?: string;
    };

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Geçersiz JSON gövdesi." }, { status: 400 });
    }

    if (!payload.trackingNumber) {
      return NextResponse.json({ error: "Takip numarası eksik." }, { status: 400 });
    }

    const result = verifyAndProcessShippingWebhook({
      carrier: carrierCode,
      rawBody,
      signature,
      payload,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      idempotent: result.idempotent,
      message: result.idempotent
        ? "Webhook hareketi zaten işlenmişti (idempotent)."
        : "Webhook başarıyla işlendi ve kargo durumu güncellendi.",
    });
  } catch (err) {
    console.error("Shipping webhook processing error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
