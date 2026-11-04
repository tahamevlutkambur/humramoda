import path from "path";
import { executeMigrationToPostgres, verifyDataParity, readAndVerifyStore } from "./migrate-json-to-pg";
import { PrismaClient } from "@prisma/client";

const NEON_DIRECT_URL = "postgresql://neondb_owner:npg_X6jgkxBr0zMK@ep-shiny-cherry-b940elpo.c-7.eu-central-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  console.log("=== FAZ 10.1: JSON VERİLERİNİN NEON PRODUCTION'A AKTARILMASI ===");

  const storePath = path.resolve("data/store.json");
  const { sha256, isHashValid } = readAndVerifyStore(storePath);

  if (!isHashValid) {
    throw new Error(`KAYNAK GÜVENLİK ENGELİ: store.json hash'i beklenen değerle eşleşmiyor! (${sha256})`);
  }
  console.log(`[1] Kaynak JSON doğrulandı: SHA256=${sha256}`);

  // 1. Aktarım işlemini başlat
  console.log("[2] Neon Production veritabanına aktarım başlatılıyor...");
  const migrationResult = await executeMigrationToPostgres({
    target: "production",
    confirmProduction: true,
    databaseUrl: NEON_DIRECT_URL,
    storePath,
  });

  console.log(`[3] Aktarım Tamamlandı (${migrationResult.durationMs}ms)! Eklenen Kayıtlar:`, migrationResult.recordsInserted);

  // 2. Parite denetimini gerçekleştir
  console.log("\n[4] Parite denetimi yapılıyor...");
  const prisma = new PrismaClient({
    datasources: { db: { url: NEON_DIRECT_URL } },
  });

  try {
    const parity = await verifyDataParity(prisma, storePath);
    console.log("=== PARİTE RAPORU ===");
    console.log("Parite Kusursuz mu?:", parity.isParityPerfect ? "EVET (%100)" : "HAYIR");
    console.log("Tablo Karşılaştırmaları:", parity.tableCounts);
    console.log("Betül Trençkot Kontrolü:", parity.betulCheck);
    console.log("Bildirimler Kontrolü:", parity.notificationsCheck);
    console.log("Audit Logları Kontrolü:", parity.auditLogsCheck);

    if (!parity.isParityPerfect || !parity.betulCheck.match) {
      throw new Error("KRİTİK HATA: Veri paritesi sağlanamadı!");
    }

    console.log("\n✔ TÜM VERİLER NEON PRODUCTION'A EKSİKSİZ VE %100 PARİTE İLE AKTARILDI!");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("AKTARIM HATASI:", err);
  process.exit(1);
});

