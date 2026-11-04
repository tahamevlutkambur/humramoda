import { NextResponse } from "next/server";
import { verifyPassword, hashPassword } from "@/lib/server/auth";
import {
  getAuthenticatedCustomer,
  validatePasswordStrength,
} from "@/lib/server/customer-auth";
import { updateCustomerPassword } from "@/lib/server/store";

export const dynamic = "force-dynamic";

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
    const { currentPassword, newPassword, newPasswordRepeat } = body;

    if (!currentPassword) {
      return NextResponse.json(
        { error: "Lütfen mevcut şifrenizi giriniz." },
        { status: 400 }
      );
    }

    const isCurrentValid = verifyPassword(currentPassword, customer.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: "Mevcut şifreniz hatalı." },
        { status: 400 }
      );
    }

    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      return NextResponse.json(
        { error: strengthCheck.error || "Yeni şifre en az 6 karakter olmalıdır." },
        { status: 400 }
      );
    }

    if (newPassword !== newPasswordRepeat) {
      return NextResponse.json(
        { error: "Yeni şifre ve şifre tekrarı birbiriyle eşleşmiyor." },
        { status: 400 }
      );
    }

    const newPasswordHash = hashPassword(newPassword);
    const result = updateCustomerPassword(customer.id, newPasswordHash);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Şifre güncellenemedi." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Şifreniz başarıyla güncellendi.",
    });
  } catch (err) {
    console.error("Customer password change API error:", err);
    return NextResponse.json(
      { error: "Şifre güncellenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

