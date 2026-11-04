import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/server/auth";
import { verifyAndConsumeResetToken } from "@/lib/server/store";
import { validatePasswordStrength } from "@/lib/server/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token, password, passwordRepeat } = body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json(
        { error: "Geçersiz veya eksik sıfırlama kodu." },
        { status: 400 }
      );
    }

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { error: passwordCheck.error || "Şifre en az 6 karakter olmalıdır." },
        { status: 400 }
      );
    }

    if (password !== passwordRepeat) {
      return NextResponse.json(
        { error: "Şifre ve şifre tekrarı birbiriyle eşleşmiyor." },
        { status: 400 }
      );
    }

    const newPasswordHash = hashPassword(password);
    const result = verifyAndConsumeResetToken(token.trim(), newPasswordHash);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Şifre sıfırlama işlemi başarısız oldu." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Şifreniz başarıyla yenilendi. Yeni şifrenizle giriş yapabilirsiniz.",
    });
  } catch (err) {
    console.error("Reset password API error:", err);
    return NextResponse.json(
      { error: "Şifre sıfırlanırken bir hata oluştu. Lütfen tekrar deneyiniz." },
      { status: 500 }
    );
  }
}

