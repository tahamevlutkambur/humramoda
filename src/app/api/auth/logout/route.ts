import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE_NAME,
  revokeCustomerToken,
} from "@/lib/server/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(CUSTOMER_COOKIE_NAME);

    if (sessionCookie?.value) {
      revokeCustomerToken(sessionCookie.value);
    }

    const response = NextResponse.json({ success: true, message: "Başarıyla çıkış yapıldı." });

    response.cookies.set({
      name: CUSTOMER_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("Customer logout API error:", err);
    return NextResponse.json(
      { error: "Çıkış yapılırken bir hata oluştu." },
      { status: 500 }
    );
  }
}

