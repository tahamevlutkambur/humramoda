import fs from "fs";
import path from "path";
import crypto from "crypto";

const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const BACKUP_DIR = path.resolve("backups");
const STORE_PATH = path.resolve("data/store.json");
const UPLOADS_DIR = path.resolve("public/uploads");

function encryptBuffer(buffer: Buffer, secretKey: string): Buffer {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(secretKey, salt, 100000, 32, "sha256");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, encrypted]);
}

export async function createPreMigrationBackup(
  secretKey = "HumraModaFaz10PreMigrationBackupKey2026!"
): Promise<{
  success: boolean;
  storeSha256: string;
  storeSizeBytes: number;
  encryptedStorePath: string;
  uploadsCount: number;
  timestamp: string;
}> {
  console.log("=== FAZ 10.1: CANLI GEÇİŞ ÖNCESİ TAM GÜVENLİK YEDEĞİ ===");

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // 1. JSON Depo Doğrulaması
  const storeRaw = fs.readFileSync(STORE_PATH);
  const storeSha256 = crypto.createHash("sha256").update(storeRaw).digest("hex").toUpperCase();

  if (storeSha256 !== EXPECTED_HASH) {
    throw new Error(`GÜVENLİK ENGELİ: Kaynak veri hash'i beklenen değerle eşleşmiyor! Mevcut: ${storeSha256}`);
  }
  console.log(`✔ data/store.json doğrulandı. SHA256: ${storeSha256}`);

  // 2. Medya Dosyaları Sayımı
  const getFiles = (dir: string): string[] => {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (stat && stat.isDirectory()) {
        results = results.concat(getFiles(full));
      } else {
        results.push(full);
      }
    }
    return results;
  };

  const uploadFiles = getFiles(UPLOADS_DIR);
  console.log(`✔ public/uploads envanteri doğrulandı: ${uploadFiles.length} dosya.`);

  // 3. Şifreli Yedek Oluştur
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const encStorePath = path.join(BACKUP_DIR, `pre_migration_store_${timestamp}.json.enc`);
  const rawCopyPath = path.join(BACKUP_DIR, `pre_migration_store_${timestamp}.json`);

  // Ham kopyayı sakla
  fs.writeFileSync(rawCopyPath, storeRaw);
  // AES-256-GCM ile şifreli kopyayı sakla
  const encBuffer = encryptBuffer(storeRaw, secretKey);
  fs.writeFileSync(encStorePath, encBuffer);

  // Manifest oluştur
  const manifest = {
    timestamp,
    storeSha256,
    storeSizeBytes: storeRaw.length,
    uploadsCount: uploadFiles.length,
    uploadFiles: uploadFiles.map((f) => path.relative(process.cwd(), f)),
    encryptedStorePath: encStorePath,
    algorithm: "AES-256-GCM / PBKDF2-SHA256 (100,000 iter)",
  };

  const manifestPath = path.join(BACKUP_DIR, `pre_migration_manifest_${timestamp}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`✔ Şifreli yedek oluşturuldu: ${encStorePath}`);
  console.log(`✔ Güvenlik manifesti oluşturuldu: ${manifestPath}`);

  return {
    success: true,
    storeSha256,
    storeSizeBytes: storeRaw.length,
    encryptedStorePath: encStorePath,
    uploadsCount: uploadFiles.length,
    timestamp,
  };
}

if (require.main === module) {
  createPreMigrationBackup().catch((err) => {
    console.error("Yedekleme hatası:", err);
    process.exit(1);
  });
}

