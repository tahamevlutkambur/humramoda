import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/server/auth";
import { createCustomer, findCustomerByEmail } from "@/lib/server/store";
import {
  createCustomerSessionToken,
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
  validatePasswordStrength,
} from "@/lib/server/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      fullName,
      email,
      phone,
      password,
      passwordRepeat,
      kvkkApproved,
      termsApproved,
      marketingConsent,
    } = body;

    // 1. Validasyonlar
    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      return NextResponse.json(
        { error: "Lütfen adınızı ve soyadınızı giriniz." },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Lütfen geçerli bir e-posta adresi giriniz." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = findCustomerByEmail(cleanEmail);
    if (existing) {
      return NextResponse.json(
        { error: "Bu e-posta adresiyle kayıtlı bir hesap zaten mevcuttur." },
        { status: 409 }
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

    if (!kvkkApproved) {
      return NextResponse.json(
        { error: "Lütfen KVKK Aydınlatma Metni'ni onaylayınız." },
        { status: 400 }
      );
    }

    if (!termsApproved) {
      return NextResponse.json(
        { error: "Lütfen Üyelik Sözleşmesi ve Kullanım Koşulları'nı onaylayınız." },
        { status: 400 }
      );
    }

    // 2. Güvenli scrypt hashleme
    const passwordHash = hashPassword(password);

    const result = createCustomer({
      fullName: fullName.trim(),
      email: cleanEmail,
      phone: phone && typeof phone === "string" ? phone.trim() : undefined,
      passwordHash,
      kvkkApproved: true,
      termsApproved: true,
      marketingConsent: Boolean(marketingConsent),
    });

    if (!result.success || !result.customer) {
      return NextResponse.json(
        { error: result.error || "Hesap oluşturulamadı." },
        { status: 400 }
      );
    }

    const customer = result.customer;

    // 3. Oturum token'ı üret ve HttpOnly Cookie olarak ayarla
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
    console.error("Customer register API error:", err);
    return NextResponse.json(
      { error: "Kayıt işlemi sırasında bir hata oluştu. Lütfen tekrar deneyiniz." },
      { status: 500 }
    );
  }
}

