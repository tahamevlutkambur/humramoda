import { NextResponse } from "next/server";
import { createPasswordResetToken } from "@/lib/server/store";
import {
  checkPasswordResetRateLimit,
  recordPasswordResetAttempt,
} from "@/lib/server/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Lütfen geçerli bir e-posta adresi giriniz." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Rate Limiting Kontrolü (15 dakikada en fazla 3 talep)
    const rateCheck = checkPasswordResetRateLimit(cleanEmail);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Çok fazla şifre sıfırlama talebi gönderildi. Lütfen ${rateCheck.waitSeconds} saniye sonra tekrar deneyiniz.`,
        },
        { status: 429 }
      );
    }

    recordPasswordResetAttempt(cleanEmail);

    // 2. Token oluştur
    const result = createPasswordResetToken(cleanEmail);

    const isDev = process.env.NODE_ENV !== "production";

    return NextResponse.json({
      success: true,
      message:
        "Eğer bu e-posta adresi sistemimizde kayıtlıysa, şifre sıfırlama bağlantısı oluşturulmuştur.",
      // Yerel geliştirme ve test modunda SMTP bağlantısı olmadan test edilebilmesi için güvenli debug bağlantısı
      ...(isDev && result.debugResetUrl ? { debugResetUrl: result.debugResetUrl } : {}),
    });
  } catch (err) {
    console.error("Forgot password API error:", err);
    return NextResponse.json(
      { error: "Şifre sıfırlama talebi işlenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

