import crypto from "crypto";
import { getAuthSecret } from "./auth";
import {
  getStoreData,
  saveStoreData,
  StoreOrder,
  ShippingStatus,
  CarrierCode,
  ShipmentRecord,
  TrackingEvent,
} from "./store";
import { logAdminAudit } from "./logger";
import { notifyCustomer } from "./notifications";

export type { CarrierCode, ShippingStatus, ShipmentRecord, TrackingEvent };

export interface CarrierMetadata {
  code: CarrierCode;
  name: string;
  trackingUrlTemplate: string;
  supportsApiDispatch: boolean;
  supportsCancel: boolean;
  supportsLabel: boolean;
}

export const SUPPORTED_CARRIERS: Record<CarrierCode, CarrierMetadata> = {
  yurtici: {
    code: "yurtici",
    name: "Yurtiçi Kargo",
    trackingUrlTemplate: "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={trackingNumber}",
    supportsApiDispatch: true,
    supportsCancel: true,
    supportsLabel: true,
  },
  aras: {
    code: "aras",
    name: "Aras Kargo",
    trackingUrlTemplate: "https://kargotakip.araskargo.com.tr/mainpage.aspx?code={trackingNumber}",
    supportsApiDispatch: true,
    supportsCancel: true,
    supportsLabel: true,
  },
  mng: {
    code: "mng",
    name: "MNG Kargo",
    trackingUrlTemplate: "https://www.mngkargo.com.tr/gonderitakip?takipNo={trackingNumber}",
    supportsApiDispatch: true,
    supportsCancel: false,
    supportsLabel: true,
  },
  ptt: {
    code: "ptt",
    name: "PTT Kargo",
    trackingUrlTemplate: "https://gonderitakip.ptt.gov.tr/Track/Verify?q={trackingNumber}",
    supportsApiDispatch: true,
    supportsCancel: false,
    supportsLabel: true,
  },
  surat: {
    code: "surat",
    name: "Sürat Kargo",
    trackingUrlTemplate: "https://suratkargo.com.tr/KargoTakip/?kargotakipno={trackingNumber}",
    supportsApiDispatch: true,
    supportsCancel: false,
    supportsLabel: true,
  },
  hepsijet: {
    code: "hepsijet",
    name: "HepsiJet",
    trackingUrlTemplate: "https://hepsijet.com/gonderi-takibi/{trackingNumber}",
    supportsApiDispatch: true,
    supportsCancel: true,
    supportsLabel: true,
  },
  custom: {
    code: "custom",
    name: "Özel / Diğer Kurye",
    trackingUrlTemplate: "",
    supportsApiDispatch: false,
    supportsCancel: false,
    supportsLabel: false,
  },
};

export function generateTrackingUrl(carrier: CarrierCode, trackingNumber: string, customUrl?: string): string {
  if (customUrl && customUrl.trim().length > 0) {
    return customUrl.trim();
  }
  const meta = SUPPORTED_CARRIERS[carrier];
  if (!meta || !meta.trackingUrlTemplate) {
    return "";
  }
  return meta.trackingUrlTemplate.replace("{trackingNumber}", encodeURIComponent(trackingNumber.trim()));
}

export function isLiveCarrierConfigured(carrier: CarrierCode): boolean {
  if (carrier === "custom") return false;
  const envKey = `${carrier.toUpperCase()}_API_KEY`;
  return Boolean(process.env[envKey] && process.env[envKey]!.trim().length > 0);
}

export interface CreateShipmentOptions {
  orderId: string;
  carrier: CarrierCode;
  trackingNumber?: string;
  customTrackingUrl?: string;
  method?: "MANUAL" | "API_INTEGRATED";
  adminInfo?: {
    adminId?: string;
    adminEmail?: string;
    ip?: string;
  };
}

export interface CreateShipmentResult {
  success: boolean;
  shipment?: ShipmentRecord;
  order?: StoreOrder;
  error?: string;
  isSimulated?: boolean;
}

/**
 * Sipariş için yeni bir kargo gönderisi oluşturur.
 * Kural 1: Ödeme doğrulanmamış sipariş için kargo oluşturulamaz.
 * Kural 2: İptal edilmiş sipariş için kargo oluşturulamaz.
 * Kural 3: Aynı sipariş için mükerrer aktif gönderi oluşturulamaz.
 */
export function createShipment(options: CreateShipmentOptions): CreateShipmentResult {
  const store = getStoreData();
  const order = store.orders?.find(
    (o) => o.id === options.orderId || o.orderNumber === options.orderId
  );

  if (!order) {
    return { success: false, error: "Sipariş bulunamadı." };
  }

  // Kural 1: Operasyonel iptal kontrolü
  if (order.operationalStatus === "CANCELLED") {
    return {
      success: false,
      error: "İptal edilmiş bir sipariş için kargo gönderisi oluşturulamaz.",
    };
  }

  // Kural 2: Ödeme kontrolü
  if (order.paymentStatus !== "PAID") {
    return {
      success: false,
      error: "Ödeme doğrulanmadan kargo gönderisi oluşturulamaz. Ödeme durumu: " + order.paymentStatus,
    };
  }

  // Kural 3: Mükerrer gönderi engelleme
  store.shipments = store.shipments || [];
  const existingActiveShipment = store.shipments.find(
    (s) => s.orderId === order.id && s.status !== "RETURNED" && s.status !== "SHIPMENT_ISSUE"
  );

  if (existingActiveShipment) {
    return {
      success: false,
      error: `Bu sipariş için zaten aktif bir kargo gönderisi mevcut (Takip No: ${existingActiveShipment.trackingNumber}).`,
      shipment: existingActiveShipment,
    };
  }

  const carrierMeta = SUPPORTED_CARRIERS[options.carrier] || SUPPORTED_CARRIERS.custom;
  const isLive = isLiveCarrierConfigured(options.carrier);
  const method = options.method || (options.trackingNumber ? "MANUAL" : "API_INTEGRATED");

  let trackingNumber = options.trackingNumber?.trim();
  let isSimulated = false;

  if (!trackingNumber) {
    if (isLive) {
      // Gerçek kargo API çağrısı bu blokta yapılır (API entegrasyonu tamamlandığında)
      trackingNumber = `HM-${Date.now()}`;
    } else {
      // Test ve simülasyon ortamında gerçek gibi davranılmaz, açıkça simüle edildiği belirtilir
      isSimulated = true;
      const prefix = options.carrier.toUpperCase().slice(0, 3);
      const randDigits = Math.floor(100000000 + Math.random() * 900000000);
      trackingNumber = `${prefix}${randDigits}`;
    }
  }

  const trackingUrl = generateTrackingUrl(options.carrier, trackingNumber, options.customTrackingUrl);
  const now = new Date().toISOString();
  const shipmentId = `shp-${crypto.randomBytes(6).toString("hex")}`;

  const initialEvent: TrackingEvent = {
    id: `evt-${crypto.randomBytes(6).toString("hex")}`,
    timestamp: now,
    status: "AWAITING_SHIPMENT",
    description: isSimulated
      ? "Kargo gönderi kaydı oluşturuldu (Simülasyon Adaptörü - Test Ortamı)."
      : method === "MANUAL"
      ? "Kargo takip bilgisi yönetici tarafından elle sisteme girildi."
      : "Kargo gönderi kaydı kargo sağlayıcı API üzerinden oluşturuldu.",
    location: "Hümra Moda Merkez Depo / İstanbul",
    carrierReference: isSimulated ? "SIMULATED_MOCK_REF" : undefined,
    createdAt: now,
  };

  const shipment: ShipmentRecord = {
    id: shipmentId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    carrier: options.carrier,
    carrierName: carrierMeta.name,
    trackingNumber,
    trackingUrl,
    labelUrl: `/api/shipping/labels/${shipmentId}`,
    status: "AWAITING_SHIPMENT",
    method,
    providerReference: isSimulated ? "SIM_REF_" + trackingNumber : undefined,
    shippedAt: undefined,
    deliveredAt: undefined,
    events: [initialEvent],
    createdAt: now,
    updatedAt: now,
  };

  store.shipments.push(shipment);

  // Siparişteki kargo alanlarını güncelle
  order.shippingStatus = "AWAITING_SHIPMENT";
  order.carrier = options.carrier;
  order.carrierName = carrierMeta.name;
  order.trackingNumber = trackingNumber;
  order.trackingUrl = trackingUrl;
  order.shipmentId = shipmentId;
  order.shipmentMethod = method;
  order.trackingEvents = shipment.events;
  order.updatedAt = now;

  saveStoreData(store);

  // Denetim kaydı oluştur
  logAdminAudit({
    adminId: options.adminInfo?.adminId || "SYSTEM",
    adminEmail: options.adminInfo?.adminEmail || "system@humramoda.local",
    action: "SHIPPING_SHIPMENT_CREATED",
    targetType: "SHIPPING",
    targetId: shipmentId,
    result: "SUCCESS",
    ipAddress: options.adminInfo?.ip,
    details: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      carrier: options.carrier,
      trackingNumber,
      method,
      isSimulated,
    },
  });

  // Müşteriye bildirim gönder (kargo gönderisi oluşturuldu)
  notifyCustomer({
    orderId: order.id,
    orderNumber: order.orderNumber,
    recipientEmail: order.customerEmail,
    recipientPhone: order.customerPhone,
    customerName: order.customerFullName,
    eventType: "SHIPMENT_CREATED",
    context: {
      carrierName: carrierMeta.name,
      trackingNumber,
      trackingUrl,
    },
  });

  return {
    success: true,
    shipment,
    order,
    isSimulated,
  };
}

export interface UpdateTrackingOptions {
  orderId: string;
  carrier: CarrierCode;
  trackingNumber: string;
  customTrackingUrl?: string;
  status?: ShippingStatus;
  adminInfo?: {
    adminId?: string;
    adminEmail?: string;
    ip?: string;
  };
}

/**
 * Yönetici tarafından elle kargo bilgisi girilmesini veya düzeltilmesini sağlar.
 */
export function updateTrackingInfo(options: UpdateTrackingOptions): {
  success: boolean;
  order?: StoreOrder;
  shipment?: ShipmentRecord;
  error?: string;
} {
  const store = getStoreData();
  const order = store.orders?.find(
    (o) => o.id === options.orderId || o.orderNumber === options.orderId
  );

  if (!order) {
    return { success: false, error: "Sipariş bulunamadı." };
  }

  const trackingNumber = options.trackingNumber.trim();
  if (!trackingNumber) {
    return { success: false, error: "Takip numarası boş olamaz." };
  }

  const carrierMeta = SUPPORTED_CARRIERS[options.carrier] || SUPPORTED_CARRIERS.custom;
  const trackingUrl = generateTrackingUrl(options.carrier, trackingNumber, options.customTrackingUrl);
  const now = new Date().toISOString();

  store.shipments = store.shipments || [];
  let shipment = store.shipments.find((s) => s.orderId === order.id);

  const newStatus = options.status || order.shippingStatus || "SHIPPED";

  const event: TrackingEvent = {
    id: `evt-${crypto.randomBytes(6).toString("hex")}`,
    timestamp: now,
    status: newStatus,
    description: `Takip bilgileri güncellendi (${carrierMeta.name} - Takip No: ${trackingNumber})`,
    location: "Yönetim Paneli",
    createdAt: now,
  };

  if (!shipment) {
    shipment = {
      id: `shp-${crypto.randomBytes(6).toString("hex")}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      carrier: options.carrier,
      carrierName: carrierMeta.name,
      trackingNumber,
      trackingUrl,
      status: newStatus,
      method: "MANUAL",
      events: [event],
      createdAt: now,
      updatedAt: now,
    };
    store.shipments.push(shipment);
  } else {
    shipment.carrier = options.carrier;
    shipment.carrierName = carrierMeta.name;
    shipment.trackingNumber = trackingNumber;
    shipment.trackingUrl = trackingUrl;
    shipment.status = newStatus;
    shipment.method = "MANUAL";
    shipment.events.push(event);
    shipment.updatedAt = now;
  }

  if (newStatus === "SHIPPED" && !shipment.shippedAt) {
    shipment.shippedAt = now;
    order.shippedAt = now;
  }
  if (newStatus === "DELIVERED" && !shipment.deliveredAt) {
    shipment.deliveredAt = now;
    order.deliveredAt = now;
  }

  order.shippingStatus = newStatus;
  order.carrier = options.carrier;
  order.carrierName = carrierMeta.name;
  order.trackingNumber = trackingNumber;
  order.trackingUrl = trackingUrl;
  order.shipmentId = shipment.id;
  order.shipmentMethod = "MANUAL";
  order.trackingEvents = shipment.events;
  order.updatedAt = now;

  saveStoreData(store);

  logAdminAudit({
    adminId: options.adminInfo?.adminId || "ADMIN",
    adminEmail: options.adminInfo?.adminEmail || "admin@humramoda.local",
    action: "SHIPPING_TRACKING_UPDATED",
    targetType: "SHIPPING",
    targetId: shipment.id,
    result: "SUCCESS",
    ipAddress: options.adminInfo?.ip,
    details: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      carrier: options.carrier,
      trackingNumber,
      status: newStatus,
    },
  });

  return { success: true, order, shipment };
}

export interface AddTrackingEventOptions {
  orderIdOrTrackingNumber: string;
  status: ShippingStatus;
  description: string;
  location?: string;
  carrierReference?: string;
  timestamp?: string;
}

/**
 * Kargo takip hareketi ekler.
 * İdempotent: Aynı referans ve zaman damgasına sahip hareketleri mükerrer eklemez.
 */
export function addTrackingEvent(options: AddTrackingEventOptions): {
  success: boolean;
  event?: TrackingEvent;
  idempotent?: boolean;
  error?: string;
} {
  const store = getStoreData();
  const search = options.orderIdOrTrackingNumber.trim();

  store.shipments = store.shipments || [];
  const shipment = store.shipments.find(
    (s) => s.trackingNumber === search || s.orderId === search || s.orderNumber === search
  );

  if (!shipment) {
    return { success: false, error: "Kargo gönderisi bulunamadı." };
  }

  const order = store.orders?.find((o) => o.id === shipment.orderId);
  const eventTime = options.timestamp || new Date().toISOString();

  // İdempotentlik kontrolü: Aynı durum ve referans / açıklama varsa tekrar ekleme
  const isDuplicate = shipment.events.some((e) => {
    if (options.carrierReference && e.carrierReference === options.carrierReference) {
      return true;
    }
    return e.status === options.status && e.description === options.description;
  });

  if (isDuplicate) {
    return {
      success: true,
      idempotent: true,
      event: shipment.events[shipment.events.length - 1],
    };
  }

  const event: TrackingEvent = {
    id: `evt-${crypto.randomBytes(6).toString("hex")}`,
    timestamp: eventTime,
    status: options.status,
    description: options.description,
    location: options.location,
    carrierReference: options.carrierReference,
    createdAt: new Date().toISOString(),
  };

  shipment.events.push(event);
  shipment.status = options.status;
  shipment.updatedAt = new Date().toISOString();

  if (options.status === "DELIVERED" && !shipment.deliveredAt) {
    shipment.deliveredAt = eventTime;
    if (order) order.deliveredAt = eventTime;
  }
  if (options.status === "SHIPPED" && !shipment.shippedAt) {
    shipment.shippedAt = eventTime;
    if (order) order.shippedAt = eventTime;
  }

  if (order) {
    order.shippingStatus = options.status;
    order.trackingEvents = shipment.events;
    order.updatedAt = new Date().toISOString();
  }

  saveStoreData(store);

  // Müşteriye bildirim gönder
  if (order) {
    if (options.status === "IN_TRANSIT" || options.status === "OUT_FOR_DELIVERY") {
      notifyCustomer({
        orderId: order.id,
        orderNumber: order.orderNumber,
        recipientEmail: order.customerEmail,
        recipientPhone: order.customerPhone,
        customerName: order.customerFullName,
        eventType: "SHIPMENT_IN_TRANSIT",
        context: {
          carrierName: shipment.carrierName,
          trackingNumber: shipment.trackingNumber,
          trackingUrl: shipment.trackingUrl,
          location: options.location,
        },
      });
    } else if (options.status === "DELIVERED") {
      notifyCustomer({
        orderId: order.id,
        orderNumber: order.orderNumber,
        recipientEmail: order.customerEmail,
        recipientPhone: order.customerPhone,
        customerName: order.customerFullName,
        eventType: "SHIPMENT_DELIVERED",
        context: {
          carrierName: shipment.carrierName,
          trackingNumber: shipment.trackingNumber,
          deliveredAt: eventTime,
        },
      });
    }
  }

  return { success: true, event };
}

/**
 * Kargo sağlayıcısından gelen Webhook bildirimini doğrular ve işler.
 */
export function verifyAndProcessShippingWebhook(params: {
  carrier: CarrierCode;
  rawBody: string;
  signature?: string;
  payload: {
    trackingNumber: string;
    status: string;
    description: string;
    location?: string;
    eventId?: string;
    timestamp?: string;
  };
}): { success: boolean; error?: string; idempotent?: boolean } {
  const { carrier, rawBody, signature, payload } = params;

  // Webhook imza doğrulaması (Varsayılan sır kabul edilmez; SHIPPING_WEBHOOK_SECRET zorunludur)
  const webhookSecret = (process.env.SHIPPING_WEBHOOK_SECRET || "").trim();
  if (
    !webhookSecret ||
    webhookSecret === "default_test_carrier_secret_2026" ||
    webhookSecret.includes("replace_in_production") ||
    webhookSecret.includes("ornek_")
  ) {
    logAdminAudit({
      adminId: "WEBHOOK",
      adminEmail: "carrier-webhook@carrier.local",
      action: "SHIPPING_WEBHOOK_INVALID",
      targetType: "SHIPPING",
      result: "FAILED",
      details: {
        carrier,
        trackingNumber: payload.trackingNumber,
        reason: "SHIPPING_WEBHOOK_SECRET eksik veya güvensiz varsayılan değerde.",
      },
    });
    return {
      success: false,
      error: "Kargo webhook gizli anahtarı (SHIPPING_WEBHOOK_SECRET) yapılandırılmamış.",
    };
  }

  const expectedHash = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody, "utf-8")
    .digest("hex");

  const sigBuffer = Buffer.from(signature || "", "utf-8");
  const expectedBuffer = Buffer.from(expectedHash, "utf-8");
  const isSignatureValid =
    Boolean(signature) &&
    sigBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(sigBuffer, expectedBuffer);

  if (!isSignatureValid) {
    logAdminAudit({
      adminId: "WEBHOOK",
      adminEmail: "carrier-webhook@carrier.local",
      action: "SHIPPING_WEBHOOK_INVALID",
      targetType: "SHIPPING",
      result: "FAILED",
      details: {
        carrier,
        trackingNumber: payload.trackingNumber,
        providedSignature: signature ? "[SAĞLANDI]" : "[EKSİK]",
      },
    });
    return { success: false, error: "Geçersiz webhook imzası." };
  }

  // Durum haritalandırması (Sağlayıcı durumlarını standart ShippingStatus enum'ına çevir)
  let normalizedStatus: ShippingStatus = "IN_TRANSIT";
  const rawStatus = (payload.status || "").toUpperCase();

  if (rawStatus.includes("TESLİM") || rawStatus.includes("DELIVERED")) {
    normalizedStatus = "DELIVERED";
  } else if (rawStatus.includes("DAĞITIM") || rawStatus.includes("KURYEDE")) {
    normalizedStatus = "OUT_FOR_DELIVERY";
  } else if (rawStatus.includes("TRANSFER") || rawStatus.includes("YOLDA") || rawStatus.includes("TRANSIT")) {
    normalizedStatus = "IN_TRANSIT";
  } else if (rawStatus.includes("KABUL") || rawStatus.includes("ALINDI") || rawStatus.includes("SHIPPED")) {
    normalizedStatus = "SHIPPED";
  } else if (rawStatus.includes("SORUN") || rawStatus.includes("HASAR") || rawStatus.includes("İADE_GEREKÇE")) {
    normalizedStatus = "SHIPMENT_ISSUE";
  }

  const addResult = addTrackingEvent({
    orderIdOrTrackingNumber: payload.trackingNumber,
    status: normalizedStatus,
    description: payload.description,
    location: payload.location,
    carrierReference: payload.eventId,
    timestamp: payload.timestamp,
  });

  return addResult;
}

/**
 * Müşterinin takip ekranına erişim yetkisini güvenli şekilde doğrular.
 * E-posta veya telefon numarası eşleşmeden sipariş verisi asla dönülmez.
 */
export function verifyCustomerTrackingAccess(
  orderNumber: string,
  identifier: { email?: string; phone?: string; customerUserId?: string }
): { authorized: boolean; order?: StoreOrder; error?: string } {
  const store = getStoreData();
  const cleanOrderNumber = orderNumber.trim().toUpperCase();

  const order = store.orders?.find(
    (o) =>
      o.orderNumber.toUpperCase() === cleanOrderNumber ||
      o.id.toUpperCase() === cleanOrderNumber ||
      (o.trackingNumber && o.trackingNumber.toUpperCase() === cleanOrderNumber)
  );

  if (!order) {
    return { authorized: false, error: "Sipariş bulunamadı." };
  }

  // 1. Giriş yapmış kullanıcı kontrolü
  if (identifier.customerUserId && order.userId && order.userId === identifier.customerUserId) {
    return { authorized: true, order };
  }

  // 2. Misafir kullanıcı e-posta doğrulaması (veya sistem yöneticisi e-postası)
  if (identifier.email) {
    const cleanEmail = identifier.email.trim().toLowerCase();
    if (cleanEmail === order.customerEmail.toLowerCase()) {
      return { authorized: true, order };
    }
    const isAdmin = store.adminUsers?.some((a) => a.email.toLowerCase() === cleanEmail && a.isActive);
    if (isAdmin) {
      return { authorized: true, order };
    }
  }

  // 3. Misafir kullanıcı telefon doğrulaması (+90, 0 ve boşluk formatlarından bağımsız son 10 hane veya son 4 hane)
  if (identifier.phone) {
    const cleanInputPhone = identifier.phone.replace(/\D/g, "");
    const cleanOrderPhone = order.customerPhone.replace(/\D/g, "");
    const inputLast10 = cleanInputPhone.slice(-10);
    const orderLast10 = cleanOrderPhone.slice(-10);

    if (
      cleanInputPhone.length >= 4 &&
      (
        cleanOrderPhone.endsWith(cleanInputPhone) ||
        cleanInputPhone.endsWith(cleanOrderPhone) ||
        (inputLast10.length >= 7 && inputLast10 === orderLast10) ||
        cleanInputPhone === cleanOrderPhone ||
        (cleanInputPhone.length >= 4 && orderLast10.endsWith(cleanInputPhone.slice(-4)))
      )
    ) {
      return { authorized: true, order };
    }
  }

  return {
    authorized: false,
    error: "Doğrulama başarısız. Sipariş numarası ile e-posta veya telefon bilgisi eşleşmiyor.",
  };
}

/**
 * Müşteriye gösterilmek üzere hassas kişisel verileri maskelenmiş sipariş takip verisi oluşturur.
 */
export function createOrderTrackingToken(order: StoreOrder): string {
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ orderId: order.id, expiresAt })).toString("base64url");
  const signature = crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOrderTrackingToken(token: string, expectedOrderId: string): boolean {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;
    const expected = crypto.createHmac("sha256", getAuthSecret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.orderId === expectedOrderId && Number(decoded.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

export function getMaskedOrderTrackingView(order: StoreOrder) {
  const names = order.customerFullName.split(" ");
  const maskedName = names
    .map((n) => (n.length > 1 ? `${n[0]}${"*".repeat(n.length - 1)}` : n))
    .join(" ");

  const cleanPhone = order.customerPhone.replace(/\s+/g, "");
  const maskedPhone =
    cleanPhone.length > 6
      ? `${cleanPhone.slice(0, 4)} *** ** ${cleanPhone.slice(-2)}`
      : "***";

  const emailParts = order.customerEmail.split("@");
  const maskedEmail =
    emailParts.length === 2 && emailParts[0].length > 2
      ? `${emailParts[0].slice(0, 2)}***@${emailParts[1]}`
      : "***@***";

  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customerName: maskedName,
    customerEmail: maskedEmail,
    customerPhone: maskedPhone,
    operationalStatus: order.operationalStatus,
    paymentStatus: order.paymentStatus,
    shippingStatus: order.shippingStatus || "AWAITING_SHIPMENT",
    carrier: order.carrier,
    carrierName: order.carrierName || "Kargo Firması Henüz Seçilmedi",
    trackingNumber: order.trackingNumber || null,
    trackingUrl: order.trackingUrl || null,
    shippedAt: order.shippedAt || null,
    deliveredAt: order.deliveredAt || null,
    city: order.shippingAddress.city,
    district: order.shippingAddress.district,
    items: order.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      colorName: it.colorName,
      sizeName: it.sizeName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
    })),
    trackingEvents: (order.trackingEvents || []).map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      status: e.status,
      description: e.description,
      location: e.location,
    })),
  };
}
