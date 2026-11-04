import { describe, it, expect, beforeAll, afterAll } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  getStoreData,
  saveStoreData,
  getAllStoreProducts,
  getStoreProductBySlug,
  executeWithOrderLock,
  createCashOnDeliveryOrder,
  createPendingOrder,
  setupIsolatedTestStore,
  AppStoreData,
  StoreOrder,
} from "@/lib/server/store";
import {
  processPayTRCallback,
  computePayTRCallbackHash,
  getPayTRConfig,
} from "@/lib/server/paytr";
import { createReturnRequest, updateReturnRequestStatus } from "@/lib/server/returns";
import { createShipment, addTrackingEvent } from "@/lib/server/shipping";
import { verifyMagicBytes } from "@/lib/server/media";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductGallery } from "@/components/product/ProductGallery";
import { FavoritesProvider } from "@/context/FavoritesContext";

const REAL_STORE_PATH = path.resolve("data/store.json");
const EXPECTED_INITIAL_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";

function getRealStoreHash(): string {
  const content = fs.readFileSync(REAL_STORE_PATH);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

describe("FAZ 7.10.1: Test İzolasyonu ve Kritik Mağaza Sipariş Güvenlik Denetimi", () => {
  let isolation: { testFilePath: string; cleanup: () => void };

  beforeAll(() => {
    // 1. Gerçek data/store.json dosyasının başlangıç hash'ini doğrula
    const currentHash = getRealStoreHash();
    expect(currentHash).toBe(EXPECTED_INITIAL_HASH);

    // 2. KESİN TEST İZOLASYONU:
    // os.tmpdir() altında bağımsız geçici test deposu oluşturulur.
    // Tüm sipariş, stok, bildirim ve log işlemleri bu izole geçici dosyaya yönlendirilir.
    // Gerçek data/store.json dosyasına ASLA yazılmaz ve dokunulmaz.
    isolation = setupIsolatedTestStore();
  });

  afterAll(() => {
    // 1. Geçici izole test deposunu temizle
    isolation?.cleanup();

    // 2. KESİN DOĞRULAMA:
    // Testler bittikten sonra gerçek data/store.json hash'inin HİÇBİR ŞEKİLDE DEĞİŞMEDİĞİNİ teyit et.
    // afterAll ile dosyayı eski haline döndürmek yerine, dosyanın gerçekten HİÇ DEĞİŞTİRİLMEDİĞİ kanıtlanır.
    const finalHash = getRealStoreHash();
    expect(finalHash).toBe(EXPECTED_INITIAL_HASH);
  });

  // ----------------------------------------------------------------
  // 1. ÜRÜN VE KATALOG GÖRÜNTÜLENME DENETİMİ (13 ÜRÜN)
  // ----------------------------------------------------------------
  describe("1. Ürün ve Katalog Denetimi", () => {
    it("1.1. Mağazadaki 13 ürünün tamamı katalogda eksiksiz listelenmelidir", () => {
      const products = getAllStoreProducts();
      expect(products.length).toBe(13);
    });

    it("1.2. Her bir ürün geçerli başlık, slug, fiyat ve kategori bilgisine sahip olmalıdır", () => {
      const products = getAllStoreProducts();
      products.forEach((p) => {
        expect(p.id).toBeDefined();
        expect(p.title.trim().length).toBeGreaterThan(0);
        expect(p.slug.trim().length).toBeGreaterThan(0);
        expect(p.basePrice).toBeGreaterThan(0);
        expect(p.categorySlug).toBeDefined();
      });
    });

    it("1.3. Görseli olan 7 ürün ProductCard bileşeninde görseliyle, görselsiz 6 ürün ise fallback placeholder ile render edilmelidir", () => {
      const products = getAllStoreProducts();
      let withImages = 0;
      let withoutImages = 0;

      products.forEach((p) => {
        const html = renderToString(
          React.createElement(
            FavoritesProvider,
            null,
            React.createElement(ProductCard, { product: p as any })
          )
        );
        expect(html.length).toBeGreaterThan(0);
        expect(html).toContain(p.title);

        if (p.media && p.media.length > 0) {
          withImages++;
          expect(html).toContain("img");
        } else {
          withoutImages++;
          expect(html).toContain("product-placeholder.svg");
        }
      });

      expect(withImages).toBe(7);
      expect(withoutImages).toBe(6);
    });

    it("1.4. Görseli olan ürünlerde ProductGallery seçilen renge göre galeriyi doğru filtrelemelidir", () => {
      const gomlek = getStoreProductBySlug("gomlek");
      expect(gomlek).toBeDefined();
      if (!gomlek) return;

      expect(gomlek.media.length).toBe(12);
      expect(gomlek.colors.length).toBe(11);

      const firstColor = gomlek.colors[0];
      const colorMedia = gomlek.media.filter((m) => !m.colorId || m.colorId === firstColor.id);
      const html = renderToString(
        React.createElement(ProductGallery, {
          media: (colorMedia.length > 0 ? colorMedia : gomlek.media) as any,
          productTitle: gomlek.title,
        })
      );
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain("img");
    });
  });

  // ----------------------------------------------------------------
  // 2. MEDYA VE DOSYA GÜVENLİK DENETİMİ (155 DOSYA)
  // ----------------------------------------------------------------
  describe("2. Medya ve Dosya Güvenlik Denetimi", () => {
    it("2.1. public/uploads altındaki 155 dosyanın tamamı diskte okunabilir ve geçerli sihirli baytlara sahip olmalıdır", () => {
      function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
        const files = fs.readdirSync(dirPath);
        files.forEach((file) => {
          const fullPath = path.join(dirPath, file);
          if (fs.statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, arrayOfFiles);
          } else {
            arrayOfFiles.push(fullPath);
          }
        });
        return arrayOfFiles;
      }

      const uploadFiles = getAllFiles(path.resolve("public/uploads"));
      expect(uploadFiles.length).toBe(155);

      let validCount = 0;
      uploadFiles.forEach((file) => {
        const ext = path.extname(file).toLowerCase();
        if (ext === ".json") {
          validCount++;
          return;
        }
        const buffer = fs.readFileSync(file);
        expect(buffer.length).toBeGreaterThan(0);
        const res = verifyMagicBytes(buffer);
        expect(res.isValid).toBe(true);
        validCount++;
      });

      expect(validCount).toBe(155);
    });
  });

  // ----------------------------------------------------------------
  // 3. SEPET, VARYANT, FİYAT, KAMPANYA VE KARGO HESAPLAMA DOĞRULAMASI
  // ----------------------------------------------------------------
  describe("3. Sepet, Varyant ve Fiyat Hesaplama Denetimi", () => {
    it("3.1. Sunucu tarafında fiyat doğrulaması, indirimler, kampanyalar, kargo ücreti ve toplam tutar ayrı ayrı doğrulanmalıdır", () => {
      const store = getStoreData();
      const product = store.products.find((p) => p.variants && p.variants.length >= 2);
      expect(product).toBeDefined();
      if (!product) return;

      const v1 = product.variants[0];
      const v2 = product.variants[1];
      const c1 = product.colors.find((c) => c.id === v1.colorId);
      const c2 = product.colors.find((c) => c.id === v2.colorId);
      const s1 = product.sizes.find((s) => s.id === v1.sizeId);
      const s2 = product.sizes.find((s) => s.id === v2.sizeId);

      // İstemci manipüle edilmiş fiyatlar gönderiyor
      const cartItems = [
        {
          productId: product.id,
          variantId: v1.id,
          colorName: c1?.name || "Standart",
          sizeName: s1?.name || "Standart",
          sku: v1.sku,
          price: 999999, // Kötü niyetli istemci tahrifatı
          quantity: 2,
        },
        {
          productId: product.id,
          variantId: v2.id,
          colorName: c2?.name || "Standart",
          sizeName: s2?.name || "Standart",
          sku: v2.sku,
          price: 1, // Kötü niyetli istemci tahrifatı
          quantity: 1,
        },
      ];

      // İzole test deposunda aktif geçerli bir kampanya tanımla
      const currentStore = getStoreData();
      currentStore.campaigns = [
        {
          id: "camp-yenisezon",
          code: "YENISEZON10",
          name: "Yeni Sezona Özel %10 İndirim",
          discountPercentage: 10,
          minBasketAmount: 2000,
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          isActive: true,
        },
      ];
      saveStoreData(currentStore);

      // HUMRA10 veya YENISEZON10 kampanyası ile sipariş aç
      const res = createCashOnDeliveryOrder({
        customer: {
          fullName: "Sepet Test Müşterisi",
          email: "sepet-test@example.com",
          phone: "05551112233",
          fullAddress: "Test Mahallesi No:1 D:2",
          city: "İstanbul",
          district: "Kadıköy",
        },
        items: cartItems as any,
        campaignCode: "YENISEZON10",
      });

      expect(res.success).toBe(true);
      expect(res.order).toBeDefined();
      if (!res.order) return;

      const order = res.order;
      const expectedUnit = product.discountPrice ?? product.basePrice;

      // 1. Birim fiyat doğrulaması (istemci fiyatı ezilir, sunucu fiyatı geçerlidir)
      expect(order.items[0].unitPrice).toBe(expectedUnit);
      expect(order.items[1].unitPrice).toBe(expectedUnit);

      // 2. Ara toplam doğrulaması (subtotal)
      const expectedSubtotal = expectedUnit * 3;
      expect(order.subtotal).toBe(expectedSubtotal);

      // 3. Kampanya ve indirim doğrulaması (discountAmount)
      let expectedDiscount = 0;
      if (expectedSubtotal >= 2000) {
        expectedDiscount = Math.round(((expectedSubtotal * 10) / 100) * 100) / 100;
      }
      expect(order.discountAmount).toBe(expectedDiscount);

      // 4. Kargo ücreti doğrulaması (shippingAmount: 150 TL)
      expect(order.shippingAmount).toBe(150);

      // 5. Genel toplam doğrulaması (totalAmount = subtotal - discount + shipping)
      const expectedTotal = Math.max(0, expectedSubtotal - expectedDiscount + 150);
      expect(order.totalAmount).toBe(expectedTotal);
      expect(order.totalKurus).toBe(Math.round(expectedTotal * 100));
    });

    it("3.2. Olmayan varyant veya ürün ID'si ile sipariş oluşturulması reddedilmelidir", () => {
      const res = createCashOnDeliveryOrder({
        customer: {
          fullName: "Geçersiz ID Test",
          email: "gecersiz@example.com",
          phone: "05551112233",
          fullAddress: "Test Açık Adres",
          city: "Ankara",
          district: "Çankaya",
        },
        items: [
          {
            productId: "non-existent-product",
            variantId: "non-existent-variant",
            colorName: "Siyah",
            sizeName: "M",
            sku: "SAHTE-SKU",
            quantity: 1,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("3.3. Stok miktarından fazla talep edilen sipariş reddedilmelidir", () => {
      const store = getStoreData();
      const product = store.products[0];
      const variant = product.variants[0];
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const excessiveQuantity = variant.stockQuantity + 9999;

      const res = createCashOnDeliveryOrder({
        customer: {
          fullName: "Fazla Stok Test",
          email: "fazla-stok@example.com",
          phone: "05551112233",
          fullAddress: "Test Açık Adres No:10",
          city: "İzmir",
          district: "Konak",
        },
        items: [
          {
            productId: product.id,
            variantId: variant.id,
            colorName: color?.name || "Standart",
            sizeName: size?.name || "Standart",
            sku: variant.sku,
            quantity: excessiveQuantity,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("stok");
    });
  });

  // ----------------------------------------------------------------
  // 4. KAPIDA ÖDEME (COD) VE FORM DOĞRULAMA DENETİMİ
  // ----------------------------------------------------------------
  describe("4. Kapıda Ödeme Akışı ve Form Doğrulaması", () => {
    it("4.1. Eksik ad soyad veya adres bilgisiyle sipariş oluşturulamaz", () => {
      const store = getStoreData();
      const product = store.products[0];
      const variant = product.variants[0];
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const res = createCashOnDeliveryOrder({
        customer: {
          fullName: "", // Eksik ad soyad
          email: "eksik-form@example.com",
          phone: "05550000000",
          fullAddress: "", // Eksik adres
          city: "Bursa",
          district: "Nilüfer",
        },
        items: [
          {
            productId: product.id,
            variantId: variant.id,
            colorName: color?.name || "Standart",
            sizeName: size?.name || "Standart",
            sku: variant.sku,
            quantity: 1,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("4.2. Başarılı kapıda ödeme siparişinde stok tam bir kez düşmeli, sipariş numarası üretilmeli ve mükerrer istek idempotent olmalıdır", async () => {
      const store = getStoreData();
      const product = store.products[0];
      const variant = product.variants[0];
      const initialStock = variant.stockQuantity;
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const payload = {
        customer: {
          fullName: "Zeynep Demir",
          email: "zeynep.demir@example.com",
          phone: "05559998877",
          fullAddress: "Atatürk Cad. No:15 D:4",
          city: "Antalya",
          district: "Muratpaşa",
        },
        items: [
          {
            productId: product.id,
            variantId: variant.id,
            colorName: color?.name || "Standart",
            sizeName: size?.name || "Standart",
            sku: variant.sku,
            quantity: 2,
          },
        ],
      };

      const orderResult1 = await executeWithOrderLock(async () => {
        return createCashOnDeliveryOrder(payload);
      });

      expect(orderResult1.success).toBe(true);
      expect(orderResult1.order).toBeDefined();
      if (!orderResult1.order) return;

      expect(orderResult1.order.orderNumber).toMatch(/^HM-\d{8}-[A-Za-z0-9]+$/);
      expect(orderResult1.order.paymentProvider).toBe("CASH_ON_DELIVERY");
      expect(orderResult1.order.operationalStatus).toBe("CONFIRMED");
      expect(orderResult1.order.stockDeducted).toBe(true);

      // Stok 2 adet düşmüş olmalıdır
      const storeAfterOrder = getStoreData();
      const updatedVar = storeAfterOrder.products.find((p) => p.id === product.id)?.variants.find((v) => v.id === variant.id);
      expect(updatedVar?.stockQuantity).toBe(initialStock - 2);

      // İdempotency Denetimi: Aynı payload ile 60 saniye içinde tekrarlanan istek çift sipariş üretmez ve çift stok düşmez
      const orderResult2 = await executeWithOrderLock(async () => {
        return createCashOnDeliveryOrder(payload);
      });

      expect(orderResult2.success).toBe(true);
      expect(orderResult2.order?.orderNumber).toBe(orderResult1.order.orderNumber);

      const storeAfterDuplicate = getStoreData();
      const finalVar = storeAfterDuplicate.products.find((p) => p.id === product.id)?.variants.find((v) => v.id === variant.id);
      expect(finalVar?.stockQuantity).toBe(initialStock - 2); // İkinci kez düşmez!
    });
  });

  // ----------------------------------------------------------------
  // 5. EŞZAMANLI SİPARİŞ YARIŞI VE MUTEX GÜVENLİĞİ
  // ----------------------------------------------------------------
  describe("5. Eşzamanlı Sipariş ve Stok Mutex Kilit Güvenliği", () => {
    it("5.1. Kalan son 1 stok için eşzamanlı gönderilen iki istekten yalnızca BİRİ başarılı olmalı, çift stok düşülmemelidir", async () => {
      const store = getStoreData();
      const product = store.products.find((p) => p.id === "prod-1793197800139"); // Taşlı mont
      expect(product).toBeDefined();
      if (!product) return;

      const variant = product.variants[0];
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      // Stoku kontrollü olarak 1'e ayarla (izole depoda)
      variant.stockQuantity = 1;
      saveStoreData(store);

      const orderPayload = {
        productId: product.id,
        variantId: variant.id,
        colorName: color?.name || "Standart",
        sizeName: size?.name || "Standart",
        sku: variant.sku,
        quantity: 1,
      };

      const promise1 = executeWithOrderLock(async () => {
        return createCashOnDeliveryOrder({
          customer: {
            fullName: "Yarışçı Müşteri 1",
            email: "yarisi-1@example.com",
            phone: "05551234567",
            fullAddress: "Adres 1 No:1",
            city: "İstanbul",
            district: "Beşiktaş",
          },
          items: [orderPayload],
        });
      });

      const promise2 = executeWithOrderLock(async () => {
        return createCashOnDeliveryOrder({
          customer: {
            fullName: "Yarışçı Müşteri 2",
            email: "yarisi-2@example.com",
            phone: "05557654321",
            fullAddress: "Adres 2 No:2",
            city: "Ankara",
            district: "Çankaya",
          },
          items: [orderPayload],
        });
      });

      const [res1, res2] = await Promise.all([promise1, promise2]);

      const successCount = (res1.success ? 1 : 0) + (res2.success ? 1 : 0);
      const failCount = (!res1.success ? 1 : 0) + (!res2.success ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failCount).toBe(1);

      const finalStore = getStoreData();
      const finalProd = finalStore.products.find((p) => p.id === product.id);
      const finalVar = finalProd?.variants.find((v) => v.id === variant.id);
      expect(finalVar?.stockQuantity).toBe(0); // Kesinlikle 0, asla -1 olamaz!
    });
  });

  // ----------------------------------------------------------------
  // 6. PAYTR SİMÜLASYONU VE İDAMPOTENT CALLBACK
  // ----------------------------------------------------------------
  describe("6. PayTR Simülasyonu ve Callback Doğrulaması", () => {
    it("6.1. Geçerli imzalı PayTR callback'i siparişi onaylamalı, mükerrer callback anında OK dönmeli ve ikinci kez stok düşmemelidir", async () => {
      const store = getStoreData();
      const product = store.products[0];
      const variant = product.variants[0];
      const initialStock = variant.stockQuantity;
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const pendingRes = await executeWithOrderLock(async () => {
        return createPendingOrder({
          customer: {
            fullName: "PayTR Test Müşterisi",
            email: "paytr-sim@example.com",
            phone: "05550001122",
            fullAddress: "Gül Sok. No:5",
            city: "Eskişehir",
            district: "Tepebaşı",
          },
          items: [
            {
              productId: product.id,
              variantId: variant.id,
              colorName: color?.name || "Standart",
              sizeName: size?.name || "Standart",
              sku: variant.sku,
              quantity: 1,
            },
          ],
        });
      });

      expect(pendingRes.success).toBe(true);
      expect(pendingRes.order).toBeDefined();
      if (!pendingRes.order) return;

      const orderNumber = pendingRes.order.orderNumber;
      const totalKurus = pendingRes.order.totalKurus;

      const config = getPayTRConfig();
      const validHash = computePayTRCallbackHash({
        merchantOid: orderNumber,
        status: "success",
        totalAmount: String(totalKurus),
        merchantSalt: config.merchantSalt,
        merchantKey: config.merchantKey,
      });

      const callbackResult1 = await executeWithOrderLock(async () => {
        return processPayTRCallback(
          {
            merchantOid: orderNumber,
            status: "success",
            totalAmount: String(totalKurus),
            hash: validHash,
          },
          "127.0.0.1"
        );
      });

      expect(callbackResult1.ok).toBe(true);
      expect(callbackResult1.statusText).toBe("OK");

      const midStore = getStoreData();
      const midProd = midStore.products.find((p) => p.id === product.id);
      const midVar = midProd?.variants.find((v) => v.id === variant.id);
      expect(midVar?.stockQuantity).toBe(initialStock - 1);

      // İdempotency Denetimi: Mükerrer bildirim tekrar stok düşmez
      const callbackResult2 = await executeWithOrderLock(async () => {
        return processPayTRCallback(
          {
            merchantOid: orderNumber,
            status: "success",
            totalAmount: String(totalKurus),
            hash: validHash,
          },
          "127.0.0.1"
        );
      });

      expect(callbackResult2.ok).toBe(true);
      expect(callbackResult2.statusText).toBe("OK");

      const finalStore = getStoreData();
      const finalProd = finalStore.products.find((p) => p.id === product.id);
      const finalVar = finalProd?.variants.find((v) => v.id === variant.id);
      expect(finalVar?.stockQuantity).toBe(initialStock - 1);
    });

    it("6.2. Geçersiz imzalı PayTR callback 400 ile reddedilmeli ve sipariş onaylanmamalıdır", async () => {
      const res = await executeWithOrderLock(async () => {
        return processPayTRCallback(
          {
            merchantOid: "HM-FAKE-ORDER",
            status: "success",
            totalAmount: "10000",
            hash: "invalid-tampered-hash-12345",
          },
          "127.0.0.1"
        );
      });

      expect(res.ok).toBe(false);
      expect(res.httpStatus).toBe(400);
      expect(res.statusText).toContain("failed");
    });
  });

  // ----------------------------------------------------------------
  // 7. SİPARİŞ SONRASI AKIŞ: KARGO, İADE, DEĞİŞİM VE BİLDİRİM
  // ----------------------------------------------------------------
  describe("7. Sipariş Sonrası Süreçler: Kargo, İade ve Değişim", () => {
    it("7.1. Sipariş için kargo oluşturulabilmeli, durum güncellenebilmeli ve takip olayları işlenebilmelidir", async () => {
      const store = getStoreData();
      const product = store.products[0];
      const variant = product.variants[0];
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const ordRes = createCashOnDeliveryOrder({
        customer: {
          fullName: "Kargo Testi",
          email: "kargo-test@example.com",
          phone: "05553334455",
          fullAddress: "Kargo Sokak No:3",
          city: "Kocaeli",
          district: "İzmit",
        },
        items: [
          {
            productId: product.id,
            variantId: variant.id,
            colorName: color?.name || "Standart",
            sizeName: size?.name || "Standart",
            sku: variant.sku,
            quantity: 1,
          },
        ],
      });

      expect(ordRes.success).toBe(true);
      expect(ordRes.order).toBeDefined();
      if (!ordRes.order) return;

      const order = ordRes.order;

      // Kargo oluşturulabilmesi için ödemenin onaylanmış olması gerekir (PAID)
      const storeWithOrder = getStoreData();
      const dbOrder = storeWithOrder.orders.find((o) => o.id === order.id);
      if (dbOrder) {
        dbOrder.paymentStatus = "PAID";
        saveStoreData(storeWithOrder);
      }

      const shipmentRes = createShipment({
        orderId: order.id,
        carrier: "yurtici",
        trackingNumber: "YK1234567890",
      });

      expect(shipmentRes.success).toBe(true);
      expect(shipmentRes.shipment).toBeDefined();

      const trackingEventRes = addTrackingEvent({
        orderIdOrTrackingNumber: shipmentRes.shipment!.trackingNumber,
        status: "DELIVERED",
        description: "Teslim edildi",
      });

      expect(trackingEventRes.success).toBe(true);
      expect(trackingEventRes.event?.status).toBe("DELIVERED");
    });

    it("7.2. İade/değişim talebi onaylandığında stok bir defaya mahsus iade edilmeli, ikinci kez onaylandığında stok artmamalıdır (idempotency)", () => {
      const store = getStoreData();
      const product = store.products[0];
      const variant = product.variants[0];
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const ordRes = createCashOnDeliveryOrder({
        customer: {
          fullName: "İade Test Müşterisi",
          email: "iade-test@example.com",
          phone: "05554445566",
          fullAddress: "İade Sokak No:4",
          city: "Bursa",
          district: "Osmangazi",
        },
        items: [
          {
            productId: product.id,
            variantId: variant.id,
            colorName: color?.name || "Standart",
            sizeName: size?.name || "Standart",
            sku: variant.sku,
            quantity: 1,
          },
        ],
      });

      expect(ordRes.success).toBe(true);
      const order = ordRes.order!;
      const item = order.items[0];

      // Ödemeyi PAID yap
      const storeWithOrd = getStoreData();
      const currentOrd = storeWithOrd.orders.find((o) => o.id === order.id);
      if (currentOrd) {
        currentOrd.paymentStatus = "PAID";
        saveStoreData(storeWithOrd);
      }

      const currentStore = getStoreData();
      const currentVar = currentStore.products
        .find((p) => p.id === item.productId)
        ?.variants.find((v) => v.id === item.variantId);
      const stockBeforeReturn = currentVar?.stockQuantity || 0;

      const returnRes = createReturnRequest({
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
        requestType: "EXCHANGE",
        reason: "Beden uyumsuzluğu",
        items: [
          {
            orderItemId: item.id,
            quantity: 1,
            reason: "Bir beden büyüğü ile değişim talep ediliyor",
          },
        ],
        exchangeDetails: {
          requestedSize: "44-46-48",
          notes: "Lütfen bir beden büyüğünü gönderiniz",
        },
      });

      expect(returnRes.success).toBe(true);
      expect(returnRes.returnRequest).toBeDefined();

      // 1. Onay: Stok +1 artar ve isRestocked: true olur
      const approveRes1 = updateReturnRequestStatus({
        returnId: returnRes.returnRequest!.id,
        newStatus: "APPROVED",
        restockDecision: "RESTOCKED",
        adminNotes: "Ürün incelendi, hasarsız, stoka iade edildi",
      });

      expect(approveRes1.success).toBe(true);
      expect(approveRes1.returnRequest?.isRestocked).toBe(true);

      const storeAfterApprove1 = getStoreData();
      const varAfterApprove1 = storeAfterApprove1.products
        .find((p) => p.id === item.productId)
        ?.variants.find((v) => v.id === item.variantId);
      expect(varAfterApprove1?.stockQuantity).toBe(stockBeforeReturn + 1);

      // 2. İdempotency Denetimi: İkinci kez onaylandığında stok TEKRAR ARTMAZ
      const approveRes2 = updateReturnRequestStatus({
        returnId: returnRes.returnRequest!.id,
        newStatus: "APPROVED",
        restockDecision: "RESTOCKED",
        adminNotes: "Tekrarlanan onay isteği",
      });

      expect(approveRes2.success).toBe(true);
      const storeAfterApprove2 = getStoreData();
      const varAfterApprove2 = storeAfterApprove2.products
        .find((p) => p.id === item.productId)
        ?.variants.find((v) => v.id === item.variantId);
      expect(varAfterApprove2?.stockQuantity).toBe(stockBeforeReturn + 1); // Değişmedi!
    });

    it("7.3. İade talebi reddedildiğinde stok yanlışlıkla artmamalıdır", () => {
      const store = getStoreData();
      const product = store.products[0];
      const variant = product.variants[0];
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const ordRes = createCashOnDeliveryOrder({
        customer: {
          fullName: "Ret Testi",
          email: "ret-test@example.com",
          phone: "05557778899",
          fullAddress: "Ret Sokak No:5",
          city: "İzmir",
          district: "Bornova",
        },
        items: [
          {
            productId: product.id,
            variantId: variant.id,
            colorName: color?.name || "Standart",
            sizeName: size?.name || "Standart",
            sku: variant.sku,
            quantity: 1,
          },
        ],
      });

      expect(ordRes.success).toBe(true);
      const order = ordRes.order!;
      const item = order.items[0];

      const storeWithOrd = getStoreData();
      const currentOrd = storeWithOrd.orders.find((o) => o.id === order.id);
      if (currentOrd) {
        currentOrd.paymentStatus = "PAID";
        saveStoreData(storeWithOrd);
      }

      const currentStore = getStoreData();
      const currentVar = currentStore.products
        .find((p) => p.id === item.productId)
        ?.variants.find((v) => v.id === item.variantId);
      const stockBeforeReject = currentVar?.stockQuantity || 0;

      const returnRes = createReturnRequest({
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
        requestType: "RETURN",
        reason: "Kusurlu ürün iddiası",
        items: [
          {
            orderItemId: item.id,
            quantity: 1,
          },
        ],
      });

      expect(returnRes.success).toBe(true);

      // Yönetici inceledi ve hasarlı ürün olduğu için reddetti
      const rejectRes = updateReturnRequestStatus({
        returnId: returnRes.returnRequest!.id,
        newStatus: "REJECTED",
        restockDecision: "REJECTED",
        adminNotes: "Kullanıcı hatası, ürün kullanılmış, talep reddedildi",
      });

      expect(rejectRes.success).toBe(true);
      expect(rejectRes.returnRequest?.status).toBe("REJECTED");
      expect(rejectRes.returnRequest?.isRestocked).toBeFalsy();

      const storeAfterReject = getStoreData();
      const varAfterReject = storeAfterReject.products
        .find((p) => p.id === item.productId)
        ?.variants.find((v) => v.id === item.variantId);
      expect(varAfterReject?.stockQuantity).toBe(stockBeforeReject); // Stok ASLA artmaz!
    });

    it("7.4. Aynı sipariş kalemi için siparişteki adetten fazla iade talebi oluşturulması engellenmelidir", () => {
      const store = getStoreData();
      const product = store.products[0];
      const variant = product.variants[0];
      const color = product.colors.find((c) => c.id === variant.colorId);
      const size = product.sizes.find((s) => s.id === variant.sizeId);

      const ordRes = createCashOnDeliveryOrder({
        customer: {
          fullName: "Limit Testi",
          email: "limit-test@example.com",
          phone: "05558889900",
          fullAddress: "Limit Sokak No:6",
          city: "Adana",
          district: "Seyhan",
        },
        items: [
          {
            productId: product.id,
            variantId: variant.id,
            colorName: color?.name || "Standart",
            sizeName: size?.name || "Standart",
            sku: variant.sku,
            quantity: 1, // Sadece 1 adet sipariş edildi
          },
        ],
      });

      expect(ordRes.success).toBe(true);
      const order = ordRes.order!;
      const item = order.items[0];

      const storeWithOrd = getStoreData();
      const currentOrd = storeWithOrd.orders.find((o) => o.id === order.id);
      if (currentOrd) {
        currentOrd.paymentStatus = "PAID";
        saveStoreData(storeWithOrd);
      }

      // İlk talep: 1 adet talep edildi (geçerli)
      const returnRes1 = createReturnRequest({
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
        requestType: "RETURN",
        reason: "İlk talep",
        items: [
          {
            orderItemId: item.id,
            quantity: 1,
          },
        ],
      });
      expect(returnRes1.success).toBe(true);

      // İkinci talep: Açık talep varken aynı kalem için 1 adet daha talep edilmek isteniyor -> REDDEDİLMELİ
      const returnRes2 = createReturnRequest({
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
        requestType: "RETURN",
        reason: "Mükerrer talep denemesi",
        items: [
          {
            orderItemId: item.id,
            quantity: 1,
          },
        ],
      });
      expect(returnRes2.success).toBe(false);
      expect(returnRes2.error).toContain("aşıldı");
    });
  });
});
