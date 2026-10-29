import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, revokeSessionToken } from "@/lib/server/auth";
import { verifySameOrigin } from "@/lib/server/session-guard";

export async function POST(req: Request) {
  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);

  if (sessionCookie && sessionCookie.value) {
    // Sunucu tarafında belirteci anında kara listeye al (Revocation)
    revokeSessionToken(sessionCookie.value);
  }

  const response = NextResponse.json({ success: true, message: "Oturum sonlandırıldı." });

  // İstemci çerezini sıfırla
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
