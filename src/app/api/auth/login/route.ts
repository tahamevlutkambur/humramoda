import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/server/auth";
import { findCustomerByEmail } from "@/lib/server/store";
import {
  createCustomerSessionToken,
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
  checkCustomerLoginRateLimit,
  recordFailedCustomerLogin,
  resetCustomerLoginRateLimit,
} from "@/lib/server/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Lütfen geçerli bir e-posta adresi giriniz." },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Lütfen şifrenizi giriniz." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Rate Limit Denetimi
    const rateCheck = checkCustomerLoginRateLimit(cleanEmail);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Çok fazla başarısız giriş denemesi. Lütfen ${rateCheck.waitSeconds} saniye sonra tekrar deneyiniz.`,
          blocked: true,
          waitSeconds: rateCheck.waitSeconds,
        },
        { status: 429 }
      );
    }

    // 2. Müşteriyi bul
    const customer = findCustomerByEmail(cleanEmail);
    if (!customer) {
      recordFailedCustomerLogin(cleanEmail);
      return NextResponse.json(
        { error: "E-posta adresi veya şifre hatalı." },
        { status: 401 }
      );
    }

    if (customer.isActive === false) {
      return NextResponse.json(
        { error: "Hesabınız askıya alınmıştır. Lütfen müşteri hizmetleri ile iletişime geçiniz." },
        { status: 403 }
      );
    }

    // 3. Parola doğrula (timing-safe)
    const isPasswordValid = verifyPassword(password, customer.passwordHash);
    if (!isPasswordValid) {
      const failStatus = recordFailedCustomerLogin(cleanEmail);
      if (failStatus.isBlocked) {
        return NextResponse.json(
          {
            error: `Çok fazla başarısız giriş denemesi. Hesabınız 15 dakika kilitlendi. Lütfen ${failStatus.waitSeconds} saniye sonra tekrar deneyiniz.`,
            blocked: true,
            waitSeconds: failStatus.waitSeconds,
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        {
          error: "E-posta adresi veya şifre hatalı.",
          attemptsLeft: failStatus.attemptsLeft,
        },
        { status: 401 }
      );
    }

    // 4. Başarılı giriş: rate limit sayacını sıfırla
    resetCustomerLoginRateLimit(cleanEmail);

    // 5. Oturum belirteci oluştur ve çerez ayarla
    const token = createCustomerSessionToken(customer);

    const response = NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        email: customer.email,
        fullName: customer.fullName,
        phone: customer.phone,
      },
    });

    response.cookies.set({
      name: CUSTOMER_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: CUSTOMER_SESSION_MAX_AGE_SECONDS,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("Customer login API error:", err);
    return NextResponse.json(
      { error: "Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyiniz." },
      { status: 500 }
    );
  }
}

