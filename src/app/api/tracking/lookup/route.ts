import { NextResponse } from "next/server";
import {
  verifyCustomerTrackingAccess,
  getMaskedOrderTrackingView,
} from "@/lib/server/shipping";
import { getReturnRequestsByOrderId } from "@/lib/server/returns";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderNumber = body.orderNumber?.trim();
    const email = body.email?.trim();
    const phone = body.phone?.trim();

    if (!orderNumber || (!email && !phone)) {
      return NextResponse.json(
        { error: "Lütfen sipariş numaranızı ve siparişe ait e-posta adresinizi veya telefon numaranızı giriniz." },
        { status: 400 }
      );
    }

    const { authorized, order, error } = verifyCustomerTrackingAccess(orderNumber, {
      email,
      phone,
    });

    if (!authorized || !order) {
      return NextResponse.json(
        { error: error || "Belirtilen bilgilere ait bir sipariş bulunamadı veya doğrulama başarısız." },
        { status: 404 }
      );
    }

    const trackingData = getMaskedOrderTrackingView(order);
    const returnRequests = getReturnRequestsByOrderId(order.id);

    return NextResponse.json({
      success: true,
      tracking: trackingData,
      returnRequests: returnRequests.map((r) => ({
        id: r.id,
        status: r.status,
        requestedAmount: r.requestedAmount,
        refundedAmount: r.refundedAmount,
        reason: r.reason,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error("Tracking lookup API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
