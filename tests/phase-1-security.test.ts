/**
 * Hümra Moda — Faz 1: Acil Kritik Saldırı Yollarının Kapatılması (Sentetik Staging Doğrulama Testleri)
 *
 * Doğrulanan Kontroller:
 * 1. Sahte `sim_hash_` callback'i siparişi PAID yapmamalı.
 * 2. Geçerli mock HMAC callback'i beklenen siparişi yalnızca bir kez onaylamalı.
 * 3. İstemci `_snapshot` ile ürün fiyatı/stoku değiştirilememeli.
 * 4. Yetkisiz kargo etiketi isteği müşteri PII'si döndürmemeli.
 * 5. HTML özel karakterleri etikette çalıştırılabilir markup'a dönüşmemeli.
 * 6. Settings API yanıtında sır bulunmamalı ve sırlar tekrar gönderilmeden ayar güncellenebilmeli.
 * 7. Webhook secret eksikken imza kabul edilmemeli ve durum değişmemeli.
 * 8. Üretim simülasyon endpoint'i test modu açık olsa da reddedilmeli.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PRODUCTS } from "../src/lib/catalog";
import {
  getStoreData,
  saveStoreData,
  createPendingOrder,
  getOrderById,
  syncStoreSnapshot,
  getStoreSettings,
} from "../src/lib/server/store";
import {
  computePayTRCallbackHash,
  processPayTRCallback,
} from "../src/lib/server/paytr";
import { createShipment, verifyAndProcessShippingWebhook } from "../src/lib/server/shipping";
import { createSessionToken, ADMIN_COOKIE_NAME } from "../src/lib/server/auth";
import { POST as paytrCallbackPost } from "../src/app/api/payments/paytr/callback/route";
import { POST as paytrCreatePost } from "../src/app/api/payments/paytr/create/route";
import { POST as paytrSimulatePost } from "../src/app/api/payments/paytr/simulate/route";
import { GET as shippingLabelGet } from "../src/app/api/shipping/labels/[id]/route";
import { GET as adminSettingsGet, PUT as adminSettingsPut } from "../src/app/api/admin/settings/route";
import { POST as adminProductsPost } from "../src/app/api/admin/products/route";

describe("Faz 1: Acil Kritik Saldırı Yolları Sentetik Staging Kontrolleri", () => {
  const storeFilePath = path.join(process.cwd(), "data", "store.json");
  let originalStoreRaw: string | null = null;
  const origEnv = { ...process.env };

  const SYNTHETIC_MERCHANT_ID = "900100";
  const SYNTHETIC_MERCHANT_KEY = "synthetic_key_for_staging_test_1";
  const SYNTHETIC_MERCHANT_SALT = "synthetic_salt_for_staging_test1";

  beforeAll(() => {
    if (fs.existsSync(storeFilePath)) {
      originalStoreRaw = fs.readFileSync(storeFilePath, "utf-8");
    }
  });

  afterAll(() => {
    process.env = { ...origEnv };
    if (originalStoreRaw !== null) {
      fs.writeFileSync(storeFilePath, originalStoreRaw, "utf-8");
      const restored = JSON.parse(originalStoreRaw);
      saveStoreData(restored);
    }
  });

  beforeEach(() => {
    process.env.PAYTR_MERCHANT_ID = SYNTHETIC_MERCHANT_ID;
    process.env.PAYTR_MERCHANT_KEY = SYNTHETIC_MERCHANT_KEY;
    process.env.PAYTR_MERCHANT_SALT = SYNTHETIC_MERCHANT_SALT;
    process.env.PAYTR_TEST_MODE = "1";
    delete process.env.ALLOW_PAYTR_SIMULATION;
    delete process.env.SHIPPING_WEBHOOK_SECRET;

    if (originalStoreRaw !== null) {
      const cleanCopy = JSON.parse(originalStoreRaw);
      // Sentetik test katalog ve ayar verisi (gerçek sırlar içermez)
      cleanCopy.settings = {
        ...cleanCopy.settings,
        paytr: {
          merchantId: SYNTHETIC_MERCHANT_ID,
          merchantKey: SYNTHETIC_MERCHANT_KEY,
          merchantSalt: SYNTHETIC_MERCHANT_SALT,
          testMode: "1",
          debugOn: "1",
        },
      };
      if (!cleanCopy.products || cleanCopy.products.length === 0) {
        cleanCopy.products = JSON.parse(JSON.stringify(PRODUCTS));
      }
      if (cleanCopy.products?.[0]?.variants?.[0]) {
        cleanCopy.products[0].basePrice = 2000;
        cleanCopy.products[0].discountPrice = 1500;
        cleanCopy.products[0].variants[0].stockQuantity = 25;
      }
      saveStoreData(cleanCopy);
    }
  });

  it("Kontrol 1: Sahte sim_hash_ callback'i (test modu açık olsa dahi) siparişi PAID yapmamalı", async () => {
    const store = getStoreData();
    const product = store.products[0];
    const variant = product.variants[0];

    const created = createPendingOrder({
      customer: {
        fullName: "Sentetik Müşteri",
        email: "sentetik@staging.local",
        phone: "05001112233",
        city: "İstanbul",
        district: "Kadıköy",
        fullAddress: "Sentetik Test Sokak No: 1",
      },
      items: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
    });

    expect(created.success).toBe(true);
    const order = created.order!;

    // Doğrudan fonksiyon üzerinden sim_hash_ saldırısı
    const directRes = processPayTRCallback({
      merchantOid: order.orderNumber,
      status: "success",
      totalAmount: order.totalKurus,
      hash: `sim_hash_${order.orderNumber}_${Date.now()}`,
    });
    expect(directRes.ok).toBe(false);
    expect(directRes.httpStatus).toBe(400);

    // HTTP Route Handler üzerinden sim_hash_ saldırısı
    const req = new Request("http://localhost/api/payments/paytr/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_oid: order.orderNumber,
        status: "success",
        total_amount: String(order.totalKurus),
        hash: `sim_hash_${order.orderNumber}_attack`,
      }),
    });

    const httpRes = await paytrCallbackPost(req);
    expect(httpRes.status).toBe(400);
    expect(await httpRes.text()).toContain("bad hash");

    const afterOrder = getOrderById(order.orderNumber);
    expect(afterOrder?.paymentStatus).toBe("PENDING");
    expect(afterOrder?.operationalStatus).toBe("PENDING");
    expect(afterOrder?.stockDeducted).toBe(false);
  });

  it("Kontrol 2: Geçerli mock HMAC callback'i beklenen siparişi yalnızca bir kez onaylamalı (idempotent)", () => {
    const store = getStoreData();
    const product = store.products[0];
    const variant = product.variants[0];
    const initialStock = variant.stockQuantity;

    const created = createPendingOrder({
      customer: {
        fullName: "Sentetik Müşteri 2",
        email: "sentetik2@staging.local",
        phone: "05001112234",
        city: "Ankara",
        district: "Çankaya",
        fullAddress: "Sentetik Cad. No: 2",
      },
      items: [{ productId: product.id, variantId: variant.id, quantity: 2 }],
    });
    const order = created.order!;

    const validHmac = computePayTRCallbackHash({
      merchantOid: order.orderNumber,
      status: "success",
      totalAmount: order.totalKurus,
      merchantKey: SYNTHETIC_MERCHANT_KEY,
      merchantSalt: SYNTHETIC_MERCHANT_SALT,
    });

    const first = processPayTRCallback({
      merchantOid: order.orderNumber,
      status: "success",
      totalAmount: order.totalKurus,
      hash: validHmac,
    });
    expect(first.ok).toBe(true);
    expect(first.statusText).toBe("OK");
    expect(first.idempotent).toBeFalsy();

    const stockAfterFirst = getStoreData().products[0].variants[0].stockQuantity;
    expect(stockAfterFirst).toBe(initialStock - 2);

    const second = processPayTRCallback({
      merchantOid: order.orderNumber,
      status: "success",
      totalAmount: order.totalKurus,
      hash: validHmac,
    });
    expect(second.ok).toBe(true);
    expect(second.statusText).toBe("OK");
    expect(second.idempotent).toBe(true);

    const stockAfterSecond = getStoreData().products[0].variants[0].stockQuantity;
    expect(stockAfterSecond).toBe(stockAfterFirst);
  });

  it("Kontrol 3: İstemci _snapshot verisi ile ürün fiyatı veya stoku değiştirilememeli", async () => {
    const store = getStoreData();
    const product = store.products[0];
    const variant = product.variants[0];
    const truePrice = product.discountPrice ?? product.basePrice;
    const trueStock = variant.stockQuantity;

    // 3a. syncStoreSnapshot oturumsuz (allowCatalogMutation olmadan) çağrıldığında fiyatı değiştirememeli
    const maliciousProduct = {
      ...JSON.parse(JSON.stringify(product)),
      basePrice: 1,
      discountPrice: 0.01,
      variants: [{ ...variant, stockQuantity: 99999 }],
    };
    syncStoreSnapshot({
      updatedAt: Date.now() + 9999999,
      products: [maliciousProduct],
      _mergeOnly: true,
    });

    const checkStore1 = getStoreData();
    expect(checkStore1.products[0].discountPrice ?? checkStore1.products[0].basePrice).toBe(truePrice);
    expect(checkStore1.products[0].variants[0].stockQuantity).toBe(trueStock);

    // 3b. Oturumsuz POST /api/admin/products sync_snapshot isteği 401 ile reddedilmeli
    const unauthSyncReq = new Request("http://localhost/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _entity: "sync_snapshot",
        updatedAt: Date.now() + 9999999,
        products: [maliciousProduct],
      }),
    });
    const unauthSyncRes = await adminProductsPost(unauthSyncReq);
    expect(unauthSyncRes.status).toBe(401);

    // 3c. POST /api/payments/paytr/create içine gömülen _snapshot fiyatı 0.01 TL yapamamalı
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "success", token: "mock_isolated_token_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    try {
      const checkoutReq = new Request("http://localhost/api/payments/paytr/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _snapshot: {
            updatedAt: Date.now() + 9999999,
            products: [maliciousProduct],
          },
          customer: {
            fullName: "Fiyat Manipülasyon Testi",
            email: "manipulasyon@staging.local",
            phone: "05009998877",
            city: "İstanbul",
            district: "Şişli",
            fullAddress: "Test Mah. No: 9",
          },
          items: [
            {
              productId: product.id,
              variantId: variant.id,
              quantity: 1,
              price: 0.01,
              unitPrice: 0.01,
            },
          ],
        }),
      });

      const checkoutRes = await paytrCreatePost(checkoutReq);
      const checkoutData = await checkoutRes.json();

      expect(checkoutRes.status).toBe(200);
      const expectedShipping = store.settings?.shippingFee ?? 150;
      expect(checkoutData.totalAmount).toBe(truePrice + expectedShipping);
      expect(checkoutData.totalKurus).toBe(Math.round((truePrice + expectedShipping) * 100));
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("Kontrol 4 & 5: Yetkisiz kargo etiketi isteği PII döndürmemeli ve yetkili istekte HTML özel karakterleri escape edilmeli", async () => {
    const store = getStoreData();
    const product = store.products[0];
    const variant = product.variants[0];

    const xssOrderRes = createPendingOrder({
      customer: {
        fullName: `<script>alert("XSS_NAME")</script> Ayşe`,
        email: "xss@staging.local",
        phone: `05001112233"><img src=x onerror=alert(1)>`,
        city: `İstanbul<script>`,
        district: `Kadıköy" onload="alert(2)`,
        fullAddress: `<svg/onload=alert("XSS_ADDR")> Moda Cad. No: 5`,
      },
      items: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
    });

    const order = xssOrderRes.order!;
    const currentStore = getStoreData();
    const targetOrder = currentStore.orders.find((o) => o.id === order.id)!;
    targetOrder.paymentStatus = "PAID";
    targetOrder.operationalStatus = "CONFIRMED";
    saveStoreData(currentStore);

    const shipRes = createShipment({
      orderId: order.id,
      carrier: "yurtici",
      trackingNumber: `YK123"><script>alert("TRACK")</script>`,
    });
    expect(shipRes.success).toBe(true);
    const shipmentId = shipRes.shipment!.id;

    // Kontrol 4: Yetkisiz (anonim) istek 401 dönmeli ve hiçbir PII sızdırmamalı
    const anonReq = new Request(`http://localhost/api/shipping/labels/${shipmentId}`, {
      method: "GET",
    });
    const anonRes = await shippingLabelGet(anonReq, {
      params: Promise.resolve({ id: shipmentId }),
    });
    expect(anonRes.status).toBe(401);
    const anonText = await anonRes.text();
    expect(anonText).not.toContain("Moda Cad");
    expect(anonText).not.toContain("05001112233");

    // Kontrol 5: Yetkili yönetici isteğinde tüm HTML özel karakterleri güvenli şekilde escape edilmeli
    const adminToken = createSessionToken({
      userId: "admin-test-1",
      email: "admin@staging.local",
      role: "ADMIN",
      fullName: "Staging Admin",
    });
    const authedReq = new Request(`http://localhost/api/shipping/labels/${shipmentId}`, {
      method: "GET",
      headers: {
        cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
    });
    const authedRes = await shippingLabelGet(authedReq, {
      params: Promise.resolve({ id: shipmentId }),
    });
    expect(authedRes.status).toBe(200);
    const html = await authedRes.text();

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<svg/onload=");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(&quot;XSS_NAME&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;svg/onload=alert(&quot;XSS_ADDR&quot;)&gt;");
  });

  it("Kontrol 6: Settings API yanıtında sır bulunmamalı ve sırları tekrar göndermeden ayarlar güncellenebilmeli", async () => {
    const adminToken = createSessionToken({
      userId: "admin-test-1",
      email: "admin@staging.local",
      role: "ADMIN",
      fullName: "Staging Admin",
    });

    const getReq = new Request("http://localhost/api/admin/settings", {
      method: "GET",
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    const getRes = await adminSettingsGet(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();

    // Yanıtta gerçek merchantKey veya merchantSalt yer almamalı
    expect(getData.settings.paytr.merchantKey).toBe("");
    expect(getData.settings.paytr.merchantSalt).toBe("");
    expect(getData.settings.paytr.hasMerchantKey).toBe(true);
    expect(getData.settings.paytr.hasMerchantSalt).toBe(true);
    expect(JSON.stringify(getData)).not.toContain(SYNTHETIC_MERCHANT_KEY);
    expect(JSON.stringify(getData)).not.toContain(SYNTHETIC_MERCHANT_SALT);

    // Form sırları boş bırakarak (veya maskeli) kargo eşiğini güncellediğinde mevcut sırlar korunmalı
    const putReq = new Request("http://localhost/api/admin/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({
        ...getData.settings,
        freeShippingThreshold: 2500,
        paytr: {
          merchantId: SYNTHETIC_MERCHANT_ID,
          merchantKey: "",
          merchantSalt: "••••••••",
          testMode: "1",
        },
      }),
    });

    const putRes = await adminSettingsPut(putReq);
    expect(putRes.status).toBe(200);
    const putData = await putRes.json();
    expect(putData.settings.freeShippingThreshold).toBe(2500);
    expect(putData.settings.paytr.merchantKey).toBe("");
    expect(putData.settings.paytr.merchantSalt).toBe("");

    // Sunucu deposundaki gerçek sırlar silinmemiş/bozulmamış olmalı
    const rawServerSettings = getStoreSettings();
    expect(rawServerSettings.paytr?.merchantKey).toBe(SYNTHETIC_MERCHANT_KEY);
    expect(rawServerSettings.paytr?.merchantSalt).toBe(SYNTHETIC_MERCHANT_SALT);
  });

  it("Kontrol 7: SHIPPING_WEBHOOK_SECRET eksikken veya varsayılan değerdeyken imza kabul edilmemeli", () => {
    const store = getStoreData();
    const product = store.products[0];
    const variant = product.variants[0];

    const orderRes = createPendingOrder({
      customer: {
        fullName: "Kargo Webhook Test",
        email: "webhook@staging.local",
        phone: "05003334455",
        city: "İzmir",
        district: "Konak",
        fullAddress: "Kordon No: 1",
      },
      items: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
    });
    const order = orderRes.order!;
    const currentStore = getStoreData();
    const targetOrder = currentStore.orders.find((o) => o.id === order.id)!;
    targetOrder.paymentStatus = "PAID";
    targetOrder.operationalStatus = "CONFIRMED";
    saveStoreData(currentStore);

    const shipRes = createShipment({
      orderId: order.id,
      carrier: "yurtici",
    });
    const trackingNumber = shipRes.shipment!.trackingNumber;

    // Secret tanımlı değilken eski bilinen varsayılan sır ile imzalanmış saldırı
    delete process.env.SHIPPING_WEBHOOK_SECRET;
    const payload = {
      trackingNumber,
      status: "TESLİM EDİLDİ",
      description: "Sahte teslimat bildirimi",
      eventId: "FAKE_EVT_1",
    };
    const rawBody = JSON.stringify(payload);
    const forgedSigWithOldDefault = crypto
      .createHmac("sha256", "default_test_carrier_secret_2026")
      .update(rawBody, "utf-8")
      .digest("hex");

    const resMissing = verifyAndProcessShippingWebhook({
      carrier: "yurtici",
      rawBody,
      signature: forgedSigWithOldDefault,
      payload,
    });

    expect(resMissing.success).toBe(false);
    expect(getOrderById(order.id)?.shippingStatus).toBe("AWAITING_SHIPMENT");
  });

  it("Kontrol 8: Üretim simülasyon endpoint'i PAYTR_TEST_MODE=1 olsa dahi reddedilmeli", async () => {
    const store = getStoreData();
    const product = store.products[0];
    const variant = product.variants[0];

    const orderRes = createPendingOrder({
      customer: {
        fullName: "Simülasyon Test",
        email: "sim@staging.local",
        phone: "05007778899",
        city: "Bursa",
        district: "Nilüfer",
        fullAddress: "Test Sok. No: 3",
      },
      items: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
    });
    const order = orderRes.order!;

    const prevNodeEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.PAYTR_TEST_MODE = "1";
      process.env.ALLOW_PAYTR_SIMULATION = "true"; // Üretimde bu bayrak açık olsa dahi reddedilmeli!

      const reqProd = new Request("http://localhost/api/payments/paytr/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: order.orderNumber, action: "success" }),
      });

      const resProd = await paytrSimulatePost(reqProd);
      expect(resProd.status).toBe(403);
      expect(getOrderById(order.orderNumber)?.paymentStatus).toBe("PENDING");

      // Geliştirme ortamında bile ALLOW_PAYTR_SIMULATION açık değilse reddedilmeli
      (process.env as Record<string, string | undefined>).NODE_ENV = "test";
      delete process.env.ALLOW_PAYTR_SIMULATION;

      const reqTestNoFlag = new Request("http://localhost/api/payments/paytr/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: order.orderNumber, action: "success" }),
      });
      const resTestNoFlag = await paytrSimulatePost(reqTestNoFlag);
      expect(resTestNoFlag.status).toBe(403);
      expect(getOrderById(order.orderNumber)?.paymentStatus).toBe("PENDING");
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
    }
  });
});
