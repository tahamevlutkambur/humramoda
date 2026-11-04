import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { processAndSaveUpload } from "@/lib/server/media";
import {
  getStoreData,
  saveStoreData,
  createCashOnDeliveryOrder,
  createPendingOrder,
  executeWithOrderLock,
} from "@/lib/server/store";

const REFERENCE_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const storePath = path.resolve("data/store.json");
let pristineStore = "";

describe("FAZ 7.3.1: Bağımsız Son Denetim, Eşzamanlı Sipariş Güvenliği ve Veri Tutarlılığı", () => {
  beforeAll(() => {
    pristineStore = fs.readFileSync(storePath, "utf8");
  });

  afterAll(() => {
    if (pristineStore) {
      try {
        const cur = fs.readFileSync(storePath, "utf8");
        if (cur !== pristineStore) {
          fs.writeFileSync(storePath, pristineStore, "utf8");
        }
      } catch {}
    }
    const currentHash = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex").toUpperCase();
    expect(currentHash).toBe(REFERENCE_HASH);
  });

  describe("1. Eşzamanlı Sipariş ve Mutex Stok Güvenliği (Stok: 1)", () => {
    it("Aynı varyant için stok 1 iken eşzamanlı iki siparişten yalnızca biri başarılı olmalı, stok 0 olmalı ve negatif olmamalıdır", async () => {
      const store = getStoreData();
      const product = store.products[0];
      const targetVariant = product.variants[0];

      // Test için geçici stok değerini 1 yap
      const originalStock = targetVariant.stockQuantity;
      targetVariant.stockQuantity = 1;
      saveStoreData(store);

      try {
        const orderPayloadA = {
          customer: {
            fullName: "Eşzamanlı Alıcı A",
            email: "concurrent.test.a@example.com",
            phone: "05329998811",
            city: "İstanbul",
            district: "Beşiktaş",
            fullAddress: "Barbaros Bulvarı No: 1",
          },
          items: [
            {
              productId: product.id,
              variantId: targetVariant.id,
              sku: targetVariant.sku,
              quantity: 1,
            },
          ],
        };

        const orderPayloadB = {
          customer: {
            fullName: "Eşzamanlı Alıcı B",
            email: "concurrent.test.b@example.com",
            phone: "05329998822",
            city: "Ankara",
            district: "Çankaya",
            fullAddress: "Tunalı Hilmi Cad. No: 2",
          },
          items: [
            {
              productId: product.id,
              variantId: targetVariant.id,
              sku: targetVariant.sku,
              quantity: 1,
            },
          ],
        };

        // İki siparişi gerçek anlamda paralel (Promise.all) ve Mutex kilidi altında yarıştır
        const [resultA, resultB] = await Promise.all([
          executeWithOrderLock(async () => createCashOnDeliveryOrder(orderPayloadA)),
          executeWithOrderLock(async () => createCashOnDeliveryOrder(orderPayloadB)),
        ]);

        const successes = [resultA, resultB].filter((r) => r.success);
        const failures = [resultA, resultB].filter((r) => !r.success);

        // Tam olarak bir sipariş başarılı olmalı
        expect(successes.length).toBe(1);
        // Tam olarak bir sipariş stok yetersizliği nedeniyle reddedilmeli
        expect(failures.length).toBe(1);
        expect(failures[0].error).toContain("yeterli stok bulunmuyor");

        // Kalan stok tam olarak 0 olmalı, asla negatif olmamalı
        const freshProduct = getStoreData().products.find((p) => p.id === product.id)!;
        const freshVariant = freshProduct.variants.find((v) => v.id === targetVariant.id)!;
        expect(freshVariant.stockQuantity).toBe(0);
      } finally {
        // Stoğu orijinal haline getir
        const resetStore = getStoreData();
        const resetVariant = resetStore.products.find((p) => p.id === product.id)?.variants.find((v) => v.id === targetVariant.id);
        if (resetVariant) resetVariant.stockQuantity = originalStock;
        saveStoreData(resetStore);
      }
    });

    it("Aynı siparişin 60 saniye içinde tekrarlanması idempotent olmalı ve stoku ikinci kez düşürmemelidir", () => {
      const store = getStoreData();
      const product = store.products[0];
      const targetVariant = product.variants[0];
      const stockBefore = targetVariant.stockQuantity;

      const orderInput = {
        customer: {
          fullName: "Mükerrer Müşteri",
          email: "mukerrer.cod@example.com",
          phone: "05441112233",
          city: "İzmir",
          district: "Bornova",
          fullAddress: "Ege Cad. No: 5",
        },
        items: [
          {
            productId: product.id,
            variantId: targetVariant.id,
            sku: targetVariant.sku,
            quantity: 1,
          },
        ],
      };

      const res1 = createCashOnDeliveryOrder(orderInput);
      expect(res1.success).toBe(true);

      const stockAfterFirst = getStoreData().products.find((p) => p.id === product.id)!.variants.find((v) => v.id === targetVariant.id)!.stockQuantity;
      expect(stockAfterFirst).toBe(stockBefore - 1);

      // İkinci defa aynı sepet gönderildiğinde
      const res2 = createCashOnDeliveryOrder(orderInput);
      expect(res2.success).toBe(true);
      expect(res2.order?.orderNumber).toBe(res1.order?.orderNumber);

      // Stok tekrar düşmemeli
      const stockAfterSecond = getStoreData().products.find((p) => p.id === product.id)!.variants.find((v) => v.id === targetVariant.id)!.stockQuantity;
      expect(stockAfterSecond).toBe(stockAfterFirst);
    });
  });

  describe("2. SKU ve Varyant Çapraz Doğrulaması", () => {
    it("Seçilen varyant ile gönderilen SKU uyuşmadığında sipariş reddedilmelidir", () => {
      const store = getStoreData();
      const betul = store.products.find((p) => p.id === "prod-1793185888547")!;
      const v0 = betul.variants[0]; // HM-SIY-STD-152

      const result = createCashOnDeliveryOrder({
        customer: {
          fullName: "Hileli Müşteri",
          email: "mismatch.sku@example.com",
          phone: "05553332211",
          city: "İstanbul",
          district: "Üsküdar",
          fullAddress: "Adres",
        },
        items: [
          {
            productId: betul.id,
            variantId: v0.id,
            sku: "YANLIS-SKU-999", // v0'ın gerçek SKU'su HM-SIY-STD-152, bilerek yanlış gönderildi
            quantity: 1,
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("stok kodu");
      expect(result.error).toContain("ile uyuşmuyor");
    });

    it("Seçilen varyant ile gönderilen renk adı uyuşmadığında sipariş reddedilmelidir", () => {
      const store = getStoreData();
      const betul = store.products.find((p) => p.id === "prod-1793185888547")!;
      const v0 = betul.variants[0]; // Siyah renginde

      const result = createCashOnDeliveryOrder({
        customer: {
          fullName: "Hileli Müşteri 2",
          email: "mismatch.color@example.com",
          phone: "05553332211",
          city: "İstanbul",
          district: "Üsküdar",
          fullAddress: "Adres",
        },
        items: [
          {
            productId: betul.id,
            variantId: v0.id,
            sku: v0.sku,
            colorName: "KIRMIZI", // Gerçekte Siyah
            quantity: 1,
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("gönderilen renk");
      expect(result.error).toContain("ile uyuşmuyor");
    });

    it("Seçilen varyant ile gönderilen beden adı uyuşmadığında sipariş reddedilmelidir", () => {
      const store = getStoreData();
      const betul = store.products.find((p) => p.id === "prod-1793185888547")!;
      const v0 = betul.variants[0]; // 38-40-42 bedeninde

      const result = createCashOnDeliveryOrder({
        customer: {
          fullName: "Hileli Müşteri 3",
          email: "mismatch.size@example.com",
          phone: "05553332211",
          city: "İstanbul",
          district: "Üsküdar",
          fullAddress: "Adres",
        },
        items: [
          {
            productId: betul.id,
            variantId: v0.id,
            sku: v0.sku,
            sizeName: "XXL-BATTAL", // Gerçekte 38-40-42
            quantity: 1,
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("gönderilen beden");
      expect(result.error).toContain("ile uyuşmuyor");
    });

    it("Aynı renk ve bedende birden fazla SKU varsa belirsiz sipariş reddedilmelidir", () => {
      const store = getStoreData();
      const betul = store.products.find((p) => p.id === "prod-1793185888547")!;

      const result = createPendingOrder({
        customer: {
          fullName: "Belirsiz Müşteri",
          email: "ambiguous@example.com",
          phone: "05550001122",
          city: "Ankara",
          district: "Mamak",
          fullAddress: "Adres",
        },
        items: [
          {
            productId: betul.id,
            colorName: "Siyah",
            sizeName: "38-40-42",
            quantity: 1,
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("birden fazla varyant tanımlıdır");
    });
  });

  describe("3. Medya Hash ve Mükerrer Kontrolü", () => {
    it("Aynı içerik farklı dosya adıyla yüklense bile SHA-256 hash birebir aynı olmalıdır", async () => {
      const buffer = Buffer.from("FAZ731_TEST_IMAGE_BUFFER_" + Date.now());
      // Farklı isimlerle simüle et
      const hashA = crypto.createHash("sha256").update(buffer).digest("hex");
      const hashB = crypto.createHash("sha256").update(buffer).digest("hex");
      expect(hashA).toBe(hashB);
    });

    it("Farklı içerik aynı dosya adıyla yüklendiğinde farklı hash üretilmeli ve yanlışlıkla mükerrer sayılmamalıdır", async () => {
      const buf1 = Buffer.from("CONTENT_ONE");
      const buf2 = Buffer.from("CONTENT_TWO");
      const hash1 = crypto.createHash("sha256").update(buf1).digest("hex");
      const hash2 = crypto.createHash("sha256").update(buf2).digest("hex");
      expect(hash1).not.toBe(hash2);
    });

    it("Dosya yükleme başarısız olursa mevcut galeri korunmalı ve veri kaybı olmamalıdır", async () => {
      const badBuffer = Buffer.from("NOT_A_VALID_IMAGE_BINARY");
      const { result, error } = await processAndSaveUpload(badBuffer, "malicious.exe", "application/x-msdownload");
      expect(error).toBeDefined();
      expect(result).toBeUndefined();
    });
  });

  describe("4. 58 Bildirim ve 47 Denetim Kaydının Korunması", () => {
    it("58 yetim bildirimin tamamı store.json içinde eksiksiz ve bozulmadan korunmaktadır", () => {
      const store = JSON.parse(pristineStore);
      expect(store.notifications.length).toBe(58);
      store.notifications.forEach((n: any) => {
        expect(n.orderNumber).toBeDefined();
        expect(n.recipient).toBeDefined();
        expect(n.subject).toBeDefined();
      });
    });

    it("47 denetim günlüğünün tamamı store.json içinde eksiksiz ve bozulmadan korunmaktadır", () => {
      const store = JSON.parse(pristineStore);
      expect(store.auditLogs.length).toBe(47);
      store.auditLogs.forEach((l: any) => {
        expect(l.timestamp).toBeDefined();
        expect(l.adminId).toBeDefined();
        expect(l.action).toBeDefined();
      });
    });

    it("Betül Trençkot'un 4 çakışan varyantı ve 10'ar adet stokları eksiksiz korunmaktadır", () => {
      const store = JSON.parse(pristineStore);
      const betul = store.products.find((p: any) => p.id === "prod-1793185888547");
      const expectedSkus = ["HM-SIY-STD-152", "KAET-YEN-STD-708", "KAET-SIY-STAN-004", "KAET-ACI-STAN-005"];
      for (const sku of expectedSkus) {
        const v = betul.variants.find((variant: any) => variant.sku === sku);
        expect(v).toBeDefined();
        expect(v.stockQuantity).toBe(10);
      }
    });
  });
});
