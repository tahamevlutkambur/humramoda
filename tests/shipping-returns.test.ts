/**
 * Hümra Moda — Faz 6: Kargo, Sipariş Takibi, İade Talepleri ve Bildirim Testleri
 *
 * Prompt 10 Kapsamındaki 15 Kritik Senaryo:
 * 1. Ödeme doğrulanmamış sipariş için kargo gönderisi oluşturulamaz.
 * 2. İptal edilmiş sipariş gönderilemez.
 * 3. Aynı sipariş için tekrarlanan gönderi oluşturma isteği mükerrer gönderi üretmez.
 * 4. Geçerli kargo webhook'u doğru durumu oluşturur.
 * 5. Geçersiz webhook reddedilir.
 * 6. Tekrarlanan webhook mükerrer hareket üretmez.
 * 7. Müşteri yalnızca kendi siparişini görebilir.
 * 8. Tahmin edilebilir veya geçersiz takip erişimi kişisel verileri açığa çıkarmaz.
 * 9. İade talebi oluşturulabilir ve yetkili tarafından işlenebilir.
 * 10. İade tutarı toplam ödenen tutarı aşamaz.
 * 11. Gerçek iade doğrulanmadan para iadesi tamamlandı görünmez.
 * 12. Bildirim hatası sipariş kaydını bozmaz.
 * 13. Aynı bildirim olayı ikinci kez gönderilmez.
 * 14. Gizli anahtarlar loglara düşmez.
 * 15. Kargo ve sipariş durumları birbirinden ayrı kalır.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PRODUCTS } from "../src/lib/catalog";
import {
  createShipment,
  updateTrackingInfo,
  addTrackingEvent,
  verifyAndProcessShippingWebhook,
  verifyCustomerTrackingAccess,
  getMaskedOrderTrackingView,
} from "../src/lib/server/shipping";
import {
  createReturnRequest,
  updateReturnRequestStatus,
} from "../src/lib/server/returns";
import {
  notifyCustomer,
} from "../src/lib/server/notifications";
import {
  getStoreData,
  saveStoreData,
  createPendingOrder,
  StoreOrder,
} from "../src/lib/server/store";
import { sanitizeLogData } from "../src/lib/server/logger";

describe("Faz 6: Kargo, Sipariş Takibi, İade Talepleri ve Bildirimler", () => {
  let paidOrder: StoreOrder;
  let unpaidOrder: StoreOrder;
  let cancelledOrder: StoreOrder;

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
    const initStore = getStoreData();
    if (!initStore.products || initStore.products.length === 0) {
      initStore.products = JSON.parse(JSON.stringify(PRODUCTS));
    }
    const v = initStore.products[0]?.variants[0];
    if (v && v.stockQuantity < 10) {
      v.stockQuantity = 50;
      saveStoreData(initStore);
    }

    // 1. Ödenmiş ve onaylı sipariş
    const resPaid = createPendingOrder({
      customer: {
        fullName: "Ayşe Yılmaz",
        email: "ayse.yilmaz@example.com",
        phone: "05321112233",
        city: "İstanbul",
        district: "Kadıköy",
        fullAddress: "Moda Caddesi No: 10 D: 4",
      },
      items: [
        {
          productId: "prod-1",
          variantId: "var-prod-1-0",
          quantity: 2,
        },
      ],
    });
    paidOrder = resPaid.order!;

    // 2. Ödenmemiş sipariş
    const resUnpaid = createPendingOrder({
      customer: {
        fullName: "Fatma Kaya",
        email: "fatma.kaya@example.com",
        phone: "05442223344",
        city: "Ankara",
        district: "Çankaya",
        fullAddress: "Tunalı Hilmi No: 20",
      },
      items: [
        {
          productId: "prod-1",
          variantId: "var-prod-1-0",
          quantity: 1,
        },
      ],
    });
    unpaidOrder = resUnpaid.order!;

    // 3. İptal edilmiş sipariş
    const resCancelled = createPendingOrder({
      customer: {
        fullName: "Merve Demir",
        email: "merve.demir@example.com",
        phone: "05553334455",
        city: "İzmir",
        district: "Konak",
        fullAddress: "Alsancak No: 5",
      },
      items: [
        {
          productId: "prod-1",
          variantId: "var-prod-1-0",
          quantity: 1,
        },
      ],
    });
    cancelledOrder = resCancelled.order!;

    // Disk deposunda sipariş durumlarını kesinleştir
    const store = getStoreData();
    const p = store.orders?.find((o) => o.id === paidOrder.id);
    if (p) {
      p.paymentStatus = "PAID";
      p.operationalStatus = "CONFIRMED";
      p.shippingStatus = "AWAITING_SHIPMENT";
      paidOrder = p;
    }

    const c = store.orders?.find((o) => o.id === cancelledOrder.id);
    if (c) {
      c.paymentStatus = "PAID";
      c.operationalStatus = "CANCELLED";
      c.shippingStatus = "AWAITING_SHIPMENT";
      cancelledOrder = c;
    }

    saveStoreData(store);
  });

  // Test 1: Ödeme doğrulanmamış sipariş için kargo gönderisi oluşturulamaz.
  it("1. Ödeme doğrulanmamış sipariş için kargo gönderisi oluşturulamaz", () => {
    const result = createShipment({
      orderId: unpaidOrder.id,
      carrier: "yurtici",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Ödeme doğrulanmadan kargo gönderisi oluşturulamaz");
  });

  // Test 2: İptal edilmiş sipariş gönderilemez.
  it("2. İptal edilmiş sipariş için kargo gönderisi oluşturulamaz", () => {
    const result = createShipment({
      orderId: cancelledOrder.id,
      carrier: "aras",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("İptal edilmiş bir sipariş için kargo gönderisi oluşturulamaz");
  });

  // Test 3: Aynı sipariş için tekrarlanan gönderi oluşturma isteği mükerrer gönderi üretmez.
  it("3. Aynı sipariş için tekrarlanan gönderi oluşturma isteği mükerrer gönderi üretmez", () => {
    const firstResult = createShipment({
      orderId: paidOrder.id,
      carrier: "mng",
    });
    expect(firstResult.success).toBe(true);
    expect(firstResult.shipment).toBeDefined();

    // İkinci istek
    const secondResult = createShipment({
      orderId: paidOrder.id,
      carrier: "mng",
    });

    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toContain("zaten aktif bir kargo gönderisi mevcut");
  });

  // Test 4: Geçerli kargo webhook'u doğru durumu oluşturur.
  it("4. Geçerli kargo webhook'u doğru durumu oluşturur", () => {
    const shipResult = createShipment({
      orderId: paidOrder.id,
      carrier: "yurtici",
    });
    const trackingNo = shipResult.shipment!.trackingNumber;

    const webhookSecret = "synthetic_test_shipping_webhook_secret_2026";
    process.env.SHIPPING_WEBHOOK_SECRET = webhookSecret;
    const payloadObj = {
      trackingNumber: trackingNo,
      status: "TESLİM EDİLDİ",
      description: "Alıcıya bizzat teslim edildi.",
      location: "Kadıköy Şubesi",
      eventId: "EVT_DELIVER_001",
    };
    const rawBody = JSON.stringify(payloadObj);
    const validSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const webhookResult = verifyAndProcessShippingWebhook({
      carrier: "yurtici",
      rawBody,
      signature: validSignature,
      payload: payloadObj,
    });

    expect(webhookResult.success).toBe(true);

    const store = getStoreData();
    const updatedOrder = store.orders?.find((o) => o.id === paidOrder.id);
    expect(updatedOrder?.shippingStatus).toBe("DELIVERED");
    expect(updatedOrder?.deliveredAt).toBeDefined();
  });

  // Test 5: Geçersiz webhook reddedilir.
  it("5. Geçersiz imzalı webhook reddedilir", () => {
    process.env.SHIPPING_WEBHOOK_SECRET = "synthetic_test_shipping_webhook_secret_2026";
    const rawBody = JSON.stringify({
      trackingNumber: "YK123456",
      status: "YOLDA",
      description: "Sahte hareket",
    });

    const result = verifyAndProcessShippingWebhook({
      carrier: "yurtici",
      rawBody,
      signature: "tamamen_gecersiz_ve_sahte_imza",
      payload: {
        trackingNumber: "YK123456",
        status: "YOLDA",
        description: "Sahte hareket",
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Geçersiz webhook imzası");
  });

  // Test 6: Tekrarlanan webhook mükerrer hareket üretmez.
  it("6. Tekrarlanan webhook mükerrer hareket üretmez (idempotent)", () => {
    const shipResult = createShipment({
      orderId: paidOrder.id,
      carrier: "aras",
    });
    const trackingNo = shipResult.shipment!.trackingNumber;

    const webhookSecret = "synthetic_test_shipping_webhook_secret_2026";
    process.env.SHIPPING_WEBHOOK_SECRET = webhookSecret;
    const payloadObj = {
      trackingNumber: trackingNo,
      status: "DAĞITIMDA",
      description: "Kurye teslimat için adrese çıktı",
      eventId: "EVT_OUT_001",
    };
    const rawBody = JSON.stringify(payloadObj);
    const validSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    // 1. Gönderim
    const firstCall = verifyAndProcessShippingWebhook({
      carrier: "aras",
      rawBody,
      signature: validSignature,
      payload: payloadObj,
    });
    expect(firstCall.success).toBe(true);

    // 2. Aynı Webhook Tekrar Geldi
    const secondCall = verifyAndProcessShippingWebhook({
      carrier: "aras",
      rawBody,
      signature: validSignature,
      payload: payloadObj,
    });
    expect(secondCall.success).toBe(true);
    expect(secondCall.idempotent).toBe(true);

    const store = getStoreData();
    const shp = store.shipments?.find((s) => s.trackingNumber === trackingNo);
    const matchingEvents = shp?.events.filter((e) => e.carrierReference === "EVT_OUT_001");
    expect(matchingEvents?.length).toBe(1); // Mükerrer kayıt üretilmemiştir
  });

  // Test 7: Müşteri yalnızca kendi siparişini görebilir.
  it("7. Müşteri yalnızca kendi siparişini görebilir", () => {
    // Doğru e-posta ile erişim: BAŞARILI
    const authAccess = verifyCustomerTrackingAccess(paidOrder.orderNumber, {
      email: "ayse.yilmaz@example.com",
    });
    expect(authAccess.authorized).toBe(true);
    expect(authAccess.order?.id).toBe(paidOrder.id);

    // Başka birinin e-postası ile erişim: YETKİSİZ
    const unauthorizedAccess = verifyCustomerTrackingAccess(paidOrder.orderNumber, {
      email: "baska.biri@example.com",
    });
    expect(unauthorizedAccess.authorized).toBe(false);
    expect(unauthorizedAccess.error).toContain("Doğrulama başarısız");
  });

  // Test 8: Tahmin edilebilir veya geçersiz takip erişimi kişisel verileri açığa çıkarmaz.
  it("8. Tahmin edilebilir veya geçersiz takip erişimi kişisel verileri açığa çıkarmaz", () => {
    // E-posta veya telefon verilmeden yalnızca sipariş no ile erişim denemesi
    const emptyCredsAccess = verifyCustomerTrackingAccess(paidOrder.orderNumber, {});
    expect(emptyCredsAccess.authorized).toBe(false);

    // Maskeleme denetimi: Tam açık adres veya tam telefon herkese açık dönülmez
    const masked = getMaskedOrderTrackingView(paidOrder);
    expect(masked.customerName).toContain("*"); // Örn: A*** Y***
    expect(masked.customerPhone).toContain("***");
    expect(masked.customerEmail).toContain("***");
    expect((masked as Record<string, unknown>).shippingAddress).toBeUndefined(); // Açık adres objesi gizlenir, sadece şehir/ilçe sunulur
    expect(masked.city).toBe("İstanbul");
    expect(masked.district).toBe("Kadıköy");
  });

  // Test 9: İade talebi oluşturulabilir ve yetkili tarafından işlenebilir.
  it("9. İade talebi oluşturulabilir ve yetkili tarafından işlenebilir", () => {
    const itemToReturn = paidOrder.items[0];

    // Müşteri iade talebi oluşturur
    const retResult = createReturnRequest({
      orderNumber: paidOrder.orderNumber,
      customerEmail: paidOrder.customerEmail,
      reason: "Beden Uymadı",
      customerNotes: "Bir beden küçüğü ile değiştirmek istiyorum.",
      items: [
        {
          orderItemId: itemToReturn.id,
          quantity: 1,
        },
      ],
    });

    expect(retResult.success).toBe(true);
    expect(retResult.returnRequest).toBeDefined();
    expect(retResult.returnRequest?.status).toBe("REQUESTED");

    // Yetkili talebi inceler ve onaylar
    const updateResult = updateReturnRequestStatus({
      returnId: retResult.returnRequest!.id,
      newStatus: "APPROVED",
      adminNotes: "İade onaylandı. Lütfen anlaşmalı Yurtiçi Kargo kodumuz ile gönderiniz.",
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.returnRequest?.status).toBe("APPROVED");
  });

  // Test 10: İade tutarı toplam ödenen tutarı aşamaz.
  it("10. İade tutarı toplam ödenen tutarı aşamaz", () => {
    const itemToReturn = paidOrder.items[0];

    const invalidResult = createReturnRequest({
      orderNumber: paidOrder.orderNumber,
      customerEmail: paidOrder.customerEmail,
      reason: "Hatalı Tutar Denemesi",
      items: [
        {
          orderItemId: itemToReturn.id,
          quantity: 999, // Sipariş adedinden fazla
        },
      ],
    });

    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toContain("geçersiz iade adedi");
  });

  // Test 11: Gerçek iade doğrulanmadan para iadesi tamamlandı görünmez.
  it("11. Gerçek iade doğrulanmadan para iadesi tamamlandı (REFUND_COMPLETED) görünmez", () => {
    const itemToReturn = paidOrder.items[0];
    const retResult = createReturnRequest({
      orderNumber: paidOrder.orderNumber,
      customerEmail: paidOrder.customerEmail,
      reason: "Vazgeçtim",
      items: [
        {
          orderItemId: itemToReturn.id,
          quantity: 1,
        },
      ],
    });

    // Doğrulama işareti olmadan tamamlandıya çekmeye çalışma
    const illegalStatusChange = updateReturnRequestStatus({
      returnId: retResult.returnRequest!.id,
      newStatus: "REFUND_COMPLETED",
      actualRefundVerified: false,
    });

    expect(illegalStatusChange.success).toBe(false);
    expect(illegalStatusChange.error).toContain("Gerçek para iadesi ödeme sağlayıcısından");

    // Doğrulama ve dekont referansı sağlandığında başarıyla tamamlanır
    const validRefund = updateReturnRequestStatus({
      returnId: retResult.returnRequest!.id,
      newStatus: "REFUND_COMPLETED",
      actualRefundVerified: true,
      refundTransactionRef: "PAYTR_TEST_REFUND_TX_9876",
    });

    expect(validRefund.success).toBe(true);
    expect(validRefund.returnRequest?.status).toBe("REFUND_COMPLETED");
    expect(validRefund.returnRequest?.actualRefundVerified).toBe(true);
  });

  // Test 12: Bildirim hatası sipariş kaydını bozmaz.
  it("12. Bildirim hatası sipariş kaydını veya kargo sürecini bozmaz", () => {
    // Geçersiz e-posta veya mock fail durumu simülasyonu
    const notifResult = notifyCustomer({
      orderId: paidOrder.id,
      orderNumber: paidOrder.orderNumber,
      recipientEmail: "invalid-email-format",
      customerName: "Test Müşteri",
      eventType: "ORDER_CREATED",
    });

    // Bildirim servisi hata fırlatarak çökmek yerine güvenli sonuç döner
    expect(notifResult).toBeDefined();
    // Sipariş kaydı bütünlüğünü korur
    expect(paidOrder.id).toBeDefined();
    expect(paidOrder.paymentStatus).toBe("PAID");
  });

  // Test 13: Aynı bildirim olayı ikinci kez gönderilmez.
  it("13. Aynı bildirim olayı mükerrer gönderilmez (idempotent notification)", () => {
    const firstSend = notifyCustomer({
      orderId: paidOrder.id,
      orderNumber: paidOrder.orderNumber,
      recipientEmail: "ayse.yilmaz@example.com",
      customerName: "Ayşe Yılmaz",
      eventType: "PAYMENT_CONFIRMED",
      idempotencySuffix: "unit-test-key",
    });
    expect(firstSend.success).toBe(true);
    expect(firstSend.status).toBe("SENT");

    // İkinci çağrı
    const secondSend = notifyCustomer({
      orderId: paidOrder.id,
      orderNumber: paidOrder.orderNumber,
      recipientEmail: "ayse.yilmaz@example.com",
      customerName: "Ayşe Yılmaz",
      eventType: "PAYMENT_CONFIRMED",
      idempotencySuffix: "unit-test-key",
    });

    expect(secondSend.idempotent).toBe(true);
    expect(secondSend.status).toBe("SKIPPED_DUPLICATE");
  });

  // Test 14: Gizli anahtarlar loglara düşmez.
  it("14. Gizli anahtarlar (API key, secret, token) denetim loglarına düşmez", () => {
    const rawSensitiveData = {
      orderId: "ord-test-1",
      apiKey: "secret_carrier_key_9999",
      shippingApiKey: "carrier_top_secret_xxx",
      merchantKey: "paytr_merchant_key_secret",
      webhookSecret: "secret_carrier_webhook_sign_key",
      customerName: "Test Kullanıcı",
    };

    const sanitized = sanitizeLogData(rawSensitiveData) as typeof rawSensitiveData;

    expect(sanitized.apiKey).toBe("[GİZLENDİ / REDACTED]");
    expect(sanitized.shippingApiKey).toBe("[GİZLENDİ / REDACTED]");
    expect(sanitized.merchantKey).toBe("[GİZLENDİ / REDACTED]");
    expect(sanitized.webhookSecret).toBe("[GİZLENDİ / REDACTED]");
    expect(sanitized.customerName).toBe("Test Kullanıcı");
  });

  // Test 15: Kargo ve sipariş durumları birbirinden ayrı kalır.
  it("15. Kargo ve sipariş durumları birbirinden ayrı ve bağımsız kalır", () => {
    // 1. Başlangıç durumu: Sipariş Onaylandı, Kargo Bekleniyor
    expect(paidOrder.operationalStatus).toBe("CONFIRMED");
    expect(paidOrder.paymentStatus).toBe("PAID");
    expect(paidOrder.shippingStatus).toBe("AWAITING_SHIPMENT");

    // 2. Kargo gönderisi oluşturuldu: shippingStatus SHIPPED olur, operationalStatus CONFIRMED kalır
    updateTrackingInfo({
      orderId: paidOrder.id,
      carrier: "hepsijet",
      trackingNumber: "HJ123456789",
      status: "SHIPPED",
    });

    const store = getStoreData();
    const updated = store.orders?.find((o) => o.id === paidOrder.id);
    expect(updated?.shippingStatus).toBe("SHIPPED");
    expect(updated?.operationalStatus).toBe("CONFIRMED"); // Operasyonel durum değişmez!

    // 3. Kargo teslim edildi: shippingStatus DELIVERED olur, operationalStatus CONFIRMED kalır
    const addRes = addTrackingEvent({
      orderIdOrTrackingNumber: paidOrder.id,
      status: "DELIVERED",
      description: "Paket müşteriye teslim edildi",
    });
    expect(addRes.success).toBe(true);

    const deliveredOrder = getStoreData().orders?.find((o) => o.id === paidOrder.id);
    expect(deliveredOrder?.shippingStatus).toBe("DELIVERED");
    expect(deliveredOrder?.operationalStatus).toBe("CONFIRMED"); // Operasyonel durum yine CONFIRMED kalır
  });
});
