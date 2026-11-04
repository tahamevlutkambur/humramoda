import { NextResponse } from "next/server";
import { getAuthenticatedCustomer } from "@/lib/server/customer-auth";
import { addCustomerAddress } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return NextResponse.json(
        { error: "Bu işlem için giriş yapmanız gerekmektedir." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      addresses: customer.addresses || [],
    });
  } catch (err) {
    console.error("Customer addresses GET API error:", err);
    return NextResponse.json(
      { error: "Adresler yüklenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return NextResponse.json(
        { error: "Bu işlem için giriş yapmanız gerekmektedir." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      title,
      recipient,
      phone,
      city,
      district,
      neighborhood,
      fullAddress,
      postalCode,
      isDefaultDelivery,
      isDefaultBilling,
    } = body;

    const result = addCustomerAddress(customer.id, {
      title,
      recipient,
      phone,
      city,
      district,
      neighborhood,
      fullAddress,
      postalCode,
      isDefaultDelivery,
      isDefaultBilling,
    });

    if (!result.success || !result.address) {
      return NextResponse.json(
        { error: result.error || "Adres eklenemedi." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      address: result.address,
    });
  } catch (err) {
    console.error("Customer addresses POST API error:", err);
    return NextResponse.json(
      { error: "Adres kaydedilirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

