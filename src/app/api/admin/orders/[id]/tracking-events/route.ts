import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { addTrackingEvent, ShippingStatus } from "@/lib/server/shipping";

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
    const status = body.status as ShippingStatus;
    const description = body.description?.trim();
    const location = body.location?.trim();

    if (!status || !description) {
      return NextResponse.json(
        { error: "Kargo durumu ve hareket açıklaması zorunludur." },
        { status: 400 }
      );
    }

    const result = addTrackingEvent({
      orderIdOrTrackingNumber: id,
      status,
      description,
      location,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      event: result.event,
      idempotent: result.idempotent,
      message: "Kargo hareketi kaydedildi.",
    });
  } catch (err) {
    console.error("Add tracking event API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
