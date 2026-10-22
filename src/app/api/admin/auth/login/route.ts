import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/server/store";
import {
  createSessionToken,
  ADMIN_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
} from "@/lib/server/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Lütfen e-posta ve şifrenizi giriniz." },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    // İstemci kimliği (IP + e-posta)
    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown-ip";
    const rateLimitKey = `${clientIp}:${cleanEmail}`;

    // 1. Rate Limiting Kontrolü
    const rateCheck = checkLoginRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Çok fazla hatalı giriş denemesi yapıldı. Güvenliğiniz için hesabınız geçici olarak kilitlendi. Lütfen ${rateCheck.waitSeconds} saniye sonra tekrar deneyiniz.`,
        },
        { status: 429 }
      );
    }

    // 2. Kimlik Doğrulama
    const { user, error } = authenticateAdmin(cleanEmail, password);
    if (error || !user) {
      const record = recordFailedLogin(rateLimitKey);
      const remainingMsg = record.isBlocked
        ? "Çok fazla hatalı deneme nedeniyle giriş geçici olarak engellendi."
        : `Kalan deneme hakkı: ${record.attemptsLeft}`;

      return NextResponse.json(
        { error: `Geçersiz e-posta adresi veya şifre. (${remainingMsg})` },
        { status: 401 }
      );
    }

    // 3. Başarılı Giriş — Rate Limiti Sıfırla
    resetLoginRateLimit(rateLimitKey);

    const token = createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });

    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (err) {
    console.error("Admin login error:", err);
    return NextResponse.json(
      { error: "Sunucu hatası oluştu. Lütfen tekrar deneyiniz." },
      { status: 500 }
    );
  }
}
