import fs from "fs";
import path from "path";
import sharp from "sharp";

export interface MediaUploadResult {
  url: string;
  thumbnailUrl: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  mediaType: "IMAGE" | "VIDEO";
}

const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_SIZE_BYTES = 60 * 1024 * 1024; // 60 MB

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
]);

const ALLOWED_VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);

/**
 * Dosya sihirli baytlarını (magic bytes) denetler.
 * Yalnızca dosya uzantısına veya istemci bildirimine güvenilmesini engeller.
 * Fotoğraf (IMAGE) ve Video (VIDEO) ayrımını kesin olarak yapar.
 */
export function verifyMagicBytes(buffer: Buffer): {
  isValid: boolean;
  detectedType?: string;
  mediaType?: "IMAGE" | "VIDEO";
} {
  if (buffer.length < 4) return { isValid: false };

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, detectedType: "image/jpeg", mediaType: "IMAGE" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, detectedType: "image/png", mediaType: "IMAGE" };
  }

  // WebP: RIFF .... WEBP
  const riff = buffer.toString("ascii", 0, 4);
  const webp = buffer.toString("ascii", 8, 12);
  if (riff === "RIFF" && webp === "WEBP") {
    return { isValid: true, detectedType: "image/webp", mediaType: "IMAGE" };
  }

  // WebM: 1A 45 DF A3 (EBML)
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return { isValid: true, detectedType: "video/webm", mediaType: "VIDEO" };
  }

  // ISO Base Media File Format (MP4 / MOV / AVIF / HEIC): offset 4 contains 'ftyp'
  const ftyp = buffer.toString("ascii", 4, 8);
  if (ftyp === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();

    // AVIF görsel
    if (brand.startsWith("avif") || brand.startsWith("avis")) {
      return { isValid: true, detectedType: "image/avif", mediaType: "IMAGE" };
    }

    // HEIC / HEIF görsel (iPhone çekimleri) — KESİNLİKLE VİDEO DEĞİLDİR!
    const heicBrands = ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"];
    if (heicBrands.some((b) => brand.startsWith(b))) {
      return { isValid: true, detectedType: "image/heic", mediaType: "IMAGE" };
    }

    // MP4 Video formatları (isom, iso2, mp41, mp42, dash, qt, avc1 vs.)
    return { isValid: true, detectedType: "video/mp4", mediaType: "VIDEO" };
  }

  return { isValid: false };
}

/**
 * Dosya adı temizleme (Directory Traversal ve zararlı karakterleri engeller)
 */
export function sanitizeFileName(name: string): string {
  const base = path.basename(name);
  const trMap: Record<string, string> = {
    ç: "c",
    Ç: "c",
    ğ: "g",
    Ğ: "g",
    ı: "i",
    İ: "i",
    ö: "o",
    Ö: "o",
    ş: "s",
    Ş: "s",
    ü: "u",
    Ü: "u",
  };
  const transliterated = base
    .split("")
    .map((char) => trMap[char] || char)
    .join("");

  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Yüklenen dosya arabelleğini doğrular ve güvenli yerel depoya kaydeder.
 * Fotoğraf ve video dosyalarını kesin biçimde ayrıştırır.
 */
export async function processAndSaveUpload(
  buffer: Buffer,
  originalName: string,
  claimedMime?: string
): Promise<{ result?: MediaUploadResult; error?: string }> {
  // 1. Sihirli bayt doğrulama
  const magic = verifyMagicBytes(buffer);
  if (!magic.isValid || !magic.detectedType || !magic.mediaType) {
    return {
      error:
        "Güvenlik uyarısı: Dosya içeriği geçerli bir resim veya video formatıyla eşleşmiyor.",
    };
  }

  // Güvenlik: İstemcinin iddia ettiği MIME türü ile gerçek imza çelişkisini denetle
  if (claimedMime && claimedMime.startsWith("text/")) {
    return {
      error: "Güvenlik uyarısı: Metin dosyaları medya olarak yüklenemez.",
    };
  }

  const mime = magic.detectedType;
  const mediaType = magic.mediaType;
  const isImage = mediaType === "IMAGE";
  const isVideo = mediaType === "VIDEO";

  if (!ALLOWED_IMAGE_MIMES.has(mime) && !ALLOWED_VIDEO_MIMES.has(mime)) {
    return {
      error: `Desteklenmeyen dosya türü: ${mime}. Yalnızca JPG, PNG, WebP, AVIF veya MP4 kabul edilir.`,
    };
  }

  // 2. Boyut kontrolü
  if (isImage && buffer.length > MAX_IMAGE_SIZE_BYTES) {
    return { error: "Görsel boyutu en fazla 15 MB olabilir." };
  }
  if (isVideo && buffer.length > MAX_VIDEO_SIZE_BYTES) {
    return { error: "Video boyutu en fazla 60 MB olabilir." };
  }

  // 3. Hedef dizini belirle
  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    isVideo ? "videos" : "products"
  );
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const timestamp = Date.now();
  const safeName = sanitizeFileName(originalName);
  const ext = path.extname(safeName);
  const nameWithoutExt = path.basename(safeName, ext);

  if (isImage) {
    // Görselleri doğrudan optimize WebP olarak kaydet
    const cardFileName = `${nameWithoutExt}-${timestamp}-card.webp`;
    const thumbFileName = `${nameWithoutExt}-${timestamp}-thumb.webp`;

    const cardPath = path.join(uploadDir, cardFileName);
    const thumbPath = path.join(uploadDir, thumbFileName);

    try {
      // 3:4 oranına uygun 640x853 vitrin boyutu
      await sharp(buffer)
        .resize(640, 853, { fit: "cover", position: "center" })
        .webp({ quality: 86 })
        .toFile(cardPath);

      // 240x320 küçük resim (thumbnail) boyutu
      await sharp(buffer)
        .resize(240, 320, { fit: "cover", position: "center" })
        .webp({ quality: 80 })
        .toFile(thumbPath);

      return {
        result: {
          url: `/uploads/products/${cardFileName}`,
          thumbnailUrl: `/uploads/products/${thumbFileName}`,
          fileName: cardFileName,
          sizeBytes: buffer.length,
          mimeType: "image/webp",
          mediaType: "IMAGE",
        },
      };
    } catch (err) {
      console.error("Görsel işleme hatası:", err);
      return { error: "Görsel işlenirken bir hata oluştu." };
    }
  } else {
    // Video dosyasını kaydet (Fotoğraf dönüştürme işleminden KESİNLİKLE geçirilmez)
    const videoFileName = `${nameWithoutExt}-${timestamp}.mp4`;
    const videoPath = path.join(uploadDir, videoFileName);
    fs.writeFileSync(videoPath, buffer);

    return {
      result: {
        url: `/uploads/videos/${videoFileName}`,
        thumbnailUrl: `/uploads/videos/${videoFileName}`,
        fileName: videoFileName,
        sizeBytes: buffer.length,
        mimeType: "video/mp4",
        mediaType: "VIDEO",
      },
    };
  }
}

/**
 * Dosya silme fonksiyonu (Yol gezintisi saldırılarını engeller)
 */
export function safelyDeleteUploadedFile(fileUrl: string): boolean {
  if (!fileUrl || typeof fileUrl !== "string") return false;

  // Asla humraresimler veya humravideolar klasörlerini silmeye izin verme!
  if (fileUrl.includes("humraresimler") || fileUrl.includes("humravideolar")) {
    return false;
  }

  const normalized = path.normalize(fileUrl).replace(/^(\.\.[\/\\])+/, "");
  if (!normalized.startsWith("/uploads/")) {
    return false;
  }

  const relativePath = normalized.replace(/^\/uploads\//, "");
  const fullPath = path.join(process.cwd(), "public", "uploads", relativePath);

  // Dizin dışına çıkış denetimi (Path traversal guard)
  const allowedBase = path.join(process.cwd(), "public", "uploads");
  if (!fullPath.startsWith(allowedBase)) {
    return false;
  }

  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
