import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifySessionToken, SessionPayload } from "./auth";
import { getStoreData } from "./store";

/**
 * Sunucu tarafında Route Handler veya Server Component içinde admin oturumunu doğrular.
 * Request nesnesi verilirse doğrudan Cookie başlığından, verilmezse next/headers üzerinden okur.
 * Kullanıcı veritabanında devre dışı bırakılmışsa veya token'ı geçersiz kılınmışsa oturumu sonlandırır.
 */
export async function getAuthenticatedAdmin(req?: Request): Promise<SessionPayload | null> {
  let cookieValue: string | undefined;

  // 1. Doğrudan Request parametresi verilmişse Cookie başlığını oku
  if (req && req.headers) {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE_NAME}=([^;]+)`));
    if (match) {
      try {
        cookieValue = decodeURIComponent(match[1]);
      } catch {
        cookieValue = match[1];
      }
    }
  }

  // 2. Request verilmemişse veya başlıkta bulunamamışsa next/headers cookies() kullan
  if (!cookieValue) {
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);
      if (sessionCookie) {
        try {
          cookieValue = decodeURIComponent(sessionCookie.value);
        } catch {
          cookieValue = sessionCookie.value;
        }
      }
    } catch {
      // next/headers istek bağlamı dışında (örn. test ortamı) çağrılırsa güvenle null dön
      return null;
    }
  }

  if (!cookieValue) {
    return null;
  }

  cookieValue = cookieValue.replace(/^"|"$/g, "");

  const payload = verifySessionToken(cookieValue);
  if (!payload || (payload.role !== "ADMIN" && payload.role !== "STAFF")) {
    return null;
  }

  // 3. Kalıcı kullanıcı durumu kontrolü (Kullanıcı devre dışı bırakılmışsa erişimi kes)
  try {
    const store = getStoreData();
    const activeUser = store.adminUsers?.find((u) => u.id === payload.userId || u.email === payload.email);
    if (activeUser) {
      if (activeUser.isActive === false) {
        return null;
      }
      if (activeUser.tokenVersionTimestamp && payload.iat < activeUser.tokenVersionTimestamp) {
        return null;
      }
    }
  } catch {
    // Depo okuma hatası durumunda mevcut doğrulanmış token geçerli sayılır
  }

  return payload;
}

/**
 * Rol tabanlı yetki matrisi (RBAC) kontrolcüsü.
 * Belirtilen roller dışındaki kullanıcıları 403 Forbidden ile engeller.
 */
export async function requireAdminRole(
  req: Request | undefined,
  allowedRoles: Array<"ADMIN" | "STAFF"> = ["ADMIN"]
): Promise<
  | { session: SessionPayload; errorResponse?: never }
  | { session?: never; errorResponse: NextResponse }
> {
  const session = await getAuthenticatedAdmin(req);

  if (!session) {
    return {
      errorResponse: NextResponse.json(
        { error: "Yetkisiz erişim. Lütfen giriş yapınız." },
        { status: 401 }
      ),
    };
  }

  if (!allowedRoles.includes(session.role as "ADMIN" | "STAFF")) {
    return {
      errorResponse: NextResponse.json(
        { error: "Yetersiz yetki. Bu işlem için ADMIN rolü gereklidir." },
        { status: 403 }
      ),
    };
  }

  return { session };
}

/**
 * Cookie tabanlı durum değiştiren isteklerde CSRF / Same-Origin denetimi.
 * POST, PUT, DELETE, PATCH metotlarında Origin veya Referer başlığının sunucu ile eşleşmesini zorunlu kılar.
 * NOT: Bu fonksiyon tarayıcı istekleri içindir; sunucudan sunucuya HMAC imzalı webhook'lara uygulanmamalıdır.
 */
const TRUSTED_PRODUCTION_DOMAINS = new Set([
  "humrabutik.com",
  "www.humrabutik.com",
  "humramoda.com",
  "www.humramoda.com",
]);

function getTrustedOriginHosts(): Set<string> {
  const trusted = new Set(TRUSTED_PRODUCTION_DOMAINS);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (appUrl) {
    try {
      trusted.add(new URL(appUrl).host.toLowerCase());
    } catch {}
  }
  if (process.env.NODE_ENV !== "production") {
    trusted.add("localhost");
    trusted.add("localhost:3000");
    trusted.add("127.0.0.1");
    trusted.add("127.0.0.1:3000");
  }
  return trusted;
}

export function verifySameOrigin(req: Request): { valid: boolean; error?: string } {
  const method = req.method.toUpperCase();
  // Güvenli (safe) idempotent okuma metotlarında CSRF aranmaz
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { valid: true };
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  const secFetchSite = req.headers.get("sec-fetch-site");

  // Modern tarayıcı cross-site koruması
  if (secFetchSite === "cross-site") {
    return {
      valid: false,
      error: "CSRF doğrulaması başarısız: Cross-site istek tespit edildi.",
    };
  }

  const trustedHosts = getTrustedOriginHosts();
  const isLocalDevOrTest =
    process.env.NODE_ENV !== "production" ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    !host;

  // 1. Origin başlığı mevcutsa doğrula
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.host.toLowerCase();

      // Güvenilen domain listesinde mi?
      if (trustedHosts.has(originHost)) {
        return { valid: true };
      }

      // Localhost / geliştirme ortamı toleransı
      if (isLocalDevOrTest && (originHost.startsWith("localhost") || originHost.startsWith("127.0.0.1"))) {
        return { valid: true };
      }

      return {
        valid: false,
        error: `CSRF doğrulaması başarısız: Yetkisiz Origin (${originHost}).`,
      };
    } catch {
      return { valid: false, error: "CSRF doğrulaması başarısız: Bozuk Origin URL." };
    }
  }

  // 2. Origin yoksa Referer başlığını kontrol et
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererHost = refererUrl.host.toLowerCase();

      if (trustedHosts.has(refererHost)) {
        return { valid: true };
      }

      if (isLocalDevOrTest && (refererHost.startsWith("localhost") || refererHost.startsWith("127.0.0.1"))) {
        return { valid: true };
      }

      return {
        valid: false,
        error: `CSRF doğrulaması başarısız: Yetkisiz Referer (${refererHost}).`,
      };
    } catch {
      return { valid: false, error: "CSRF doğrulaması başarısız: Bozuk Referer URL." };
    }
  }

  // 3. Ne Origin ne Referer sağlandıysa
  if (isLocalDevOrTest) {
    return { valid: true };
  }

  return {
    valid: false,
    error: "CSRF doğrulaması başarısız: Durum değiştiren isteklerde Origin veya Referer başlığı zorunludur.",
  };
}
