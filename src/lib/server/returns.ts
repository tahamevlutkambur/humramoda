import crypto from "crypto";
import {
  getStoreData,
  saveStoreData,
  ReturnRequest,
  ReturnItem,
  ReturnStatus,
  ReturnRestockDecision,
  ReturnRequestType,
  ExchangeDetails,
} from "./store";
import { logAdminAudit } from "./logger";
import { notifyCustomer } from "./notifications";

export type {
  ReturnStatus,
  ReturnRestockDecision,
  ReturnRequest,
  ReturnItem,
  ReturnRequestType,
  ExchangeDetails,
};

export interface CreateReturnRequestInput {
  orderNumber: string;
  customerEmail?: string;
  customerPhone?: string;
  requestType?: ReturnRequestType;
  exchangeDetails?: ExchangeDetails;
  reason: string;
  customerNotes?: string;
  items: {
    orderItemId: string;
    quantity: number;
    reason?: string;
    condition?: string;
  }[];
}

export interface CreateReturnResult {
  success: boolean;
  returnRequest?: ReturnRequest;
  error?: string;
}

/**
 * Müşteri veya yetkili tarafından bir iptal, iade veya değişim talebi oluşturur.
 * Kurallar:
 * 1. Sipariş ödenmiş olmalıdır (paymentStatus === "PAID").
 * 2. İptal edilmiş sipariş için yeni talep oluşturulamaz (operationalStatus !== "CANCELLED").
 * 3. İptal talebi (CANCEL): Kargoya verilmiş siparişler doğrudan iptal edilemez (iade/değişim yapılmalıdır).
 * 4. Talep edilen ürünler siparişte mevcut olmalı ve talep adedi sipariş/kalan adedini aşmamalıdır.
 * 5. Mükerrer talep: Aynı ürün için açıkta bekleyen talepler varsa kalan adetten fazlası talep edilemez.
 * 6. Talep edilen iade tutarı toplam sipariş tutarından daha önce iade edilmiş tutarı düşerek hesaplanan bakiyeyi aşamaz.
 */
export function createReturnRequest(input: CreateReturnRequestInput): CreateReturnResult {
  const store = getStoreData();
  const cleanOrderNo = input.orderNumber.trim().toUpperCase();

  const order = store.orders?.find(
    (o) => o.orderNumber.toUpperCase() === cleanOrderNo || o.id === input.orderNumber.trim()
  );

  if (!order) {
    return { success: false, error: "Talebe konu sipariş bulunamadı." };
  }

  // Güvenlik ve Kimlik Doğrulama: Müşteri e-postası VEYA telefonu siparişle uyuşmalıdır
  const emailMatches =
    Boolean(input.customerEmail) &&
    input.customerEmail?.trim().toLowerCase() === order.customerEmail.toLowerCase();

  const cleanInputPhone = input.customerPhone?.replace(/\D/g, "");
  const cleanOrderPhone = order.customerPhone.replace(/\D/g, "");
  const phoneMatches =
    Boolean(cleanInputPhone) &&
    (cleanInputPhone?.length || 0) >= 4 &&
    (cleanOrderPhone.endsWith(cleanInputPhone || "") || cleanInputPhone === cleanOrderPhone);

  if (!emailMatches && !phoneMatches) {
    return {
      success: false,
      error: "Sipariş ile e-posta adresi veya telefon bilgisi uyuşmuyor. Lütfen siparişi oluşturduğunuz bilgileri giriniz.",
    };
  }

  const requestType: ReturnRequestType = input.requestType || "RETURN";

  // Kural 1: Ödeme kontrolü
  if (order.paymentStatus !== "PAID") {
    return {
      success: false,
      error: "Yalnızca ödemesi tamamlanmış siparişler için talepte bulunulabilir.",
    };
  }

  // Kural 2: Operasyonel iptal kontrolü
  if (order.operationalStatus === "CANCELLED") {
    return {
      success: false,
      error: "İptal edilmiş sipariş için yeni bir talep açılamaz.",
    };
  }

  // Kural 3: İptal Talebi Uygunluğu (Kargoya verildiyse doğrudan iptal edilemez)
  if (requestType === "CANCEL") {
    const shippedStatuses = ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];
    if (order.shippingStatus && shippedStatuses.includes(order.shippingStatus)) {
      return {
        success: false,
        error: "Kargoya verilmiş olan siparişler doğrudan iptal edilemez. Siparişinizi teslim aldıktan sonra İade veya Değişim talebinde bulunabilirsiniz.",
      };
    }
  }

  if (!input.items || input.items.length === 0) {
    return { success: false, error: "Lütfen talep etmek istediğiniz en az bir ürün seçiniz." };
  }

  store.returnRequests = store.returnRequests || [];

  // Daha önce bu siparişe ait açıkta olan veya onaylanmış iadelerin toplam tutarını hesapla
  const previousRefundedOrRequested = store.returnRequests
    .filter((r) => r.orderId === order.id && r.status !== "REJECTED")
    .reduce((sum, r) => sum + (r.requestedAmount || 0), 0);

  const remainingRefundableAmount = Math.max(0, order.totalAmount - (order.refundedAmount || 0) - previousRefundedOrRequested);

  const returnItems: ReturnItem[] = [];
  let calculatedRequestedAmount = 0;

  for (const itemInput of input.items) {
    const orderItem = order.items.find((it) => it.id === itemInput.orderItemId);
    if (!orderItem) {
      return { success: false, error: `Siparişe ait ürün kaydı bulunamadı (ID: ${itemInput.orderItemId}).` };
    }

    // Mükerrer talep kontrolü: Bu kalem için açık olan taleplerdeki toplam adedi bul
    const activeItemRequestsCount = store.returnRequests
      .filter((r) => r.orderId === order.id && r.status !== "REJECTED" && r.status !== "REFUND_COMPLETED")
      .flatMap((r) => r.items)
      .filter((i) => i.orderItemId === orderItem.id)
      .reduce((sum, i) => sum + i.quantity, 0);

    const availableQuantityForReturn = orderItem.quantity - activeItemRequestsCount;

    if (itemInput.quantity <= 0 || itemInput.quantity > orderItem.quantity) {
      return {
        success: false,
        error: `${orderItem.productName} için geçersiz iade adedi. En fazla ${orderItem.quantity} adet iade edilebilir.`,
      };
    }

    if (itemInput.quantity > availableQuantityForReturn) {
      return {
        success: false,
        error: `${orderItem.productName} için talep edilebilir adet (${availableQuantityForReturn}) aşıldı. Bu ürüne ait açık bir talep bulunuyor olabilir.`,
      };
    }

    const itemTotal = Number((orderItem.unitPrice * itemInput.quantity).toFixed(2));
    calculatedRequestedAmount += itemTotal;

    returnItems.push({
      id: `ritem-${crypto.randomBytes(6).toString("hex")}`,
      orderItemId: orderItem.id,
      productId: orderItem.productId,
      productName: orderItem.productName,
      variantSku: orderItem.sku,
      colorName: orderItem.colorName,
      sizeName: orderItem.sizeName,
      quantity: itemInput.quantity,
      unitPrice: orderItem.unitPrice,
      totalPrice: itemTotal,
      reason: itemInput.reason || input.reason || `${requestType === "EXCHANGE" ? "Değişim" : requestType === "CANCEL" ? "İptal" : "İade"} Talebi`,
      condition: itemInput.condition || "Kullanılmamış / Etiketli",
    });
  }

  calculatedRequestedAmount = Number(calculatedRequestedAmount.toFixed(2));

  // Tutar aşım kontrolü: İade tutarı toplam ödenen tutarı aşamaz (İade ve İptal durumunda)
  if (requestType !== "EXCHANGE" && calculatedRequestedAmount > remainingRefundableAmount + 0.01) {
    return {
      success: false,
      error: `Talep edilen tutar (${calculatedRequestedAmount} ₺), siparişin kalan iade edilebilir maksimum tutarını (${remainingRefundableAmount.toFixed(2)} ₺) aşamaz.`,
    };
  }

  const now = new Date().toISOString();
  const returnRequestId = `ret-${crypto.randomBytes(6).toString("hex")}`;

  const returnRequest: ReturnRequest = {
    id: returnRequestId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    requestType,
    exchangeDetails: input.exchangeDetails,
    items: returnItems,
    requestedAmount: calculatedRequestedAmount,
    refundedAmount: 0,
    status: "REQUESTED",
    reason: input.reason,
    customerNotes: input.customerNotes?.trim(),
    restockDecision: "PENDING",
    isRestocked: false,
    actualRefundVerified: false,
    createdAt: now,
    updatedAt: now,
  };

  store.returnRequests.unshift(returnRequest);
  saveStoreData(store);

  logAdminAudit({
    adminId: "CUSTOMER",
    adminEmail: order.customerEmail,
    action: "RETURN_REQUEST_CREATED",
    targetType: "RETURN",
    targetId: returnRequestId,
    result: "SUCCESS",
    details: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      itemCount: returnItems.length,
      requestedAmount: calculatedRequestedAmount,
      reason: input.reason,
    },
  });

  // Müşteriye bildirim gönder (İade talebi alındı)
  notifyCustomer({
    orderId: order.id,
    orderNumber: order.orderNumber,
    recipientEmail: order.customerEmail,
    recipientPhone: order.customerPhone,
    customerName: order.customerFullName,
    eventType: "RETURN_REQUESTED",
    context: {
      requestedAmount: calculatedRequestedAmount,
      itemCount: returnItems.length,
    },
  });

  return { success: true, returnRequest };
}

export interface UpdateReturnStatusOptions {
  returnId: string;
  newStatus: ReturnStatus;
  adminNotes?: string;
  restockDecision?: ReturnRestockDecision;
  actualRefundVerified?: boolean;
  refundTransactionRef?: string;
  adminInfo?: {
    adminId?: string;
    adminEmail?: string;
    ip?: string;
  };
}

/**
 * Yönetici tarafından iade talebini inceler, onaylar, reddeder veya iade sürecini günceller.
 * Stok İadesi ve Para İadesi Ayrımı:
 * - Stok iadesi yalnızca restockDecision === "RESTOCKED" olduğunda ve atomik olarak yapılır.
 * - Para iadesi tamamlandı (REFUND_COMPLETED) yalnızca gerçek doğrulama sağlandığında işaretlenebilir.
 */
export function updateReturnRequestStatus(options: UpdateReturnStatusOptions): {
  success: boolean;
  returnRequest?: ReturnRequest;
  error?: string;
} {
  const store = getStoreData();
  store.returnRequests = store.returnRequests || [];

  const returnReq = store.returnRequests.find((r) => r.id === options.returnId);
  if (!returnReq) {
    return { success: false, error: "İade talebi bulunamadı." };
  }

  const order = store.orders?.find((o) => o.id === returnReq.orderId);
  const now = new Date().toISOString();

  // Para İadesi Güvenlik Doğrulaması:
  // Eğer yeni durum REFUND_COMPLETED seçiliyorsa gerçek doğrulama şarttır
  if (options.newStatus === "REFUND_COMPLETED") {
    if (!options.actualRefundVerified && !returnReq.actualRefundVerified) {
      return {
        success: false,
        error: "Gerçek para iadesi ödeme sağlayıcısından veya doğrulanabilir banka dekontundan teyit edilmeden durum 'Para İadesi Doğrulandı (REFUND_COMPLETED)' olarak değiştirilemez.",
      };
    }
  }

  // Stok İadesi Kuralı:
  // Ürünün yeniden satılabilir olduğu teyit edildiyse ve daha önce stoka eklenmediyse ekle
  if (options.restockDecision === "RESTOCKED" && !returnReq.isRestocked) {
    for (const rItem of returnReq.items) {
      for (const product of store.products) {
        const variant = product.variants.find(
          (v) => v.sku.toUpperCase() === rItem.variantSku.toUpperCase()
        );
        if (variant) {
          variant.stockQuantity += rItem.quantity;
          break;
        }
      }
    }
    returnReq.isRestocked = true;
    returnReq.restockDecision = "RESTOCKED";

    logAdminAudit({
      adminId: options.adminInfo?.adminId || "ADMIN",
      adminEmail: options.adminInfo?.adminEmail || "admin@humramoda.local",
      action: "RETURN_RESTOCK_PROCESSED",
      targetType: "RETURN",
      targetId: returnReq.id,
      result: "SUCCESS",
      ipAddress: options.adminInfo?.ip,
      details: {
        returnId: returnReq.id,
        items: returnReq.items.map((i) => ({ sku: i.variantSku, qty: i.quantity })),
      },
    });
  } else if (options.restockDecision && options.restockDecision !== "RESTOCKED") {
    returnReq.restockDecision = options.restockDecision;
  }

  // Gerçek Para İadesi Tamamlandığında Siparişteki Finansal Alanları Güncelle
  if (options.newStatus === "REFUND_COMPLETED") {
    returnReq.actualRefundVerified = true;
    returnReq.refundedAmount = returnReq.requestedAmount;
    returnReq.refundTransactionRef =
      options.refundTransactionRef || returnReq.refundTransactionRef || `REF_TX_${Date.now()}`;

    if (order) {
      order.refundedAmount = Number(((order.refundedAmount || 0) + returnReq.refundedAmount).toFixed(2));
      // Eğer siparişin tamamı iade edildiyse sipariş ödeme durumunu REFUNDED yap
      if (order.refundedAmount >= order.totalAmount - 0.01) {
        order.paymentStatus = "REFUNDED";
      }
      order.updatedAt = now;
    }

    logAdminAudit({
      adminId: options.adminInfo?.adminId || "ADMIN",
      adminEmail: options.adminInfo?.adminEmail || "admin@humramoda.local",
      action: "RETURN_REFUND_VERIFIED",
      targetType: "RETURN",
      targetId: returnReq.id,
      result: "SUCCESS",
      ipAddress: options.adminInfo?.ip,
      details: {
        refundedAmount: returnReq.refundedAmount,
        transactionRef: returnReq.refundTransactionRef,
        orderId: returnReq.orderId,
      },
    });

    if (order) {
      notifyCustomer({
        orderId: order.id,
        orderNumber: order.orderNumber,
        recipientEmail: order.customerEmail,
        recipientPhone: order.customerPhone,
        customerName: order.customerFullName,
        eventType: "REFUND_CONFIRMED",
        context: {
          amount: returnReq.refundedAmount,
        },
      });
    }
  }

  const previousStatus = returnReq.status;
  returnReq.status = options.newStatus;
  if (options.adminNotes !== undefined) {
    returnReq.adminNotes = options.adminNotes;
  }
  returnReq.updatedAt = now;
  returnReq.processedAt = now;

  saveStoreData(store);

  logAdminAudit({
    adminId: options.adminInfo?.adminId || "ADMIN",
    adminEmail: options.adminInfo?.adminEmail || "admin@humramoda.local",
    action: "RETURN_STATUS_UPDATED",
    targetType: "RETURN",
    targetId: returnReq.id,
    result: "SUCCESS",
    ipAddress: options.adminInfo?.ip,
    details: {
      fromStatus: previousStatus,
      toStatus: options.newStatus,
      restockDecision: returnReq.restockDecision,
      actualRefundVerified: returnReq.actualRefundVerified,
    },
  });

  // Müşteriye bildirim gönder (İade kararı: Onay veya Ret)
  if ((options.newStatus === "APPROVED" || options.newStatus === "REJECTED") && order) {
    notifyCustomer({
      orderId: order.id,
      orderNumber: order.orderNumber,
      recipientEmail: order.customerEmail,
      recipientPhone: order.customerPhone,
      customerName: order.customerFullName,
      eventType: "RETURN_DECISION",
      context: {
        decision: options.newStatus,
        notes: returnReq.adminNotes,
      },
    });
  }

  return { success: true, returnRequest: returnReq };
}

export function getAllReturnRequests(): ReturnRequest[] {
  const store = getStoreData();
  return store.returnRequests || [];
}

export function getReturnRequestById(id: string): ReturnRequest | undefined {
  const store = getStoreData();
  return store.returnRequests?.find((r) => r.id === id);
}

export function getReturnRequestsByOrderId(orderIdOrNumber: string): ReturnRequest[] {
  const store = getStoreData();
  const search = orderIdOrNumber.trim();
  return (store.returnRequests || []).filter(
    (r) => r.orderId === search || r.orderNumber === search
  );
}

export interface ReturnOrderLookupResult {
  authorized: boolean;
  error?: string;
  orderSummary?: {
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    createdAt: string;
    totalAmount: number;
    paymentStatus: string;
    operationalStatus: string;
    shippingStatus: string;
    carrierName?: string;
    trackingNumber?: string | null;
  };
  eligibleActions?: {
    canCancel: boolean;
    cancelReasonMessage?: string;
    canReturn: boolean;
    returnReasonMessage?: string;
    canExchange: boolean;
    exchangeReasonMessage?: string;
  };
  items?: {
    id: string;
    productId: string;
    productName: string;
    colorName: string;
    sizeName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    availableQuantity: number;
  }[];
  existingRequests?: {
    id: string;
    requestType?: ReturnRequestType;
    status: ReturnStatus;
    requestedAmount: number;
    createdAt: string;
    items: {
      productName: string;
      colorName?: string;
      sizeName?: string;
      quantity: number;
    }[];
  }[];
}

/**
 * Müşterinin /iade-degisim sayfasında sipariş numarası ve e-posta/telefon ile siparişini
 * doğrulamasını, kalem bazlı talep edilebilir miktarları ve uygunluk durumunu listeler.
 */
export function lookupOrderForReturns(
  orderNumber: string,
  identifier: { email?: string; phone?: string }
): ReturnOrderLookupResult {
  const store = getStoreData();
  const cleanOrderNo = orderNumber.trim().toUpperCase();

  const order = store.orders?.find(
    (o) => o.orderNumber.toUpperCase() === cleanOrderNo || o.id === orderNumber.trim()
  );

  if (!order) {
    return {
      authorized: false,
      error: "Belirtilen sipariş numarasına ait sipariş bulunamadı.",
    };
  }

  // Güvenlik ve Kimlik Doğrulama: E-posta veya Telefon eşleşmesi zorunludur (IDOR koruması)
  const emailMatches =
    Boolean(identifier.email) &&
    identifier.email?.trim().toLowerCase() === order.customerEmail.toLowerCase();

  const cleanInputPhone = identifier.phone?.replace(/\D/g, "");
  const cleanOrderPhone = order.customerPhone.replace(/\D/g, "");
  const phoneMatches =
    Boolean(cleanInputPhone) &&
    (cleanInputPhone?.length || 0) >= 4 &&
    (cleanOrderPhone.endsWith(cleanInputPhone || "") || cleanInputPhone === cleanOrderPhone);

  if (!emailMatches && !phoneMatches) {
    return {
      authorized: false,
      error: "Doğrulama başarısız. Sipariş numarası ile girilen e-posta veya telefon eşleşmiyor.",
    };
  }

  // Maskeleme
  const names = order.customerFullName.split(" ");
  const maskedName = names
    .map((n) => (n.length > 1 ? `${n[0]}${"*".repeat(n.length - 1)}` : n))
    .join(" ");

  const maskedPhone =
    cleanOrderPhone.length > 6
      ? `${cleanOrderPhone.slice(0, 4)} *** ** ${cleanOrderPhone.slice(-2)}`
      : "***";

  const emailParts = order.customerEmail.split("@");
  const maskedEmail =
    emailParts.length === 2 && emailParts[0].length > 2
      ? `${emailParts[0].slice(0, 2)}***@${emailParts[1]}`
      : "***@***";

  // Mevcut talepleri bul
  store.returnRequests = store.returnRequests || [];
  const existingRequests = store.returnRequests.filter((r) => r.orderId === order.id);

  // Kalem bazında uygun kalan adetleri hesapla
  const items = order.items.map((it) => {
    const requestedCount = existingRequests
      .filter((r) => r.status !== "REJECTED" && r.status !== "REFUND_COMPLETED")
      .flatMap((r) => r.items)
      .filter((i) => i.orderItemId === it.id)
      .reduce((sum, i) => sum + i.quantity, 0);

    const availableQuantity = Math.max(0, it.quantity - requestedCount);

    return {
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      colorName: it.colorName,
      sizeName: it.sizeName,
      sku: it.sku,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
      availableQuantity,
    };
  });

  // Eylemlerin Uygunluğu
  const isPaid = order.paymentStatus === "PAID";
  const isCancelled = order.operationalStatus === "CANCELLED";
  const isShipped = ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(
    order.shippingStatus || ""
  );

  const canCancel = isPaid && !isCancelled && !isShipped;
  let cancelReasonMessage: string | undefined;
  if (!isPaid) {
    cancelReasonMessage = "Ödemesi onaylanmamış siparişler için iptal talebi oluşturulamaz.";
  } else if (isCancelled) {
    cancelReasonMessage = "Sipariş zaten iptal edilmiştir.";
  } else if (isShipped) {
    cancelReasonMessage = "Sipariş kargoya verildiğinden doğrudan iptal edilemez. İade veya değişim yapabilirsiniz.";
  }

  const canReturn = isPaid && !isCancelled;
  let returnReasonMessage: string | undefined;
  if (!isPaid) {
    returnReasonMessage = "Yalnızca ödemesi tamamlanmış siparişlerde iade yapılabilir.";
  } else if (isCancelled) {
    returnReasonMessage = "İptal edilmiş siparişlerde iade açılamaz.";
  }

  const canExchange = isPaid && !isCancelled;
  let exchangeReasonMessage: string | undefined;
  if (!isPaid) {
    exchangeReasonMessage = "Yalnızca ödemesi tamamlanmış siparişlerde değişim yapılabilir.";
  } else if (isCancelled) {
    exchangeReasonMessage = "İptal edilmiş siparişlerde değişim açılamaz.";
  }

  return {
    authorized: true,
    orderSummary: {
      orderNumber: order.orderNumber,
      customerName: maskedName,
      customerEmail: maskedEmail,
      customerPhone: maskedPhone,
      createdAt: order.createdAt,
      totalAmount: order.totalAmount,
      paymentStatus: order.paymentStatus,
      operationalStatus: order.operationalStatus,
      shippingStatus: order.shippingStatus || "AWAITING_SHIPMENT",
      carrierName: order.carrierName,
      trackingNumber: order.trackingNumber,
    },
    eligibleActions: {
      canCancel,
      cancelReasonMessage,
      canReturn,
      returnReasonMessage,
      canExchange,
      exchangeReasonMessage,
    },
    items,
    existingRequests: existingRequests.map((r) => ({
      id: r.id,
      requestType: r.requestType || "RETURN",
      status: r.status,
      requestedAmount: r.requestedAmount,
      createdAt: r.createdAt,
      items: r.items.map((i) => ({
        productName: i.productName,
        colorName: i.colorName,
        sizeName: i.sizeName,
        quantity: i.quantity,
      })),
    })),
  };
}
