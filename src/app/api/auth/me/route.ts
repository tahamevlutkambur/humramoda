import { NextResponse } from "next/server";
import { getAuthenticatedCustomer } from "@/lib/server/customer-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const customer = await getAuthenticatedCustomer(req);

    if (!customer) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: customer.id,
        email: customer.email,
        fullName: customer.fullName,
        phone: customer.phone,
        marketingConsent: customer.marketingConsent,
        addresses: customer.addresses || [],
        createdAt: customer.createdAt,
      },
    });
  } catch (err) {
    console.error("Customer auth/me API error:", err);
    return NextResponse.json(
      { error: "Kullanıcı bilgisi alınırken bir hata oluştu." },
      { status: 500 }
    );
  }
}

