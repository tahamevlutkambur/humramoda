import { describe, it, expect } from "vitest";
import {
  verifyMagicBytes,
  sanitizeFileName,
  processAndSaveUpload,
} from "../src/lib/server/media";

describe("Media Upload Security & Magic Bytes Processor", () => {
  it("sanitizes filenames to prevent directory traversal and special character injections", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\..\\windows\\system32\\calc.exe")).toBe("calc.exe");
    expect(sanitizeFileName("Moda Çekimi 2026! @#$.jpg")).toBe("moda-cekimi-2026-.jpg");
  });

  it("identifies valid JPEG magic bytes", () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const res = verifyMagicBytes(jpegHeader);
    expect(res.isValid).toBe(true);
    expect(res.detectedType).toBe("image/jpeg");
  });

  it("identifies valid PNG magic bytes", () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const res = verifyMagicBytes(pngHeader);
    expect(res.isValid).toBe(true);
    expect(res.detectedType).toBe("image/png");
  });

  it("identifies valid WebP magic bytes", () => {
    const webpHeader = Buffer.from("RIFF....WEBPVP8 ");
    const res = verifyMagicBytes(webpHeader);
    expect(res.isValid).toBe(true);
    expect(res.detectedType).toBe("image/webp");
  });

  it("identifies valid MP4 video magic bytes and assigns mediaType 'VIDEO'", () => {
    const mp4Header = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const res = verifyMagicBytes(mp4Header);
    expect(res.isValid).toBe(true);
    expect(res.detectedType).toBe("video/mp4");
    expect(res.mediaType).toBe("VIDEO");
  });

  it("identifies HEIC photos with 'ftypheic' as IMAGE and never misclassifies as VIDEO", () => {
    const heicHeader = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
    ]);
    const res = verifyMagicBytes(heicHeader);
    expect(res.isValid).toBe(true);
    expect(res.detectedType).toBe("image/heic");
    expect(res.mediaType).toBe("IMAGE");
  });

  it("assigns mediaType 'IMAGE' for JPEG, PNG and WebP", () => {
    const jpeg = verifyMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
    expect(jpeg.mediaType).toBe("IMAGE");

    const png = verifyMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.mediaType).toBe("IMAGE");

    const webp = verifyMagicBytes(Buffer.from("RIFF....WEBPVP8 "));
    expect(webp.mediaType).toBe("IMAGE");
  });

  it("rejects malicious or spoofed file masquerading as image", async () => {
    // PHP veya EXE dosyası .jpg uzantısıyla yüklense dahi sihirli bayt denetimi reddeder
    const fakeFile = Buffer.from("<?php echo 'malicious code'; ?>");
    const check = verifyMagicBytes(fakeFile);
    expect(check.isValid).toBe(false);

    const uploadRes = await processAndSaveUpload(fakeFile, "zararli.jpg", "image/jpeg");
    expect(uploadRes.error).toContain("Güvenlik uyarısı: Dosya içeriği geçerli bir resim veya video formatıyla eşleşmiyor.");
    expect(uploadRes.result).toBeUndefined();
  });
});
