import { Prisma } from "@prisma/client";
import {
  CreateReturnDAOInput,
  ReturnProcessDecisionInput,
  ExchangeProcessDecisionInput,
  RefundVerificationInput,
  ReturnProcessResult,
} from "./types";
import { StockWriteDAO } from "./stock-write-dao";

/**
 * ReturnsWriteDAO
 * PostgreSQL için İptal, İade ve Değişim akışlarını
 * bağımsız stok kararları, ödeme doğrulama güvencesi ve pesimistik kilit altında yöneten DAO.
 */
export class ReturnsWriteDAO {
  private defaultStockDao = new StockWriteDAO();

  /**
   * Müşteri veya yetkili tarafından İade, İptal veya Değişim talebi oluşturur.
   */
  public async createReturnRequest(
    tx: Prisma.TransactionClient,
    input: CreateReturnDAOInput
  ): Promise<ReturnProcessResult> {
    const cleanOrderNo = input.orderNumber.trim().toUpperCase();

    // 1. Siparişi kalemleri ve mevcut iade talepleriyle bul
    const order = await tx.order.findFirst({
      where: {
        OR: [{ id: input.orderNumber.trim() }, { orderNumber: cleanOrderNo }],
      },
      include: {
        items: true,
        returnRequests: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!order) {
      return { success: false, error: "Talebe konu sipariş bulunamadı." };
    }

    // 2. Müşteri Bilgisi Doğrulaması (E-posta veya Telefon)
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
        error: "Sipariş ile e-posta adresi veya telefon bilgisi uyuşmuyor.",
      };
    }

    // 3. Sipariş Durum Kontrolleri
    if (order.paymentStatus !== "PAID") {
      return {
        success: false,
        error: "Yalnızca ödemesi tamamlanmış siparişler için talepte bulunulabilir.",
      };
    }

    if (order.status === "CANCELLED") {
      return {
        success: false,
        error: "İptal edilmiş sipariş için yeni bir talep açılamaz.",
      };
    }

    const requestType = input.requestType || "RETURN";
    if (requestType === "CANCEL") {
      const shippedStatuses = ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];
      if (order.shippingStatus && shippedStatuses.includes(order.shippingStatus)) {
        return {
          success: false,
          error: "Kargoya verilmiş siparişler doğrudan iptal edilemez. İade veya değişim talebi oluşturulmalıdır.",
        };
      }
    }

    if (!input.items || input.items.length === 0) {
      return { success: false, error: "Lütfen talep etmek istediğiniz en az bir ürün seçiniz." };
    }

    // 4. Kalem Denetimleri ve Tutar Hesaplaması
    const validatedItems: Array<{
      orderItemId: string;
      productId: string;
      productName: string;
      variantSku: string;
      colorName: string | null;
      sizeName: string | null;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      reason: string;
      condition: string | null;
    }> = [];

    let calculatedRequestedAmount = 0;

    for (const itemInput of input.items) {
      const orderItem = order.items.find((it) => it.id === itemInput.orderItemId);
      if (!orderItem) {
        return {
          success: false,
          error: `Siparişe ait ürün kalemi bulunamadı (ID: ${itemInput.orderItemId}).`,
        };
      }

      // Bu kalem için açık olan önceki taleplerdeki toplam miktarı bul
      const activeRequestedQty = order.returnRequests
        .filter((r) => r.status !== "REJECTED" && r.status !== "REFUND_COMPLETED")
        .flatMap((r) => r.items)
        .filter((i) => i.orderItemId === orderItem.id)
        .reduce((sum, i) => sum + i.quantity, 0);

      const availableQty = orderItem.quantity - activeRequestedQty;

      if (itemInput.quantity <= 0 || itemInput.quantity > orderItem.quantity) {
        return {
          success: false,
          error: `${orderItem.productName} için geçersiz adet (${itemInput.quantity}).`,
        };
      }

      if (itemInput.quantity > availableQty) {
        return {
          success: false,
          error: `${orderItem.productName} için talep edilebilir adet (${availableQty}) aşıldı.`,
        };
      }

      const itemTotal = Number((Number(orderItem.price) * itemInput.quantity).toFixed(2));
      calculatedRequestedAmount += itemTotal;

      validatedItems.push({
        orderItemId: orderItem.id,
        productId: orderItem.productId,
        productName: orderItem.productName,
        variantSku: orderItem.sku,
        colorName: orderItem.colorName || null,
        sizeName: orderItem.sizeName || null,
        quantity: itemInput.quantity,
        unitPrice: Number(orderItem.price),
        totalPrice: itemTotal,
        reason: itemInput.reason || input.reason,
        condition: itemInput.condition || "Kullanılmamış / Etiketli",
      });
    }

    // 5. İade Edilebilir Maksimum Bakiye Denetimi
    const previousActiveAmount = order.returnRequests
      .filter((r) => r.status !== "REJECTED")
      .reduce((sum, r) => sum + Number(r.requestedAmount), 0);

    const remainingRefundable = Math.max(
      0,
      Number(order.totalAmount) - Number(order.refundedAmount) - previousActiveAmount
    );

    if (requestType !== "EXCHANGE" && calculatedRequestedAmount > remainingRefundable + 0.01) {
      return {
        success: false,
        error: `Talep edilen tutar (${calculatedRequestedAmount} ₺), siparişin kalan iade edilebilir maksimum tutarını (${remainingRefundable.toFixed(2)} ₺) aşamaz.`,
      };
    }

    // 6. ReturnRequest ve ReturnItem Kayıtlarını Oluştur
    const returnRequest = await tx.returnRequest.create({
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        requestType,
        exchangeDetails: input.exchangeDetails ? input.exchangeDetails : Prisma.DbNull,
        requestedAmount: new Prisma.Decimal(calculatedRequestedAmount),
        refundedAmount: new Prisma.Decimal(0),
        reason: input.reason,
        customerNotes: input.customerNotes?.trim() || null,
        status: "REQUESTED",
        restockDecision: "PENDING",
        isRestocked: false,
        actualRefundVerified: false,
        items: {
          create: validatedItems.map((vi) => ({
            orderItemId: vi.orderItemId,
            productId: vi.productId,
            productName: vi.productName,
            variantSku: vi.variantSku,
            colorName: vi.colorName,
            sizeName: vi.sizeName,
            quantity: vi.quantity,
            unitPrice: new Prisma.Decimal(vi.unitPrice),
            totalPrice: new Prisma.Decimal(vi.totalPrice),
            reason: vi.reason,
            condition: vi.condition,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return {
      success: true,
      returnRequest,
    };
  }

  /**
   * İade talebi kararı (Onay / Ret / Yeniden Stoğa Alma Ayrımı).
   * İdempotent: İki kez onay verilse bile stok asla ikinci kez artırılmaz.
   */
  public async processReturnDecision(
    tx: Prisma.TransactionClient,
    input: ReturnProcessDecisionInput,
    helpers?: { stockDao?: StockWriteDAO }
  ): Promise<ReturnProcessResult> {
    const stockDao = helpers?.stockDao || this.defaultStockDao;

    const returnRequest = await tx.returnRequest.findUnique({
      where: { id: input.returnId },
      include: {
        items: true,
        order: true,
      },
    });

    if (!returnRequest) {
      return { success: false, error: "İade talebi bulunamadı." };
    }

    // İdempotency Denetimi: Daha önce onaylanmışsa mükerrer stok iadesi yapma
    if (returnRequest.status === "APPROVED" && input.decision === "APPROVED") {
      return {
        success: true,
        returnRequest,
        idempotent: true,
        stockRestored: false,
      };
    }

    const now = new Date();

    if (input.decision === "APPROVED") {
      let stockRestored = false;

      // Stok İadesi Kuralı: Yalnızca RESTOCKED kararı verildiğinde ve daha önce yapılmamışsa
      if (input.restockDecision === "RESTOCKED" && !returnRequest.isRestocked) {
        const stockItems: Array<{ variantId: string; quantity: number }> = [];

        for (const rItem of returnRequest.items) {
          const variant = await tx.productVariant.findUnique({
            where: { sku: rItem.variantSku },
            select: { id: true },
          });
          if (variant) {
            stockItems.push({ variantId: variant.id, quantity: rItem.quantity });
          }
        }

        if (stockItems.length > 0) {
          await stockDao.restoreVariantStock(tx, stockItems);
          stockRestored = true;
        }
      }

      const updated = await tx.returnRequest.update({
        where: { id: returnRequest.id },
        data: {
          status: "APPROVED",
          restockDecision: input.restockDecision,
          isRestocked: stockRestored || returnRequest.isRestocked,
          adminNotes: input.adminNotes || returnRequest.adminNotes,
          processedAt: now,
        },
        include: {
          items: true,
        },
      });

      return {
        success: true,
        returnRequest: updated,
        stockRestored,
      };
    } else {
      // REDDEDİLDİ: Stok asla değişmez
      const updated = await tx.returnRequest.update({
        where: { id: returnRequest.id },
        data: {
          status: "REJECTED",
          restockDecision: "REJECTED",
          isRestocked: false,
          adminNotes: input.adminNotes || returnRequest.adminNotes,
          processedAt: now,
        },
        include: {
          items: true,
        },
      });

      return {
        success: true,
        returnRequest: updated,
        stockRestored: false,
      };
    }
  }

  /**
   * Değişim (EXCHANGE) Onayı:
   * Yeni ürünün stoku pesimistik kilit altında kontrol edilir.
   * Yetersizse onaylanamaz; yeterliyse yeni ürünün stoku düşülür, eski ürünün stoku iade edilir.
   */
  public async processExchangeDecision(
    tx: Prisma.TransactionClient,
    input: ExchangeProcessDecisionInput,
    helpers?: { stockDao?: StockWriteDAO }
  ): Promise<ReturnProcessResult> {
    const stockDao = helpers?.stockDao || this.defaultStockDao;

    const returnRequest = await tx.returnRequest.findUnique({
      where: { id: input.returnId },
      include: {
        items: true,
        order: true,
      },
    });

    if (!returnRequest) {
      return { success: false, error: "Değişim talebi bulunamadı." };
    }

    if (input.decision !== "APPROVED") {
      const updated = await tx.returnRequest.update({
        where: { id: returnRequest.id },
        data: {
          status: "REJECTED",
          restockDecision: "REJECTED",
          adminNotes: input.adminNotes || returnRequest.adminNotes,
        },
        include: { items: true },
      });
      return { success: true, returnRequest: updated };
    }

    // 1. Yeni ürünün stok durumunu pesimistik kilitlemeyle denetle
    const targetVariant = await tx.productVariant.findUnique({
      where: { id: input.targetVariantId },
      select: { id: true, sku: true, stockQuantity: true },
    });

    if (!targetVariant) {
      return { success: false, error: "Değişim için seçilen yeni ürün varyantı bulunamadı." };
    }

    if (targetVariant.stockQuantity < input.targetQuantity) {
      return {
        success: false,
        error: `DEĞİŞİM_STOK_YETERSİZ: Değişim için talep edilen varyantta (${targetVariant.sku}) yeterli stok bulunmuyor. Mevcut stok: ${targetVariant.stockQuantity}, Talep: ${input.targetQuantity}.`,
      };
    }

    // 2. Yeni ürünün stokunu düş
    await stockDao.lockAndDeductVariantStock(tx, [
      { variantId: input.targetVariantId, quantity: input.targetQuantity },
    ]);

    // 3. Eski ürünün stokunu geri iade et
    const returnedItems: Array<{ variantId: string; quantity: number }> = [];
    for (const rItem of returnRequest.items) {
      const v = await tx.productVariant.findUnique({
        where: { sku: rItem.variantSku },
        select: { id: true },
      });
      if (v) {
        returnedItems.push({ variantId: v.id, quantity: rItem.quantity });
      }
    }

    if (returnedItems.length > 0) {
      await stockDao.restoreVariantStock(tx, returnedItems);
    }

    // 4. Talebi onayla
    const updated = await tx.returnRequest.update({
      where: { id: returnRequest.id },
      data: {
        status: "APPROVED",
        restockDecision: "RESTOCKED",
        isRestocked: true,
        adminNotes: input.adminNotes || returnRequest.adminNotes,
        exchangeDetails: {
          targetVariantId: input.targetVariantId,
          targetQuantity: input.targetQuantity,
          processedAt: new Date().toISOString(),
        },
      },
      include: { items: true },
    });

    return {
      success: true,
      returnRequest: updated,
      stockRestored: true,
    };
  }

  /**
   * Gerçek Para İadesi (REFUND_COMPLETED) Doğrulaması.
   * Stoktan tamamen bağımsız finansal mutabakat adımıdır.
   */
  public async processRefundVerification(
    tx: Prisma.TransactionClient,
    input: RefundVerificationInput
  ): Promise<ReturnProcessResult> {
    const returnRequest = await tx.returnRequest.findUnique({
      where: { id: input.returnId },
      include: { order: true, items: true },
    });

    if (!returnRequest) {
      return { success: false, error: "İade talebi bulunamadı." };
    }

    if (!input.actualRefundVerified || !input.refundTransactionRef?.trim()) {
      return {
        success: false,
        error: "Gerçek para iadesi referans kodu veya banka doğrulaması olmadan durum 'REFUND_COMPLETED' yapılamaz.",
      };
    }

    const refundAmount = input.refundedAmount || Number(returnRequest.requestedAmount);
    const now = new Date();

    const updated = await tx.returnRequest.update({
      where: { id: returnRequest.id },
      data: {
        status: "REFUND_COMPLETED",
        actualRefundVerified: true,
        refundTransactionRef: input.refundTransactionRef.trim(),
        refundedAmount: new Prisma.Decimal(refundAmount),
        updatedAt: now,
      },
      include: { items: true },
    });

    // Siparişin toplam iade tutarını güncelle
    const order = returnRequest.order;
    const newOrderRefunded = Number(order.refundedAmount) + refundAmount;
    const isFullyRefunded = newOrderRefunded >= Number(order.totalAmount) - 0.01;

    await tx.order.update({
      where: { id: order.id },
      data: {
        refundedAmount: new Prisma.Decimal(newOrderRefunded),
        paymentStatus: isFullyRefunded ? "REFUNDED" : order.paymentStatus,
        updatedAt: now,
      },
    });

    return {
      success: true,
      returnRequest: updated,
    };
  }
}

