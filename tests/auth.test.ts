import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  getAuthSecret,
} from "../src/lib/server/auth";
import { getStoreData, saveStoreData, authenticateAdmin } from "../src/lib/server/store";

describe("Admin Authentication & Security Engine", () => {
  it("generates cryptographic scrypt hash with random salt", () => {
    const rawPass = "GuvenliParola_2026!#";
    const hash1 = hashPassword(rawPass);
    const hash2 = hashPassword(rawPass);

    expect(hash1).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(hash2).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    // Farklı rastgele tuzlar (salt) nedeniyle aynı parolanın iki hash'i eşit olmamalıdır
    expect(hash1).not.toBe(hash2);
  });

  it("verifies matching passwords and rejects invalid passwords", () => {
    const rawPass = "DogruSifre_12345!";
    const hash = hashPassword(rawPass);

    expect(verifyPassword(rawPass, hash)).toBe(true);
    expect(verifyPassword("YanlisSifre", hash)).toBe(false);
    expect(verifyPassword("", hash)).toBe(false);
    expect(verifyPassword(rawPass, "bozuk:hash")).toBe(false);
  });

  it("creates and verifies tamper-proof HMAC session tokens", () => {
    const payload = {
      userId: "admin-test-1",
      email: "test-admin@humramoda.local",
      role: "ADMIN" as const,
      fullName: "Test Yöneticisi",
    };

    const token = createSessionToken(payload);
    expect(token).toBeTruthy();

    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.email).toBe("test-admin@humramoda.local");
    expect(verified?.role).toBe("ADMIN");
    expect(verified?.tokenId).toBeTruthy();
    expect(verified?.exp).toBeGreaterThan(Date.now());

    // İmzası bozulmuş token reddedilmelidir
    const tampered = token.slice(0, -4) + "abcd";
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects expired session tokens", () => {
    const payload = {
      userId: "admin-test-expired",
      email: "expired@humramoda.local",
      role: "ADMIN" as const,
      fullName: "Süresi Dolan Yönetici",
    };

    // -10 saniye süreyle süresi geçmiş token oluştur
    const expiredToken = createSessionToken(payload, -10);
    const verified = verifySessionToken(expiredToken);
    expect(verified).toBeNull();
  });

  it("immediately invalidates session token upon logout revocation", () => {
    const payload = {
      userId: "admin-test-logout",
      email: "logout@humramoda.local",
      role: "ADMIN" as const,
      fullName: "Çıkış Yapan Yönetici",
    };

    const token = createSessionToken(payload);
    expect(verifySessionToken(token)).not.toBeNull();

    // Çıkış yapıldı ve token iptal edildi
    const revoked = revokeSessionToken(token);
    expect(revoked).toBe(true);

    // İptal edilen token artık kabul edilmemelidir
    expect(verifySessionToken(token)).toBeNull();
  });

  it("enforces brute-force rate limiting on repeated failed login attempts", () => {
    const testKey = `test-ip-${Date.now()}:admin@test.local`;
    resetLoginRateLimit(testKey);

    // İlk 4 denemede izin verilmeli
    for (let i = 1; i <= 4; i++) {
      const rec = recordFailedLogin(testKey);
      expect(rec.isBlocked).toBe(false);
      expect(rec.attemptsLeft).toBe(5 - i);
    }

    // 5. denemede hesap geçici olarak kilitlenmeli
    const fifth = recordFailedLogin(testKey);
    expect(fifth.isBlocked).toBe(true);
    expect(fifth.attemptsLeft).toBe(0);

    // Kilitli durumdayken giriş engellenmeli
    const check = checkLoginRateLimit(testKey);
    expect(check.allowed).toBe(false);
    expect(check.waitSeconds).toBeGreaterThan(0);

    // Başarılı giriş sonrasında limit sıfırlanabilmeli
    resetLoginRateLimit(testKey);
    expect(checkLoginRateLimit(testKey).allowed).toBe(true);
  });

  it("prevents insecure startup in production with missing or weak AUTH_SECRET", () => {
    const envMap = process.env as Record<string, string | undefined>;
    const originalEnv = envMap.NODE_ENV;
    const originalSecret = envMap.AUTH_SECRET;

    try {
      envMap.NODE_ENV = "production";
      envMap.AUTH_SECRET = "zayif";

      expect(() => getAuthSecret()).toThrow(/GÜVENLİK HATASI/);

      // Güçlü üretim anahtarı (en az 32 karakter) sağlandığında çalışmalı
      envMap.AUTH_SECRET = "guclu_ve_kriptografik_olarak_uzun_anahtar_32karakter!";
      expect(getAuthSecret()).toBe("guclu_ve_kriptografik_olarak_uzun_anahtar_32karakter!");
    } finally {
      envMap.NODE_ENV = originalEnv;
      envMap.AUTH_SECRET = originalSecret;
    }
  });

  it("authenticates registered admin securely and rejects invalid credentials", () => {
    const store = getStoreData();
    const testEmail = `auth-test-${Date.now()}@humramoda.local`;
    const testPass = "TestGucluParola_2026!";

    // Geçici test kullanıcısı ekle
    store.adminUsers.push({
      id: `admin-test-${Date.now()}`,
      email: testEmail,
      fullName: "Birim Test Yöneticisi",
      passwordHash: hashPassword(testPass),
      role: "ADMIN",
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    saveStoreData(store);

    // Doğru şifre ile giriş
    const success = authenticateAdmin(testEmail, testPass);
    expect(success.error).toBeUndefined();
    expect(success.user?.email).toBe(testEmail);

    // Hatalı şifre ile giriş reddedilmeli
    const badPass = authenticateAdmin(testEmail, "YanlisParola!");
    expect(badPass.error).toBe("Geçersiz e-posta adresi veya şifre.");

    // Olmayan e-posta reddedilmeli
    const badEmail = authenticateAdmin("olmayan@humramoda.com", testPass);
    expect(badEmail.error).toBe("Geçersiz e-posta adresi veya şifre.");

    // Temizlik: Test kullanıcısını kaldır
    store.adminUsers = store.adminUsers.filter((u) => u.email !== testEmail);
    saveStoreData(store);
  });
});
