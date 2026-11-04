import { Prisma } from "@prisma/client";
import {
  OrderWriteInput,
  OrderWriteResult,
  CancelOrderResult,
  CreateOrderItemData,
} from "./types";
import { StockWriteDAO } from "./stock-write-dao";
import { IdempotencyManager } from "./idempotency";

/**
 * OrderWriteDAO
 * PostgreSQL için ACID uyumlu sipariş oluşturma, kapıda ödeme (COD)
 * ve sipariş iptali / stok iadesi işlemlerini yürüten yazma DAO'su.
 */
export class OrderWriteDAO {
  private defaultStockDao = new StockWriteDAO();

  /**
   * PENDING (ödeme bekleyen) sipariş kaydı ve kalemlerini oluşturur.
   * Fiyatlar sunucu kataloğundan doğrulanır, kampanya ve kargo tutarları hesaplanır.
   */
  public async createPendingOrder(
    tx: Prisma.TransactionClient,
    input: OrderWriteInput
  ): Promise<OrderWriteResult> {
    const { customer, items } = input;

    // 1. Müşteri doğrulaması
    if (!customer?.fullName?.trim()) {
      return { success: false, error: "Lütfen adınızı ve soyadınızı giriniz." };
    }
    if (!customer?.email?.trim() || !customer.email.includes("@")) {
      return { success: false, error: "Geçerli bir e-posta adresi giriniz." };
    }
    if (!customer?.phone?.trim() || customer.phone.trim().length < 10) {
      return { success: false, error: "Geçerli bir telefon numarası giriniz." };
    }
    if (!customer?.city?.trim()) {
      return { success: false, error: "Lütfen il seçiniz." };
    }
    if (!customer?.district?.trim()) {
      return { success: false, error: "Lütfen ilçe giriniz." };
    }
    if (!customer?.fullAddress?.trim()) {
      return { success: false, error: "Lütfen açık adresinizi giriniz." };
    }

    if (!items || items.length === 0) {
      return { success: false, error: "Sepetinizde ürün bulunamadı." };
    }

    // 2. Sunucu taraflı ürün ve fiyat doğrulaması
    const validatedItems: Array<{
      productId: string;
      variantId: string;
      productName: string;
      colorName: string;
      sizeName: string;
      sku: string;
      price: number;
      quantity: number;
      totalPrice: number;
      costPriceSnapshot: number | null;
    }> = [];

    let subtotal = 0;

    for (const it of items) {
      const qty = Number(it.quantity);
      if (!qty || qty <= 0) {
        return { success: false, error: "Geçersiz ürün adedi." };
      }

      // Ürünü veritabanından al
      const product = await tx.product.findFirst({
        where: {
          OR: [{ id: it.productId }, { slug: it.productId }],
        },
        include: {
          variants: true,
          colors: true,
          sizes: true,
        },
      });

      if (!product) {
        return {
          success: false,
          error: `Seçilen ürün katalogda bulunamadı (ID/Slug: ${it.productId}).`,
        };
      }

      // Varyantı eşleştir
      let variant = product.variants.find((v) => {
        if (it.variantId && v.id === it.variantId) return true;
        if (it.sku && v.sku.toUpperCase() === it.sku.trim().toUpperCase()) return true;
        return false;
      });

      if (!variant && (it.colorName || it.sizeName)) {
        const matches = product.variants.filter((v) => {
          if (it.colorName) {
            const col = product.colors.find((c) => c.id === v.colorId);
            if (col && col.name.toLowerCase() !== it.colorName.toLowerCase()) return false;
          }
          if (it.sizeName) {
            const sz = product.sizes.find((s) => s.id === v.sizeId);
            if (sz && sz.name.toLowerCase() !== it.sizeName.toLowerCase()) return false;
          }
          return true;
        });

        if (matches.length === 1) {
          variant = matches[0];
        } else if (matches.length > 1) {
          return {
            success: false,
            error: `"${product.title}" için seçilen renk ve bedende birden fazla varyant tanımlıdır. Lütfen kesin varyant seçiniz.`,
          };
        }
      }

      if (!variant && product.variants.length > 0) {
        variant = product.variants[0];
      }

      if (!variant) {
        return {
          success: false,
          error: `"${product.title}" için geçerli varyant bulunamadı.`,
        };
      }

      // Ön stok kontrolü
      if (variant.stockQuantity < qty) {
        return {
          success: false,
          error: `"${product.title}" (${variant.sku}) için yeterli stok bulunmuyor. Kalan stok: ${variant.stockQuantity}`,
        };
      }

      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const unitPrice =
        product.discountPrice && Number(product.discountPrice) > 0
          ? Number(product.discountPrice)
          : Number(product.basePrice);

      const itemTotal = unitPrice * qty;
      subtotal += itemTotal;

      const costPriceSnapshot =
        variant.costPrice !== null && variant.costPrice !== undefined
          ? Number(variant.costPrice)
          : product.costPrice !== null && product.costPrice !== undefined
          ? Number(product.costPrice)
          : null;

      validatedItems.push({
        productId: product.id,
        variantId: variant.id,
        productName: product.title,
        colorName: it.colorName || color?.name || "Standart",
        sizeName: it.sizeName || size?.name || "Standart",
        sku: variant.sku,
        price: unitPrice,
        quantity: qty,
        totalPrice: itemTotal,
        costPriceSnapshot,
      });
    }

    // 3. Kampanya ve İndirim Hesaplaması
    let discountAmount = 0;
    if (input.campaignCode) {
      const cleanCode = input.campaignCode.trim().toUpperCase();
      const campaign = await tx.discountCampaign.findFirst({
        where: {
          code: cleanCode,
          isActive: true,
        },
        select: {
          id: true,
          title: true,
          code: true,
          percentage: true,
          fixedAmount: true,
          minSpendAmount: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      });

      if (campaign) {
        const now = new Date();
        const isStarted = campaign.startDate <= now;
        const isNotExpired = campaign.endDate >= now;
        const minSpend = campaign.minSpendAmount ? Number(campaign.minSpendAmount) : 0;
        const meetsMinSpend = subtotal >= minSpend;

        if (isStarted && isNotExpired && meetsMinSpend && campaign.percentage) {
          discountAmount =
            Math.round(((subtotal * Number(campaign.percentage)) / 100) * 100) / 100;
        }
      }
    }

    // 4. Kargo Ücreti: Sepette ürün varsa sabit 150 TL
    const shippingAmount = validatedItems.length > 0 ? 150 : 0;
    const totalAmount = Math.max(0, subtotal - discountAmount + shippingAmount);
    const totalKurus = Math.round(totalAmount * 100);

    // 5. Benzersiz Sipariş Numarası Üretimi
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `HM-${dateStr}-${randomSuffix}`;

    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        userId: customer.userId?.trim() || null,
        customerFullName: customer.fullName.trim(),
        customerEmail: customer.email.trim().toLowerCase(),
        customerPhone: customer.phone.trim(),
        status: "PENDING",
        paymentStatus: "PENDING",
        paymentProvider: "PAYTR",
        subtotal: new Prisma.Decimal(subtotal),
        discountAmount: new Prisma.Decimal(discountAmount),
        shippingAmount: new Prisma.Decimal(shippingAmount),
        totalAmount: new Prisma.Decimal(totalAmount),
        totalKurus,
        shippingAddress: {
          city: customer.city.trim(),
          district: customer.district.trim(),
          fullAddress: customer.fullAddress.trim(),
          postalCode: customer.postalCode?.trim() || "",
        },
        customerNotes: customer.customerNotes?.trim() || null,
        stockDeducted: false,
        shippingStatus: "AWAITING_SHIPMENT",
        items: {
          create: validatedItems.map((vi) => ({
            productId: vi.productId,
            variantId: vi.variantId,
            productName: vi.productName,
            colorName: vi.colorName,
            sizeName: vi.sizeName,
            sku: vi.sku,
            price: new Prisma.Decimal(vi.price),
            quantity: vi.quantity,
            totalPrice: new Prisma.Decimal(vi.totalPrice),
            costPriceSnapshot:
              vi.costPriceSnapshot !== null ? new Prisma.Decimal(vi.costPriceSnapshot) : null,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return {
      success: true,
      order: createdOrder,
    };
  }

  /**
   * Kapıda Ödeme (COD) Siparişi oluşturur ve stokları atomik olarak kilitler/düşer.
   * İdempotency: Son 60 saniye içinde aynı müşteri ve aynı sepet ile gelen mükerrer siparişlerde
   * yeni sipariş açılmaz, mevcut sipariş döndürülür.
   */
  public async createCashOnDeliveryOrder(
    tx: Prisma.TransactionClient,
    input: OrderWriteInput,
    options?: { stockDao?: StockWriteDAO }
  ): Promise<OrderWriteResult> {
    const stockDao = options?.stockDao || this.defaultStockDao;
    const { customer, items } = input;
    const cleanEmail = customer?.email?.trim().toLowerCase() || "";
    const cleanPhone = customer?.phone ? customer.phone.replace(/\D/g, "").slice(-10) : "";

    // 1. Kalıcı Idempotency Denetimi (idempotencyKey verilmişse önceliklidir)
    if (input.idempotencyKey) {
      const idemCheck = await IdempotencyManager.checkOrLockKey(
        tx,
        input.idempotencyKey,
        "COD_CHECKOUT",
        { customer: input.customer, items: input.items, campaignCode: input.campaignCode }
      );

      if (idemCheck.exists && idemCheck.responsePayload) {
        return {
          success: true,
          order: idemCheck.responsePayload,
          idempotent: true,
        };
      }
    } else {
      // Geriye dönük uyumluluk: Son 60 saniyedeki COD siparişlerini incele
      const sixtySecondsAgo = new Date(Date.now() - 60_000);
      const recentOrders = await tx.order.findMany({
        where: {
          paymentProvider: "CASH_ON_DELIVERY",
          createdAt: { gte: sixtySecondsAgo },
          OR: [
            ...(cleanEmail ? [{ customerEmail: cleanEmail }] : []),
            ...(cleanPhone ? [{ customerPhone: { contains: cleanPhone } }] : []),
          ],
        },
        include: {
          items: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const duplicate = recentOrders.find((existing) => {
        if (existing.items.length !== items.length) return false;
        return items.every((it) =>
          existing.items.some(
            (ei) =>
              (ei.variantId === it.variantId ||
                ei.sku.toUpperCase() === (it.sku || "").toUpperCase()) &&
              ei.quantity === Number(it.quantity)
          )
        );
      });

      if (duplicate) {
        return {
          success: true,
          order: duplicate,
          idempotent: true,
        };
      }
    }

    // 2. Pending Siparişi oluştur
    const pendingResult = await this.createPendingOrder(tx, input);
    if (!pendingResult.success || !pendingResult.order) {
      return pendingResult;
    }

    const createdOrder = pendingResult.order;

    // 3. Stokları pesimistik kilitleme ile atomik düş
    const stockDeductItems = createdOrder.items.map((i: any) => ({
      variantId: i.variantId,
      quantity: i.quantity,
    }));

    await stockDao.lockAndDeductVariantStock(tx, stockDeductItems);

    // 4. Siparişi COD ve CONFIRMED olarak güncelle
    const confirmedOrder = await tx.order.update({
      where: { id: createdOrder.id },
      data: {
        paymentProvider: "CASH_ON_DELIVERY",
        paymentStatus: "PENDING",
        status: "CONFIRMED",
        confirmedAt: new Date(),
        stockDeducted: true,
      },
      include: {
        items: true,
      },
    });

    // 5. Idempotency kaydını atomik olarak yaz
    if (input.idempotencyKey) {
      const payloadHash = IdempotencyManager.computePayloadHash({
        customer: input.customer,
        items: input.items,
        campaignCode: input.campaignCode,
      });

      await IdempotencyManager.saveKey(
        tx,
        input.idempotencyKey,
        "COD_CHECKOUT",
        payloadHash,
        "COMPLETED",
        confirmedOrder,
        confirmedOrder.id
      );
    }

    return {
      success: true,
      order: confirmedOrder,
    };
  }

  /**
   * Sipariş iptali ve stok iadesi (Rollback / Cancel).
   * İdempotent: Sipariş zaten iptal edilmişse tekrar stok iadesi yapmaz.
   */
  public async cancelOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    reason?: string,
    options?: { stockDao?: StockWriteDAO }
  ): Promise<CancelOrderResult> {
    const stockDao = options?.stockDao || this.defaultStockDao;

    // 1. Siparişi bul
    const order = await tx.order.findFirst({
      where: {
        OR: [{ id: orderId }, { orderNumber: orderId }],
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      return {
        success: false,
        error: `Sipariş bulunamadı (ID/No: ${orderId}).`,
      };
    }

    // 2. İdempotency Denetimi: Zaten CANCELLED ise mükerrer iade yapma
    if (order.status === "CANCELLED") {
      return {
        success: true,
        order,
        idempotent: true,
        stockRestored: false,
      };
    }

    // 3. Stok iadesi: Eğer daha önce stok düşülmüşse geri yükle
    let stockRestored = false;
    if (order.stockDeducted && order.items.length > 0) {
      await stockDao.restoreVariantStock(
        tx,
        order.items.map((it) => ({
          variantId: it.variantId,
          quantity: it.quantity,
        }))
      );
      stockRestored = true;
    }

    // 4. Siparişi CANCELLED durumuna çek
    const updatedNotes = reason
      ? `${order.customerNotes ? order.customerNotes + " | " : ""}İptal Nedeni: ${reason}`
      : order.customerNotes;

    const cancelledOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        paymentStatus: "CANCELLED",
        cancelledAt: new Date(),
        stockDeducted: false,
        customerNotes: updatedNotes,
      },
      include: {
        items: true,
      },
    });

    return {
      success: true,
      order: cancelledOrder,
      stockRestored,
    };
  }

  public async getOrderById(
    tx: Prisma.TransactionClient,
    id: string
  ): Promise<any> {
    return await tx.order.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
      },
    });
  }

  public async getOrderByOrderNumber(
    tx: Prisma.TransactionClient,
    orderNumber: string
  ): Promise<any> {
    return await tx.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        payments: true,
      },
    });
  }
}

