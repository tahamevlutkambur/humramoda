import { NextResponse } from "next/server";
import { createReturnRequest } from "@/lib/server/returns";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";
import { getStoreData } from "@/lib/server/store";
import { verifyOrderTrackingToken } from "@/lib/server/shipping";

export async function POST(req: Request) {
  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();

    const orderNumber = body.orderNumber?.trim();
    const customerEmail = body.customerEmail?.trim();
    const customerPhone = body.customerPhone?.trim();
    const trackingToken = typeof body.trackingToken === "string" ? body.trackingToken : "";
    const requestType = body.requestType || "RETURN";
    const exchangeDetails = body.exchangeDetails;
    const reason = body.reason?.trim();
    const customerNotes = body.customerNotes?.trim();
    const items = body.items;

    if (!orderNumber || (!customerEmail && !customerPhone && !trackingToken) || !reason || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Lütfen sipariş numarası, e-posta veya telefon, talep gerekçesi ve ürünleri eksiksiz doldurunuz." },
        { status: 400 }
      );
    }

    const tokenVerifiedOrder = trackingToken
      ? getStoreData().orders.find((order) =>
          (order.orderNumber.toUpperCase() === orderNumber.toUpperCase() || order.id === orderNumber) &&
          verifyOrderTrackingToken(trackingToken, order.id)
        )
      : undefined;
    if (trackingToken && !tokenVerifiedOrder) {
      return NextResponse.json({ error: "Sipariş doğrulaması zaman aşımına uğradı. Lütfen siparişinizi yeniden sorgulayın." }, { status: 401 });
    }

    const result = createReturnRequest({
      orderNumber,
      customerEmail: customerEmail || tokenVerifiedOrder?.customerEmail,
      customerPhone,
      requestType,
      exchangeDetails,
      reason,
      customerNotes,
      items,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const typeTitle =
      requestType === "CANCEL"
        ? "İptal talebiniz"
        : requestType === "EXCHANGE"
        ? "Değişim talebiniz"
        : "İade talebiniz";

    await savePersistentStoreData(getStoreData());
    return NextResponse.json({
      success: true,
      returnRequest: result.returnRequest,
      message: `${typeTitle} başarıyla oluşturuldu ve incelemeye alındı.`,
    });
  } catch (err) {
    console.error("Create return request API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
