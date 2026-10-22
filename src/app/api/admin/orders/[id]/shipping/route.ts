import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import {
  createShipment,
  updateTrackingInfo,
  CarrierCode,
  ShippingStatus,
} from "@/lib/server/shipping";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const carrier = (body.carrier || "yurtici") as CarrierCode;
    const trackingNumber = body.trackingNumber?.trim();
    const customTrackingUrl = body.customTrackingUrl?.trim();
    const method = body.method as "MANUAL" | "API_INTEGRATED" | undefined;

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const result = createShipment({
      orderId: id,
      carrier,
      trackingNumber,
      customTrackingUrl,
      method,
      adminInfo: {
        adminId: session.userId,
        adminEmail: session.email,
        ip: clientIp,
      },
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, shipment: result.shipment },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      shipment: result.shipment,
      order: result.order,
      isSimulated: result.isSimulated,
      message: result.isSimulated
        ? "Kargo gönderisi oluşturuldu (Simülasyon Adaptörü - Gerçek Kargo API anahtarları tanımlanmadığında test modu devrededir)."
        : "Kargo gönderisi başarıyla oluşturuldu.",
    });
  } catch (err) {
    console.error("Create shipment API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const carrier = (body.carrier || "yurtici") as CarrierCode;
    const trackingNumber = body.trackingNumber?.trim();
    const customTrackingUrl = body.customTrackingUrl?.trim();
    const status = body.status as ShippingStatus | undefined;

    if (!trackingNumber) {
      return NextResponse.json(
        { error: "Takip numarası zorunludur." },
        { status: 400 }
      );
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const result = updateTrackingInfo({
      orderId: id,
      carrier,
      trackingNumber,
      customTrackingUrl,
      status,
      adminInfo: {
        adminId: session.userId,
        adminEmail: session.email,
        ip: clientIp,
      },
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      shipment: result.shipment,
      order: result.order,
      message: "Kargo takip bilgileri güncellendi.",
    });
  } catch (err) {
    console.error("Update tracking API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
