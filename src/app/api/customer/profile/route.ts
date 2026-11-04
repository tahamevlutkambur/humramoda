import { NextResponse } from "next/server";
import { getAuthenticatedCustomer } from "@/lib/server/customer-auth";
import { updateCustomerProfile } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  try {
    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return NextResponse.json(
        { error: "Bu işlem için giriş yapmanız gerekmektedir." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { fullName, phone, marketingConsent } = body;

    const result = updateCustomerProfile(customer.id, {
      fullName,
      phone,
      marketingConsent,
    });

    if (!result.success || !result.customer) {
      return NextResponse.json(
        { error: result.error || "Profil güncellenemedi." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      customer: {
        id: result.customer.id,
        email: result.customer.email,
        fullName: result.customer.fullName,
        phone: result.customer.phone,
        marketingConsent: result.customer.marketingConsent,
      },
    });
  } catch (err) {
    console.error("Customer profile PATCH API error:", err);
    return NextResponse.json(
      { error: "Profil güncellenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

