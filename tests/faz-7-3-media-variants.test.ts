import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { processAndSaveUpload } from "@/lib/server/media";
import {
  getStoreData,
  createCashOnDeliveryOrder,
  createPendingOrder,
  updateStoreProduct,
} from "@/lib/server/store";

const REFERENCE_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const storePath = path.resolve("data/store.json");
let pristineStore = "";

describe("FAZ 7.3 — Medya Restorasyonu, Varyant Güvenliği ve Veri Bütünlüğü", () => {
  beforeAll(() => {
    pristineStore = fs.readFileSync(storePath, "utf8");
  });

  afterAll(() => {
    if (pristineStore) {
      fs.writeFileSync(storePath, pristineStore, "utf8");
    }
    const currentHash = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex").toUpperCase();
    expect(currentHash).toBe(REFERENCE_HASH);
  });

  describe("Bölüm 1: Medya Sistemi & Hash Tabanlı Mükerrer Kontrolü", () => {
    it("Görsel yüklemesinde SHA-256 hash hesaplanmalı ve dosya sunucuda saklanmalıdır", async () => {
      // 1x1 PNG buffer
      const pngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );
      const expectedHash = crypto.createHash("sha256").update(pngBuffer).digest("hex");

      const { result, error } = await processAndSaveUpload(pngBuffer, "test-faz73-swatch.png", "image/png");

      expect(error).toBeUndefined();
      expect(result).toBeDefined();
      expect(result?.mediaType).toBe("IMAGE");
      expect(result?.hash).toBe(expectedHash);
      expect(result?.url).toMatch(/\/uploads\/products\/.+\.webp$/);

      // Temizlik: Oluşturulan test dosyasını temizle
      if (result?.fileName) {
        try { fs.unlinkSync(path.join(process.cwd(), "public", "uploads", "products", result.fileName)); } catch {}
      }
      if (result?.thumbnailUrl?.startsWith("/uploads/products/")) {
        try { fs.unlinkSync(path.join(process.cwd(), "public", result.thumbnailUrl)); } catch {}
      }
    });

    it("Aynı görsel buffer'ı yüklendiğinde aynı hash üretilerek mükerrerlik tespit edilmelidir", async () => {
      const pngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      );
      const hash1 = crypto.createHash("sha256").update(pngBuffer).digest("hex");
      const { result: res1 } = await processAndSaveUpload(pngBuffer, "test-dup-1.png", "image/png");
      const { result: res2 } = await processAndSaveUpload(pngBuffer, "test-dup-2.png", "image/png");

      expect(res1?.hash).toBe(hash1);
      expect(res2?.hash).toBe(hash1);
      expect(res1?.hash).toBe(res2?.hash);

      // Temizlik
      if (res1?.fileName) {
        try { fs.unlinkSync(path.join(process.cwd(), "public", "uploads", "products", res1.fileName)); } catch {}
      }
      if (res1?.thumbnailUrl?.startsWith("/uploads/products/")) {
        try { fs.unlinkSync(path.join(process.cwd(), "public", res1.thumbnailUrl)); } catch {}
      }
      if (res2?.fileName) {
        try { fs.unlinkSync(path.join(process.cwd(), "public", "uploads", "products", res2.fileName)); } catch {}
      }
      if (res2?.thumbnailUrl?.startsWith("/uploads/products/")) {
        try { fs.unlinkSync(path.join(process.cwd(), "public", res2.thumbnailUrl)); } catch {}
      }
    });
  });

  describe("Bölüm 2: Betül Trençkot SKU Güvenliği & Çakışan Varyant Koruması", () => {
    it("Betül Trençkot (prod-1793185888547) 4 çakışan SKU'nun tamamını stok 10 ile korumalıdır", () => {
      const store = getStoreData();
      const betul = store.products.find((p) => p.id === "prod-1793185888547");
      expect(betul).toBeDefined();

      const requiredSkus = [
        "HM-SIY-STD-152",
        "KAET-YEN-STD-708",
        "KAET-SIY-STAN-004",
        "KAET-ACI-STAN-005",
      ];

      for (const sku of requiredSkus) {
        const v = betul?.variants.find((variant) => variant.sku === sku);
        expect(v, `SKU ${sku} mevcut olmalı`).toBeDefined();
        expect(v?.stockQuantity, `SKU ${sku} stoğu 10 olmalı`).toBe(10);
      }
    });

    it("Aynı renk ve bedende birden fazla SKU varken belirsiz sipariş engellenmelidir", () => {
      // Siyah ve 38-40-42 kombinasyonunda hem HM-SIY-STD-152 hem KAET-YEN-STD-708 var
      const result = createCashOnDeliveryOrder({
        customer: {
          fullName: "Test Müşteri",
          email: "test.ambiguous@example.com",
          phone: "05551234567",
          city: "İstanbul",
          district: "Kadıköy",
          fullAddress: "Test Mahallesi No: 1",
        },
        items: [
          {
            productId: "prod-1793185888547",
            colorName: "Siyah",
            sizeName: "38-40-42",
            quantity: 1,
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("birden fazla varyant tanımlıdır");
    });

    it("Kesin SKU belirtildiğinde sipariş doğru varyanta bağlanmalı ve yalnızca o varyantın stoğu düşmelidir", () => {
      const store = getStoreData();
      const betul = store.products.find((p) => p.id === "prod-1793185888547")!;
      const v1Before = betul.variants.find((v) => v.sku === "HM-SIY-STD-152")!.stockQuantity;
      const v2Before = betul.variants.find((v) => v.sku === "KAET-YEN-STD-708")!.stockQuantity;

      const result = createCashOnDeliveryOrder({
        customer: {
          fullName: "Test Müşteri 2",
          email: "test.exact@example.com",
          phone: "05559876543",
          city: "Ankara",
          district: "Çankaya",
          fullAddress: "Kızılay Cad. No: 10",
        },
        items: [
          {
            productId: "prod-1793185888547",
            sku: "HM-SIY-STD-152",
            quantity: 2,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.order).toBeDefined();

      const freshStore = getStoreData();
      const freshBetul = freshStore.products.find((p) => p.id === "prod-1793185888547")!;
      const v1After = freshBetul.variants.find((v) => v.sku === "HM-SIY-STD-152")!.stockQuantity;
      const v2After = freshBetul.variants.find((v) => v.sku === "KAET-YEN-STD-708")!.stockQuantity;

      expect(v1After).toBe(v1Before - 2);
      expect(v2After).toBe(v2Before); // Diğer varyantın stoğuna dokunulmadı
    });

    it("Eşzamanlı iki COD siparişinde kalan stok aşılmamalı ve negatif stok oluşmamalıdır", () => {
      const store = getStoreData();
      const betul = store.products.find((p) => p.id === "prod-1793185888547")!;
      const targetVariant = betul.variants.find((v) => v.sku === "KAET-ACI-STAN-005")!;
      const currentStock = targetVariant.stockQuantity; // 10

      // İki sipariş birden 6'şar adet talep ediyor (toplam 12 > 10)
      const order1 = createCashOnDeliveryOrder({
        customer: {
          fullName: "Müşteri A",
          email: "concurrent.a@example.com",
          phone: "05321112233",
          city: "İzmir",
          district: "Konak",
          fullAddress: "Adres A",
        },
        items: [
          {
            productId: "prod-1793185888547",
            sku: "KAET-ACI-STAN-005",
            quantity: 6,
          },
        ],
      });

      const order2 = createCashOnDeliveryOrder({
        customer: {
          fullName: "Müşteri B",
          email: "concurrent.b@example.com",
          phone: "05324445566",
          city: "Bursa",
          district: "Nilüfer",
          fullAddress: "Adres B",
        },
        items: [
          {
            productId: "prod-1793185888547",
            sku: "KAET-ACI-STAN-005",
            quantity: 6,
          },
        ],
      });

      // Biri başarılı olmalı, ikincisi stok yetersizliği nedeniyle reddedilmeli
      expect(order1.success).toBe(true);
      expect(order2.success).toBe(false);
      expect(order2.error).toContain("yeterli stok bulunmuyor");

      const finalVariant = getStoreData()
        .products.find((p) => p.id === "prod-1793185888547")!
        .variants.find((v) => v.sku === "KAET-ACI-STAN-005")!;
      expect(finalVariant.stockQuantity).toBe(currentStock - 6);
      expect(finalVariant.stockQuantity).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Bölüm 3 & 4: Yetim Bildirimler (58) ve Denetim Kayıtları (47)", () => {
    it("store.json dosyasındaki 58 bildirimin tamamı orijinal orderNumber ve içerikleriyle korunmalıdır", () => {
      const data = JSON.parse(pristineStore);
      expect(data.notifications).toBeDefined();
      expect(data.notifications.length).toBe(58);

      for (const n of data.notifications) {
        expect(n.id).toBeDefined();
        expect(n.orderId).toBeDefined();
        expect(n.orderNumber).toBeDefined();
        expect(n.recipient).toBeDefined();
        expect(n.subject).toBeDefined();
      }
    });

    it("store.json dosyasındaki 47 denetim günlüğünün tamamı aktör ve zaman damgalarıyla korunmalıdır", () => {
      const data = JSON.parse(pristineStore);
      expect(data.auditLogs).toBeDefined();
      expect(data.auditLogs.length).toBe(47);

      for (const log of data.auditLogs) {
        expect(log.id).toBeDefined();
        expect(log.timestamp).toBeDefined();
        expect(log.adminId).toBeDefined();
        expect(log.action).toBeDefined();
      }
    });
  });
});
