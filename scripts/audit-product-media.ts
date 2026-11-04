import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

interface AuditResult {
  generatedAt: string;
  source: string;
  totalProductsScanned: number;
  totalMediaReferences: number;
  localUploadReferences: number;
  accessibleFilesCount: number;
  missingFilesCount: number;
  corruptedFilesCount: number;
  mimeMismatchCount: number;
  duplicateFilesCount: number;
  missingColorGalleriesCount: number;
  sharedFilesAcrossProductsCount: number;
  missingFiles: Array<{
    productId: string;
    productTitle: string;
    mediaUrl: string;
    field: string;
  }>;
  corruptedFiles: Array<{
    filePath: string;
    error: string;
  }>;
  mimeMismatches: Array<{
    filePath: string;
    extension: string;
    detectedMime: string;
  }>;
  duplicateFiles: Array<{
    hash: string;
    files: string[];
  }>;
  missingColorGalleries: Array<{
    productId: string;
    productTitle: string;
    colorId: string;
    colorName: string;
  }>;
  sharedFilesAcrossProducts: Array<{
    mediaUrl: string;
    productIds: string[];
    productTitles: string[];
  }>;
}

function getMagicMime(buffer: Buffer): string {
  if (buffer.length < 4) return "application/octet-stream";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
    if (["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].some(b => brand.startsWith(b))) return "image/heic";
    return "video/mp4";
  }
  return "application/octet-stream";
}

async function runMediaAudit(): Promise<void> {
  const root = process.cwd();
  const storePath = path.join(root, "data", "store.json");
  const uploadsDir = path.join(root, "public", "uploads");
  const reportPath = path.join(root, "docs", "FAZ-7.2-GORSEL-DENETIM.json");

  console.log("=== HÜMRA MODA FAZ 7.2 MEDYA DENETİMİ (SALT OKUNUR) ===");

  if (!fs.existsSync(storePath)) {
    console.error("HATA: data/store.json bulunamadı!");
    process.exit(1);
  }

  const storeRaw = fs.readFileSync(storePath, "utf-8");
  const store = JSON.parse(storeRaw);
  const products: any[] = store.products || [];

  const audit: AuditResult = {
    generatedAt: new Date().toISOString(),
    source: "data/store.json",
    totalProductsScanned: products.length,
    totalMediaReferences: 0,
    localUploadReferences: 0,
    accessibleFilesCount: 0,
    missingFilesCount: 0,
    corruptedFilesCount: 0,
    mimeMismatchCount: 0,
    duplicateFilesCount: 0,
    missingColorGalleriesCount: 0,
    sharedFilesAcrossProductsCount: 0,
    missingFiles: [],
    corruptedFiles: [],
    mimeMismatches: [],
    duplicateFiles: [],
    missingColorGalleries: [],
    sharedFilesAcrossProducts: [],
  };

  const fileMap = new Map<string, { buffer: Buffer; hash: string; mime: string }>();
  const productUsageByUrl = new Map<string, { productIds: Set<string>; productTitles: Set<string> }>();
  const hashesToFiles = new Map<string, string[]>();

  for (const product of products) {
    const pMedia: any[] = product.media || [];
    const pColors: any[] = product.colors || [];

    // Check color galleries
    for (const color of pColors) {
      const hasMediaForColor = pMedia.some((m) => m.colorId === color.id);
      if (!hasMediaForColor && pMedia.length > 0) {
        audit.missingColorGalleries.push({
          productId: product.id,
          productTitle: product.title,
          colorId: color.id,
          colorName: color.name,
        });
      }
    }

    // Check each media item
    for (const media of pMedia) {
      const urlsToCheck: Array<{ field: string; url: string }> = [];
      if (media.url && typeof media.url === "string") urlsToCheck.push({ field: "url", url: media.url });
      if (media.thumbnailUrl && typeof media.thumbnailUrl === "string") urlsToCheck.push({ field: "thumbnailUrl", url: media.thumbnailUrl });
      if (media.posterUrl && typeof media.posterUrl === "string") urlsToCheck.push({ field: "posterUrl", url: media.posterUrl });

      for (const item of urlsToCheck) {
        audit.totalMediaReferences++;
        const mediaUrl = item.url;

        if (mediaUrl.startsWith("/uploads/")) {
          audit.localUploadReferences++;

          // Track usage across products
          const usage = productUsageByUrl.get(mediaUrl) || { productIds: new Set(), productTitles: new Set() };
          usage.productIds.add(product.id);
          usage.productTitles.add(product.title);
          productUsageByUrl.set(mediaUrl, usage);

          const relativePath = mediaUrl.slice("/uploads/".length);
          const fullPath = path.resolve(uploadsDir, relativePath);

          if (!fs.existsSync(fullPath)) {
            audit.missingFiles.push({
              productId: product.id,
              productTitle: product.title,
              mediaUrl,
              field: item.field,
            });
            continue;
          }

          audit.accessibleFilesCount++;

          if (!fileMap.has(fullPath)) {
            try {
              const buffer = fs.readFileSync(fullPath);
              const hash = crypto.createHash("sha256").update(buffer).digest("hex");
              const detectedMime = getMagicMime(buffer);
              fileMap.set(fullPath, { buffer, hash, mime: detectedMime });

              const ext = path.extname(fullPath).toLowerCase();
              let expectedMime = "image/webp";
              if (ext === ".jpg" || ext === ".jpeg") expectedMime = "image/jpeg";
              if (ext === ".png") expectedMime = "image/png";
              if (ext === ".avif") expectedMime = "image/avif";
              if (ext === ".mp4") expectedMime = "video/mp4";

              if (detectedMime !== expectedMime && detectedMime !== "application/octet-stream") {
                audit.mimeMismatches.push({
                  filePath: relativePath,
                  extension: ext,
                  detectedMime,
                });
              }

              // Check if image can be parsed by sharp
              if (detectedMime.startsWith("image/") && detectedMime !== "image/svg+xml") {
                try {
                  await sharp(buffer).metadata();
                } catch (sharpError: any) {
                  audit.corruptedFiles.push({
                    filePath: relativePath,
                    error: sharpError?.message || "Sharp parse error",
                  });
                }
              }

              const siblingFiles = hashesToFiles.get(hash) || [];
              siblingFiles.push(relativePath);
              hashesToFiles.set(hash, siblingFiles);
            } catch (readErr: any) {
              audit.corruptedFiles.push({
                filePath: relativePath,
                error: readErr?.message || "File read error",
              });
            }
          }
        }
      }
    }
  }

  // Duplicate files
  for (const [hash, fileList] of hashesToFiles.entries()) {
    if (fileList.length > 1) {
      audit.duplicateFiles.push({ hash, files: fileList });
    }
  }

  // Cross-product shared files
  for (const [mediaUrl, usage] of productUsageByUrl.entries()) {
    if (usage.productIds.size > 1) {
      audit.sharedFilesAcrossProducts.push({
        mediaUrl,
        productIds: Array.from(usage.productIds),
        productTitles: Array.from(usage.productTitles),
      });
    }
  }

  audit.missingFilesCount = audit.missingFiles.length;
  audit.corruptedFilesCount = audit.corruptedFiles.length;
  audit.mimeMismatchCount = audit.mimeMismatches.length;
  audit.duplicateFilesCount = audit.duplicateFiles.length;
  audit.missingColorGalleriesCount = audit.missingColorGalleries.length;
  audit.sharedFilesAcrossProductsCount = audit.sharedFilesAcrossProducts.length;

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2), "utf-8");

  console.log(`- Taranan Ürün Sayısı: ${audit.totalProductsScanned}`);
  console.log(`- Toplam Medya Referansı: ${audit.totalMediaReferences}`);
  console.log(`- Yerel /uploads Referansı: ${audit.localUploadReferences}`);
  console.log(`- Fiziksel Erişilebilir Dosya: ${audit.accessibleFilesCount}`);
  console.log(`- Eksik Fiziksel Dosya: ${audit.missingFilesCount}`);
  console.log(`- Bozuk Görsel/Video: ${audit.corruptedFilesCount}`);
  console.log(`- MIME/Uzantı Uyuşmazlığı: ${audit.mimeMismatchCount}`);
  console.log(`- Yinelenen Dosyalar (Hash Eşleşmesi): ${audit.duplicateFilesCount}`);
  console.log(`- Ürünler Arası Paylaşılan Dosyalar: ${audit.sharedFilesAcrossProductsCount}`);
  console.log(`- Rapor Kaydedildi: ${reportPath}`);
}

runMediaAudit().catch((err) => {
  console.error("Audit script failed:", err);
  process.exit(1);
});

