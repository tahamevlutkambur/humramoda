import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {
  createCashOnDeliveryOrder,
  getOrderPublicStatus,
  getStoreData,
  saveStoreData,
  type AppStoreData,
} from "../src/lib/server/store";
import {
  verifyCustomerTrackingAccess,
  getMaskedOrderTrackingView,
  createOrderTrackingToken,
  verifyOrderTrackingToken,
} from "../src/lib/server/shipping";
import {
  verifyMagicBytes,
  sanitizeFileName,
  processAndSaveUpload,
} from "../src/lib/server/media";

const storeFilePath = path.resolve("data/store.json");
let originalStoreJson: string = "";

describe("FAZ 7.2: COD Sipariş Kalıcılığı, Stok Atomikliği ve Medya Testleri", () => {
  beforeEach(() => {
    originalStoreJson = fs.readFileSync(storeFilePath, "utf8");
  });

  afterEach(() => {
    // Test sonrasında kaynak veriyi tam olarak eski haline döndür
    fs.writeFileSync(storeFilePath, originalStoreJson, "utf8");
  });

  describe("1. Kapıda Ödeme (COD) Sipariş Kalıcılığı ve Validasyon", () => {
    it("1.1 Başarılı COD siparişi oluşturur, benzersiz orderNumber ve internal id üretir", () => {
      const store = getStoreData();
      const testProduct = store.products.find((p) => p.variants && p.variants.length > 0 && p.variants[0].stockQuantity >= 2);
      expect(testProduct).toBeDefined();

      const variant = testProduct!.variants[0];
      const initialStock = variant.stockQuantity;

      const result = createCashOnDeliveryOrder({
        customer: {
          fullName: "Ayşe Yılmaz",
          email: "ayse.yilmaz@test.com",
          phone: "05321234567",
          city: "İstanbul",
          district: "Kadıköy",
          fullAddress: "Moda Caddesi No: 12",
        },
        items: [
          {
            productId: testProduct!.id,
            variantId: variant.id,
            sku: variant.sku,
            quantity: 1,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.order).toBeDefined();

      const order = result.order!;
      expect(order.id).toMatch(/^ord-\d+-[a-f0-9]+$/);
      expect(order.orderNumber).toMatch(/^HM-\d{8}-[A-F0-9]+$/);
      expect(order.paymentProvider).toBe("CASH_ON_DELIVERY");
      expect(order.paymentStatus).toBe("PENDING");
      expect(order.operationalStatus).toBe("CONFIRMED");
      expect(order.stockDeducted).toBe(true);
      expect(order.shippingStatus).toBe("AWAITING_SHIPMENT");

      // Stok 1 adet düşmüş olmalı
      expect(variant.stockQuantity).toBe(initialStock - 1);

      // Diskteki store.json içinde de siparişin bulunduğu doğrulanmalı
      const reloadedStore = JSON.parse(fs.readFileSync(storeFilePath, "utf8")) as AppStoreData;
      const foundInDisk = reloadedStore.orders.find((o) => o.orderNumber === order.orderNumber);
      expect(foundInDisk).toBeDefined();
      expect(foundInDisk!.id).toBe(order.id);
    });

    it("1.2 Aynı sipariş isteğinin tekrarlanması mükerrer sipariş oluşturmaz ve stoku çift düşürmez (Idempotency)", () => {
      const store = getStoreData();
      const testProduct = store.products.find((p) => p.variants && p.variants.length > 0 && p.variants[0].stockQuantity >= 5);
      const variant = testProduct!.variants[0];
      const initialStock = variant.stockQuantity;

      const orderInput = {
        customer: {
          fullName: "Fatma Demir",
          email: "fatma.demir@test.com",
          phone: "05439876543",
          city: "Ankara",
          district: "Çankaya",
          fullAddress: "Atatürk Bulvarı No: 50",
        },
        items: [
          {
            productId: testProduct!.id,
            variantId: variant.id,
            sku: variant.sku,
            quantity: 1,
          },
        ],
      };

      const firstCall = createCashOnDeliveryOrder(orderInput);
      expect(firstCall.success).toBe(true);
      const stockAfterFirst = variant.stockQuantity;
      expect(stockAfterFirst).toBe(initialStock - 1);

      // İkinci eşzamanlı/tekrar istek
      const secondCall = createCashOnDeliveryOrder(orderInput);
      expect(secondCall.success).toBe(true);
      // Aynı sipariş döndürülmeli
      expect(secondCall.order!.orderNumber).toBe(firstCall.order!.orderNumber);
      expect(secondCall.order!.id).toBe(firstCall.order!.id);

      // Stok tekrar düşürülmemiş olmalı
      expect(variant.stockQuantity).toBe(stockAfterFirst);
    });

    it("1.3 Geçersiz varyant seçimi reddedilmeli ve ilk varyanta otomatik düşülmemeli", () => {
      const store = getStoreData();
      const testProduct = store.products[0];

      const result = createCashOnDeliveryOrder({
        customer: {
          fullName: "Mehmet Kaya",
          email: "mehmet.kaya@test.com",
          phone: "05551112233",
          city: "İzmir",
          district: "Konak",
          fullAddress: "Alsancak Mah. No: 1",
        },
        items: [
          {
            productId: testProduct.id,
            variantId: "non-existent-variant-999",
            sku: "NON-EXISTENT-SKU",
            quantity: 1,
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("geçerli varyant bulunamadı");
    });

    it("1.4 Yetersiz stok durumunda sipariş reddedilmeli ve stok asla negatif olmamalı", () => {
      const store = getStoreData();
      const testProduct = store.products.find((p) => p.variants && p.variants.length > 0);
      const variant = testProduct!.variants[0];
      const availableStock = variant.stockQuantity;

      const result = createCashOnDeliveryOrder({
        customer: {
          fullName: "Zeynep Çelik",
          email: "zeynep.celik@test.com",
          phone: "05051234567",
          city: "Bursa",
          district: "Nilüfer",
          fullAddress: "FSM Bulvarı No: 20",
        },
        items: [
          {
            productId: testProduct!.id,
            variantId: variant.id,
            sku: variant.sku,
            quantity: availableStock + 10,
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("yeterli stok bulunmuyor");
      expect(variant.stockQuantity).toBe(availableStock);
      expect(variant.stockQuantity).toBeGreaterThanOrEqual(0);
    });

    it("1.5 Aynı varyant sepette birden fazla satırda yer aldığında stok talepleri konsolide edilmeli", () => {
      const store = getStoreData();
      const testProduct = store.products.find((p) => p.variants && p.variants.length > 0 && p.variants[0].stockQuantity >= 3);
      const variant = testProduct!.variants[0];
      const initialStock = variant.stockQuantity;

      // 2 ayrı satırda toplam 3 adet isteniyor
      const result = createCashOnDeliveryOrder({
        customer: {
          fullName: "Kemal Sunal",
          email: "kemal.sunal@test.com",
          phone: "05335554433",
          city: "Adana",
          district: "Seyhan",
          fullAddress: "Baraj Yolu No: 10",
        },
        items: [
          {
            productId: testProduct!.id,
            variantId: variant.id,
            sku: variant.sku,
            quantity: 2,
          },
          {
            productId: testProduct!.id,
            variantId: variant.id,
            sku: variant.sku,
            quantity: 1,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(variant.stockQuantity).toBe(initialStock - 3);
    });
  });

  describe("2. Sipariş Başarı ve Takip Ekranı Güvenliği", () => {
    it("2.1 getOrderPublicStatus sipariş bilgilerini güvenli maskeleme ile döndürür", () => {
      const store = getStoreData();
      const testProduct = store.products[0];
      const variant = testProduct.variants[0];

      const res = createCashOnDeliveryOrder({
        customer: {
          fullName: "Emine Şahin",
          email: "emine.sahin@test.com",
          phone: "05441234567",
          city: "Antalya",
          district: "Muratpaşa",
          fullAddress: "Işıklar Cad. No: 15 Daire: 4",
        },
        items: [{ productId: testProduct.id, variantId: variant.id, quantity: 1 }],
      });

      expect(res.success).toBe(true);
      const status = getOrderPublicStatus(res.order!.orderNumber);
      expect(status).toBeDefined();
      expect(status!.orderNumber).toBe(res.order!.orderNumber);
      expect(status!.paymentProvider).toBe("CASH_ON_DELIVERY");
      expect(status!.paymentStatus).toBe("PENDING");
      expect(status!.operationalStatus).toBe("CONFIRMED");
      // Müşteri tam adı maskeli olmalı
      expect(status!.customerName).toContain("*");
    });

    it("2.2 Takip sorgulamasında telefon veya e-posta doğrulanmadan sipariş bilgisi ifşa edilmez", () => {
      const store = getStoreData();
      const testProduct = store.products[0];
      const variant = testProduct.variants[0];

      const res = createCashOnDeliveryOrder({
        customer: {
          fullName: "Ali Veli",
          email: "ali.veli@test.com",
          phone: "05329998877",
          city: "Eskişehir",
          district: "Tepebaşı",
          fullAddress: "Üniversite Cad. No: 8",
        },
        items: [{ productId: testProduct.id, variantId: variant.id, quantity: 1 }],
      });

      const orderNumber = res.order!.orderNumber;

      // Yanlış telefon ile sorgulama
      const wrongAuth = verifyCustomerTrackingAccess(orderNumber, { phone: "05321112233" });
      expect(wrongAuth.authorized).toBe(false);

      // Doğru telefon ile sorgulama (son 10 hane normalize edilir)
      const correctAuth = verifyCustomerTrackingAccess(orderNumber, { phone: "5329998877" });
      expect(correctAuth.authorized).toBe(true);

      const trackingView = getMaskedOrderTrackingView(correctAuth.order!);
      expect(trackingView.orderNumber).toBe(orderNumber);
      expect(trackingView.paymentProvider).toBe("CASH_ON_DELIVERY");
    });

    it("2.3 Signed tracking token doğrulaması geçerli çalışır", () => {
      const store = getStoreData();
      const testProduct = store.products[0];
      const variant = testProduct.variants[0];

      const res = createCashOnDeliveryOrder({
        customer: {
          fullName: "Hasan Hüseyin",
          email: "hasan.huseyin@test.com",
          phone: "05338887766",
          city: "Konya",
          district: "Selçuklu",
          fullAddress: "Nalçacı Cad. No: 14",
        },
        items: [{ productId: testProduct.id, variantId: variant.id, quantity: 1 }],
      });

      const order = res.order!;
      const token = createOrderTrackingToken(order);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(20);

      // Doğru token
      expect(verifyOrderTrackingToken(token, order.id)).toBe(true);
      // Yanlış orderId
      expect(verifyOrderTrackingToken(token, "fake-order-id")).toBe(false);
    });
  });

  describe("3. Medya ve Görsel İşleme Sistemi", () => {
    it("3.1 Magic bytes doğru formatları tespit eder ve HEIC'i video olarak sınıflandırmaz", () => {
      const jpeg = verifyMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
      expect(jpeg.isValid).toBe(true);
      expect(jpeg.mediaType).toBe("IMAGE");

      const png = verifyMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      expect(png.isValid).toBe(true);
      expect(png.mediaType).toBe("IMAGE");

      const heicHeader = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
      const heic = verifyMagicBytes(heicHeader);
      expect(heic.isValid).toBe(true);
      expect(heic.mediaType).toBe("IMAGE");
      expect(heic.detectedType).toBe("image/heic");

      const mp4Header = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
      const mp4 = verifyMagicBytes(mp4Header);
      expect(mp4.isValid).toBe(true);
      expect(mp4.mediaType).toBe("VIDEO");
    });

    it("3.2 processAndSaveUpload geçerli bir resmi Sharp ile WebP'ye dönüştürür ve diske yazar", async () => {
      // 100x100 basit PNG oluştur
      const testImageBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 200, g: 100, b: 50 },
        },
      })
        .png()
        .toBuffer();

      const { result, error } = await processAndSaveUpload(
        testImageBuffer,
        "test-kumash-cekim.png",
        "image/png"
      );

      expect(error).toBeUndefined();
      expect(result).toBeDefined();
      expect(result!.url).toMatch(/^\/uploads\/products\/.+\.webp$/);
      expect(result!.mimeType).toBe("image/webp");
      expect(result!.mediaType).toBe("IMAGE");

      // Dosyanın fiziksel olarak diskte oluşturulduğunu kontrol et
      const relativePath = result!.url.slice("/uploads/".length);
      const fullPath = path.resolve("public/uploads", relativePath);
      expect(fs.existsSync(fullPath)).toBe(true);

      // Temizlik: Test görselini sil
      try {
        fs.unlinkSync(fullPath);
        if (result!.thumbnailUrl && result!.thumbnailUrl.startsWith("/uploads/")) {
          const thumbFullPath = path.resolve("public/uploads", result!.thumbnailUrl.slice("/uploads/".length));
          if (fs.existsSync(thumbFullPath)) fs.unlinkSync(thumbFullPath);
        }
      } catch {}
    });

    it("3.3 Bozuk veya sahte dosya yüklendiğinde güvenlik hatası fırlatır", async () => {
      const fakeCorruptBuffer = Buffer.from("NOT_AN_IMAGE_FAKE_DATA");
      const { result, error } = await processAndSaveUpload(
        fakeCorruptBuffer,
        "fake.jpg",
        "image/jpeg"
      );

      expect(result).toBeUndefined();
      expect(error).toContain("Güvenlik uyarısı");
    });
  });

  describe("4. Betül Trençkot Varyant Çakışması Koruma Garantisi", () => {
    it("4.1 betul-trenckot ürününün 4 çakışan SKU'su (HM-SIY-STD-152, KAET-YEN-STD-708, KAET-SIY-STAN-004, KAET-ACI-STAN-005) ve 10'ar stokları kesinlikle korunmuştur", () => {
      const store = getStoreData();
      const betul = store.products.find((p) => p.slug === "betul-trenckot" || p.id === "betul-trenckot");
      expect(betul).toBeDefined();

      const requiredSkus = [
        "HM-SIY-STD-152",
        "KAET-YEN-STD-708",
        "KAET-SIY-STAN-004",
        "KAET-ACI-STAN-005",
      ];

      for (const sku of requiredSkus) {
        const variant = betul!.variants.find((v) => v.sku.toUpperCase() === sku.toUpperCase());
        expect(variant).toBeDefined();
        expect(variant!.stockQuantity).toBe(10);
      }
    });
  });
});

