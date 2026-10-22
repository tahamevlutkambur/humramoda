import fs from "node:fs";
import path from "node:path";
import heicConvert from "heic-convert";
import sharp from "sharp";

interface DerivativeConfig {
  suffix: string;
  width: number;
  height?: number;
  quality: number;
}

const DERIVATIVE_SIZES: DerivativeConfig[] = [
  { suffix: "thumb", width: 240, height: 320, quality: 80 },
  { suffix: "card", width: 640, height: 853, quality: 85 },
  { suffix: "detail", width: 1440, quality: 85 },
];

export interface ProcessedAsset {
  originalFileName: string;
  baseName: string;
  originalSizeBytes: number;
  width: number;
  height: number;
  derivatives: {
    format: "webp" | "avif";
    size: "thumb" | "card" | "detail";
    path: string;
    url: string;
    sizeBytes: number;
  }[];
  processedAt: string;
}

export interface MediaManifest {
  version: string;
  generatedAt: string;
  sourceDirectory: string;
  assets: ProcessedAsset[];
}

export async function processAllImages(
  sourceDir = path.join(process.cwd(), "humraresimler"),
  outputBaseDir = path.join(process.cwd(), "public", "uploads", "products")
) {
  console.log("==================================================");
  console.log("Hümra Moda — Tekrarlanabilir Medya Dönüştürücü");
  console.log(`Kaynak Dizin:  ${sourceDir}`);
  console.log(`Çıktı Dizini:  ${outputBaseDir}`);
  console.log("==================================================");

  if (!fs.existsSync(sourceDir)) {
    console.warn(`[UYARI] Kaynak dizin bulunamadı: ${sourceDir}`);
    return { success: false, processed: 0, skipped: 0, failed: 0 };
  }

  // Çıktı klasörlerini oluştur
  fs.mkdirSync(outputBaseDir, { recursive: true });

  const files = fs.readdirSync(sourceDir).filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return ext === ".heic" || ext === ".heif" || ext === ".jpg" || ext === ".jpeg" || ext === ".png";
  });

  console.log(`Toplam işlenecek kaynak görsel: ${files.length}`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const processedAssets: ProcessedAsset[] = [];

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const sourceFilePath = path.join(sourceDir, fileName);
    const baseName = path.parse(fileName).name;
    const ext = path.extname(fileName).toLowerCase();

    console.log(`\n[${i + 1}/${files.length}] İşleniyor: ${fileName}`);

    try {
      // 1. Zaten dönüştürülmüş mü kontrol et (Idempotency)
      const detailWebpPath = path.join(outputBaseDir, `${baseName}-detail.webp`);
      const detailAvifPath = path.join(outputBaseDir, `${baseName}-detail.avif`);

      if (fs.existsSync(detailWebpPath) && fs.existsSync(detailAvifPath)) {
        console.log(`  -> Zaten mevcut, atlanıyor: ${baseName}`);
        skipCount++;

        const metadata = await sharp(detailWebpPath).metadata();
        const existingDerivatives: ProcessedAsset["derivatives"] = [];

        for (const config of DERIVATIVE_SIZES) {
          const webpName = `${baseName}-${config.suffix}.webp`;
          const webpPath = path.join(outputBaseDir, webpName);
          if (fs.existsSync(webpPath)) {
            existingDerivatives.push({
              format: "webp",
              size: config.suffix as "thumb" | "card" | "detail",
              path: webpPath,
              url: `/uploads/products/${webpName}`,
              sizeBytes: fs.statSync(webpPath).size,
            });
          }

          const avifName = `${baseName}-${config.suffix}.avif`;
          const avifPath = path.join(outputBaseDir, avifName);
          if (fs.existsSync(avifPath)) {
            existingDerivatives.push({
              format: "avif",
              size: config.suffix as "thumb" | "card" | "detail",
              path: avifPath,
              url: `/uploads/products/${avifName}`,
              sizeBytes: fs.statSync(avifPath).size,
            });
          }
        }

        processedAssets.push({
          originalFileName: fileName,
          baseName,
          originalSizeBytes: fs.statSync(sourceFilePath).size,
          width: metadata.width || 0,
          height: metadata.height || 0,
          derivatives: existingDerivatives,
          processedAt: new Date().toISOString(),
        });
        continue;
      }

      // 2. Kaynak dosyayı oku
      const inputBuffer = fs.readFileSync(sourceFilePath);
      let standardBuffer: Buffer;

      // 3. HEIC ise JPEG arabelleğine aç (Pure JS/WASM libheif ile)
      if (ext === ".heic" || ext === ".heif") {
        console.log("  -> HEIC kod çözümü yapılıyor (heic-convert)...");
        const converted = await heicConvert({
          buffer: inputBuffer,
          format: "JPEG",
          quality: 0.95,
        });
        standardBuffer = Buffer.from(converted);
      } else {
        standardBuffer = inputBuffer;
      }

      // 4. Sharp ile boyutları ve kırılımları üret
      const imageInstance = sharp(standardBuffer);
      const meta = await imageInstance.metadata();
      const origWidth = meta.width || 1200;
      const origHeight = meta.height || 1600;

      const assetDerivatives: ProcessedAsset["derivatives"] = [];

      for (const config of DERIVATIVE_SIZES) {
        // Asla yapay olarak büyütme (upscale yapma)
        const targetWidth = Math.min(config.width, origWidth);

        // WebP formatı
        const webpFileName = `${baseName}-${config.suffix}.webp`;
        const webpOutputPath = path.join(outputBaseDir, webpFileName);

        const webpPipeline = sharp(standardBuffer).resize({
          width: targetWidth,
          height: config.height && origWidth > config.width ? config.height : undefined,
          fit: config.height ? "cover" : "inside",
          withoutEnlargement: true,
        });

        await webpPipeline.webp({ quality: config.quality, effort: 4 }).toFile(webpOutputPath);

        assetDerivatives.push({
          format: "webp",
          size: config.suffix as "thumb" | "card" | "detail",
          path: webpOutputPath,
          url: `/uploads/products/${webpFileName}`,
          sizeBytes: fs.statSync(webpOutputPath).size,
        });

        // AVIF formatı (Destekleniyorsa)
        try {
          const avifFileName = `${baseName}-${config.suffix}.avif`;
          const avifOutputPath = path.join(outputBaseDir, avifFileName);

          const avifPipeline = sharp(standardBuffer).resize({
            width: targetWidth,
            height: config.height && origWidth > config.width ? config.height : undefined,
            fit: config.height ? "cover" : "inside",
            withoutEnlargement: true,
          });

          await avifPipeline.avif({ quality: config.quality - 5, effort: 4 }).toFile(avifOutputPath);

          assetDerivatives.push({
            format: "avif",
            size: config.suffix as "thumb" | "card" | "detail",
            path: avifOutputPath,
            url: `/uploads/products/${avifFileName}`,
            sizeBytes: fs.statSync(avifOutputPath).size,
          });
        } catch (avifErr) {
          console.warn(`  [BİLGİ] AVIF dönüştürme atlandı (${fileName}):`, (avifErr as Error).message);
        }
      }

      processedAssets.push({
        originalFileName: fileName,
        baseName,
        originalSizeBytes: inputBuffer.length,
        width: origWidth,
        height: origHeight,
        derivatives: assetDerivatives,
        processedAt: new Date().toISOString(),
      });

      console.log(`  ✔ Başarıyla üretildi: ${baseName} (WebP & AVIF)`);
      successCount++;
    } catch (err) {
      console.error(`  ✖ Hata oluştu (${fileName}):`, (err as Error).message);
      failCount++;
    }
  }

  // 5. Manifest dosyasını kaydet
  const manifest: MediaManifest = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    sourceDirectory: sourceDir,
    assets: processedAssets,
  };

  const manifestPath = path.join(outputBaseDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`\nManifest kaydedildi: ${manifestPath}`);

  console.log("\n==================================================");
  console.log("Medya İşleme Tamamlandı:");
  console.log(`  Başarılı: ${successCount}`);
  console.log(`  Atlanan (Mevcut): ${skipCount}`);
  console.log(`  Hatalı: ${failCount}`);
  console.log("==================================================");

  return {
    success: failCount === 0,
    processed: successCount,
    skipped: skipCount,
    failed: failCount,
  };
}

// Doğrudan çalıştırıldığında tetikle
if (require.main === module) {
  processAllImages()
    .then((res) => {
      process.exit(res.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("Beklenmeyen hata:", err);
      process.exit(1);
    });
}
