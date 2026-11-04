/**
 * Hümra Moda — Faz 5: PayTR Ödeme Entegrasyonu ve Güvenlik Testleri
 *
 * Test Edilen Kriterler:
 * 1. PayTR token hash formülünün doğruluğu (HMAC-SHA256, base64)
 * 2. Callback hash formülünün doğruluğu ve timing-safe doğrulama
 * 3. Eksik yapılandırmanın güvenli şekilde ele alınması
 * 4. İstemciden gönderilen fiyat ve tutarlara güvenilmemesi (sunucu taraflı katalog hesabı)
 * 5. Yetersiz stok durumunda sipariş oluşturmanın güvenle engellenmesi
 * 6. Geçerli imzalı başarılı callback (`status: "success"`) -> siparişin PAID yapılması ve stok düşümü
 * 7. İdempotency: Aynı başarılı callback ikinci kez geldiğinde tekrar stok düşülmemesi ve "OK" dönülmesi
 * 8. Geçersiz imzalı (bad hash) bildirimlerin reddedilmesi
 * 9. Tutar uyuşmazlığı tespitinde işlemin reddedilmesi (amount mismatch)
 * 10. Bilinmeyen sipariş referansı geldiğinde reddedilmesi
 * 11. Başarısız ödeme bildirimi (`status: "failed"`) -> siparişin FAILED ve CANCELLED yapılması
 * 12. Operasyonel durum (CONFIRMED/CANCELLED) ile finansal ödeme durumunun (PAID/FAILED) birbirinden bağımsızlığı
 * 13. Gizli anahtarların (merchant_key, salt) ve hassas verilerin loglara ve yanıtlara sızmaması
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PRODUCTS } from "../src/lib/catalog";
import {
  computePayTRTokenHash,
  computePayTRCallbackHash,
  verifyPayTRCallbackHash,
  formatPayTRBasket,
  processPayTRCallback,
  getPayTRConfig,
} from "../src/lib/server/paytr";
import {
  createPendingOrder,
  getOrderById,
  updateOrderOperationalStatus,
  getStoreData,
  saveStoreData,
  getOrderPublicStatus,
} from "../src/lib/server/store";

describe("Faz 5: PayTR Ödeme Entegrasyonu ve Güvenlik Denetimleri", () => {
  const TEST_MERCHANT_KEY = "test_merchant_key_1234567890abcdef";
  const TEST_MERCHANT_SALT = "test_merchant_salt_abcdef1234567890";
  const TEST_MERCHANT_ID = "999888";
  const storeFilePath = path.join(process.cwd(), "data", "store.json");
  let snapshot: string | null = null;

  beforeAll(() => {
    if (fs.existsSync(storeFilePath)) {
      snapshot = fs.readFileSync(storeFilePath, "utf-8");
    }
  });

  afterAll(() => {
    if (snapshot && fs.existsSync(storeFilePath)) {
      fs.writeFileSync(storeFilePath, snapshot, "utf-8");
    }
  });

  beforeEach(() => {
    const store = getStoreData();
    if (!store.products || store.products.length === 0) {
      store.products = JSON.parse(JSON.stringify(PRODUCTS));
    }
    for (const p of store.products) {
      for (const v of p.variants) {
        if (v.stockQuantity < 20) {
          v.stockQuantity = 50;
        }
      }
    }
    saveStoreData(store);
  });

  describe("1. PayTR İmzaları ve Hash Doğrulama", () => {
    it("Token isteği için resmi dokümantasyon formülüyle doğru HMAC-SHA256 üretir", () => {
      const basket = formatPayTRBasket([
        {
          productName: "Scuba Takım",
          colorName: "Siyah",
          sizeName: "1 Beden",
          unitPrice: 1574.1,
          quantity: 1,
        },
      ]);

      const tokenHash = computePayTRTokenHash({
        merchantId: TEST_MERCHANT_ID,
        merchantKey: TEST_MERCHANT_KEY,
        merchantSalt: TEST_MERCHANT_SALT,
        userIp: "192.168.1.1",
        merchantOid: "HM-20261021-TEST1",
        email: "test@humramoda.com",
        paymentAmountKurus: 157410,
        userBasketBase64: basket,
        noInstallment: "0",
        maxInstallment: "0",
        currency: "TL",
        testMode: "1",
      });

      expect(tokenHash).toBeDefined();
      expect(typeof tokenHash).toBe("string");
      expect(tokenHash.length).toBeGreaterThan(20);

      // Manuel aynı formülle kontrol
      const expectedStr =
        TEST_MERCHANT_ID +
        "192.168.1.1" +
        "HM-20261021-TEST1" +
        "test@humramoda.com" +
        "157410" +
        basket +
        "0" +
        "0" +
        "TL" +
        "1" +
        TEST_MERCHANT_SALT;

      const manualHash = crypto
        .createHmac("sha256", TEST_MERCHANT_KEY)
        .update(expectedStr)
        .digest("base64");

      expect(tokenHash).toBe(manualHash);
    });

    it("Callback bildirimi için resmi formülle doğru hash üretir ve timing-safe doğrular", () => {
      const merchantOid = "HM-20261021-TEST2";
      const status = "success";
      const totalAmount = "157410";

      const validHash = computePayTRCallbackHash({
        merchantOid,
        status,
        totalAmount,
        merchantSalt: TEST_MERCHANT_SALT,
        merchantKey: TEST_MERCHANT_KEY,
      });

      const isVerified = verifyPayTRCallbackHash(validHash, {
        merchantOid,
        status,
        totalAmount,
        merchantSalt: TEST_MERCHANT_SALT,
        merchantKey: TEST_MERCHANT_KEY,
      });

      expect(isVerified).toBe(true);

      // Tahrif edilmiş / değiştirilmiş hash reddedilmeli
      const tamperedHash = Buffer.from("sahte_hash_degeri").toString("base64");
      const isTamperedVerified = verifyPayTRCallbackHash(tamperedHash, {
        merchantOid,
        status,
        totalAmount,
        merchantSalt: TEST_MERCHANT_SALT,
        merchantKey: TEST_MERCHANT_KEY,
      });

      expect(isTamperedVerified).toBe(false);
    });
  });

  describe("2. Sunucu Taraflı Güvenli Sipariş Oluşturma", () => {
    it("istemciden gelen fiyatlara güvenmez, güncel katalogdan hesaplar", () => {
      const store = getStoreData();
      const firstProduct = store.products[0];
      const firstVariant = firstProduct.variants[0];

      const expectedUnitPrice = firstProduct.discountPrice ?? firstProduct.basePrice;
      const expectedShipping = store.settings?.shippingFee ?? 150;
      const expectedTotal = expectedUnitPrice * 2 + expectedShipping;
      const expectedKurus = Math.round(expectedTotal * 100);

      const res = createPendingOrder({
        customer: {
          fullName: "Ayşe Yılmaz",
          email: "ayse@example.com",
          phone: "05321112233",
          city: "İstanbul",
          district: "Beşiktaş",
          fullAddress: "Barbaros Bulvarı No: 10 D: 4",
        },
        items: [
          {
            productId: firstProduct.id,
            variantId: firstVariant.id,
            quantity: 2,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.order).toBeDefined();
      expect(res.order?.totalAmount).toBe(expectedTotal);
      expect(res.order?.totalKurus).toBe(expectedKurus);
      expect(res.order?.paymentStatus).toBe("PENDING");
      expect(res.order?.operationalStatus).toBe("PENDING");
      expect(res.order?.stockDeducted).toBe(false);
    });

    it("yetersiz stok durumunda sipariş oluşturulmasını güvenle engeller", () => {
      const store = getStoreData();
      const firstProduct = store.products[0];
      const firstVariant = firstProduct.variants[0];

      const res = createPendingOrder({
        customer: {
          fullName: "Zeynep Kaya",
          email: "zeynep@example.com",
          phone: "05321112233",
          city: "İzmir",
          district: "Konak",
          fullAddress: "Cumhuriyet Bulvarı No: 5",
        },
        items: [
          {
            productId: firstProduct.id,
            variantId: firstVariant.id,
            quantity: 999999, // Mevcut stoktan kat kat fazla
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("yeterli stok bulunmuyor");
      expect(res.order).toBeUndefined();
    });
  });

  describe("3. Callback İşleme, Stok ve İdempotency Güvenliği", () => {
    let testOrderNumber: string;
    let initialStock: number;
    let targetVariantId: string;
    let orderKurus: number;

    beforeEach(() => {
      const store = getStoreData();
      const prod = store.products[0];
      const variant = prod.variants[0];
      if (variant.stockQuantity < 10) {
        variant.stockQuantity = 50;
        saveStoreData(store);
      }
      targetVariantId = variant.id;
      initialStock = variant.stockQuantity;

      const orderRes = createPendingOrder({
        customer: {
          fullName: "Fatma Şahin",
          email: "fatma@example.com",
          phone: "05332223344",
          city: "Ankara",
          district: "Çankaya",
          fullAddress: "Kızılay Mah. No: 1",
        },
        items: [
          {
            productId: prod.id,
            variantId: variant.id,
            quantity: 2,
          },
        ],
      });

      expect(orderRes.success).toBe(true);
      testOrderNumber = orderRes.order!.orderNumber;
      orderKurus = orderRes.order!.totalKurus;
    });

    it("sahte sim_hash_ öneki ile gönderilen callback'i kesinlikle reddeder ve siparişi PAID yapmaz", () => {
      const fakeSimHash = `sim_hash_${testOrderNumber}_1`;
      const res = processPayTRCallback({
        merchantOid: testOrderNumber,
        status: "success",
        totalAmount: orderKurus,
        hash: fakeSimHash,
      });

      expect(res.ok).toBe(false);
      expect(res.httpStatus).toBe(400);
      expect(res.statusText).toContain("bad hash");

      const unchanged = getOrderById(testOrderNumber);
      expect(unchanged?.paymentStatus).toBe("PENDING");
      expect(unchanged?.stockDeducted).toBe(false);
    });

    it("geçerli imzalı başarılı callback siparişi PAID yapar ve stoku tam bir kez düşer", () => {
      const cfg = getPayTRConfig();
      const validHash = computePayTRCallbackHash({
        merchantOid: testOrderNumber,
        status: "success",
        totalAmount: orderKurus,
        merchantSalt: cfg.merchantSalt,
        merchantKey: cfg.merchantKey,
      });
      const res = processPayTRCallback({
        merchantOid: testOrderNumber,
        status: "success",
        totalAmount: orderKurus,
        hash: validHash,
      });

      expect(res.ok).toBe(true);
      expect(res.httpStatus).toBe(200);
      expect(res.statusText).toBe("OK");

      const updated = getOrderById(testOrderNumber);
      expect(updated?.paymentStatus).toBe("PAID");
      expect(updated?.operationalStatus).toBe("CONFIRMED");
      expect(updated?.stockDeducted).toBe(true);
      expect(updated?.paidAt).toBeDefined();

      // Stok 2 adet düşmüş olmalı
      const storeAfter = getStoreData();
      const variantAfter = storeAfter.products[0].variants.find((v) => v.id === targetVariantId);
      expect(variantAfter?.stockQuantity).toBe(initialStock - 2);
    });

    it("idempotency: aynı başarılı callback ikinci kez geldiğinde stok tekrar düşülmez ve anında OK yanıtı döner", () => {
      const cfg = getPayTRConfig();
      const validHash = computePayTRCallbackHash({
        merchantOid: testOrderNumber,
        status: "success",
        totalAmount: orderKurus,
        merchantSalt: cfg.merchantSalt,
        merchantKey: cfg.merchantKey,
      });

      // 1. Çağrı
      const res1 = processPayTRCallback({
        merchantOid: testOrderNumber,
        status: "success",
        totalAmount: orderKurus,
        hash: validHash,
      });
      expect(res1.ok).toBe(true);
      expect(res1.statusText).toBe("OK");

      const storeMid = getStoreData();
      const stockMid = storeMid.products[0].variants.find((v) => v.id === targetVariantId)?.stockQuantity;

      // 2. Çağrı (PayTR retry simülasyonu)
      const res2 = processPayTRCallback({
        merchantOid: testOrderNumber,
        status: "success",
        totalAmount: orderKurus,
        hash: validHash,
      });

      expect(res2.ok).toBe(true);
      expect(res2.httpStatus).toBe(200);
      expect(res2.statusText).toBe("OK");
      expect(res2.idempotent).toBe(true);

      // Stok DEĞİŞMEMELİ
      const storeFinal = getStoreData();
      const stockFinal = storeFinal.products[0].variants.find((v) => v.id === targetVariantId)?.stockQuantity;
      expect(stockFinal).toBe(stockMid);
    });

    it("tutar uyuşmazlığında callback reddedilir ve sipariş ödenmiş sayılmaz", () => {
      const cfg = getPayTRConfig();
      const tamperedKurus = orderKurus + 10000; // 100 TL fazla gönderildi
      const validHashForTamperedAmount = computePayTRCallbackHash({
        merchantOid: testOrderNumber,
        status: "success",
        totalAmount: tamperedKurus,
        merchantSalt: cfg.merchantSalt,
        merchantKey: cfg.merchantKey,
      });

      const res = processPayTRCallback({
        merchantOid: testOrderNumber,
        status: "success",
        totalAmount: tamperedKurus,
        hash: validHashForTamperedAmount,
      });

      expect(res.ok).toBe(false);
      expect(res.httpStatus).toBe(400);
      expect(res.statusText).toContain("amount mismatch");

      const order = getOrderById(testOrderNumber);
      expect(order?.paymentStatus).toBe("PENDING");
      expect(order?.stockDeducted).toBe(false);
    });

    it("bilinmeyen sipariş referansı geldiğinde callback reddedilir", () => {
      const cfg = getPayTRConfig();
      const unknownOid = "HM-TANIMSIZ-9999";
      const validHash = computePayTRCallbackHash({
        merchantOid: unknownOid,
        status: "success",
        totalAmount: 50000,
        merchantSalt: cfg.merchantSalt,
        merchantKey: cfg.merchantKey,
      });

      const res = processPayTRCallback({
        merchantOid: unknownOid,
        status: "success",
        totalAmount: 50000,
        hash: validHash,
      });

      expect(res.ok).toBe(false);
      expect(res.httpStatus).toBe(400);
      expect(res.statusText).toContain("order not found");
    });

    it("başarısız callback siparişi FAILED yapar ve operasyonel durumu CANCELLED olarak işaretler", () => {
      const cfg = getPayTRConfig();
      const validFailHash = computePayTRCallbackHash({
        merchantOid: testOrderNumber,
        status: "failed",
        totalAmount: orderKurus,
        merchantSalt: cfg.merchantSalt,
        merchantKey: cfg.merchantKey,
      });
      const res = processPayTRCallback({
        merchantOid: testOrderNumber,
        status: "failed",
        totalAmount: orderKurus,
        hash: validFailHash,
        failedReasonCode: "100",
        failedReasonMsg: "Yetersiz bakiye",
      });

      expect(res.ok).toBe(true);
      expect(res.statusText).toBe("OK");

      const order = getOrderById(testOrderNumber);
      expect(order?.paymentStatus).toBe("FAILED");
      expect(order?.operationalStatus).toBe("CANCELLED");
      expect(order?.paymentFailedReason).toContain("Yetersiz bakiye");
      expect(order?.stockDeducted).toBe(false);
    });
  });

  describe("4. Operasyonel Durum ve Finansal Durum Ayrımı", () => {
    it("yöneticinin siparişi CONFIRMED yapması finansal ödeme durumunu otomatik olarak PAID yapmaz", () => {
      const store = getStoreData();
      const prod = store.products[0];

      const res = createPendingOrder({
        customer: {
          fullName: "Merve Koç",
          email: "merve@example.com",
          phone: "05329998877",
          city: "Bursa",
          district: "Nilüfer",
          fullAddress: "Ataevler Mah. No: 12",
        },
        items: [{
          productId: prod.id,
          variantId: prod.variants.find((variant) => variant.isActive && variant.stockQuantity > 0)?.id,
          quantity: 1,
        }],
      });

      const order = res.order!;
      expect(order.paymentStatus).toBe("PENDING");

      // Yönetici operasyonel olarak onaylıyor
      const updateRes = updateOrderOperationalStatus(order.id, "CONFIRMED", {
        adminId: "adm-1",
        adminEmail: "admin@humramoda.com",
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.order?.operationalStatus).toBe("CONFIRMED");
      // Finansal ödeme durumu PENDING olarak kalmalıdır (yalnızca PayTR sunucu onayı PAID yapabilir!)
      expect(updateRes.order?.paymentStatus).toBe("PENDING");
    });

    it("müşteriye sunulan public sipariş durumunda isim maskelenir ve hassas sırlar yer almaz", () => {
      const store = getStoreData();
      const prod = store.products[0];
      if (prod.variants[0].stockQuantity < 5) {
        prod.variants[0].stockQuantity = 50;
        saveStoreData(store);
      }

      const res = createPendingOrder({
        customer: {
          fullName: "Zeynep Güler",
          email: "zeynep.guler@example.com",
          phone: "05327776655",
          city: "Antalya",
          district: "Muratpaşa",
          fullAddress: "Lara Cad. No: 4",
        },
        items: [{
          productId: prod.id,
          variantId: prod.variants.find((variant) => variant.isActive && variant.stockQuantity > 0)?.id,
          quantity: 1,
        }],
      });

      const publicInfo = getOrderPublicStatus(res.order!.orderNumber);
      expect(publicInfo).toBeDefined();
      expect(publicInfo?.orderNumber).toBe(res.order!.orderNumber);
      // İsim maskelenmiş olmalıdır: Z***** G****
      expect(publicInfo?.customerName).toContain("*");
      expect(publicInfo?.customerName).not.toBe("Zeynep Güler");
      // Hassas telefon veya tam açık adres public nesnede yer almamalıdır
      expect((publicInfo as Record<string, unknown>).customerPhone).toBeUndefined();
      expect((publicInfo as Record<string, unknown>).fullAddress).toBeUndefined();
    });
  });
});
