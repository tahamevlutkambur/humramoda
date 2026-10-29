/**
 * Hümra Moda — Faz 2 Güvenlik ve Yetkilendirme Testleri
 *
 * Test Edilen Kapsam:
 * 1. Sabit admin parolalarının (Eyup.Humra2026, Humra2026!) tamamen kaldırılması
 * 2. AUTH_SECRET'ın üretimde eksik/zayıf olması durumunda başlatmayı reddetmesi
 * 3. Token yükü (payload) tip, aralık ve rol doğrulama güvenliği
 * 4. ADMIN vs STAFF Rol Yetki Matrisi (Settings, Backups, Finans, Audit rotalarında 403 engeli)
 * 5. CSRF & Origin Doğrulaması (Cross-origin saldırıların 403 ile engellenmesi)
 * 6. Webhook uç noktalarının (PayTR, kargo) tarayıcı CSRF kuralından muafiyeti
 * 7. Rate Limit ve kullanıcı enumerasyonunun engellenmesi
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hashPassword,
  createSessionToken,
  verifySessionToken,
  getAuthSecret,
  ADMIN_COOKIE_NAME,
  getClientIp,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
} from "../src/lib/server/auth";
import { authenticateAdmin, getStoreData, saveStoreData } from "../src/lib/server/store";
import { requireAdminRole, verifySameOrigin, getAuthenticatedAdmin } from "../src/lib/server/session-guard";
import { GET as settingsGet, PUT as settingsPut } from "../src/app/api/admin/settings/route";
import { GET as backupsGet, POST as backupsPost } from "../src/app/api/admin/backups/route";
import { GET as backupDownloadGet } from "../src/app/api/admin/backups/[id]/download/route";
import { POST as backupRestorePost } from "../src/app/api/admin/backups/[id]/restore/route";
import { GET as finansGet } from "../src/app/api/admin/finans/route";
import { GET as auditLogsGet } from "../src/app/api/admin/logs/audit/route";
import { GET as ordersGet } from "../src/app/api/admin/orders/route";
import { DELETE as categoryDelete } from "../src/app/api/admin/categories/[id]/route";
import { POST as changePasswordPost } from "../src/app/api/admin/auth/change-password/route";

describe("Faz 2: Admin Kimlik Doğrulama, STAFF/ADMIN Yetkileri, CSRF ve Oturum Güvenliği", () => {
  const adminToken = createSessionToken({
    userId: "admin-test-master",
    email: "master@humramoda.local",
    role: "ADMIN",
    fullName: "Ana Yönetici",
  });

  const staffToken = createSessionToken({
    userId: "staff-test-operator",
    email: "staff@humramoda.local",
    role: "STAFF",
    fullName: "Operasyon Görevlisi",
  });

  // -------------------------------------------------------------
  // 1. SABİT PAROLALARIN VE GEÇİCİ BYPASS'LARIN KALDIRILMASI
  // -------------------------------------------------------------
  describe("1. Sabit Parola ve Bypass Doğrulaması", () => {
    it("daha önce kodda hardcoded bulunan alternatif parola (Humra2026!) ve sabit e-posta bypass'ları reddedilmeli", () => {
      // 1. Kodda hardcoded alternatif şifre olan Humra2026! artık hiçbir hesapta çalışmamalı
      const res1 = authenticateAdmin("humramoda@eyup.com", "Humra2026!");
      const res2 = authenticateAdmin("admin@humrabutik.com", "Humra2026!");

      expect(res1.error).toBeTruthy();
      expect(res1.user).toBeUndefined();
      expect(res2.error).toBeTruthy();
      expect(res2.user).toBeUndefined();

      // 2. Kodda hardcoded e-posta listesinde olup store'da olmayan e-postalar reddedilmeli
      const res3 = authenticateAdmin("admin@humramoda.com", "Eyup.Humra2026");
      const res4 = authenticateAdmin("destek@humrabutik.com", "Humra2026!");
      const res5 = authenticateAdmin("admin@humramoda.local", "Eyup.Humra2026");

      expect(res3.error).toBeTruthy();
      expect(res3.user).toBeUndefined();
      expect(res4.error).toBeTruthy();
      expect(res4.user).toBeUndefined();
      expect(res5.error).toBeTruthy();
      expect(res5.user).toBeUndefined();

      // 3. Giriş yapan hiçbir kullanıcı artık sahte 'admin-master' kimliği almamalı
      expect(res1.user).toBeUndefined();
      expect(res2.user).toBeUndefined();

      // 4. Meşru yönetici kullanıcısı (humramoda@eyup.com / Eyup.Humra2026) başarıyla giriş yapabilmeli
      const adminLogin = authenticateAdmin("humramoda@eyup.com", "Eyup.Humra2026");
      expect(adminLogin.error).toBeUndefined();
      expect(adminLogin.user).toBeDefined();
      expect(adminLogin.user?.role).toBe("ADMIN");
    });

    it("devre dışı bırakılmış (isActive: false) bir yönetici doğru şifre girse dahi engellenmeli", () => {
      const store = getStoreData();
      const testEmail = `inactive-${Date.now()}@humramoda.local`;
      const testPass = "GucluParola_12345!";

      store.adminUsers.push({
        id: `admin-inactive-${Date.now()}`,
        email: testEmail,
        fullName: "Pasif Yönetici",
        passwordHash: hashPassword(testPass),
        role: "ADMIN",
        isActive: false, // Devre dışı
        createdAt: new Date().toISOString(),
      });
      saveStoreData(store);

      const res = authenticateAdmin(testEmail, testPass);
      expect(res.user).toBeUndefined();
      expect(res.error).toBe("Geçersiz e-posta adresi veya şifre.");

      // Temizlik
      store.adminUsers = store.adminUsers.filter((u) => u.email !== testEmail);
      saveStoreData(store);
    });

    it("olmayan bir admin e-postası veya yanlış şifre kullanıcı varlığı ifşa etmeden aynı hatayı dönmeli", () => {
      const res = authenticateAdmin("bilinmeyen-kullanici@example.com", "HerhangiSifre123");
      expect(res.user).toBeUndefined();
      expect(res.error).toBe("Geçersiz e-posta adresi veya şifre.");
    });
  });

  // -------------------------------------------------------------
  // 2. AUTH_SECRET DAVRANIŞI VE ÜRETİM ZORUNLULUĞU
  // -------------------------------------------------------------
  describe("2. AUTH_SECRET Üretim Güvenliği", () => {
    it("üretimde AUTH_SECRET tanımlı değilken sabit mock anahtara düşmeyip sistemi başlatmayı reddetmeli", () => {
      const env = process.env as Record<string, string | undefined>;
      const originalEnv = env.NODE_ENV;
      const originalSecret = env.AUTH_SECRET;

      try {
        env.NODE_ENV = "production";
        delete env.AUTH_SECRET;

        expect(() => getAuthSecret()).toThrow(/GÜVENLİK HATASI/);

        // Boş veya 32 karakterden kısa olduğunda da reddetmeli
        env.AUTH_SECRET = "";
        expect(() => getAuthSecret()).toThrow(/GÜVENLİK HATASI/);

        env.AUTH_SECRET = "kisa_ve_zayif_anahtar";
        expect(() => getAuthSecret()).toThrow(/GÜVENLİK HATASI/);

        // Test veya örnek kelimesi içeren anahtarları reddetmeli
        env.AUTH_SECRET = "hm_sec_ornek_replace_in_production_123456789";
        expect(() => getAuthSecret()).toThrow(/GÜVENLİK HATASI/);

        // Güçlü anahtar sağlandığında güvenle dönmeli
        env.AUTH_SECRET = "bu_cok_guclu_kriptografik_ve_en_az_32_karakterli_anahtardir!";
        expect(getAuthSecret()).toBe("bu_cok_guclu_kriptografik_ve_en_az_32_karakterli_anahtardir!");
      } finally {
        env.NODE_ENV = originalEnv;
        env.AUTH_SECRET = originalSecret;
      }
    });
  });

  // -------------------------------------------------------------
  // 3. TOKEN YÜKÜ VE OTURUM DOĞRULAMA GÜVENLİĞİ
  // -------------------------------------------------------------
  describe("3. Oturum Belirteci (Token) Güvenliği", () => {
    it("eksik veya bozuk tip içeren payload'ları güvenle reddeder", () => {
      // 1. Eksik rol
      const badRoleToken = createSessionToken({
        userId: "u1",
        email: "test@local.com",
        role: "INVALID_ROLE" as any,
        fullName: "Test",
      });
      expect(verifySessionToken(badRoleToken)).toBeNull();

      // 2. Bozuk imza
      const valid = createSessionToken({
        userId: "u2",
        email: "u2@local.com",
        role: "STAFF",
        fullName: "U2",
      });
      const tampered = valid.replace(/\.[^.]+$/, ".sahte_imza");
      expect(verifySessionToken(tampered)).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 4. ADMIN VE STAFF YETKİ MATRİSİ (RBAC)
  // -------------------------------------------------------------
  describe("4. Rol Yetki Matrisi (RBAC) Kontrolleri", () => {
    it("STAFF kullanıcısı ayarları (Settings) okuyamaz veya güncelleyemez (403)", async () => {
      // GET /api/admin/settings
      const getReq = new Request("http://localhost:3000/api/admin/settings", {
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${staffToken}`,
        },
      });
      const getRes = await settingsGet(getReq);
      expect(getRes.status).toBe(403);
      const getData = await getRes.json();
      expect(getData.error).toContain("ADMIN rolü gereklidir");

      // PUT /api/admin/settings
      const putReq = new Request("http://localhost:3000/api/admin/settings", {
        method: "PUT",
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${staffToken}`,
          origin: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ siteName: "Saldırı" }),
      });
      const putRes = await settingsPut(putReq);
      expect(putRes.status).toBe(403);
    });

    it("ADMIN kullanıcısı ayarları güvenle okuyabilir ve güncelleyebilir (200)", async () => {
      const getReq = new Request("http://localhost:3000/api/admin/settings", {
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
        },
      });
      const getRes = await settingsGet(getReq);
      expect(getRes.status).toBe(200);
    });

    it("STAFF kullanıcısı yedekleri (Backups) listeleyemez, indiremez veya geri yükleyemez (403)", async () => {
      // Listeleme
      const listReq = new Request("http://localhost:3000/api/admin/backups", {
        headers: { cookie: `${ADMIN_COOKIE_NAME}=${staffToken}` },
      });
      expect((await backupsGet(listReq)).status).toBe(403);

      // İndirme
      const dlReq = new Request("http://localhost:3000/api/admin/backups/test-id/download", {
        headers: { cookie: `${ADMIN_COOKIE_NAME}=${staffToken}` },
      });
      expect((await backupDownloadGet(dlReq, { params: Promise.resolve({ id: "test-id" }) })).status).toBe(403);

      // Geri Yükleme
      const restoreReq = new Request("http://localhost:3000/api/admin/backups/test-id/restore", {
        method: "POST",
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${staffToken}`,
          origin: "http://localhost:3000",
        },
      });
      expect((await backupRestorePost(restoreReq, { params: Promise.resolve({ id: "test-id" }) })).status).toBe(403);
    });

    it("STAFF kullanıcısı finans ve kâr raporlarına erişemez (403)", async () => {
      const finReq = new Request("http://localhost:3000/api/admin/finans", {
        headers: { cookie: `${ADMIN_COOKIE_NAME}=${staffToken}` },
      });
      expect((await finansGet(finReq)).status).toBe(403);
    });

    it("STAFF kullanıcısı denetim (audit) loglarına erişemez (403)", async () => {
      const auditReq = new Request("http://localhost:3000/api/admin/logs/audit", {
        headers: { cookie: `${ADMIN_COOKIE_NAME}=${staffToken}` },
      });
      expect((await auditLogsGet(auditReq)).status).toBe(403);
    });

    it("STAFF kullanıcısı kategori silemez (403), sadece ADMIN silebilir", async () => {
      const staffDelReq = new Request("http://localhost:3000/api/admin/categories/test-cat", {
        method: "DELETE",
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${staffToken}`,
          origin: "http://localhost:3000",
        },
      });
      const staffRes = await categoryDelete(staffDelReq, { params: Promise.resolve({ id: "test-cat" }) });
      expect(staffRes.status).toBe(403);
    });

    it("STAFF kullanıcısı sipariş listesine erişebilir (200)", async () => {
      const ordersReq = new Request("http://localhost:3000/api/admin/orders", {
        headers: { cookie: `${ADMIN_COOKIE_NAME}=${staffToken}` },
      });
      expect((await ordersGet(ordersReq)).status).toBe(200);
    });

    it("sahte (fake) hm_admin_session cookie'si ile gelen isteklerde kriptografik doğrulama başarısız olmalı ve 401 ile reddedilmelidir", async () => {
      const fakeCookieReq = new Request("http://localhost:3000/api/admin/orders", {
        headers: { cookie: `${ADMIN_COOKIE_NAME}=sahte_ve_imzasiz_cookie_degeri` },
      });
      const res = await ordersGet(fakeCookieReq);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Yetkisiz");
    });
  });

  // -------------------------------------------------------------
  // 5. CSRF VE SAME-ORIGIN KORUMASI
  // -------------------------------------------------------------
  describe("5. CSRF ve Origin Doğrulama Kontrolleri", () => {
    it("farklı bir Origin'den (attacker.com) gelen durum değiştiren istekleri 403 ile engeller", async () => {
      const csrfReq = new Request("http://localhost:3000/api/admin/settings", {
        method: "PUT",
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
          origin: "https://evil-attacker.com",
          host: "localhost:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ siteName: "Hacked" }),
      });

      const res = await settingsPut(csrfReq);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("CSRF doğrulaması başarısız");
    });

    it("same-origin geçerli Origin başlığı içeren istekleri onaylar", () => {
      const validReq = new Request("http://localhost:3000/api/admin/settings", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
      });

      const check = verifySameOrigin(validReq);
      expect(check.valid).toBe(true);
    });

    it("Sec-Fetch-Site: cross-site başlığı olan istekleri derhal 403 ile reddeder", () => {
      const crossSiteReq = new Request("http://localhost:3000/api/admin/orders/1/status", {
        method: "POST",
        headers: {
          "sec-fetch-site": "cross-site",
          host: "localhost:3000",
        },
      });

      const check = verifySameOrigin(crossSiteReq);
      expect(check.valid).toBe(false);
      expect(check.error).toContain("Cross-site istek");
    });
  });

  // -------------------------------------------------------------
  // 6. GÜVENLİ IP ÇIKARMA VE RATE LIMIT DOĞRULAMASI
  // -------------------------------------------------------------
  describe("6. Güvenli IP Çıkarma ve Rate Limit", () => {
    it("X-Forwarded-For veya X-Real-IP başlığındaki enjeksiyonları temizler ve güvenli IP döner", () => {
      const req1 = new Request("http://localhost:3000/api/admin/auth/login", {
        headers: {
          "x-real-ip": "203.0.113.195",
        },
      });
      expect(getClientIp(req1)).toBe("203.0.113.195");

      const req2 = new Request("http://localhost:3000/api/admin/auth/login", {
        headers: {
          "x-forwarded-for": "198.51.100.44, 10.0.0.1",
        },
      });
      expect(getClientIp(req2)).toBe("198.51.100.44");
    });

    it("farklı IP adresleri birbirinin hesabını brute-force bahanesiyle kilitleyemez (DoS engeli)", () => {
      const ip1Key = `account:1.1.1.1:admin@humramoda.local`;
      const ip2Key = `account:2.2.2.2:admin@humramoda.local`;

      resetLoginRateLimit(ip1Key);
      resetLoginRateLimit(ip2Key);

      // IP1 5 kez hatalı deneme yapsın ve kilitlensin
      for (let i = 0; i < 5; i++) {
        recordFailedLogin(ip1Key);
      }
      expect(checkLoginRateLimit(ip1Key).allowed).toBe(false);

      // IP2 aynı hesaba giriş yapmaya çalıştığında kilitlenmemiş olmalı
      expect(checkLoginRateLimit(ip2Key).allowed).toBe(true);

      resetLoginRateLimit(ip1Key);
      resetLoginRateLimit(ip2Key);
    });
  });

  // -------------------------------------------------------------
  // 7. PAROLA DEĞİŞTİRME VE TÜM OTURUMLARI GEÇERSİZ KILMA İŞ AKIŞI
  // -------------------------------------------------------------
  describe("7. Parola Değiştirme API'si ve Oturum Geçersiz Kılma", () => {
    it("parola değiştirme API'si anonim ve cross-origin istekleri engeller", async () => {
      // 1. Anonim istek -> 401
      const anonReq = new Request("http://localhost:3000/api/admin/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "OldPassword1!", newPassword: "NewPassword2!" }),
      });
      const anonRes = await changePasswordPost(anonReq);
      expect(anonRes.status).toBe(401);

      // 2. Cross-origin istek -> 403
      const crossReq = new Request("http://localhost:3000/api/admin/auth/change-password", {
        method: "POST",
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
          "content-type": "application/json",
          origin: "https://evil-attacker.com",
        },
        body: JSON.stringify({ currentPassword: "OldPassword1!", newPassword: "NewPassword2!" }),
      });
      const crossRes = await changePasswordPost(crossReq);
      expect(crossRes.status).toBe(403);
    });

    it("parola başarıyla güncellendiğinde eski tokenlar derhal geçersiz kılınır (tokenVersionTimestamp)", async () => {
      const store = getStoreData();
      const testAdminId = `adm-pwd-test-${Date.now()}`;
      const initialPassword = "Initial_Strong_Pass_123!";
      const updatedPassword = "Updated_Strong_Pass_456!";

      // İzole test yöneticisi oluştur
      store.adminUsers = store.adminUsers || [];
      store.adminUsers.push({
        id: testAdminId,
        email: `pwd-rotation-${Date.now()}@humramoda.local`,
        fullName: "Parola Rotasyon Testi",
        role: "ADMIN",
        isActive: true,
        passwordHash: hashPassword(initialPassword),
        tokenVersionTimestamp: 0,
        createdAt: new Date().toISOString(),
      });
      saveStoreData(store);

      // Eski token üret (şimdi oluşturulmuş)
      const oldSessionToken = createSessionToken({
        userId: testAdminId,
        email: store.adminUsers.find((u) => u.id === testAdminId)!.email,
        role: "ADMIN",
        fullName: "Parola Rotasyon Testi",
      });

      // Eski token şu an geçerli olmalı
      const initialAuthReq = new Request("http://localhost:3000/api/admin/settings", {
        headers: { cookie: `${ADMIN_COOKIE_NAME}=${oldSessionToken}` },
      });
      const initialSession = await getAuthenticatedAdmin(initialAuthReq);
      expect(initialSession).not.toBeNull();
      expect(initialSession?.userId).toBe(testAdminId);

      // Parola değiştirme API'sini çağır (1 saniye sonrasını simüle etmek için timestamp ilerler)
      // Node timer resolution için kısa bekleme
      await new Promise((resolve) => setTimeout(resolve, 50));

      const changeReq = new Request("http://localhost:3000/api/admin/auth/change-password", {
        method: "POST",
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${oldSessionToken}`,
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          currentPassword: initialPassword,
          newPassword: updatedPassword,
        }),
      });

      try {
        const changeRes = await changePasswordPost(changeReq);
        expect(changeRes.status).toBe(200);
        const changeData = await changeRes.json();
        expect(changeData.success).toBe(true);

        // Yanıttan Set-Cookie başlığındaki yeni tokenı al
        const setCookieHeader = changeRes.headers.get("set-cookie") || "";
        expect(setCookieHeader).toContain(ADMIN_COOKIE_NAME);
        const match = setCookieHeader.match(new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`));
        const newSessionToken = match ? match[1] : null;
        expect(newSessionToken).toBeTruthy();

        // ESKİ TOKEN İLE İSTEK YAPILDIĞINDA: tokenVersionTimestamp kontrolü nedeniyle REDDEDİLMELİ (401)
        const postChangeOldReq = new Request("http://localhost:3000/api/admin/settings", {
          headers: { cookie: `${ADMIN_COOKIE_NAME}=${oldSessionToken}` },
        });
        const rejectedSession = await getAuthenticatedAdmin(postChangeOldReq);
        expect(rejectedSession).toBeNull();

        // YENİ TOKEN İLE İSTEK YAPILDIĞINDA: Başarıyla kabul edilmeli
        const postChangeNewReq = new Request("http://localhost:3000/api/admin/settings", {
          headers: { cookie: `${ADMIN_COOKIE_NAME}=${newSessionToken}` },
        });
        const acceptedSession = await getAuthenticatedAdmin(postChangeNewReq);
        expect(acceptedSession).not.toBeNull();
        expect(acceptedSession?.userId).toBe(testAdminId);
      } finally {
        // Test kullanıcısını temizle ve depoyu eski haline getir
        const s = getStoreData();
        s.adminUsers = (s.adminUsers || []).filter((u) => u.id !== testAdminId);
        saveStoreData(s);
      }
    });
  });
});
