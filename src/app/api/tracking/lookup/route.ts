import { NextResponse } from "next/server";
import {
  verifyCustomerTrackingAccess,
  getMaskedOrderTrackingView,
  createOrderTrackingToken,
  verifyOrderTrackingToken,
} from "@/lib/server/shipping";
import { getReturnRequestsByOrderId } from "@/lib/server/returns";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import { getStoreData } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const orderNumber = body.orderNumber?.trim();
    const email = body.email?.trim();
    const phone = body.phone?.trim();
    const trackingToken = body.trackingToken?.trim();

    if (!orderNumber) {
      return NextResponse.json(
        { error: "Lütfen sipariş numaranızı giriniz." },
        { status: 400 }
      );
    }

    const store = getStoreData();
    const cleanOrderNumber = orderNumber.toUpperCase();
    const order = store.orders?.find(
      (o) => o.orderNumber.toUpperCase() === cleanOrderNumber
    );

    if (!order) {
      return NextResponse.json(
        { error: "Belirtilen sipariş numarasına ait bir sipariş bulunamadı." },
        { status: 404 }
      );
    }

    // İlk sorgu tam iletişim bilgisiyle doğrulanır. Sonraki ekran yenilemeleri kısa
    // ömürlü, siparişe bağlı imzalı token kullanır.
    if (trackingToken) {
      if (!verifyOrderTrackingToken(trackingToken, order.id)) {
        return NextResponse.json({ error: "Sipariş doğrulaması süresi doldu. Lütfen yeniden doğrulayınız." }, { status: 401 });
      }
    } else {
      if (!email && !phone) {
        return NextResponse.json({ error: "Siparişinizi doğrulamak için telefon veya e-posta giriniz." }, { status: 400 });
      }
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
      tracking: { ...trackingData, trackingToken: createOrderTrackingToken(order) },
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
