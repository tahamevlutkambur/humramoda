import { NextResponse } from "next/server";
import { lookupOrderForReturns } from "@/lib/server/returns";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderNumber = body.orderNumber?.trim();
    const email = body.email?.trim();
    const phone = body.phone?.trim();

    if (!orderNumber || (!email && !phone)) {
      return NextResponse.json(
        {
          error:
            "Lütfen sipariş numaranızı ve siparişle ilişkili e-posta adresinizi veya telefon numaranızı giriniz.",
        },
        { status: 400 }
      );
    }

    const result = lookupOrderForReturns(orderNumber, { email, phone });

    if (!result.authorized) {
      return NextResponse.json(
        { error: result.error || "Sipariş bulunamadı veya doğrulama başarısız." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      orderSummary: result.orderSummary,
      eligibleActions: result.eligibleActions,
      items: result.items,
      existingRequests: result.existingRequests,
    });
  } catch (err) {
    console.error("Returns lookup API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
