import { Prisma } from "@prisma/client";
import { StockDeductItem, StockDeductResult, StockRestoreResult } from "./types";

/**
 * StockWriteDAO
 * PostgreSQL için pesimistik satır kilitleme (SELECT ... FOR UPDATE)
 * ve kilitlenme (deadlock) önleme algoritmalarıyla donatılmış stok yönetim DAO'su.
 */
export class StockWriteDAO {
  /**
   * Belirtilen varyantların stoklarını alfabetik ID sırasıyla kilitleyerek düşer.
   * Deadlock Önleme: Birden fazla varyant güncellenirken her zaman aynı sırada (ID ASC)
   * kilit alınır. Böylece karşılıklı bekleme döngüsü (circular wait) imkansız hale gelir.
   */
  public async lockAndDeductVariantStock(
    tx: Prisma.TransactionClient,
    items: StockDeductItem[]
  ): Promise<StockDeductResult> {
    if (!items || items.length === 0) {
      return { success: true, items: [] };
    }

    // 1. Talepleri varyant bazında topla (Aynı varyant birden fazla kez geçebilir)
    const qtyByVariant = new Map<string, number>();
    for (const it of items) {
      if (!it.variantId) {
        throw new Error("Stok düşümü için geçerli bir variantId gereklidir.");
      }
      const qty = Number(it.quantity);
      if (!qty || qty <= 0) {
        throw new Error(`Geçersiz stok düşüm adedi (${it.quantity}) varyant: ${it.variantId}`);
      }
      qtyByVariant.set(it.variantId, (qtyByVariant.get(it.variantId) || 0) + qty);
    }

    // 2. Deadlock Önleme: Varyant ID'lerini deterministik (alfabetik) sırala
    const sortedVariantIds = Array.from(qtyByVariant.keys()).sort();

    // 3. Pesimistik Satır Kilitleme: SELECT ... FOR UPDATE
    const lockedRows = await tx.$queryRaw<
      Array<{ id: string; sku: string; stockQuantity: number }>
    >`
      SELECT "id", "sku", "stockQuantity"
      FROM "ProductVariant"
      WHERE "id" IN (${Prisma.join(sortedVariantIds)})
      ORDER BY "id" ASC
      FOR UPDATE;
    `;

    // 4. Varyant varlığı ve stok yeterliliği kontrolü
    const lockedMap = new Map(lockedRows.map((r) => [r.id, r]));

    for (const variantId of sortedVariantIds) {
      const row = lockedMap.get(variantId);
      if (!row) {
        throw new Error(`Katalogda eşleşen varyant kaydı bulunamadı (ID: ${variantId}).`);
      }

      const requiredQty = qtyByVariant.get(variantId)!;
      if (row.stockQuantity < requiredQty) {
        throw new Error(
          `Yetersiz stok: ${row.sku} için mevcut stok ${row.stockQuantity}, talep edilen adet ${requiredQty}.`
        );
      }
    }

    // 5. Stokları güvenli şekilde düş
    const resultItems: StockDeductResult["items"] = [];

    for (const variantId of sortedVariantIds) {
      const row = lockedMap.get(variantId)!;
      const deductQty = qtyByVariant.get(variantId)!;
      const remainingStock = row.stockQuantity - deductQty;

      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          stockQuantity: {
            decrement: deductQty,
          },
        },
      });

      resultItems.push({
        variantId,
        sku: row.sku,
        deductedQuantity: deductQty,
        remainingStock,
      });
    }

    return {
      success: true,
      items: resultItems,
    };
  }

  /**
   * İptal, iade veya hata durumunda ayrılmış stokları geri iade eder (increment).
   * Deterministik kilit sırası (ID ASC) burada da uygulanır.
   */
  public async restoreVariantStock(
    tx: Prisma.TransactionClient,
    items: StockDeductItem[]
  ): Promise<StockRestoreResult> {
    if (!items || items.length === 0) {
      return { success: true, items: [] };
    }

    // 1. Talepleri varyant bazında topla
    const qtyByVariant = new Map<string, number>();
    for (const it of items) {
      if (!it.variantId) continue;
      const qty = Number(it.quantity);
      if (!qty || qty <= 0) continue;
      qtyByVariant.set(it.variantId, (qtyByVariant.get(it.variantId) || 0) + qty);
    }

    const sortedVariantIds = Array.from(qtyByVariant.keys()).sort();
    if (sortedVariantIds.length === 0) {
      return { success: true, items: [] };
    }

    // 2. Satırları kilitle
    const lockedRows = await tx.$queryRaw<
      Array<{ id: string; sku: string; stockQuantity: number }>
    >`
      SELECT "id", "sku", "stockQuantity"
      FROM "ProductVariant"
      WHERE "id" IN (${Prisma.join(sortedVariantIds)})
      ORDER BY "id" ASC
      FOR UPDATE;
    `;

    const lockedMap = new Map(lockedRows.map((r) => [r.id, r]));
    const resultItems: StockRestoreResult["items"] = [];

    for (const variantId of sortedVariantIds) {
      const row = lockedMap.get(variantId);
      if (!row) continue;

      const restoreQty = qtyByVariant.get(variantId)!;
      const newStock = row.stockQuantity + restoreQty;

      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          stockQuantity: {
            increment: restoreQty,
          },
        },
      });

      resultItems.push({
        variantId,
        sku: row.sku,
        restoredQuantity: restoreQty,
        newStock,
      });
    }

    return {
      success: true,
      items: resultItems,
    };
  }

  /**
   * Belirtilen varyantın güncel stok miktarını döner.
   */
  public async getVariantStock(
    tx: Prisma.TransactionClient,
    variantId: string
  ): Promise<number> {
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: { stockQuantity: true },
    });
    return variant?.stockQuantity ?? 0;
  }
}

