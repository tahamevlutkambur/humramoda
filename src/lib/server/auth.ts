import crypto from "crypto";

export const ADMIN_COOKIE_NAME = "hm_admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 saat

export const KNOWN_DEFAULT_PASSWORDS = new Set(["Eyup.Humra2026", "Humra2026!"]);
export const KNOWN_DEFAULT_HASHES = new Set([
  "d88ba6be78528ec28154bf691409d940:86958fabec9d64e85df791df088d1ed9b96e2f9124b5212238913a802175b5d88c96363d2a21d91f9c88bd2809ba8ca68f8f14c4b8f51e056e3a0bf53b843066",
]);

/**
 * Güvenli imzalama anahtarı sağlayıcısı.
 * Üretim modunda varsayılan veya zayıf anahtarlarla çalışmayı engeller.
 */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (
      !secret ||
      secret.length < 32 ||
      secret.includes("replace_in_production") ||
      secret.includes("ornek_") ||
      secret.includes("hm_sec_") ||
      secret.includes("testing_only")
    ) {
      throw new Error(
        "GÜVENLİK HATASI: Üretim ortamında geçerli ve güçlü (en az 32 karakter) bir AUTH_SECRET çevre değişkeni zorunludur. Zayıf, eksik veya varsayılan anahtarlarla sistem başlatılamaz."
      );
    }
    return secret;
  }

  return (
    secret ||
    "hm_sec_dev_testing_only_not_for_production_use_0123456789abcdef"
  );
}

/**
 * Güvenli parola hashleme fonksiyonu (Node.js crypto.scrypt)
 * Çıktı formatı: [saltHex]:[derivedKeyHex]
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Hashlenmiş parola doğrulaması (Zamanlama saldırılarına karşı timingSafeEqual)
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (!password || !storedHash || typeof storedHash !== "string") return false;

    const [salt, key] = storedHash.split(":");
    // 16-byte salt (32 hex) ve 64-byte key (128 hex) kontrolü
    if (!salt || !key || salt.length !== 32 || key.length !== 128) return false;

    const keyBuffer = Buffer.from(key, "hex");
    if (keyBuffer.length !== 64) return false;

    const derivedKey = crypto.scryptSync(password, salt, 64);

    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: "ADMIN" | "STAFF" | "CUSTOMER";
  fullName: string;
  tokenId: string; // Oturum iptali (revocation) için benzersiz ID
  iat: number; // Verilme zamanı (ms)
  exp: number; // Sona erme zamanı (ms)
}

/**
 * Sunucu tarafı iptal edilmiş oturum belirteçleri (Token Revocation List)
 * tokenId -> exp timestamp
 */
const revokedTokenIds = new Map<string, number>();

export function isSessionRevoked(tokenId: string): boolean {
  const exp = revokedTokenIds.get(tokenId);
  if (!exp) return false;
  if (Date.now() > exp) {
    revokedTokenIds.delete(tokenId); // Süresi dolmuşsa bellekten temizle
    return false;
  }
  return true;
}

export function revokeSessionToken(token: string): boolean {
  try {
    const payload = verifySessionToken(token, { ignoreRevocation: true });
    if (payload && payload.tokenId) {
      revokedTokenIds.set(payload.tokenId, payload.exp);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * HMAC-SHA256 imzalı oturum token'ı oluşturur.
 * Çıktı: base64(payload).signature
 */
export function createSessionToken(
  payload: Omit<SessionPayload, "iat" | "exp" | "tokenId">,
  customTtlSeconds: number = SESSION_MAX_AGE_SECONDS
): string {
  const now = Date.now();
  const tokenId = crypto.randomBytes(16).toString("hex");

  const fullPayload: SessionPayload = {
    ...payload,
    tokenId,
    iat: now,
    exp: now + customTtlSeconds * 1000,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(fullPayload)).toString(
    "base64url"
  );
  const signature = crypto
    .createHmac("sha256", getAuthSecret())
    .update(payloadBase64)
    .digest("base64url");

  return `${payloadBase64}.${signature}`;
}

/**
 * İmzalı oturum token'ını doğrular, süresini ve iptal durumunu denetler.
 */
export function verifySessionToken(
  token: string,
  options?: { ignoreRevocation?: boolean }
): SessionPayload | null {
  try {
    if (!token || typeof token !== "string") return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadBase64, signature] = parts;
    const expectedSignature = crypto
      .createHmac("sha256", getAuthSecret())
      .update(payloadBase64)
      .digest("base64url");

    // Zamanlama saldırılarını engellemek için sabit zamanlı karşılaştırma
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return null;
    }

    const jsonString = Buffer.from(payloadBase64, "base64url").toString("utf-8");
    const payload = JSON.parse(jsonString) as SessionPayload;

    // 1. Tip ve zorunlu alan doğrulaması
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.userId !== "string" || !payload.userId.trim()) return null;
    if (typeof payload.email !== "string" || !payload.email.includes("@")) return null;
    if (payload.role !== "ADMIN" && payload.role !== "STAFF" && payload.role !== "CUSTOMER") return null;
    if (typeof payload.tokenId !== "string" || !payload.tokenId.trim()) return null;
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
    if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return null;

    const now = Date.now();

    // 2. Süre kontrolü
    if (now > payload.exp) {
      return null;
    }
    if (payload.exp <= payload.iat) {
      return null;
    }
    // Token aşırı uzun süre için verilmişse (max age + 5 dk tolerans) reddet
    if (payload.exp - payload.iat > SESSION_MAX_AGE_SECONDS * 1000 + 300000) {
      return null;
    }

    // 3. İptal (revocation) kontrolü
    if (!options?.ignoreRevocation && payload.tokenId) {
      if (isSessionRevoked(payload.tokenId)) {
        return null;
      }
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * İstemci IP adresini güvenli biçimde çıkarır.
 * Header spoofing ve enjeksiyonları temizler.
 */
export function getClientIp(req: Request): string {
  try {
    // 1. Vercel veya Cloudflare güvenilir kenar başlığı (müşteri tarafından taklit edilemez)
    const cfIp = req.headers.get("cf-connecting-ip");
    if (cfIp && cfIp.trim()) {
      const sanitized = cfIp.trim().replace(/[^a-fA-F0-9.:]/g, "");
      if (sanitized) return sanitized;
    }

    const vercelIp = req.headers.get("x-vercel-forwarded-for");
    if (vercelIp && vercelIp.trim()) {
      const sanitized = vercelIp.split(",")[0].trim().replace(/[^a-fA-F0-9.:]/g, "");
      if (sanitized) return sanitized;
    }

    const realIp = req.headers.get("x-real-ip");
    if (realIp && realIp.trim()) {
      const sanitized = realIp.trim().replace(/[^a-fA-F0-9.:]/g, "");
      if (sanitized) return sanitized;
    }

    const forwardedFor = req.headers.get("x-forwarded-for");
    if (forwardedFor && forwardedFor.trim()) {
      const parts = forwardedFor
        .split(",")
        .map((s) => s.trim().replace(/[^a-fA-F0-9.:]/g, ""))
        .filter(Boolean);
      if (parts.length > 0) {
        return parts[0];
      }
    }
  } catch {
    // Hata durumunda varsayılan IP
  }
  return "127.0.0.1";
}

// -------------------------------------------------------------
// GİRİŞ BRUTE-FORCE RATE LIMITER
// -------------------------------------------------------------

interface RateLimitEntry {
  attempts: number;
  blockedUntil: number;
}

const loginRateLimits = new Map<string, RateLimitEntry>();
const MAX_LOGIN_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 dakika blokaj

export function checkLoginRateLimit(identifier: string): {
  allowed: boolean;
  waitSeconds?: number;
} {
  const now = Date.now();
  const entry = loginRateLimits.get(identifier);

  if (!entry) return { allowed: true };

  if (entry.blockedUntil > now) {
    const waitSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  // Süresi dolmuş blokajı temizle
  if (entry.blockedUntil > 0 && entry.blockedUntil <= now) {
    loginRateLimits.delete(identifier);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordFailedLogin(identifier: string): {
  isBlocked: boolean;
  attemptsLeft: number;
  waitSeconds?: number;
} {
  const now = Date.now();
  const entry = loginRateLimits.get(identifier) || {
    attempts: 0,
    blockedUntil: 0,
  };
  entry.attempts += 1;

  if (entry.attempts >= MAX_LOGIN_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_DURATION_MS;
    loginRateLimits.set(identifier, entry);
    return {
      isBlocked: true,
      attemptsLeft: 0,
      waitSeconds: Math.ceil(BLOCK_DURATION_MS / 1000),
    };
  }

  loginRateLimits.set(identifier, entry);
  return {
    isBlocked: false,
    attemptsLeft: MAX_LOGIN_ATTEMPTS - entry.attempts,
  };
}

export function resetLoginRateLimit(identifier: string): void {
  loginRateLimits.delete(identifier);
}
