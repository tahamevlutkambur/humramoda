import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
const ADMIN_COOKIE_NAME = "hm_admin_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Yalnızca /admin ve /api/admin rotalarını denetle
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const isLoginPage = pathname === "/admin/login";
    const isLoginApi = pathname === "/api/admin/auth/login";
    const isPublicProductsApi =
      pathname === "/api/admin/products" &&
      req.nextUrl.searchParams.get("public") === "1";

    // Genel ürün sorgusu herkese açıktır
    if (isPublicProductsApi) {
      return NextResponse.next();
    }

    // Giriş sayfası ve login API'si herkese açıktır
    if (isLoginPage || isLoginApi) {
      const sessionCookie = req.cookies.get(ADMIN_COOKIE_NAME);
      if (sessionCookie && sessionCookie.value && isLoginPage) {
        // Eğer CARRIER oturumu açıksa veya ?switch parametresi varsa login formunu aç (kullanıcı değiştirebilsin)
        let isCarrier = false;
        try {
          const parts = sessionCookie.value.split(".");
          if (parts.length === 2) {
            const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
            if (payload?.role === "CARRIER") {
              isCarrier = true;
            }
          }
        } catch {
          // parse hatası
        }

        if (!isCarrier && !req.nextUrl.searchParams.has("switch")) {
          return NextResponse.redirect(new URL("/admin", req.url));
        }
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

    // Güvenlik & Yetki: Kargo personeli (CARRIER) ana admin paneline veya admin API'sine kesinlikle erişemez!
    try {
      const parts = sessionCookie.value.split(".");
      if (parts.length === 2) {
        const payloadStr = Buffer.from(parts[0], "base64url").toString("utf-8");
        const payload = JSON.parse(payloadStr);
        if (payload?.role === "CARRIER") {
          if (pathname.startsWith("/api/admin")) {
            return NextResponse.json({ error: "Yetersiz yetki. Kargo personeli ana yönetim API'sine erişemez." }, { status: 403 });
          }
          return NextResponse.redirect(new URL("/kargo", req.url));
        }
      }
    } catch {
      // JSON veya Buffer hatasında normal kontrol akışı devam eder
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
