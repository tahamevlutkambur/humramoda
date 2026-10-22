import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifySessionToken, SessionPayload } from "./auth";

/**
 * Sunucu tarafında Route Handler veya Server Component içinde admin oturumunu doğrular.
 * Request nesnesi verilirse doğrudan Cookie başlığından, verilmezse next/headers üzerinden okur.
 */
export async function getAuthenticatedAdmin(req?: Request): Promise<SessionPayload | null> {
  let cookieValue: string | undefined;

  // 1. Doğrudan Request parametresi verilmişse Cookie başlığını oku
  if (req && req.headers) {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE_NAME}=([^;]+)`));
    if (match) {
      cookieValue = match[1];
    }
  }

  // 2. Request verilmemişse veya başlıkta bulunamamışsa next/headers cookies() kullan
  if (!cookieValue) {
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);
      if (sessionCookie) {
        cookieValue = sessionCookie.value;
      }
    } catch {
      // next/headers istek bağlamı dışında (örn. test ortamı) çağrılırsa güvenle null dön
      return null;
    }
  }

  if (!cookieValue) {
    return null;
  }

  const payload = verifySessionToken(cookieValue);
  if (!payload || (payload.role !== "ADMIN" && payload.role !== "STAFF")) {
    return null;
  }

  return payload;
}
