import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import {
  createSessionToken,
  ADMIN_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  getClientIp,
} from "@/lib/server/auth";
import { verifySameOrigin } from "@/lib/server/session-guard";

export async function POST(req: Request) {
  try {
    await getPersistentStoreData().catch(() => {});
    const csrf = verifySameOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ error: csrf.error }, { status: 403 });
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Lütfen e-posta ve şifrenizi giriniz." },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const clientIp = getClientIp(req);
    const ipRateKey = `ip:${clientIp}`;
    const rateLimitKey = `account:${clientIp}:${cleanEmail}`;

    // 1. Rate Limiting Kontrolü (IP ve Hesap Bazında)
    const ipCheck = checkLoginRateLimit(ipRateKey);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        {
          error: `Bu IP adresinden çok fazla hatalı giriş denemesi yapıldı. Lütfen ${ipCheck.waitSeconds} saniye sonra tekrar deneyiniz.`,
        },
        { status: 429 }
      );
    }

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
      recordFailedLogin(ipRateKey);
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
    resetLoginRateLimit(ipRateKey);
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
    const msg = err instanceof Error ? err.message : "Sunucu hatası oluştu. Lütfen tekrar deneyiniz.";
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
