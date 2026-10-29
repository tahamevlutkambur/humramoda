import { NextResponse } from "next/server";
import {
  verifyCustomerTrackingAccess,
  getMaskedOrderTrackingView,
} from "@/lib/server/shipping";
import { getReturnRequestsByOrderId } from "@/lib/server/returns";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getStoreData } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const orderNumber = body.orderNumber?.trim();
    const email = body.email?.trim();
    const phone = body.phone?.trim();

    if (!orderNumber) {
      return NextResponse.json(
        { error: "Lütfen sipariş numaranızı giriniz." },
        { status: 400 }
      );
    }

    const store = getStoreData();
    const cleanOrderNumber = orderNumber.toUpperCase();
    const order = store.orders?.find(
      (o) =>
        o.orderNumber.toUpperCase() === cleanOrderNumber ||
        o.id.toUpperCase() === cleanOrderNumber ||
        (o.trackingNumber && o.trackingNumber.toUpperCase() === cleanOrderNumber)
    );

    if (!order) {
      return NextResponse.json(
        { error: "Belirtilen sipariş numarasına ait bir sipariş bulunamadı." },
        { status: 404 }
      );
    }

    // Telefon veya e-posta girilmişse ek doğrulama yap (girilmemişse direkt maskelenmiş takip verisini sun)
    if (email || phone) {
      const { authorized, error } = verifyCustomerTrackingAccess(orderNumber, {
        email,
        phone,
      });

      if (!authorized) {
        return NextResponse.json(
          { error: error || "Sipariş numarası ile girilen iletişim bilgileri eşleşmedi." },
          { status: 401 }
        );
      }
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
