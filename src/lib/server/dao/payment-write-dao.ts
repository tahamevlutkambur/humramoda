import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { PaymentRecordInput, PaymentProcessResult } from "./types";
import { StockWriteDAO } from "./stock-write-dao";

/**
 * PayTR Callback bildirim hash değerini hesaplar.
 * Resmi PayTR Protokolü:
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

/**
 * PaymentWriteDAO
 * PostgreSQL için PayTR ödeme hareketleri (PaymentTransaction) kaydı,
 * callback işleme, tutar doğrulama ve ödeme idempotency yönetim DAO'su.
 */
export class PaymentWriteDAO {
  private defaultStockDao = new StockWriteDAO();

  /**
   * PayTR Callback bildirimini HMAC imzası, tutar denetimi ve idempotency ile
   * uçtan uca doğrular ve veritabanı transaction'ında işler.
   */
  public async verifyAndProcessCallback(
    tx: Prisma.TransactionClient,
    params: {
      merchantOid: string;
      status: string;
      totalAmount: string | number;
      hash: string;
      merchantKey: string;
      merchantSalt: string;
      failedReasonMsg?: string;
      callbackPayload?: any;
    },
    options?: { stockDao?: StockWriteDAO }
  ): Promise<PaymentProcessResult> {
    const isHashValid = verifyPayTRCallbackHash(params.hash, {
      merchantOid: params.merchantOid,
      status: params.status,
      totalAmount: params.totalAmount,
      merchantSalt: params.merchantSalt,
      merchantKey: params.merchantKey,
    });

    if (!isHashValid) {
      return {
        ok: false,
        error: "PAYTR_BAD_HASH: Geçersiz güvenlik imzası.",
      };
    }

    const amountKurus = Number(params.totalAmount);
    if (isNaN(amountKurus) || amountKurus <= 0) {
      return {
        ok: false,
        error: "PAYTR_INVALID_AMOUNT: Geçersiz ödeme tutarı.",
      };
    }

    return await this.processPaymentConfirmation(
      tx,
      {
        merchantOid: params.merchantOid,
        status: params.status,
        amountKurus,
        failedReason: params.failedReasonMsg,
        callbackPayload: params.callbackPayload,
      },
      options
    );
  }

  /**
   * PayTR ödeme başlatma adımında PaymentTransaction kaydı açar veya günceller.
   */
  public async recordPaymentTransaction(
    tx: Prisma.TransactionClient,
    input: PaymentRecordInput
  ): Promise<any> {
    return await tx.paymentTransaction.upsert({
      where: { merchantOid: input.merchantOid },
      create: {
        orderId: input.orderId,
        merchantOid: input.merchantOid,
        paymentProvider: input.paymentProvider || "PAYTR",
        status: "INITIALIZED",
        amountKurus: input.amountKurus,
        testMode: input.testMode ?? true,
        clientIp: input.clientIp || null,
        paytrToken: input.paytrToken || null,
        paytrHash: input.paytrHash || null,
        callbackPayload: input.callbackPayload || Prisma.DbNull,
      },
      update: {
        amountKurus: input.amountKurus,
        clientIp: input.clientIp || undefined,
        paytrToken: input.paytrToken || undefined,
        paytrHash: input.paytrHash || undefined,
      },
    });
  }

  /**
   * PayTR Callback bildirimini işler:
   * 1. Tutar uyuşmazlığını denetler.
   * 2. İdempotency: Daha önce PAID olmuş siparişlerde mükerrer stok düşümünü önler.
   * 3. Başarılı ise stokları atomik olarak kilitler ve düşer, siparişi PAID ve CONFIRMED yapar.
   */
  public async processPaymentConfirmation(
    tx: Prisma.TransactionClient,
    params: {
      merchantOid: string;
      status: "success" | "failed" | string;
      amountKurus: number;
      failedReason?: string;
      callbackPayload?: any;
    },
    options?: { stockDao?: StockWriteDAO }
  ): Promise<PaymentProcessResult> {
    const stockDao = options?.stockDao || this.defaultStockDao;

    // 1. Ödeme kaydını ve siparişi tespit et
    let paymentTx = await tx.paymentTransaction.findUnique({
      where: { merchantOid: params.merchantOid },
      include: {
        order: {
          include: { items: true },
        },
      },
    });

    let order = paymentTx?.order ?? null;

    if (!order) {
      // 1. Doğrudan eşleşme
      order = await tx.order.findFirst({
        where: {
          OR: [
            { orderNumber: params.merchantOid },
            { id: params.merchantOid },
          ],
        },
        include: { items: true },
      });

      // 2. Alfanumerik eşleşme (PayTR standartı: özel karakterler kaldırılmış oid)
      if (!order) {
        const cleanOid = params.merchantOid.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        const matched = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Order"
          WHERE UPPER(REPLACE("orderNumber", '-', '')) = ${cleanOid}
          LIMIT 1;
        `;
        if (matched.length > 0) {
          order = await tx.order.findUnique({
            where: { id: matched[0].id },
            include: { items: true },
          });
        }
      }
    }

    if (!order) {
      return {
        ok: false,
        error: `Sipariş sistemde bulunamadı (merchantOid: ${params.merchantOid}).`,
      };
    }

    // 2. Tutar Doğrulaması
    if (params.amountKurus !== order.totalKurus) {
      if (paymentTx) {
        await tx.paymentTransaction.update({
          where: { id: paymentTx.id },
          data: {
            status: "FAILED",
            failedReason: `Tutar uyuşmazlığı: Beklenen=${order.totalKurus}, Gelen=${params.amountKurus}`,
          },
        });
      }
      return {
        ok: false,
        error: `Tutar uyuşmazlığı tespit edildi. Beklenen: ${order.totalKurus}, Bildirilen: ${params.amountKurus}`,
      };
    }

    // 3. İdempotency Denetimi: Daha önce onaylanmış sipariş
    if (order.paymentStatus === "PAID") {
      return {
        ok: true,
        idempotent: true,
        order,
        payment: paymentTx,
      };
    }

    // 4. Duruma Göre İşlem
    const now = new Date();

    if (params.status === "success") {
      // Stok Düşümü: Eğer daha önce düşülmemişse atomik pesimistik kilitlemeyle düş
      if (!order.stockDeducted && order.items.length > 0) {
        await stockDao.lockAndDeductVariantStock(
          tx,
          order.items.map((it) => ({
            variantId: it.variantId,
            quantity: it.quantity,
          }))
        );
      }

      // Siparişi PAID ve CONFIRMED durumuna al
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "PAID",
          status: "CONFIRMED",
          paidAt: now,
          confirmedAt: order.confirmedAt || now,
          stockDeducted: true,
        },
        include: {
          items: true,
        },
      });

      // PaymentTransaction kaydını güncelle
      const updatedPayment = await tx.paymentTransaction.upsert({
        where: { merchantOid: params.merchantOid },
        create: {
          orderId: order.id,
          merchantOid: params.merchantOid,
          paymentProvider: "PAYTR",
          status: "SUCCESS",
          amountKurus: params.amountKurus,
          paidAt: now,
          callbackPayload: params.callbackPayload || Prisma.DbNull,
        },
        update: {
          status: "SUCCESS",
          paidAt: now,
          callbackPayload: params.callbackPayload || undefined,
        },
      });

      return {
        ok: true,
        order: updatedOrder,
        payment: updatedPayment,
      };
    } else {
      // Başarısız Ödeme Durumu
      const failedReason = params.failedReason || "Ödeme sağlayıcı tarafından reddedildi.";

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "FAILED",
          paymentFailedReason: failedReason,
        },
        include: {
          items: true,
        },
      });

      const updatedPayment = await tx.paymentTransaction.upsert({
        where: { merchantOid: params.merchantOid },
        create: {
          orderId: order.id,
          merchantOid: params.merchantOid,
          paymentProvider: "PAYTR",
          status: "FAILED",
          amountKurus: params.amountKurus,
          failedReason,
          callbackPayload: params.callbackPayload || Prisma.DbNull,
        },
        update: {
          status: "FAILED",
          failedReason,
          callbackPayload: params.callbackPayload || undefined,
        },
      });

      return {
        ok: false,
        error: failedReason,
        order: updatedOrder,
        payment: updatedPayment,
      };
    }
  }

  public async getPaymentByMerchantOid(
    tx: Prisma.TransactionClient,
    merchantOid: string
  ): Promise<any> {
    return await tx.paymentTransaction.findUnique({
      where: { merchantOid },
      include: {
        order: {
          include: {
            items: true,
          },
        },
      },
    });
  }
}
