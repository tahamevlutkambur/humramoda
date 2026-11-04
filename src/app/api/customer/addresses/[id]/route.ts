import { NextResponse } from "next/server";
import { getAuthenticatedCustomer } from "@/lib/server/customer-auth";
import { updateCustomerAddress, deleteCustomerAddress } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return NextResponse.json(
        { error: "Bu işlem için giriş yapmanız gerekmektedir." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const result = updateCustomerAddress(customer.id, id, body);

    if (!result.success || !result.address) {
      return NextResponse.json(
        { error: result.error || "Adres güncellenemedi." },
        { status: result.error === "Adres bulunamadı." ? 404 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      address: result.address,
    });
  } catch (err) {
    console.error("Customer address PUT API error:", err);
    return NextResponse.json(
      { error: "Adres güncellenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return NextResponse.json(
        { error: "Bu işlem için giriş yapmanız gerekmektedir." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const result = deleteCustomerAddress(customer.id, id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Adres silinemedi." },
        { status: result.error === "Adres bulunamadı." ? 404 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Adres başarıyla silindi.",
    });
  } catch (err) {
    console.error("Customer address DELETE API error:", err);
    return NextResponse.json(
      { error: "Adres silinirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

