import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const CONTAINER = "humra-postgres-test-83";
const SOURCE_DB = "humra_migration_test";
const VERIFY_DB = "humra_encryption_verify_db";
const USER = "humra_test";

export interface BackupResult {
  success: boolean;
  rawBackupPath: string;
  rawSha256: string;
  rawSizeBytes: number;
  encryptedBackupPath: string;
  encryptedSha256: string;
  encryptedSizeBytes: number;
  durationMs: number;
  decryptionVerified: boolean;
  restoreVerified: boolean;
  tableCount: number;
  error?: string;
}

/**
 * AES-256-GCM ile buffer şifreler.
 * Format: [16 bayt Salt] + [12 bayt IV] + [16 bayt AuthTag] + [Şifreli Veri]
 */
export function encryptBuffer(buffer: Buffer, secretKey: string): Buffer {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(secretKey, salt, 100000, 32, "sha256");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, encrypted]);
}

/**
 * AES-256-GCM ile şifrelenmiş buffer'ı çözer ve doğrular.
 */
export function decryptBuffer(encryptedBuffer: Buffer, secretKey: string): Buffer {
  const salt = encryptedBuffer.subarray(0, 16);
  const iv = encryptedBuffer.subarray(16, 28);
  const tag = encryptedBuffer.subarray(28, 44);
  const data = encryptedBuffer.subarray(44);

  const key = crypto.pbkdf2Sync(secretKey, salt, 100000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export async function runEncryptedBackupRehearsal(
  encryptionSecret = "HumraModaSecureBackupMasterKey2026!"
): Promise<BackupResult> {
  const startTime = Date.now();
  console.log("=== FAZ 9.1: ŞİFRELİ YEDEKLEME VE DOĞRULAMA PROVASI ===");

  const backupDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = Date.now();
  const rawLocalPath = path.join(backupDir, `test_backup_${timestamp}.sql`);
  const encLocalPath = path.join(backupDir, `test_backup_${timestamp}.sql.enc`);
  const containerDumpPath = `/tmp/test_backup_${timestamp}.sql`;

  try {
    // 1. pg_dump al
    console.log(`[1] '${SOURCE_DB}' veritabanı pg_dump ile alınıyor...`);
    execSync(
      `docker exec ${CONTAINER} pg_dump -U ${USER} -d ${SOURCE_DB} -F p -f ${containerDumpPath}`,
      { stdio: "inherit" }
    );

    // 2. Konteynerden kopyala
    execSync(`docker cp ${CONTAINER}:${containerDumpPath} "${rawLocalPath}"`, { stdio: "inherit" });

    // 3. Raw SHA256 hesapla
    const rawBuffer = fs.readFileSync(rawLocalPath);
    const rawSha256 = crypto.createHash("sha256").update(rawBuffer).digest("hex").toUpperCase();
    const rawSizeBytes = rawBuffer.length;
    console.log(`[2] Ham Yedek Boyutu: ${(rawSizeBytes / 1024).toFixed(2)} KB | SHA256: ${rawSha256}`);

    // 4. AES-256-GCM ile şifrele
    console.log("[3] Yedek dosyası AES-256-GCM ile şifreleniyor...");
    const encBuffer = encryptBuffer(rawBuffer, encryptionSecret);
    fs.writeFileSync(encLocalPath, encBuffer);
    const encSha256 = crypto.createHash("sha256").update(encBuffer).digest("hex").toUpperCase();
    const encSizeBytes = encBuffer.length;
    console.log(`[4] Şifreli Dosya Boyutu: ${(encSizeBytes / 1024).toFixed(2)} KB | SHA256: ${encSha256}`);

    // 5. Şifreyi çöz ve bayt bayt bütünlüğü doğrula
    console.log("[5] Şifre çözülüyor ve SHA-256 doğrulaması yapılıyor...");
    const decryptedBuffer = decryptBuffer(fs.readFileSync(encLocalPath), encryptionSecret);
    const decryptedSha256 = crypto.createHash("sha256").update(decryptedBuffer).digest("hex").toUpperCase();

    if (decryptedSha256 !== rawSha256) {
      throw new Error(`ŞİFRE ÇÖZME BÜTÜNLÜK HATASI! Ham: ${rawSha256} vs Çözülen: ${decryptedSha256}`);
    }
    console.log("✔ Şifre çözme doğrulaması %100 başarılı: SHA-256 tam eşleşti.");

    // 6. Doğrulama veritabanına restore provası
    console.log(`[6] Geçici doğrulama veritabanı ('${VERIFY_DB}') oluşturuluyor ve restore deneniyor...`);
    execSync(
      `docker exec ${CONTAINER} psql -U ${USER} -d postgres -c "DROP DATABASE IF EXISTS ${VERIFY_DB};"`,
      { stdio: "inherit" }
    );
    execSync(
      `docker exec ${CONTAINER} psql -U ${USER} -d postgres -c "CREATE DATABASE ${VERIFY_DB};"`,
      { stdio: "inherit" }
    );
    execSync(
      `docker exec ${CONTAINER} psql -U ${USER} -d ${VERIFY_DB} -f ${containerDumpPath}`,
      { stdio: "inherit" }
    );

    // 7. Tablo sayısını doğrula
    const verifyPrisma = new PrismaClient({
      datasources: {
        db: {
          url: `postgresql://${USER}:Yc1RJPBs3A9Xt0dfFU3R0P3W@127.0.0.1:5432/${VERIFY_DB}?schema=public`,
        },
      },
    });

    let tableCount = 0;
    try {
      const tables: any[] = await verifyPrisma.$queryRaw`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
      `;
      tableCount = tables.length;
      console.log(`✔ Restore edilen veritabanında toplam ${tableCount} tablo başarıyla doğrulandı.`);
    } finally {
      await verifyPrisma.$disconnect();
    }

    // 8. Geçici doğrulama DB'sini temizle
    execSync(
      `docker exec ${CONTAINER} psql -U ${USER} -d postgres -c "DROP DATABASE IF EXISTS ${VERIFY_DB};"`,
      { stdio: "inherit" }
    );
    execSync(`docker exec ${CONTAINER} rm -f ${containerDumpPath}`);

    const durationMs = Date.now() - startTime;
    console.log(`\n=== YEDEKLEME VE ŞİFRELEME PROVASI BAŞARIYLA TAMAMLANDI (${(durationMs / 1000).toFixed(2)} saniye) ===\n`);

    return {
      success: true,
      rawBackupPath: rawLocalPath,
      rawSha256,
      rawSizeBytes,
      encryptedBackupPath: encLocalPath,
      encryptedSha256: encSha256,
      encryptedSizeBytes: encSizeBytes,
      durationMs,
      decryptionVerified: true,
      restoreVerified: true,
      tableCount,
    };
  } finally {
    // Temizlik: geçici yerel test dosyalarını sil
    if (fs.existsSync(rawLocalPath)) fs.unlinkSync(rawLocalPath);
    if (fs.existsSync(encLocalPath)) fs.unlinkSync(encLocalPath);
  }
}

if (require.main === module) {
  runEncryptedBackupRehearsal().catch((err) => {
    console.error("Yedekleme provası hatası:", err);
    process.exit(1);
  });
}
