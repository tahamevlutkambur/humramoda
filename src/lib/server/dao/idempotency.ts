import crypto from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { IdempotencyCheckResult } from "./types";

/**
 * IdempotencyManager
 * 
 * PostgreSQL üzerinde kalıcı, unique-constraint destekli ve transaction ile atomik
 * çalışan Idempotency (tekillik) yöneticisi.
 * 
 * Güvenlik ve Uyum İlkeleri:
 * 1. Scope Ayrımı: Farklı işlem kapsamları (COD_CHECKOUT, PAYTR_CALLBACK vb.) aynı anahtarı paylaşamaz.
 * 2. Payload Hash Doğrulaması: Aynı anahtar farklı sepet/veriyle gönderilirse IDEMPOTENCY_PAYLOAD_MISMATCH fırlatılır.
 * 3. Eşzamanlılık Koruması: İki eşzamanlı istek aynı anda geldiğinde ilki satır kilidini alır, ikincisi kilit çözülünceye kadar bekler ve mükerrer sipariş açmaz.
 * 4. Stale Recovery (Yarıda Kalan İstek Kurtarma): PENDING durumda kalmış işlem 120 saniyeden eskiyse bayat kilit sıfırlanıp tekrar denemeye izin verilir.
 * 5. Güvenli Temizlik: Süresi dolan anahtarlar temizlenirken devam eden (PENDING) transaction'lar kesinlikle silinmez.
 */
export class IdempotencyManager {
  private static tableEnsured = false;

  /**
   * İstek gövdesinin deterministik SHA256 özetini üretir.
   */
  public static computePayloadHash(payload: any): string {
    const normalize = (obj: any): any => {
      if (obj === null || typeof obj !== "object") {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(normalize);
      }
      const sortedKeys = Object.keys(obj).sort();
      const result: Record<string, any> = {};
      for (const k of sortedKeys) {
        result[k] = normalize(obj[k]);
      }
      return result;
    };

    const str = JSON.stringify(normalize(payload));
    return crypto.createHash("sha256").update(str, "utf-8").digest("hex");
  }

  /**
   * PostgreSQL üzerinde IdempotencyKey tablosunun varlığını doğrular/oluşturur.
   */
  public static async ensureTable(client: Prisma.TransactionClient | PrismaClient): Promise<void> {
    if (this.tableEnsured) return;

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
        "key" TEXT PRIMARY KEY,
        "scope" TEXT NOT NULL,
        "requestHash" TEXT NOT NULL,
        "responseStatus" TEXT NOT NULL,
        "responsePayload" JSONB NOT NULL,
        "orderId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "lockedAt" TIMESTAMP(3),
        "expiresAt" TIMESTAMP(3) NOT NULL
      );
    `);

    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_idempotency_scope" ON "IdempotencyKey"("scope");
    `);

    this.tableEnsured = true;
  }

  /**
   * Belirtilen anahtar için mevcut kaydı pesimistik kilit altında sorgular veya atomik kilit oluşturur.
   */
  public static async checkOrLockKey(
    tx: Prisma.TransactionClient,
    key: string,
    scope: string,
    payload: any
  ): Promise<IdempotencyCheckResult> {
    await this.ensureTable(tx);

    const currentHash = this.computePayloadHash(payload);

    // 1. Pesimistik kilit altında mevcut kaydı sorgula
    const rows = await tx.$queryRaw<
      Array<{
        key: string;
        scope: string;
        requestHash: string;
        responseStatus: string;
        responsePayload: any;
        orderId: string | null;
        createdAt: Date;
        lockedAt: Date | null;
      }>
    >`
      SELECT "key", "scope", "requestHash", "responseStatus", "responsePayload", "orderId", "createdAt", "lockedAt"
      FROM "IdempotencyKey"
      WHERE "key" = ${key}
      FOR UPDATE;
    `;

    if (rows && rows.length > 0) {
      const existing = rows[0];

      // Kural 1: Scope denetimi
      if (existing.scope !== scope) {
        throw new Error(
          `IDEMPOTENCY_SCOPE_MISMATCH: '${key}' anahtarı daha önce farklı bir işlem kapsamında (${existing.scope}) kullanılmıştır. '${scope}' kapsamında kullanılamaz.`
        );
      }

      // Kural 2: Payload hash denetimi
      if (existing.requestHash !== currentHash) {
        throw new Error(
          `IDEMPOTENCY_PAYLOAD_MISMATCH: '${key}' anahtarı daha önce farklı bir sepet veya parametre ile kullanılmıştır. ` +
            `Aynı idempotency anahtarıyla değiştirilmiş sipariş verisi gönderilemez.`
        );
      }

      // Kural 3: Tamamlanmış işlem
      if (existing.responseStatus === "COMPLETED") {
        return {
          exists: true,
          status: "COMPLETED",
          responsePayload: existing.responsePayload,
          orderId: existing.orderId || undefined,
          requestHash: currentHash,
        };
      }

      // Kural 4: PENDING durumundaki işlem kontrolü
      if (existing.responseStatus === "PENDING") {
        const lockTime = existing.lockedAt ? new Date(existing.lockedAt).getTime() : new Date(existing.createdAt).getTime();
        const elapsedMs = Date.now() - lockTime;

        if (elapsedMs < 120_000) {
          // Son 2 dakika içinde kilitlenmiş, işlem devam ediyor
          throw new Error(
            `IDEMPOTENCY_CONCURRENT_REQUEST: '${key}' anahtarlı işlem şu anda işlenmektedir. Lütfen mükerrer istek göndermeyiniz.`
          );
        }

        // 120 saniyeden eski PENDING: Stale lock recovery (bayat kilit kurtarma)
        await tx.$executeRawUnsafe(
          `
          UPDATE "IdempotencyKey"
          SET "lockedAt" = NOW()
          WHERE "key" = $1;
          `,
          key
        );

        return {
          exists: false,
          requestHash: currentHash,
        };
      }

      // Diğer durumlar (örn: FAILED): Yeniden denemeye izin ver
      return {
        exists: false,
        requestHash: currentHash,
      };
    }

    // 2. Kayıt henüz yok: Atomik olarak PENDING kilidi oluştur
    await tx.$executeRawUnsafe(
      `
      INSERT INTO "IdempotencyKey" (
        "key", "scope", "requestHash", "responseStatus", "responsePayload", "createdAt", "lockedAt", "expiresAt"
      ) VALUES ($1, $2, $3, 'PENDING', '{}'::jsonb, NOW(), NOW(), NOW() + INTERVAL '24 hours')
      ON CONFLICT ("key") DO UPDATE
      SET "lockedAt" = NOW();
      `,
      key,
      scope,
      currentHash
    );

    return {
      exists: false,
      requestHash: currentHash,
    };
  }

  /**
   * İşlem başarılı olduğunda sonucu idempotency tablosuna atomik olarak kaydeder.
   */
  public static async saveKey(
    tx: Prisma.TransactionClient,
    key: string,
    scope: string,
    requestHash: string,
    responseStatus: string,
    responsePayload: any,
    orderId?: string
  ): Promise<void> {
    await this.ensureTable(tx);

    const payloadJson = JSON.stringify(responsePayload);

    await tx.$executeRawUnsafe(
      `
      INSERT INTO "IdempotencyKey" ("key", "scope", "requestHash", "responseStatus", "responsePayload", "orderId", "lockedAt", "expiresAt")
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, NULL, NOW() + INTERVAL '24 hours')
      ON CONFLICT ("key") DO UPDATE
      SET "scope" = EXCLUDED."scope",
          "responseStatus" = EXCLUDED."responseStatus",
          "responsePayload" = EXCLUDED."responsePayload",
          "orderId" = EXCLUDED."orderId",
          "lockedAt" = NULL;
      `,
      key,
      scope,
      requestHash,
      responseStatus,
      payloadJson,
      orderId || null
    );
  }

  /**
   * İşlem başarısız olduğunda anahtarı FAILED olarak işaretler ve kilidi kaldırır.
   */
  public static async markFailed(
    tx: Prisma.TransactionClient,
    key: string,
    errorMessage: string
  ): Promise<void> {
    await this.ensureTable(tx);

    const errorPayload = JSON.stringify({ error: errorMessage });
    await tx.$executeRawUnsafe(
      `
      UPDATE "IdempotencyKey"
      SET "responseStatus" = 'FAILED',
          "responsePayload" = $2::jsonb,
          "lockedAt" = NULL
      WHERE "key" = $1;
      `,
      key,
      errorPayload
    );
  }

  /**
   * Süresi dolan anahtarları güvenle temizler.
   * Kural: Devam eden ('PENDING') işlemler kesinlikle silinmez.
   */
  public static async cleanupExpiredKeys(
    client: PrismaClient | Prisma.TransactionClient,
    limit = 500
  ): Promise<number> {
    await this.ensureTable(client);

    const res = await client.$executeRawUnsafe(
      `
      DELETE FROM "IdempotencyKey"
      WHERE "key" IN (
        SELECT "key" FROM "IdempotencyKey"
        WHERE "expiresAt" < NOW() AND "responseStatus" != 'PENDING'
        LIMIT ${limit}
      );
      `
    );

    return res;
  }
}
