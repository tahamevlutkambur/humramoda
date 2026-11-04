import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  getStoreData,
  saveStoreData,
  createCustomer,
  findCustomerByEmail,
  findCustomerById,
  updateCustomerProfile,
  updateCustomerPassword,
  addCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  createPasswordResetToken,
  verifyAndConsumeResetToken,
  getCustomerOrders,
  getCustomerOrderById,
  createCashOnDeliveryOrder,
  createPendingOrder,
  executeWithOrderLock,
  AppStoreData,
} from "@/lib/server/store";
import { hashPassword, verifyPassword, ADMIN_COOKIE_NAME, createSessionToken } from "@/lib/server/auth";
import {
  createCustomerSessionToken,
  verifyCustomerSessionToken,
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
  checkCustomerLoginRateLimit,
  recordFailedCustomerLogin,
  resetCustomerLoginRateLimit,
  revokeCustomerToken,
  isCustomerTokenRevoked,
  validatePasswordStrength,
} from "@/lib/server/customer-auth";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_INITIAL_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
let baselineStoreJson: string = "";

function getStoreHash(): string {
  const content = fs.readFileSync(STORE_PATH);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

describe("FAZ 7.7: Müşteri Üyelik, Giriş ve Hesap Yönetimi Test Paketi", () => {
  beforeAll(() => {
    if (fs.existsSync(STORE_PATH)) {
      baselineStoreJson = fs.readFileSync(STORE_PATH, "utf8");
    }
  });

  afterAll(() => {
    if (baselineStoreJson && fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, baselineStoreJson, "utf8");
    }
    // Rate limit sayaçlarını temizle
    resetCustomerLoginRateLimit("test-rate@example.com");
  });

  // -------------------------------------------------------------
  // 1. MÜŞTERİ KAYIT SENARYOLARI
  // -------------------------------------------------------------
  describe("1. Müşteri Kayıt (Registration)", () => {
    it("1.1. Geçerli bilgilerle müşteri kaydı oluşturulmalı ve şifre scrypt ile hashlenmelidir", () => {
      const email = `test-user-${Date.now()}@example.com`;
      const rawPassword = "GucluSifre2026!";
      const passHash = hashPassword(rawPassword);

      const res = createCustomer({
        fullName: "Zeynep Kaya",
        email,
        passwordHash: passHash,
        phone: "05321112233",
        kvkkApproved: true,
        termsApproved: true,
        marketingConsent: true,
      });

      expect(res.success).toBe(true);
      expect(res.customer).toBeDefined();
      expect(res.customer?.email).toBe(email.toLowerCase());
      expect(res.customer?.fullName).toBe("Zeynep Kaya");
      expect(res.customer?.passwordHash).not.toBe(rawPassword);
      expect(res.customer?.passwordHash).toContain(":"); // salt:derivedKey formatı
      expect(verifyPassword(rawPassword, res.customer!.passwordHash)).toBe(true);
      expect(verifyPassword("YanlisSifre", res.customer!.passwordHash)).toBe(false);
    });

    it("1.2. Aynı e-posta adresiyle mükerrer kayıt engellenmelidir (case-insensitive)", () => {
      const email = `duplicate-${Date.now()}@example.com`;
      const passHash = hashPassword("Sifre123!");

      const first = createCustomer({
        fullName: "Merve Demir",
        email: email.toUpperCase(),
        passwordHash: passHash,
        kvkkApproved: true,
        termsApproved: true,
      });
      expect(first.success).toBe(true);

      const duplicate = createCustomer({
        fullName: "Merve Demir İkinci",
        email: email.toLowerCase(),
        passwordHash: passHash,
        kvkkApproved: true,
        termsApproved: true,
      });

      expect(duplicate.success).toBe(false);
      expect(duplicate.error).toContain("zaten mevcuttur");
    });

    it("1.3. Şifre gücü kontrolü: 6 karakterden kısa şifreler reddedilmelidir", () => {
      expect(validatePasswordStrength("12345").valid).toBe(false);
      expect(validatePasswordStrength("123456").valid).toBe(true);
      expect(validatePasswordStrength("").valid).toBe(false);
    });

    it("1.4. Zorunlu onaylar: KVKK ve Üyelik Sözleşmesi onayı olmadan kayıt yapılamaz", () => {
      const email = `onay-test-${Date.now()}@example.com`;
      const passHash = hashPassword("Sifre123!");

      const noKvkk = createCustomer({
        fullName: "Ali Veli",
        email,
        passwordHash: passHash,
        kvkkApproved: false,
        termsApproved: true,
      });
      expect(noKvkk.success).toBe(false);
      expect(noKvkk.error).toContain("KVKK");

      const noTerms = createCustomer({
        fullName: "Ali Veli",
        email,
        passwordHash: passHash,
        kvkkApproved: true,
        termsApproved: false,
      });
      expect(noTerms.success).toBe(false);
      expect(noTerms.error).toContain("Sözleşmesi");
    });
  });

  // -------------------------------------------------------------
  // 2. GİRİŞ, OTURUM VE RATE LIMITING
  // -------------------------------------------------------------
  describe("2. Giriş, Oturum ve Rate Limiting", () => {
    it("2.1. Başarılı girişte imzalı CUSTOMER rolünde token üretilmeli ve doğrulanmalıdır", () => {
      const customer = {
        id: "cust-test-123",
        email: "zeynep@example.com",
        fullName: "Zeynep Kaya",
      };

      const token = createCustomerSessionToken(customer, 3600);
      expect(token).toBeDefined();
      expect(token.split(".").length).toBe(2);

      const payload = verifyCustomerSessionToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe("cust-test-123");
      expect(payload?.role).toBe("CUSTOMER");
      expect(payload?.email).toBe("zeynep@example.com");
    });

    it("2.2. Oturum iptali (revocation): Çıkış yapılan token geçersiz olmalıdır", () => {
      const customer = { id: "cust-logout", email: "logout@example.com", fullName: "Test" };
      const token = createCustomerSessionToken(customer);

      expect(verifyCustomerSessionToken(token)).not.toBeNull();

      revokeCustomerToken(token);
      expect(verifyCustomerSessionToken(token)).toBeNull();
    });

    it("2.3. Süresi dolmuş token reddedilmelidir (expired token)", () => {
      const customer = { id: "cust-exp", email: "exp@example.com", fullName: "Test Exp" };
      // 0 saniyelik süresi geçmiş token üretimi simülasyonu (-10 saniye)
      const token = createCustomerSessionToken(customer, -10);
      expect(verifyCustomerSessionToken(token)).toBeNull();
    });

    it("2.4. Başarısız girişlerde rate limit uygulanmalı ve 5 denemede kilitlenmelidir", () => {
      const testEmail = "test-rate@example.com";
      resetCustomerLoginRateLimit(testEmail);

      expect(checkCustomerLoginRateLimit(testEmail).allowed).toBe(true);

      for (let i = 1; i <= 4; i++) {
        const fail = recordFailedCustomerLogin(testEmail);
        expect(fail.isBlocked).toBe(false);
        expect(fail.attemptsLeft).toBe(5 - i);
      }

      // 5. başarısız deneme
      const fifth = recordFailedCustomerLogin(testEmail);
      expect(fifth.isBlocked).toBe(true);
      expect(fifth.attemptsLeft).toBe(0);

      // Artık blokeli olmalı
      const blockedCheck = checkCustomerLoginRateLimit(testEmail);
      expect(blockedCheck.allowed).toBe(false);
      expect(blockedCheck.waitSeconds).toBeGreaterThan(0);

      // Resetlendiğinde tekrar açılmalı
      resetCustomerLoginRateLimit(testEmail);
      expect(checkCustomerLoginRateLimit(testEmail).allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 3. ADMİN VE MÜŞTERİ OTURUMLARININ AYRILIĞI
  // -------------------------------------------------------------
  describe("3. Admin ve Müşteri Oturumlarının İzolasyonu", () => {
    it("3.1. Admin session token'ı müşteri olarak kabul EDİLMEMELİDİR", () => {
      const adminToken = createSessionToken({
        userId: "admin-1",
        email: "humramoda@eyup.com",
        role: "ADMIN",
        fullName: "Eyüp Admin",
      });

      // Müşteri oturum doğrulayıcısı admin token'ını CUSTOMER olmadığı için reddetmelidir
      const customerVerify = verifyCustomerSessionToken(adminToken);
      expect(customerVerify).toBeNull();
    });

    it("3.2. Müşteri session token'ı admin paneli yetkisi ALAMAMALIDIR", () => {
      const customerToken = createCustomerSessionToken({
        id: "cust-attacker",
        email: "attacker@example.com",
        fullName: "Attacker User",
      });

      // Token çözüldüğünde role CUSTOMER olmalıdır; ADMIN veya STAFF olamaz
      const payload = verifyCustomerSessionToken(customerToken);
      expect(payload?.role).toBe("CUSTOMER");
      expect(payload?.role).not.toBe("ADMIN");
      expect(payload?.role).not.toBe("STAFF");
    });
  });

  // -------------------------------------------------------------
  // 4. ŞİFRE SIFIRLAMA AKIŞI
  // -------------------------------------------------------------
  describe("4. Şifre Sıfırlama Akışı", () => {
    it("4.1. Güvenli sıfırlama token'ı oluşturulmalı ve yeni şifre belirlenebilmelidir", () => {
      const email = `reset-${Date.now()}@example.com`;
      const initialPass = "EskiSifre123!";
      const createRes = createCustomer({
        fullName: "Şifre Sıfırlayan",
        email,
        passwordHash: hashPassword(initialPass),
        kvkkApproved: true,
        termsApproved: true,
      });
      expect(createRes.success).toBe(true);

      // Token oluştur
      const tokenRes = createPasswordResetToken(email);
      expect(tokenRes.success).toBe(true);
      expect(tokenRes.token).toBeDefined();
      expect(tokenRes.token?.length).toBe(64); // 32 byte hex

      // Yeni şifreyi ayarla
      const newPass = "YeniGucluSifre2026!";
      const newHash = hashPassword(newPass);
      const consumeRes = verifyAndConsumeResetToken(tokenRes.token!, newHash);
      expect(consumeRes.success).toBe(true);

      // Müşterinin yeni şifresiyle doğrulanabilmesi
      const updatedCust = findCustomerByEmail(email);
      expect(verifyPassword(newPass, updatedCust!.passwordHash)).toBe(true);
      expect(verifyPassword(initialPass, updatedCust!.passwordHash)).toBe(false);
      expect(updatedCust?.tokenVersionTimestamp).toBeDefined();
    });

    it("4.2. Kullanılmış token ikinci kez kullanılamaz (tek kullanımlık kuralı)", () => {
      const email = `reuse-${Date.now()}@example.com`;
      createCustomer({
        fullName: "Reuse Test",
        email,
        passwordHash: hashPassword("Pass123!"),
        kvkkApproved: true,
        termsApproved: true,
      });

      const tokenRes = createPasswordResetToken(email);
      const firstUse = verifyAndConsumeResetToken(tokenRes.token!, hashPassword("PassOne123!"));
      expect(firstUse.success).toBe(true);

      const secondUse = verifyAndConsumeResetToken(tokenRes.token!, hashPassword("PassTwo123!"));
      expect(secondUse.success).toBe(false);
      expect(secondUse.error).toContain("daha önce kullanılmış");
    });

    it("4.3. Sahte veya geçersiz token reddedilmelidir", () => {
      const fake = verifyAndConsumeResetToken("sahte-token-12345", hashPassword("NewPass123!"));
      expect(fake.success).toBe(false);
      expect(fake.error).toContain("geçersiz");
    });
  });

  // -------------------------------------------------------------
  // 5. ADRES YÖNETİMİ VE IDOR DENETİMİ
  // -------------------------------------------------------------
  describe("5. Adres Yönetimi ve IDOR Güvenliği", () => {
    it("5.1. Yeni adres eklenebilmeli ve ilk eklenen adres varsayılan olmalıdır", () => {
      const email = `addr-user-${Date.now()}@example.com`;
      const cust = createCustomer({
        fullName: "Adres Sahibi",
        email,
        passwordHash: hashPassword("Pass123!"),
        kvkkApproved: true,
        termsApproved: true,
      }).customer!;

      const addRes = addCustomerAddress(cust.id, {
        title: "Evim",
        recipient: "Adres Sahibi",
        phone: "05321112233",
        city: "İstanbul",
        district: "Kadıköy",
        fullAddress: "Moda Cad. No: 15 D: 4",
      });

      expect(addRes.success).toBe(true);
      expect(addRes.address).toBeDefined();
      expect(addRes.address?.title).toBe("Evim");
      expect(addRes.address?.isDefaultDelivery).toBe(true); // İlk adres otomatik varsayılan
    });

    it("5.2. IDOR Korunumu: Bir müşteri başka müşterinin adresini güncelleyemez veya silemez", () => {
      // Müşteri A
      const custA = createCustomer({
        fullName: "Müşteri A",
        email: `custA-${Date.now()}@example.com`,
        passwordHash: hashPassword("Pass123!"),
        kvkkApproved: true,
        termsApproved: true,
      }).customer!;
      const addrA = addCustomerAddress(custA.id, {
        title: "A'nın Evi",
        recipient: "Müşteri A",
        phone: "05321112233",
        city: "İstanbul",
        district: "Şişli",
        fullAddress: "Halaskargazi Cad.",
      }).address!;

      // Müşteri B
      const custB = createCustomer({
        fullName: "Müşteri B",
        email: `custB-${Date.now()}@example.com`,
        passwordHash: hashPassword("Pass123!"),
        kvkkApproved: true,
        termsApproved: true,
      }).customer!;

      // B, A'nın adresini güncellemeye çalışır -> Bulunamadı (IDOR engeli)
      const attackUpdate = updateCustomerAddress(custB.id, addrA.id, {
        title: "Saldırgan Adresi",
      });
      expect(attackUpdate.success).toBe(false);
      expect(attackUpdate.error).toContain("Adres bulunamadı");

      // B, A'nın adresini silmeye çalışır -> Bulunamadı (IDOR engeli)
      const attackDelete = deleteCustomerAddress(custB.id, addrA.id);
      expect(attackDelete.success).toBe(false);
      expect(attackDelete.error).toContain("Adres bulunamadı");

      // A'nın adresi hala sağlam durmalıdır
      const checkA = findCustomerById(custA.id);
      expect(checkA?.addresses.some((a) => a.id === addrA.id && a.title === "A'nın Evi")).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 6. SİPARİŞ GEÇMİŞİ VE MİSAFİR SİPARİŞLERİ
  // -------------------------------------------------------------
  describe("6. Sipariş Geçmişi ve Misafir Siparişleri", () => {
    it("6.1. Giriş yapmış müşteriyle oluşturulan sipariş müşterinin sipariş listesinde yer almalıdır", async () => {
      const email = `order-user-${Date.now()}@example.com`;
      const cust = createCustomer({
        fullName: "Sipariş Veren Müşteri",
        email,
        passwordHash: hashPassword("Pass123!"),
        kvkkApproved: true,
        termsApproved: true,
      }).customer!;

      const store = getStoreData();
      const product = store.products.find((p) => p.variants && p.variants.length > 0 && p.variants[0].stockQuantity > 5)!;
      const variant = product.variants[0];
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const orderRes = await executeWithOrderLock(async () => {
        return createCashOnDeliveryOrder({
          customer: {
            userId: cust.id,
            fullName: cust.fullName,
            email: cust.email,
            phone: "05321112233",
            city: "İstanbul",
            district: "Beşiktaş",
            fullAddress: "Barbaros Bulvarı No: 10",
          },
          items: [
            {
              productId: product.id,
              variantId: variant.id,
              sku: variant.sku,
              colorName: color?.name,
              sizeName: size?.name,
              quantity: 1,
            },
          ],
        });
      });

      expect(orderRes.success).toBe(true);
      expect(orderRes.order?.userId).toBe(cust.id);

      // Müşteri kendi siparişini çekebilmeli
      const customerOrders = getCustomerOrders(cust.id);
      expect(customerOrders.some((o) => o.id === orderRes.order!.id)).toBe(true);

      const singleOrder = getCustomerOrderById(cust.id, orderRes.order!.orderNumber);
      expect(singleOrder).not.toBeNull();
      expect(singleOrder?.id).toBe(orderRes.order!.id);
    });

    it("6.2. IDOR Korunumu: Başka bir müşteri bu siparişi çekememelidir", () => {
      const attackerCustId = "cust-other-random-id";
      const store = getStoreData();
      const lastOrder = store.orders[0];

      if (lastOrder) {
        // Saldırgan bu siparişi çekmeye çalıştığında null dönmeli
        const attempt = getCustomerOrderById(attackerCustId, lastOrder.orderNumber);
        expect(attempt).toBeNull();
      }
    });

    it("6.3. Misafir siparişi regresyonu: Misafir siparişleri userId olmadan oluşturulmalıdır", async () => {
      const store = getStoreData();
      const product = store.products.find((p) => p.variants && p.variants.length > 0 && p.variants[0].stockQuantity > 5)!;
      const variant = product.variants[0];
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const guestRes = await executeWithOrderLock(async () => {
        return createPendingOrder({
          customer: {
            fullName: "Misafir Alıcı",
            email: "misafir@example.com",
            phone: "05441112233",
            city: "Ankara",
            district: "Çankaya",
            fullAddress: "Tunalı Hilmi Cad.",
          },
          items: [
            {
              productId: product.id,
              variantId: variant.id,
              sku: variant.sku,
              colorName: color?.name,
              sizeName: size?.name,
              quantity: 1,
            },
          ],
        });
      });

      expect(guestRes.success).toBe(true);
      expect(guestRes.order?.userId).toBeUndefined();
    });
  });

  // -------------------------------------------------------------
  // 7. VERİ VE HASH BÜTÜNLÜĞÜ DENETİMİ
  // -------------------------------------------------------------
  describe("7. Başlangıç ve Bitiş Veri Kaynağı Koruma Denetimi", () => {
    it("7.1. Testler sonlandığında data/store.json SHA256 başlangıç değeriyle birebir eşleşmelidir", () => {
      // Testlerin oluşturduğu geçici test verileri temizlenip restore edilir
      if (baselineStoreJson) {
        fs.writeFileSync(STORE_PATH, baselineStoreJson, "utf8");
      }
      const currentHash = getStoreHash();
      expect(currentHash).toBe(EXPECTED_INITIAL_HASH);
    });
  });
});
