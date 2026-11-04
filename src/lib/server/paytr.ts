/**
 * Hümra Moda — PayTR iFrame ve Callback Güvenlik Modülü
 *
 * Resmî PayTR Dokümantasyonu (https://dev.paytr.com/) standartlarına göre geliştirilmiştir:
 * 1. Adım: Sunucu taraflı get-token isteği ve HMAC-SHA256 imzası.
 * 2. Adım: Güvenli sunucu-sunucu callback hash doğrulaması ve idempotent sipariş güncellemesi.
 *
 * GÜVENLİK KURALLARI:
 * - Gizli anahtarlar (merchant_key, merchant_salt) asla istemciye veya loglara gönderilmez.
 * - Callback doğrulaması timing-safe karşılaştırma ile yapılır (timing attack koruması).
 * - Sipariş tutarları ve stoklar daima sunucu veritabanından kesinleştirilir.
 * - Tekrarlayan bildirimlerde (idempotency) mükerrer stok düşümü veya mükerrer gelir kaydı engellenir.
 */

import crypto from "crypto";
import {
  getStoreData,
  saveStoreData,
  StoreOrder,
} from "./store";
import { logAdminAudit } from "./logger";
import { notifyCustomer } from "./notifications";
import { createOrderTrackingToken } from "./shipping";

export interface PayTRConfig {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  testMode: string; // "1" (Test) | "0" (Canlı)
  debugOn: string;  // "1" | "0"
  appBaseUrl: string;
  isConfigured: boolean;
}

/**
 * Ortam değişkenlerinden PayTR yapılandırmasını güvenle okur.
 */
export function getPayTRConfig(): PayTRConfig {
  const store = getStoreData();
  const paytrSettings = store.settings?.paytr;

  const hasCustomCredentials = Boolean(
    paytrSettings?.merchantId &&
      paytrSettings.merchantId !== "123456" &&
      paytrSettings?.merchantKey &&
      !paytrSettings.merchantKey.includes("ornek_")
  );

  const merchantId = (
    process.env.PAYTR_MERCHANT_ID ||
    (hasCustomCredentials ? paytrSettings?.merchantId : "") ||
    "768079"
  ).trim();
  const merchantKey = (
    process.env.PAYTR_MERCHANT_KEY ||
    (hasCustomCredentials ? paytrSettings?.merchantKey : "") ||
    "D3gr1fBEUkkgjRaR"
  ).trim();
  const merchantSalt = (
    process.env.PAYTR_MERCHANT_SALT ||
    (hasCustomCredentials ? paytrSettings?.merchantSalt : "") ||
    "mzAPqkRnYqakr2Qo"
  ).trim();
  const testMode = (
    process.env.PAYTR_TEST_MODE ||
    (hasCustomCredentials ? paytrSettings?.testMode : "") ||
    "0"
  ).trim();
  const debugOn = (
    process.env.PAYTR_DEBUG_ON ||
    (hasCustomCredentials ? paytrSettings?.debugOn : "") ||
    "0"
  ).trim();
  const appBaseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://humrabutik.com"
  ).replace(/\/$/, "");

  // Örnek / şablon anahtarlar gerçek yapılandırma sayılmaz
  const isPlaceholder =
    !merchantId ||
    !merchantKey ||
    !merchantSalt ||
    merchantId === "123456" ||
    merchantKey.includes("ornek_") ||
    merchantSalt.includes("ornek_");

  return {
    merchantId,
    merchantKey,
    merchantSalt,
    testMode,
    debugOn,
    appBaseUrl,
    isConfigured: !isPlaceholder,
  };
}

/**
 * PayTR sepet formatını hazırlar (Base64 kodlanmış JSON dizisi).
 * Format: [[ "Ürün Adı", "Birim Fiyat TL", Adet ], ...]
 */
export function formatPayTRBasket(
  items: Array<{
    productName: string;
    colorName?: string;
    sizeName?: string;
    unitPrice: number;
    quantity: number;
  }>
): string {
  const basket = items.map((item) => {
    const variantDesc = [item.colorName, item.sizeName].filter(Boolean).join(" - ");
    const name = variantDesc ? `${item.productName} (${variantDesc})` : item.productName;
    return [name, Number(item.unitPrice).toFixed(2), Number(item.quantity)];
  });

  return Buffer.from(JSON.stringify(basket), "utf-8").toString("base64");
}

export interface PayTRTokenRequestParams {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  userIp: string;
  merchantOid: string;
  email: string;
  paymentAmountKurus: number; // Kuruş tamsayısı (örn: 157410)
  userBasketBase64: string;
  noInstallment?: string;     // "0" | "1"
  maxInstallment?: string;    // "0" (sınır yok) veya "2"-"12"
  currency?: string;          // "TL"
  testMode?: string;          // "1" | "0"
}

/**
 * PayTR 1. Adım: Token alma için gerekli HMAC-SHA256 hash değerini hesaplar.
 *
 * Formül:
 *   hashStr = merchant_id + user_ip + merchant_oid + email + payment_amount +
 *             user_basket + no_installment + max_installment + currency + test_mode + merchant_salt
 *   token = base64(hmac_sha256(hashStr, merchant_key))
 */
export function computePayTRTokenHash(params: PayTRTokenRequestParams): string {
  const noInstallment = params.noInstallment ?? "0";
  const maxInstallment = params.maxInstallment ?? "0";
  const currency = params.currency ?? "TL";
  const testMode = params.testMode ?? "1";

  const hashStr =
    params.merchantId +
    params.userIp +
    params.merchantOid +
    params.email +
    String(params.paymentAmountKurus) +
    params.userBasketBase64 +
    noInstallment +
    maxInstallment +
    currency +
    testMode +
    params.merchantSalt;

  return crypto
    .createHmac("sha256", params.merchantKey)
    .update(hashStr, "utf-8")
    .digest("base64");
}

export interface PayTRTokenResult {
  success: boolean;
  token?: string;
  iframeUrl?: string;
  error?: string;
  isSimulation?: boolean;
  accessToken?: string;
}

/**
 * PayTR'dan iFrame ödeme token'ı alır.
 * Eğer canlı/test PayTR anahtarları tanımlı değilse, geliştirme ortamında
 * güvenli bir simülasyon token'ı ve akışı üretir.
 */
export async function requestPayTRIFrameToken(
  order: StoreOrder,
  userIp: string
): Promise<PayTRTokenResult> {
  const config = getPayTRConfig();
  const accessToken = createOrderTrackingToken(order);

  // Test / Geliştirme Simülasyonu (Yalnızca izole simülasyon izni açıkken)
  if (!config.isConfigured) {
    if (isPayTRSimulationAllowed()) {
      const simToken = `sim_token_${order.orderNumber}_${Date.now()}`;
      return {
        success: true,
        token: simToken,
        iframeUrl: `/odeme/simulasyon?token=${simToken}&orderNumber=${encodeURIComponent(order.orderNumber)}&amount=${order.totalKurus}&accessToken=${encodeURIComponent(accessToken)}`,
        isSimulation: true,
        accessToken,
      };
    }

    return {
      success: false,
      error: "PayTR ödeme altyapısı henüz yapılandırılmamış. Lütfen ortam değişkenlerini kontrol ediniz.",
    };
  }

  const userBasketBase64 = formatPayTRBasket(order.items);
  const paymentAmountKurus = order.totalKurus;
  // PayTR merchant_oid yalnızca alfanumerik (harf ve rakam) olmalıdır; özel karakter (-, _) içeremez
  const alphanumericOid = order.orderNumber.replace(/[^a-zA-Z0-9]/g, "");
  const cleanUserIp =
    !userIp || userIp === "127.0.0.1" || userIp === "::1" ? "85.105.10.10" : userIp;

  const buildPostParams = (baseUrl: string, mode = config.testMode) => {
    const tokenHash = computePayTRTokenHash({
      merchantId: config.merchantId,
      merchantKey: config.merchantKey,
      merchantSalt: config.merchantSalt,
      userIp: cleanUserIp,
      merchantOid: alphanumericOid,
      email: order.customerEmail,
      paymentAmountKurus,
      userBasketBase64,
      noInstallment: "0",
      maxInstallment: "0",
      currency: "TL",
      testMode: mode,
    });

    return new URLSearchParams({
      merchant_id: config.merchantId,
      user_ip: cleanUserIp,
      merchant_oid: alphanumericOid,
      email: order.customerEmail,
      payment_amount: String(paymentAmountKurus),
      paytr_token: tokenHash,
      user_basket: userBasketBase64,
      debug_on: config.debugOn,
      no_installment: "0",
      max_installment: "0",
      user_name: order.customerFullName,
      user_address: `${order.shippingAddress.fullAddress} ${order.shippingAddress.district}/${order.shippingAddress.city}`,
      user_phone: order.customerPhone,
      merchant_ok_url: `${baseUrl}/odeme/basarili?orderNumber=${encodeURIComponent(order.orderNumber)}&accessToken=${encodeURIComponent(accessToken)}`,
      merchant_fail_url: `${baseUrl}/odeme/basarisiz?orderNumber=${encodeURIComponent(order.orderNumber)}`,
      timeout_limit: "30",
      currency: "TL",
      test_mode: mode,
    });
  };

  try {
    const response = await fetch("https://www.paytr.com/odeme/api/get-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: buildPostParams(config.appBaseUrl, config.testMode).toString(),
      // 15 saniye zaman aşımı
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();

    if (data.status === "success" && data.token) {
      return {
        success: true,
        token: data.token,
        iframeUrl: `https://www.paytr.com/odeme/guvenli/${data.token}`,
        accessToken,
        isSimulation: false,
      };
    }

    console.error("PayTR get-token error response:", data.reason);
    return {
      success: false,
      error: data.reason || "PayTR ödeme token'ı alınamadı.",
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "PayTR sunucusuna bağlanılamadı.";
    console.error("PayTR get-token network error:", errMsg);
    return {
      success: false,
      error: "Ödeme sağlayıcısına bağlanırken bir hata oluştu. Lütfen tekrar deneyiniz.",
    };
  }
}

export interface PayTRCallbackParams {
  merchantOid: string;
  status: "success" | "failed" | string;
  totalAmount: string | number; // Kuruş cinsinden
  hash: string;
  failedReasonCode?: string;
  failedReasonMsg?: string;
}

/**
 * PayTR 2. Adım: Callback bildirim hash değerini hesaplar.
 *
 * Formül:
 *   hashStr = merchant_oid + merchant_salt + status + total_amount
 *   hash = base64(hmac_sha256(hashStr, merchant_key))
 */
export function computePayTRCallbackHash(params: {
  merchantOid: string;
  status: string;
  totalAmount: string | number;
  merchantSalt: string;
  merchantKey: string;
}): string {
  const hashStr =
    params.merchantOid +
    params.merchantSalt +
    params.status +
    String(params.totalAmount);

  return crypto
    .createHmac("sha256", params.merchantKey)
    .update(hashStr, "utf-8")
    .digest("base64");
}

/**
 * Callback bildirim hash değerini timing-safe biçimde doğrular.
 */
export function verifyPayTRCallbackHash(
  receivedHash: string,
  params: {
    merchantOid: string;
    status: string;
    totalAmount: string | number;
    merchantSalt: string;
    merchantKey: string;
  }
): boolean {
  if (!receivedHash) return false;

  const expectedHash = computePayTRCallbackHash(params);
  const expectedBuffer = Buffer.from(expectedHash, "utf-8");
  const receivedBuffer = Buffer.from(receivedHash, "utf-8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export interface CallbackProcessResult {
  ok: boolean;
  httpStatus: number;
  statusText: string;
  idempotent?: boolean;
  order?: StoreOrder;
  error?: string;
}

/**
 * Simülasyon uç noktasının çalışmasına yalnızca üretim dışı izole ortamda
 * ve açıkça ALLOW_PAYTR_SIMULATION=true tanımlandığında izin verilir.
 * Üretimde PAYTR_TEST_MODE=1 olsa dahi simülasyon kesinlikle kapalıdır.
 */
export function isPayTRSimulationAllowed(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return process.env.ALLOW_PAYTR_SIMULATION === "true";
}

/**
 * PayTR Webhook / Callback bildirimini uçtan uca doğrular ve sipariş durumunu günceller.
 * İdempotent: Tekrarlayan bildirimlerde tekrar stok düşülmez, anında saf metin "OK" döner.
 */
export function processPayTRCallback(
  params: PayTRCallbackParams,
  clientIp = "127.0.0.1"
): CallbackProcessResult {
  const config = getPayTRConfig();

  // 1. İmza / Hash Doğrulaması (sim_hash_ öneki ile HMAC atlatması kesinlikle yasaktır)
  const isHashValid =
    !params.hash.startsWith("sim_hash_") &&
    verifyPayTRCallbackHash(params.hash, {
      merchantOid: params.merchantOid,
      status: params.status,
      totalAmount: params.totalAmount,
      merchantSalt: config.merchantSalt,
      merchantKey: config.merchantKey,
    });

  if (!isHashValid) {
    logAdminAudit({
      adminId: "system-paytr",
      adminEmail: "paytr-webhook@humramoda.com",
      action: "UNAUTHORIZED_ACCESS_ATTEMPT",
      targetType: "SECURITY",
      targetId: params.merchantOid,
      result: "FAILED",
      ipAddress: clientIp,
      details: {
        reason: "PAYTR callback geçersiz imza (bad hash)",
        merchantOid: params.merchantOid,
      },
    });

    return {
      ok: false,
      httpStatus: 400,
      statusText: "PAYTR notification failed: bad hash",
      error: "Geçersiz güvenlik imzası.",
    };
  }

  // 2. Sipariş Kontrolü (Alfanumerik merchant_oid ve tireli sipariş numarası uyumlu)
  const store = getStoreData();
  const cleanIncomingOid = params.merchantOid.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const order = store.orders?.find(
    (o) =>
      o.orderNumber === params.merchantOid ||
      o.id === params.merchantOid ||
      o.orderNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() === cleanIncomingOid
  );

  if (!order) {
    logAdminAudit({
      adminId: "system-paytr",
      adminEmail: "paytr-webhook@humramoda.com",
      action: "UNAUTHORIZED_ACCESS_ATTEMPT",
      targetType: "ORDER",
      targetId: params.merchantOid,
      result: "FAILED",
      ipAddress: clientIp,
      details: {
        reason: "PAYTR callback sipariş bulunamadı",
        merchantOid: params.merchantOid,
      },
    });

    return {
      ok: false,
      httpStatus: 400,
      statusText: "PAYTR notification failed: order not found",
      error: "Sipariş sistemde bulunamadı.",
    };
  }

  // 3. Tutar Doğrulaması
  const reportedKurus = Number(params.totalAmount);
  if (isNaN(reportedKurus) || reportedKurus !== order.totalKurus) {
    logAdminAudit({
      adminId: "system-paytr",
      adminEmail: "paytr-webhook@humramoda.com",
      action: "UNAUTHORIZED_ACCESS_ATTEMPT",
      targetType: "ORDER",
      targetId: order.orderNumber,
      result: "FAILED",
      ipAddress: clientIp,
      details: {
        reason: "PAYTR callback tutar uyuşmazlığı tespit edildi",
        expectedKurus: order.totalKurus,
        reportedKurus,
      },
    });

    return {
      ok: false,
      httpStatus: 400,
      statusText: "PAYTR notification failed: amount mismatch",
      error: "Bildirilen tutar sipariş tutarıyla eşleşmiyor.",
    };
  }

  // 4. İdempotency (Tekrarlayan Bildirim) Kontrolü
  if (order.paymentStatus === "PAID") {
    // Sipariş zaten başarıyla ödenmiş, mükerrer stok düşme veya gelir yazma
    return {
      ok: true,
      httpStatus: 200,
      statusText: "OK",
      idempotent: true,
      order,
    };
  }

  // 5. Ödeme Sonucunu İşle
  const now = new Date().toISOString();

  if (params.status === "success") {
    // BAŞARILI ÖDEME
    order.paymentStatus = "PAID";
    order.operationalStatus = "CONFIRMED";
    order.paidAt = now;
    order.confirmedAt = now;
    order.updatedAt = now;
    order.paymentProvider = "PAYTR";
    order.shippingStatus = order.shippingStatus || "AWAITING_SHIPMENT";

    // Stok Düşümü: Daha önce düşülmediyse atomik düş
    if (!order.stockDeducted) {
      for (const item of order.items) {
        for (const p of store.products) {
          const v = p.variants.find(
            (variant) =>
              variant.id === item.variantId ||
              variant.sku.toUpperCase() === item.sku.toUpperCase()
          );
          if (v) {
            v.stockQuantity = Math.max(0, v.stockQuantity - item.quantity);
            break;
          }
        }
      }
      order.stockDeducted = true;
    }

    saveStoreData(store);

    // Müşteriye ödeme onayı bildirimi gönder
    notifyCustomer({
      orderId: order.id,
      orderNumber: order.orderNumber,
      recipientEmail: order.customerEmail,
      recipientPhone: order.customerPhone,
      customerName: order.customerFullName,
      eventType: "PAYMENT_CONFIRMED",
    });

    logAdminAudit({
      adminId: "system-paytr",
      adminEmail: "paytr-webhook@humramoda.com",
      action: "ORDER_CONFIRMED",
      targetType: "ORDER",
      targetId: order.orderNumber,
      result: "SUCCESS",
      ipAddress: clientIp,
      details: {
        event: "PAYTR_PAYMENT_SUCCESS",
        totalAmount: order.totalAmount,
        totalKurus: order.totalKurus,
        itemsCount: order.items.length,
      },
    });

    return {
      ok: true,
      httpStatus: 200,
      statusText: "OK",
      order,
    };
  } else {
    // BAŞARISIZ ÖDEME
    order.paymentStatus = "FAILED";
    order.operationalStatus = "CANCELLED";
    order.cancelledAt = now;
    order.updatedAt = now;
    order.paymentFailedReason =
      params.failedReasonMsg || "Ödeme banka/kart sağlayıcısı tarafından reddedildi.";

    // Eğer daha önce stok rezerve edilmişse iade et
    if (order.stockDeducted) {
      for (const item of order.items) {
        for (const p of store.products) {
          const v = p.variants.find(
            (variant) =>
              variant.id === item.variantId ||
              variant.sku.toUpperCase() === item.sku.toUpperCase()
          );
          if (v) {
            v.stockQuantity += item.quantity;
            break;
          }
        }
      }
      order.stockDeducted = false;
    }

    saveStoreData(store);

    notifyCustomer({
      orderId: order.id,
      orderNumber: order.orderNumber,
      recipientEmail: order.customerEmail,
      recipientPhone: order.customerPhone,
      customerName: order.customerFullName,
      eventType: "ORDER_CANCELLED",
    });

    logAdminAudit({
      adminId: "system-paytr",
      adminEmail: "paytr-webhook@humramoda.com",
      action: "ORDER_CANCELLED",
      targetType: "ORDER",
      targetId: order.orderNumber,
      result: "SUCCESS",
      ipAddress: clientIp,
      details: {
        event: "PAYTR_PAYMENT_FAILED",
        reasonCode: params.failedReasonCode,
        reasonMsg: params.failedReasonMsg,
      },
    });

    return {
      ok: true,
      httpStatus: 200,
      statusText: "OK",
      order,
    };
  }
}
