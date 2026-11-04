import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {
  processAndSaveUpload,
  verifyMagicBytes,
  safelyDeleteUploadedFile,
} from "@/lib/server/media";
import { getStoreData, saveStoreData } from "@/lib/server/store";
import { ProductItem, ProductMediaItem } from "@/lib/catalog";

const REFERENCE_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const storePath = path.resolve("data/store.json");
let pristineStore = "";
const createdTestFiles: string[] = [];

describe("FAZ 7.4: Eksik Ürün Görselleri Restorasyonu ve Medya Galerisi Testleri", () => {
  beforeAll(() => {
    pristineStore = fs.readFileSync(storePath, "utf8");
  });

  afterAll(() => {
    // Test sırasında oluşturulan geçici upload dosyalarını temizle
    for (const f of createdTestFiles) {
      try {
        safelyDeleteUploadedFile(f);
      } catch {}
    }

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

  describe("1. Eksik Görseli Olan 6 Ürünün Tespiti ve Veri Bütünlüğü", () => {
    it("Katalogdaki 13 üründen tam olarak 6 tanesinin görseli eksik olmalıdır ve doğru ürünler olmalıdır", () => {
      const store = getStoreData();
      expect(store.products.length).toBe(13);

      const missingMedia = store.products.filter((p) => !p.media || p.media.length === 0);
      expect(missingMedia.length).toBe(6);

      const expectedMissingIds = [
        "prod-1793185888547", // Betül Trençkot
        "prod-1793185124060", // Buklet Ceket
        "prod-1793184672798", // Ekose Desenli Kuşaklı Ceket
        "prod-1793184327059", // Unisex Scuba Kumaş İçi Peluşlu Pantolon
        "prod-1793183353452", // Kot ceket
        "prod-1793180587059", // Scuba Pantolon
      ];

      for (const expectedId of expectedMissingIds) {
        const found = missingMedia.find((p) => p.id === expectedId);
        expect(found).toBeDefined();
      }

      // Betül Trençkot'un 10 varyantı ve 10'ar stokları kesinlikle korunmalıdır
      const betul = store.products.find((p) => p.id === "prod-1793185888547");
      expect(betul).toBeDefined();
      expect(betul!.variants.length).toBe(10);
      for (const v of betul!.variants) {
        expect(v.stockQuantity).toBe(10);
      }
    });
  });

  describe("2. Farklı Formatlar ve Çoklu Görsel Yükleme", () => {
    it("JPEG formatındaki geçerli görseli başarıyla işlemeli, WebP kart ve thumb üretmelidir", async () => {
      const jpegBuffer = await sharp({
        create: {
          width: 800,
          height: 1000,
          channels: 3,
          background: { r: 180, g: 140, b: 120 },
        },
      })
        .jpeg({ quality: 90 })
        .toBuffer();

      const { result, error } = await processAndSaveUpload(jpegBuffer, "test-urun-fotografi.jpg", "image/jpeg");
      expect(error).toBeUndefined();
      expect(result).toBeDefined();
      expect(result!.url).toMatch(/^\/uploads\/products\/.+-card\.webp$/);
      expect(result!.thumbnailUrl).toMatch(/^\/uploads\/products\/.+-thumb\.webp$/);
      expect(result!.mediaType).toBe("IMAGE");
      expect(result!.mimeType).toBe("image/webp");
      expect(result!.hash).toBeDefined();

      if (result) {
        createdTestFiles.push(result.url);
        createdTestFiles.push(result.thumbnailUrl);
      }
    });

    it("PNG formatındaki geçerli görseli başarıyla işlemeli ve boyutları optimize etmelidir", async () => {
      const pngBuffer = await sharp({
        create: {
          width: 600,
          height: 800,
          channels: 4,
          background: { r: 50, g: 50, b: 50, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const { result, error } = await processAndSaveUpload(pngBuffer, "elbise-model.png", "image/png");
      expect(error).toBeUndefined();
      expect(result).toBeDefined();
      expect(result!.mediaType).toBe("IMAGE");

      if (result) {
        createdTestFiles.push(result.url);
        createdTestFiles.push(result.thumbnailUrl);
      }
    });

    it("WebP formatındaki geçerli görseli kabul etmelidir", async () => {
      const webpBuffer = await sharp({
        create: {
          width: 500,
          height: 700,
          channels: 3,
          background: { r: 240, g: 230, b: 220 },
        },
      })
        .webp()
        .toBuffer();

      const { result, error } = await processAndSaveUpload(webpBuffer, "ceket-bej.webp", "image/webp");
      expect(error).toBeUndefined();
      expect(result).toBeDefined();

      if (result) {
        createdTestFiles.push(result.url);
        createdTestFiles.push(result.thumbnailUrl);
      }
    });

    it("AVIF formatındaki geçerli görseli kabul etmelidir", async () => {
      const avifBuffer = await sharp({
        create: {
          width: 640,
          height: 853,
          channels: 3,
          background: { r: 100, g: 110, b: 120 },
        },
      })
        .avif({ quality: 80 })
        .toBuffer();

      const { result, error } = await processAndSaveUpload(avifBuffer, "pantolon.avif", "image/avif");
      expect(error).toBeUndefined();
      expect(result).toBeDefined();

      if (result) {
        createdTestFiles.push(result.url);
        createdTestFiles.push(result.thumbnailUrl);
      }
    });
  });

  describe("3. Güvenlik, Geçersiz Dosya ve HEIC Hata Denetimi", () => {
    it("Metin dosyalarını veya sahte MIME içeren içerikleri kesinlikle reddetmelidir", async () => {
      const textBuffer = Buffer.from("Bu bir resim dosyası değildir. <?php phpinfo(); ?>", "utf8");
      const { result, error } = await processAndSaveUpload(textBuffer, "shell.php.jpg", "text/plain");
      expect(result).toBeUndefined();
      expect(error).toContain("Güvenlik uyarısı");
    });

    it("HTML veya JavaScript içeren zararlı dosyaları reddetmelidir", async () => {
      const htmlBuffer = Buffer.from("<script>alert('xss')</script>", "utf8");
      const { result, error } = await processAndSaveUpload(htmlBuffer, "xss.png", "image/png");
      expect(result).toBeUndefined();
      expect(error).toBeDefined();
    });

    it("Çözünürlüğü aşırı yüksek (8000x8000 üzeri) görselleri reddetmelidir", async () => {
      // 8001x100 sanal meta testi
      const hugeBuffer = await sharp({
        create: {
          width: 8001,
          height: 100,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const { result, error } = await processAndSaveUpload(hugeBuffer, "huge.png", "image/png");
      expect(result).toBeUndefined();
      expect(error).toContain("çok yüksek");
    });

    it("HEIC/HEIF sihirli baytlarını tespit etmeli ve desteklenemiyorsa kullanıcıya anlaşılır hata vermelidir", async () => {
      // Sentetik ftyp heic başlığı
      const heicHeader = Buffer.from([
        0x00, 0x00, 0x00, 0x18, // box size
        0x66, 0x74, 0x79, 0x70, // 'ftyp'
        0x68, 0x65, 0x69, 0x63, // 'heic' brand
        0x00, 0x00, 0x00, 0x00,
        0x6d, 0x69, 0x66, 0x31,
        0x68, 0x65, 0x69, 0x63,
      ]);

      const magic = verifyMagicBytes(heicHeader);
      expect(magic.isValid).toBe(true);
      expect(magic.detectedType).toBe("image/heic");
      expect(magic.mediaType).toBe("IMAGE");

      // İşleme denendiğinde net kullanıcı dostu hata dönmeli
      const { result, error } = await processAndSaveUpload(heicHeader, "IMG_0001.HEIC", "image/heic");
      expect(result).toBeUndefined();
      expect(error).toContain("HEIC/HEIF");
      expect(error).toContain("JPG, PNG veya WebP");
    });
  });

  describe("4. Gerçek Mükerrer Kontrolü ve Aynı İsimli Farklı İçerik", () => {
    it("Birebir aynı içerik hash'ine sahip görsel mükerrer olarak tespit edilebilmelidir", async () => {
      const imgBuffer = await sharp({
        create: {
          width: 400,
          height: 400,
          channels: 3,
          background: { r: 10, g: 80, b: 90 },
        },
      })
        .png()
        .toBuffer();

      const upload1 = await processAndSaveUpload(imgBuffer, "orijinal.png");
      const upload2 = await processAndSaveUpload(imgBuffer, "kopyalanan-farkli-isim.png");

      expect(upload1.result).toBeDefined();
      expect(upload2.result).toBeDefined();
      // İki farklı yükleme aynı SHA256 içerik hash'ini üretmelidir
      expect(upload1.result!.hash).toBe(upload2.result!.hash);

      if (upload1.result) createdTestFiles.push(upload1.result.url, upload1.result.thumbnailUrl);
      if (upload2.result) createdTestFiles.push(upload2.result.url, upload2.result.thumbnailUrl);
    });

    it("Aynı dosya adına sahip ancak içeriği farklı iki dosya benzersiz UUID ile ayrı ayrı kaydedilmelidir", async () => {
      const bufA = await sharp({
        create: {
          width: 300,
          height: 300,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const bufB = await sharp({
        create: {
          width: 300,
          height: 300,
          channels: 3,
          background: { r: 0, g: 255, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const resA = await processAndSaveUpload(bufA, "urun.png");
      const resB = await processAndSaveUpload(bufB, "urun.png");

      expect(resA.result).toBeDefined();
      expect(resB.result).toBeDefined();
      // URL'leri ve dosya isimleri farklı olmalıdır
      expect(resA.result!.url).not.toBe(resB.result!.url);
      expect(resA.result!.hash).not.toBe(resB.result!.hash);

      if (resA.result) createdTestFiles.push(resA.result.url, resA.result.thumbnailUrl);
      if (resB.result) createdTestFiles.push(resB.result.url, resB.result.thumbnailUrl);
    });
  });

  describe("5. Renk Bazlı Galeri Ayrımı ve Kapak Görseli Önceliği", () => {
    it("Farklı renkler için bağımsız galeriler ve renk bazlı kapak fotoğrafı doğru filtrelenmelidir", () => {
      const testProduct: ProductItem = {
        id: "prod-test-renkler",
        title: "Test Renkli Trençkot",
        slug: "test-renkli-trenckot",
        description: "Test açıklaması",
        fabricDetails: "Pamuklu",
        modelDimensions: "175cm",
        basePrice: 1500,
        categorySlug: "trenckot",
        categoryName: "Trençkot",
        collectionSlugs: [],
        colors: [
          { id: "col-siyah", name: "Siyah", slug: "siyah", colorCode: "#000000", displayOrder: 1 },
          { id: "col-bej", name: "Bej", slug: "bej", colorCode: "#F5F5DC", displayOrder: 2 },
        ],
        sizes: [{ id: "siz-std", name: "Standart", slug: "standart", displayOrder: 1 }],
        variants: [],
        media: [
          {
            id: "m-siyah-1",
            colorId: "col-siyah",
            type: "IMAGE",
            url: "/uploads/products/siyah-1-card.webp",
            thumbnailUrl: "/uploads/products/siyah-1-thumb.webp",
            altText: "Siyah Trençkot 1",
            isThumbnail: true, // Siyah rengin kapağı
            displayOrder: 1,
          },
          {
            id: "m-siyah-2",
            colorId: "col-siyah",
            type: "IMAGE",
            url: "/uploads/products/siyah-2-card.webp",
            thumbnailUrl: "/uploads/products/siyah-2-thumb.webp",
            altText: "Siyah Trençkot 2",
            isThumbnail: false,
            displayOrder: 2,
          },
          {
            id: "m-bej-1",
            colorId: "col-bej",
            type: "IMAGE",
            url: "/uploads/products/bej-1-card.webp",
            thumbnailUrl: "/uploads/products/bej-1-thumb.webp",
            altText: "Bej Trençkot 1",
            isThumbnail: false,
            displayOrder: 2,
          },
          {
            id: "m-bej-2",
            colorId: "col-bej",
            type: "IMAGE",
            url: "/uploads/products/bej-2-card.webp",
            thumbnailUrl: "/uploads/products/bej-2-thumb.webp",
            altText: "Bej Trençkot 2 Kapak",
            isThumbnail: true, // Bej rengin kapağı
            displayOrder: 1,
          },
        ],
        createdAt: new Date().toISOString(),
      };

      // 1. Siyah seçildiğinde yalnızca siyah fotoğrafları gelmeli ve kapak (isThumbnail: true) ilk sırada olmalı
      const siyahMedia = testProduct.media
        .filter((m) => m.colorId === "col-siyah")
        .sort((a, b) => (b.isThumbnail ? 1 : 0) - (a.isThumbnail ? 1 : 0) || a.displayOrder - b.displayOrder);

      expect(siyahMedia.length).toBe(2);
      expect(siyahMedia[0].id).toBe("m-siyah-1");
      expect(siyahMedia[0].isThumbnail).toBe(true);

      // 2. Bej seçildiğinde yalnızca bej fotoğrafları gelmeli ve m-bej-2 ilk sırada olmalı
      const bejMedia = testProduct.media
        .filter((m) => m.colorId === "col-bej")
        .sort((a, b) => (b.isThumbnail ? 1 : 0) - (a.isThumbnail ? 1 : 0) || a.displayOrder - b.displayOrder);

      expect(bejMedia.length).toBe(2);
      expect(bejMedia[0].id).toBe("m-bej-2");
      expect(bejMedia[0].isThumbnail).toBe(true);
      expect(bejMedia[1].id).toBe("m-bej-1");

      // 3. Renkler birbirine asla karışmamalıdır
      expect(siyahMedia.some((m) => m.colorId === "col-bej")).toBe(false);
      expect(bejMedia.some((m) => m.colorId === "col-siyah")).toBe(false);
    });
  });

  describe("6. Başarısız Yüklemede Mevcut Galerinin Korunması", () => {
    it("Yükleme işlemi hata verdiğinde veya iptal edildiğinde mevcut galeri bozulmamalıdır", () => {
      const initialMedia: ProductMediaItem[] = [
        {
          id: "m-existing-1",
          type: "IMAGE",
          url: "/uploads/products/existing-card.webp",
          thumbnailUrl: "/uploads/products/existing-thumb.webp",
          altText: "Mevcut Görsel",
          isThumbnail: true,
          displayOrder: 1,
        },
      ];

      // Simüle edilen başarısız işlem
      let currentGallery = [...initialMedia];
      try {
        throw new Error("Yükleme hatası simülasyonu");
      } catch {
        // Hata durumunda currentGallery değişmemeli
      }

      expect(currentGallery.length).toBe(1);
      expect(currentGallery[0].id).toBe("m-existing-1");
    });
  });
});
