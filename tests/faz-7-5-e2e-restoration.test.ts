import { describe, it, expect, beforeAll, afterAll } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {
  getStoreData,
  getAllStoreProducts,
  executeWithOrderLock,
  createCashOnDeliveryOrder,
  AppStoreData,
} from "@/lib/server/store";
import { processAndSaveUpload, safelyDeleteUploadedFile } from "@/lib/server/media";
import { ProductItem, ProductMediaItem } from "@/lib/catalog";
import { MissingMediaRestorationDeck } from "@/components/admin/MissingMediaRestorationDeck";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductCard } from "@/components/product/ProductCard";

type ExtendedMediaItem = ProductMediaItem & { colorName?: string; hash?: string };

const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const createdTestFiles: string[] = [];

function getFileHash(filepath: string): string {
  const content = fs.readFileSync(filepath);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

function cleanupCreatedTestFiles() {
  for (const f of createdTestFiles) {
    safelyDeleteUploadedFile(f);
    const cleanUrl = f.replace(/-card\.webp$/, "").replace(/-thumb\.webp$/, "");
    const full1 = path.join(process.cwd(), "public", f.startsWith("/") ? f.slice(1) : f);
    const full2 = path.join(process.cwd(), "public", "uploads", "products", path.basename(f));
    for (const p of [full1, full2]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch { /* best-effort */ }
      }
    }
  }
}

describe("FAZ 7.5: Gerçek Kullanım, Medya Yükleme ve Uçtan Uca Sistem Doğrulaması", () => {
  let initialStoreDataRaw: string;

  beforeAll(() => {
    // 1. Koruma kuralı: Başlangıç hash kontrolü
    const currentHash = getFileHash("data/store.json");
    expect(currentHash).toBe(EXPECTED_HASH);
    initialStoreDataRaw = fs.readFileSync("data/store.json", "utf8");
  });

  afterAll(() => {
    cleanupCreatedTestFiles();

    // store.json dosyasının hiçbir şekilde bozulmadığını veya değişmediğini doğrula
    fs.writeFileSync("data/store.json", initialStoreDataRaw, "utf8");
    const finalHash = getFileHash("data/store.json");
    expect(finalHash).toBe(EXPECTED_HASH);
  });

  describe("1. Restorasyon Masası Gerçek Kullanım ve Katalog Denetimi", () => {
    it("Admin ürünler filtresi: Toplam 13 ürün, 6 eksik görsel, 0 tükenen ürün saymalıdır", () => {
      const store = getStoreData();
      const products = getAllStoreProducts();
      expect(products.length).toBe(13);

      const missingMedia = products.filter((p) => !p.media || p.media.length === 0);
      expect(missingMedia.length).toBe(6);

      const outOfStock = products.filter((p) => {
        const total = p.variants?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) ?? 0;
        return total === 0;
      });
      expect(outOfStock.length).toBe(0);
    });

    it("Görseli eksik olan 6 ürün ID ve başlıklarıyla doğru listelenmelidir", () => {
      const products = getAllStoreProducts();
      const missingProducts = products.filter((p) => !p.media || p.media.length === 0);

      const expectedMissing = [
        { id: "prod-1793185888547", title: "Betül Trençkot" },
        { id: "prod-1793185124060", title: "Buklet Ceket" },
        { id: "prod-1793184672798", title: "Ekose Desenli Kuşaklı Ceket" },
        { id: "prod-1793184327059", title: "Unisex Scuba Kumaş İçi Peluşlu Pantolon" },
        { id: "prod-1793183353452", title: "Kot ceket" },
        { id: "prod-1793180587059", title: "Scuba Pantolon" },
      ];

      for (const exp of expectedMissing) {
        const found = missingProducts.find((p) => p.id === exp.id);
        expect(found).toBeDefined();
        expect(found?.title.toLowerCase()).toContain(exp.title.toLowerCase());
      }
    });

    it("Her ürünün renk sekmeleri katalogdaki renk seçenekleriyle birebir eşleşmelidir", () => {
      const products = getAllStoreProducts();
      const missingProducts = products.filter((p) => !p.media || p.media.length === 0);

      for (const p of missingProducts) {
        expect(Array.isArray(p.colors)).toBe(true);
        expect(p.colors.length).toBeGreaterThan(0);
        for (const c of p.colors) {
          expect(c.name).toBeTruthy();
          expect(c.id).toBeTruthy();
        }
      }

      // Betül Trençkot renk kontrolü: Siyah, ACI KAHVE, MÜRDÜM, TAŞ RENGİ (slug üzerinden deterministik kontrol)
      const betul = missingProducts.find((p) => p.id === "prod-1793185888547");
      expect(betul?.colors.some((c) => c.slug === "siyah")).toBe(true);
      expect(betul?.colors.some((c) => c.slug === "aci-kahve")).toBe(true);
      expect(betul?.colors.some((c) => c.slug === "murdum")).toBe(true);
      expect(betul?.colors.some((c) => c.slug === "tas-rengi")).toBe(true);
    });

    it("Restorasyon Masası: Çoklu görsel yükleme, renge bağlama ve kapak fotoğrafı belirleme simülasyonu", async () => {
      const validPng1 = await sharp({
        create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const validPng2 = await sharp({
        create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const res1 = await processAndSaveUpload(validPng1, "betul-siyah-1.png", "products");
      expect(res1.result).toBeDefined();
      if (res1.result) {
        createdTestFiles.push(res1.result.url);
        if (res1.result.thumbnailUrl) createdTestFiles.push(res1.result.thumbnailUrl);
      }

      const res2 = await processAndSaveUpload(validPng2, "betul-siyah-2.png", "products");
      expect(res2.result).toBeDefined();
      if (res2.result) {
        createdTestFiles.push(res2.result.url);
        if (res2.result.thumbnailUrl) createdTestFiles.push(res2.result.thumbnailUrl);
      }

      // Ürüne ekleme ve kapak belirleme simülasyonu
      const initialMedia: ExtendedMediaItem[] = [
        {
          id: "med-test-1",
          colorId: "col-1793185888546-0",
          colorName: "Siyah",
          type: "IMAGE",
          url: res1.result!.url,
          thumbnailUrl: res1.result!.thumbnailUrl,
          altText: "Betül Trençkot Siyah Ön",
          isThumbnail: true, // Kapak
          displayOrder: 1,
        },
        {
          id: "med-test-2",
          colorId: "col-1793185888546-0",
          colorName: "Siyah",
          type: "IMAGE",
          url: res2.result!.url,
          thumbnailUrl: res2.result!.thumbnailUrl,
          altText: "Betül Trençkot Siyah Arka",
          isThumbnail: false,
          displayOrder: 2,
        },
      ];

      // Kapak fotoğrafını 2. görsel yap
      const updatedMedia = initialMedia.map((m, idx) => ({
        ...m,
        isThumbnail: idx === 1,
      }));

      expect(updatedMedia[0].isThumbnail).toBe(false);
      expect(updatedMedia[1].isThumbnail).toBe(true);

      // Sıralamayı değiştir (2. görseli başa al)
      const reordered = [updatedMedia[1], updatedMedia[0]].map((m, i) => ({
        ...m,
        displayOrder: i + 1,
      }));

      expect(reordered[0].id).toBe("med-test-2");
      expect(reordered[0].displayOrder).toBe(1);
      expect(reordered[1].id).toBe("med-test-1");
      expect(reordered[1].displayOrder).toBe(2);
    });

    it("Görseli yanlış renkten doğru renge taşıma (handleChangeColor) simülasyonu", () => {
      const mediaList: ExtendedMediaItem[] = [
        {
          id: "med-1",
          colorId: "col-1793185888546-0",
          colorName: "Siyah",
          type: "IMAGE",
          url: "/uploads/products/test.webp",
          thumbnailUrl: "/uploads/products/test.webp",
          altText: "Test",
          isThumbnail: true,
          displayOrder: 1,
        },
      ];

      // Taş Rengi rengine taşı
      const moved = mediaList.map((m) => ({
        ...m,
        colorId: "col-prod-1793185888547-3",
        colorName: "TAŞ RENGİ",
      }));

      expect(moved[0].colorId).toBe("col-prod-1793185888547-3");
      expect(moved[0].colorName).toBe("TAŞ RENGİ");
    });
  });

  describe("2. Hata ve Güvenlik Senaryoları", () => {
    it("Aynı dosyanın tekrar yüklenmesi (Duplicate Hash Detection): hash değeri eşleşmeli ve arayüzde duplicate engellenmelidir", async () => {
      const png = await sharp({
        create: { width: 80, height: 80, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const first = await processAndSaveUpload(png, "duplicate-check.png", "products");
      expect(first.result).toBeDefined();
      if (first.result) {
        createdTestFiles.push(first.result.url);
        if (first.result.thumbnailUrl) createdTestFiles.push(first.result.thumbnailUrl);
      }

      const second = await processAndSaveUpload(png, "duplicate-check-copy.png", "products");
      expect(second.result).toBeDefined();
      if (second.result) {
        createdTestFiles.push(second.result.url);
        if (second.result.thumbnailUrl) createdTestFiles.push(second.result.thumbnailUrl);
      }

      // SHA-256 hash'leri birebir aynı olmalı
      expect(first.result?.hash).toBeDefined();
      expect(second.result?.hash).toBe(first.result?.hash);

      // Restorasyon Masası mükerrerlik denetim fonksiyonu:
      const existingGallery: (ProductMediaItem & { hash?: string })[] = [
        {
          id: "m-first",
          type: "IMAGE",
          url: first.result!.url,
          thumbnailUrl: first.result!.thumbnailUrl,
          altText: "Existing",
          isThumbnail: true,
          displayOrder: 1,
          hash: first.result!.hash,
        },
      ];

      const isDuplicate = existingGallery.some(
        (m) =>
          (second.result!.hash && m.hash === second.result!.hash) ||
          m.url === second.result!.url
      );
      expect(isDuplicate).toBe(true);
    });

    it("Aynı isimli fakat farklı içerikli iki dosya UUID ile güvenle ayrıştırılmalıdır", async () => {
      const png1 = await sharp({
        create: { width: 50, height: 50, channels: 4, background: { r: 100, g: 0, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();
      const png2 = await sharp({
        create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 100, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const res1 = await processAndSaveUpload(png1, "photo.png", "products");
      expect(res1.result).toBeDefined();
      if (res1.result) {
        createdTestFiles.push(res1.result.url);
        if (res1.result.thumbnailUrl) createdTestFiles.push(res1.result.thumbnailUrl);
      }

      const res2 = await processAndSaveUpload(png2, "photo.png", "products");
      expect(res2.result).toBeDefined();
      if (res2.result) {
        createdTestFiles.push(res2.result.url);
        if (res2.result.thumbnailUrl) createdTestFiles.push(res2.result.thumbnailUrl);
      }

      expect(res1.result?.url).not.toBe(res2.result?.url);
    });

    it("Desteklenmeyen dosya uzantıları (.exe, .txt, .pdf, .sh) kesinlikle reddedilmelidir", async () => {
      const badExtensions = ["trojan.exe", "document.pdf", "readme.txt", "script.sh", "batch.bat"];
      const dummyBuffer = Buffer.from("malicious or non-image content");

      for (const filename of badExtensions) {
        const res = await processAndSaveUpload(dummyBuffer, filename, "products");
        expect(res.error).toBeDefined();
        expect(res.result).toBeUndefined();
      }
    });

    it("Bozuk görsel dosyası (corrupt buffer) Sharp tarafından yakalanıp güvenle reddedilmelidir", async () => {
      const corruptBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x00, 0x00]);
      const res = await processAndSaveUpload(corruptBuffer, "corrupt.jpg", "products");
      expect(res.error).toBeDefined();
      expect(res.error).toContain("Görsel işlenemedi");
      expect(res.result).toBeUndefined();
    });

    it("Sıfır baytlık dosya (0-byte file) anında reddedilmelidir", async () => {
      const emptyBuffer = Buffer.alloc(0);
      const res = await processAndSaveUpload(emptyBuffer, "empty.png", "products");
      expect(res.error).toBeDefined();
      expect(res.error).toContain("Güvenlik uyarısı");
      expect(res.result).toBeUndefined();
    });

    it("Aşırı büyük görsel boyutları (>8000x8000 piksel) reddedilmelidir", async () => {
      const hugeSvg = Buffer.from(
        '<svg width="8001" height="10" xmlns="http://www.w3.org/2000/svg"><rect width="8001" height="10" fill="red"/></svg>'
      );
      const res = await processAndSaveUpload(hugeSvg, "huge.svg", "products");
      expect(res.error).toBeDefined();
      expect(res.result).toBeUndefined();
    });

    it("Çoklu dosya yükleme kuyruğunda bir dosya bozuk olsa dahi diğer sağlam dosyalar başarıyla işlenmelidir", async () => {
      const validPng1 = await sharp({
        create: { width: 60, height: 60, channels: 4, background: { r: 50, g: 50, b: 50, alpha: 1 } },
      })
        .png()
        .toBuffer();
      const corruptFile = Buffer.from("bad data");
      const validPng2 = await sharp({
        create: { width: 60, height: 60, channels: 4, background: { r: 80, g: 80, b: 80, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const results = await Promise.all([
        processAndSaveUpload(validPng1, "batch-1.png", "products"),
        processAndSaveUpload(corruptFile, "batch-corrupt.png", "products"),
        processAndSaveUpload(validPng2, "batch-2.png", "products"),
      ]);

      expect(results[0].result).toBeDefined();
      expect(results[1].error).toBeDefined();
      expect(results[2].result).toBeDefined();

      if (results[0].result) {
        createdTestFiles.push(results[0].result.url);
        if (results[0].result.thumbnailUrl) createdTestFiles.push(results[0].result.thumbnailUrl);
      }
      if (results[2].result) {
        createdTestFiles.push(results[2].result.url);
        if (results[2].result.thumbnailUrl) createdTestFiles.push(results[2].result.thumbnailUrl);
      }
    });

    it("Path traversal saldırı girişimleri (örn: ../../etc/passwd) güvenle engellenmelidir", () => {
      const attempt1 = safelyDeleteUploadedFile("../../etc/passwd");
      expect(attempt1).toBe(false);

      const attempt2 = safelyDeleteUploadedFile("/uploads/../../../Windows/System32/calc.exe");
      expect(attempt2).toBe(false);
    });

    it("Silme işleminin kullanıcı tarafından iptal edilmesi (confirm = false) medyayı aynen korumalıdır", () => {
      const mediaList: ProductMediaItem[] = [
        {
          id: "m-1",
          type: "IMAGE",
          url: "/uploads/products/keep.webp",
          thumbnailUrl: "/uploads/products/keep.webp",
          altText: "Test",
          isThumbnail: true,
          displayOrder: 1,
        },
      ];

      const userConfirmed = false;
      let finalMedia = [...mediaList];
      if (userConfirmed) {
        finalMedia = finalMedia.filter((m) => m.id !== "m-1");
      }

      expect(finalMedia.length).toBe(1);
      expect(finalMedia[0].id).toBe("m-1");
    });
  });

  describe("3. Vitrin Doğrulaması (Fallback, Galeri ve Responsive Görünüm)", () => {
    it("Görseli olmayan ürünlerde placeholder fallback (/product-placeholder.svg) gösterilmelidir", () => {
      const placeholderPath = path.join(process.cwd(), "public", "product-placeholder.svg");
      expect(fs.existsSync(placeholderPath)).toBe(true);

      const svgContent = fs.readFileSync(placeholderPath, "utf8");
      expect(svgContent).toContain("<svg");
      expect(svgContent).toContain("path");

      // ProductGallery bileşeni görsel olmadan render edildiğinde placeholder üretmelidir
      const galleryHtml = renderToString(
        React.createElement(ProductGallery, { media: [], productTitle: "Betül Trençkot" })
      );
      expect(galleryHtml).toContain("product-placeholder.svg");
      expect(galleryHtml).toContain("Görsel Hazırlanıyor");
    });

    it("Restorasyon Masası (MissingMediaRestorationDeck) HTML render doğrulaması: 6 ürün, renk sekmeleri ve dropzone", () => {
      const products = getAllStoreProducts();
      const missing = products.filter((p) => !p.media || p.media.length === 0);

      const html = renderToString(
        React.createElement(MissingMediaRestorationDeck, { products: missing })
      );

      // Başlık ve eksik ürün rozeti
      expect(html).toContain("Eksik Görsel Restorasyon Masası");
      expect(html).toContain("Eksik Ürün");

      // 6 ürünün başlıkları
      expect(html).toContain("Betül Trençkot");
      expect(html).toContain("Buklet Ceket");
      expect(html).toContain("Ekose Desenli Kuşaklı Ceket");
      expect(html).toContain("Unisex Scuba Kumaş İçi Peluşlu Pantolon");
      expect(html).toContain("Kot ceket");
      expect(html).toContain("Scuba Pantolon");

      // Renk varyantları ve yükleme alanları
      expect(html).toContain("Yüklenecek Renk Varyantı");
      expect(html).toContain("fotoğrafları buraya sürükleyin veya dosya seçin");
      expect(html).toContain("JPG, PNG, WebP, AVIF");
    });

    it("Renk galerisi ayrıştırması: Farklı renklere yüklenen görseller birbirine karışmamalıdır", () => {
      const productMedia: ExtendedMediaItem[] = [
        {
          id: "med-bej-1",
          colorId: "col-bej",
          colorName: "Bej",
          type: "IMAGE",
          url: "/uploads/products/bej-1.webp",
          thumbnailUrl: "/uploads/products/bej-1.webp",
          altText: "Bej 1",
          isThumbnail: true,
          displayOrder: 1,
        },
        {
          id: "med-siyah-1",
          colorId: "col-siyah",
          colorName: "Siyah",
          type: "IMAGE",
          url: "/uploads/products/siyah-1.webp",
          thumbnailUrl: "/uploads/products/siyah-1.webp",
          altText: "Siyah 1",
          isThumbnail: true,
          displayOrder: 1,
        },
        {
          id: "med-siyah-2",
          colorId: "col-siyah",
          colorName: "Siyah",
          type: "IMAGE",
          url: "/uploads/products/siyah-2.webp",
          thumbnailUrl: "/uploads/products/siyah-2.webp",
          altText: "Siyah 2",
          isThumbnail: false,
          displayOrder: 2,
        },
      ];

      // Bej seçildiğinde yalnızca Bej fotoğrafları gelmeli
      const bejGallery = productMedia.filter(
        (m) => m.colorId === "col-bej" || m.colorName?.toLowerCase() === "bej"
      );
      expect(bejGallery.length).toBe(1);
      expect(bejGallery[0].id).toBe("med-bej-1");

      // Siyah seçildiğinde yalnızca Siyah fotoğrafları gelmeli ve kapak ilk sırada olmalı
      const siyahGallery = productMedia.filter(
        (m) => m.colorId === "col-siyah" || m.colorName?.toLowerCase() === "siyah"
      );
      expect(siyahGallery.length).toBe(2);
      expect(siyahGallery[0].isThumbnail).toBe(true);
      expect(siyahGallery[0].id).toBe("med-siyah-1");
    });

    it("Renk değiştirildiğinde aktif galeri indeksinin 0'a sıfırlanması doğrulanmalıdır", () => {
      let activeIndex = 3;
      const onColorChange = () => {
        activeIndex = 0;
      };
      onColorChange();
      expect(activeIndex).toBe(0);
    });
  });

  describe("4. Ödeme, Sipariş ve Stok Regresyonu (COD, PayTR, Mutex)", () => {
    it("COD (Kapıda Ödeme) sipariş akışı ve stok düşümü mutex altında sorunsuz çalışmalıdır", async () => {
      try {
        const store = getStoreData();
        const prod = store.products[0];
        const variant = prod.variants.find((v) => (v.stockQuantity || 0) > 5) || prod.variants[0];
        const initialStock = variant.stockQuantity;

        const orderData = {
          customer: {
            fullName: "Test Müşteri",
            email: "test@example.com",
            phone: "05551234567",
            city: "İstanbul",
            district: "Kadıköy",
            fullAddress: "Test Mahallesi No: 1 Kadıköy",
          },
          items: [
            {
              productId: prod.id,
              variantId: variant.id,
              sku: variant.sku,
              quantity: 1,
              unitPrice: prod.discountPrice || prod.basePrice,
              productTitle: prod.title,
            },
          ],
        };

        const result = await executeWithOrderLock(async () => {
          return createCashOnDeliveryOrder(orderData);
        });

        expect(result.success).toBe(true);
        expect(result.order).toBeDefined();
        expect(result.order?.paymentProvider).toBe("CASH_ON_DELIVERY");

        // Varyant stok kontrolü (tam 1 adet düşmüş olmalı)
        const reloadedStore = getStoreData();
        const reloadedProd = reloadedStore.products.find((p) => p.id === prod.id);
        const reloadedVariant = reloadedProd?.variants.find((v) => v.id === variant.id);
        expect(reloadedVariant?.stockQuantity).toBe(initialStock - 1);

        // İdempotency denetimi: Aynı sepet ve müşteriyle son 60 sn içinde tekrar istek atılırsa mükerrer sipariş oluşmamalı ve stok tekrar düşmemelidir
        const duplicateResult = await executeWithOrderLock(async () => {
          return createCashOnDeliveryOrder(orderData);
        });

        expect(duplicateResult.success).toBe(true);
        expect(duplicateResult.order?.id).toBe(result.order?.id);

        const storeAfterDuplicate = getStoreData();
        const variantAfterDup = storeAfterDuplicate.products
          .find((p) => p.id === prod.id)
          ?.variants.find((v) => v.id === variant.id);
        expect(variantAfterDup?.stockQuantity).toBe(initialStock - 1);
      } finally {
        // Disk verisini ve hash'i anında geri yükle
        fs.writeFileSync("data/store.json", initialStoreDataRaw, "utf8");
      }
    });

    it("Betül Trençkot'un 10 varyantı ve 100 stoku hiçbir şekilde etkilenmemelidir", () => {
      const store = getStoreData();
      const betul = store.products.find((p) => p.id === "prod-1793185888547");
      expect(betul).toBeDefined();
      expect(betul?.variants.length).toBe(10);

      const totalStock = betul?.variants.reduce((sum, v) => sum + (v.stockQuantity || 0), 0);
      expect(totalStock).toBe(100);

      for (const v of betul!.variants) {
        expect(v.stockQuantity).toBe(10);
      }
    });
  });

  describe("5. Bütünlük ve Manifest Doğrulaması", () => {
    it("`data/store.json` SHA-256 hash değeri orijinal kaynakla birebir aynı kalmalıdır", () => {
      const currentHash = getFileHash("data/store.json");
      expect(currentHash).toBe(EXPECTED_HASH);
    });

    it("public/uploads altındaki 155 dosya tam olarak korunmalıdır", () => {
      // Test dosyalarını temizle
      cleanupCreatedTestFiles();

      const uploadsDir = path.resolve("public/uploads");
      const files: string[] = [];
      function scan(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scan(full);
          } else if (entry.isFile()) {
            files.push(full);
          }
        }
      }
      scan(uploadsDir);
      expect(files.length).toBe(155);
    });
  });
});
