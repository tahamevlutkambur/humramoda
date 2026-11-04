import crypto from "crypto";
import { cookies } from "next/headers";
import { getAuthSecret, SessionPayload, hashPassword, verifyPassword } from "./auth";
import { findCustomerById, CustomerUser } from "./store";

export const CUSTOMER_COOKIE_NAME = "hm_customer_session";
export const CUSTOMER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 gün

// Token Revocation Store (Bellek İçi)
const revokedCustomerTokens = new Map<string, number>();

export function revokeCustomerToken(token: string): boolean {
  try {
    const payload = verifyCustomerSessionToken(token, { ignoreRevocation: true });
    if (payload?.tokenId) {
      revokedCustomerTokens.set(payload.tokenId, payload.exp);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function isCustomerTokenRevoked(tokenId: string): boolean {
  const exp = revokedCustomerTokens.get(tokenId);
  if (!exp) return false;
  if (Date.now() > exp) {
    revokedCustomerTokens.delete(tokenId);
    return false;
  }
  return true;
}

/**
 * Müşteri için HMAC-SHA256 imzalı oturum token'ı üretir.
 */
export function createCustomerSessionToken(
  customer: Pick<CustomerUser, "id" | "email" | "fullName">,
  customTtlSeconds: number = CUSTOMER_SESSION_MAX_AGE_SECONDS
): string {
  const now = Date.now();
  const tokenId = crypto.randomBytes(16).toString("hex");

  const fullPayload: SessionPayload = {
    userId: customer.id,
    email: customer.email.toLowerCase(),
    role: "CUSTOMER",
    fullName: customer.fullName,
    tokenId,
    iat: now,
    exp: now + customTtlSeconds * 1000,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getAuthSecret())
    .update(payloadBase64)
    .digest("base64url");

  return `${payloadBase64}.${signature}`;
}

/**
 * İmzalı müşteri oturum token'ını doğrular.
 */
export function verifyCustomerSessionToken(
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

    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.userId !== "string" || !payload.userId.trim()) return null;
    if (typeof payload.email !== "string" || !payload.email.includes("@")) return null;
    if (payload.role !== "CUSTOMER") return null; // Kesinlikle sadece CUSTOMER rolü kabul edilir
    if (typeof payload.tokenId !== "string" || !payload.tokenId.trim()) return null;
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;

    const now = Date.now();
    if (now > payload.exp) return null;
    if (payload.exp <= payload.iat) return null;

    if (!options?.ignoreRevocation && payload.tokenId) {
      if (isCustomerTokenRevoked(payload.tokenId)) {
        return null;
      }
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Sunucu tarafında Route Handler veya Server Component içinde müşteri oturumunu doğrular.
 */
export async function getAuthenticatedCustomer(req?: Request): Promise<CustomerUser | null> {
  let cookieValue: string | undefined;

  // 1. Doğrudan Request parametresi verilmişse Cookie başlığını oku
  if (req && req.headers) {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CUSTOMER_COOKIE_NAME}=([^;]+)`));
    if (match) {
      try {
        cookieValue = decodeURIComponent(match[1]);
      } catch {
        cookieValue = match[1];
      }
    }
  }

  // 2. Request verilmemişse next/headers cookies() kullan
  if (!cookieValue) {
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(CUSTOMER_COOKIE_NAME);
      if (sessionCookie) {
        try {
          cookieValue = decodeURIComponent(sessionCookie.value);
        } catch {
          cookieValue = sessionCookie.value;
        }
      }
    } catch {
      return null;
    }
  }

  if (!cookieValue) return null;

  cookieValue = cookieValue.replace(/^"|"$/g, "");
  const payload = verifyCustomerSessionToken(cookieValue);
  if (!payload || payload.role !== "CUSTOMER") return null;

  const customer = findCustomerById(payload.userId);
  if (!customer || !customer.isActive) return null;

  // Şifre değiştirme sonrası eski oturumları geçersiz kılma kontrolü
  if (customer.tokenVersionTimestamp && payload.iat < customer.tokenVersionTimestamp) {
    return null;
  }

  return customer;
}

// -------------------------------------------------------------
// RATE LIMITING (GİRİŞ VE ŞİFRE SIFIRLAMA)
// -------------------------------------------------------------

interface RateLimitEntry {
  attempts: number;
  blockedUntil: number;
}

const customerLoginLimits = new Map<string, RateLimitEntry>();
const MAX_CUSTOMER_LOGIN_ATTEMPTS = 5;
const CUSTOMER_LOGIN_BLOCK_MS = 15 * 60 * 1000; // 15 dakika

export function checkCustomerLoginRateLimit(identifier: string): {
  allowed: boolean;
  waitSeconds?: number;
} {
  const now = Date.now();
  const entry = customerLoginLimits.get(identifier.toLowerCase());
  if (!entry) return { allowed: true };

  if (entry.blockedUntil > now) {
    const waitSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  if (entry.blockedUntil > 0 && entry.blockedUntil <= now) {
    customerLoginLimits.delete(identifier.toLowerCase());
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordFailedCustomerLogin(identifier: string): {
  isBlocked: boolean;
  attemptsLeft: number;
  waitSeconds?: number;
} {
  const key = identifier.toLowerCase();
  const now = Date.now();
  const entry = customerLoginLimits.get(key) || { attempts: 0, blockedUntil: 0 };
  entry.attempts += 1;

  if (entry.attempts >= MAX_CUSTOMER_LOGIN_ATTEMPTS) {
    entry.blockedUntil = now + CUSTOMER_LOGIN_BLOCK_MS;
    customerLoginLimits.set(key, entry);
    return {
      isBlocked: true,
      attemptsLeft: 0,
      waitSeconds: Math.ceil(CUSTOMER_LOGIN_BLOCK_MS / 1000),
    };
  }

  customerLoginLimits.set(key, entry);
  return {
    isBlocked: false,
    attemptsLeft: MAX_CUSTOMER_LOGIN_ATTEMPTS - entry.attempts,
  };
}

export function resetCustomerLoginRateLimit(identifier: string): void {
  customerLoginLimits.delete(identifier.toLowerCase());
}

// Şifre sıfırlama talebi rate limiter'ı (15 dakikada en fazla 3 talep)
const passwordResetLimits = new Map<string, { count: number; firstAttempt: number }>();

export function checkPasswordResetRateLimit(email: string): {
  allowed: boolean;
  waitSeconds?: number;
} {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const entry = passwordResetLimits.get(key);
  if (!entry) return { allowed: true };

  if (now - entry.firstAttempt > 15 * 60 * 1000) {
    passwordResetLimits.delete(key);
    return { allowed: true };
  }

  if (entry.count >= 3) {
    const waitSeconds = Math.ceil((entry.firstAttempt + 15 * 60 * 1000 - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  return { allowed: true };
}

export function recordPasswordResetAttempt(email: string): void {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const entry = passwordResetLimits.get(key);
  if (!entry || now - entry.firstAttempt > 15 * 60 * 1000) {
    passwordResetLimits.set(key, { count: 1, firstAttempt: now });
  } else {
    entry.count += 1;
    passwordResetLimits.set(key, entry);
  }
}

/**
 * Şifre gücü doğrulama yardımcısı.
 * En az 6 karakter, CPU tükenme saldırılarına (scrypt DoS) karşı en fazla 128 karakter sınırı koyar.
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  error?: string;
} {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Şifre alanı boş bırakılamaz." };
  }
  if (password.length < 6) {
    return { valid: false, error: "Şifreniz en az 6 karakter uzunluğunda olmalıdır." };
  }
  if (password.length > 128) {
    return { valid: false, error: "Şifreniz en fazla 128 karakter uzunluğunda olabilir." };
  }
  return { valid: true };
}

/**
 * E-posta biçim ve uzunluk doğrulama yardımcısı (RFC 5322 uyumlu standart denetim).
 */
export function validateEmailFormat(email: string): {
  valid: boolean;
  cleanEmail?: string;
  error?: string;
} {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Lütfen geçerli bir e-posta adresi giriniz." };
  }
  const clean = email.trim().toLowerCase();
  if (clean.length < 5 || clean.length > 254) {
    return { valid: false, error: "E-posta adresi 5 ile 254 karakter arasında olmalıdır." };
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(clean)) {
    return { valid: false, error: "Lütfen geçerli bir e-posta formatı giriniz (örn: ornek@eposta.com)." };
  }
  return { valid: true, cleanEmail: clean };
}

