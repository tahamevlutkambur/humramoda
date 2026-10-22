import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
const ADMIN_COOKIE_NAME = "hm_admin_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Yalnızca /admin ve /api/admin rotalarını denetle
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const isLoginPage = pathname === "/admin/login";
    const isLoginApi = pathname === "/api/admin/auth/login";

    // Giriş sayfası ve login API'si herkese açıktır
    if (isLoginPage || isLoginApi) {
      const sessionCookie = req.cookies.get(ADMIN_COOKIE_NAME);
      if (sessionCookie && sessionCookie.value && isLoginPage) {
        // Oturumu açık olan yönetici tekrar login sayfasına girerse dashboard'a yönlendir
        return NextResponse.redirect(new URL("/admin", req.url));
      }
      const res = NextResponse.next();
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
      return res;
    }

    const sessionCookie = req.cookies.get(ADMIN_COOKIE_NAME);

    // Oturum çerezi yoksa
    if (!sessionCookie || !sessionCookie.value) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Yetkisiz erişim. Lütfen giriş yapınız." }, { status: 401 });
      }
      const loginUrl = new URL("/admin/login", req.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Arama motoru indekslemesini engelle
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
