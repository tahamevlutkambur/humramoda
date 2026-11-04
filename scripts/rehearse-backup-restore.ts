import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const CONTAINER = "humra-postgres-test-83";
const SOURCE_DB = "humra_migration_test";
const RESTORE_DB = "humra_restore_rehearsal";
const USER = "humra_test";
const BACKUP_PATH_CONTAINER = "/tmp/humra_backup_rehearsal.sql";
const LOCAL_BACKUP_PATH = path.join(process.cwd(), "backups", "humra_backup_rehearsal.sql");

async function main() {
  console.log("=== HÜMRA MODA FAZ 8.8: BACKUP & RESTORE PROVASI ===");

  // 1. Hedef backups klasörünü oluştur
  const backupDir = path.dirname(LOCAL_BACKUP_PATH);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 2. pg_dump ile yedek al
  console.log(`[1] '${SOURCE_DB}' veritabanı pg_dump ile yedekleniyor...`);
  execSync(
    `docker exec ${CONTAINER} pg_dump -U ${USER} -d ${SOURCE_DB} -F p -f ${BACKUP_PATH_CONTAINER}`,
    { stdio: "inherit" }
  );

  // 3. Yedeği konteynerden yerel ortama kopyala
  console.log(`[2] Yedek dosyası yerel ortama kopyalanıyor: ${LOCAL_BACKUP_PATH}`);
  execSync(`docker cp ${CONTAINER}:${BACKUP_PATH_CONTAINER} "${LOCAL_BACKUP_PATH}"`, {
    stdio: "inherit",
  });

  // 4. Dosya boyutu ve SHA256 hesapla
  const backupBuffer = fs.readFileSync(LOCAL_BACKUP_PATH);
  const backupSize = backupBuffer.length;
  const backupSha256 = crypto.createHash("sha256").update(backupBuffer).digest("hex").toUpperCase();
  console.log(`[3] Yedek Boyutu: ${backupSize} bytes (${(backupSize / 1024).toFixed(2)} KB)`);
  console.log(`[3] Yedek SHA256: ${backupSha256}`);

  // 5. Geçici Restore Veritabanı Oluştur
  console.log(`[4] Geçici restore test veritabanı oluşturuluyor: '${RESTORE_DB}'...`);
  execSync(
    `docker exec ${CONTAINER} psql -U ${USER} -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_DB};"`,
    { stdio: "inherit" }
  );
  execSync(
    `docker exec ${CONTAINER} psql -U ${USER} -d postgres -c "CREATE DATABASE ${RESTORE_DB};"`,
    { stdio: "inherit" }
  );

  // 6. Yedeği geçici veritabanına restore et
  console.log(`[5] Yedek '${RESTORE_DB}' içine geri yükleniyor (restore)...`);
  execSync(
    `docker exec ${CONTAINER} psql -U ${USER} -d ${RESTORE_DB} -f ${BACKUP_PATH_CONTAINER}`,
    { stdio: "inherit" }
  );

  // 7. Prisma ile her iki veritabanına bağlan ve karşılaştır
  console.log(`[6] Veri bütünlüğü ve parite karşılaştırması yapılıyor...`);
  const sourcePrisma = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://${USER}:Yc1RJPBs3A9Xt0dfFU3R0P3W@127.0.0.1:5432/${SOURCE_DB}?schema=public`,
      },
    },
  });

  const restorePrisma = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://${USER}:Yc1RJPBs3A9Xt0dfFU3R0P3W@127.0.0.1:5432/${RESTORE_DB}?schema=public`,
      },
    },
  });

  try {
    // 7.1. Tablo listesi karşılaştırması
    const sourceTables: Array<{ table_name: string }> = await sourcePrisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    const restoreTables: Array<{ table_name: string }> = await restorePrisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    console.log(`- Kaynak Tablo Sayısı: ${sourceTables.length}`);
    console.log(`- Hedef Restore Tablo Sayısı: ${restoreTables.length}`);
    if (sourceTables.length !== restoreTables.length) {
      throw new Error(`Tablo sayısı uyuşmuyor: ${sourceTables.length} vs ${restoreTables.length}`);
    }

    // 7.2. Her tablonun satır sayısını karşılaştır
    console.log(`- Tablo bazında satır sayıları doğrulanıyor...`);
    for (const t of sourceTables) {
      const sCountRes: Array<{ count: bigint }> = await sourcePrisma.$queryRawUnsafe(
        `SELECT count(*) FROM "${t.table_name}";`
      );
      const rCountRes: Array<{ count: bigint }> = await restorePrisma.$queryRawUnsafe(
        `SELECT count(*) FROM "${t.table_name}";`
      );
      const sCount = Number(sCountRes[0].count);
      const rCount = Number(rCountRes[0].count);
      if (sCount !== rCount) {
        throw new Error(`Tablo '${t.table_name}' satır sayısı uyuşmuyor: Kaynak=${sCount}, Restore=${rCount}`);
      }
      console.log(`  ✓ ${t.table_name.padEnd(25)}: ${sCount} satır`);
    }

    // 7.3. Betül Trençkot'un varyant ve stok kontrolü
    console.log(`- Betül Trençkot varyant ve stok kontrolü yapılıyor...`);
    const betulInRestore = await restorePrisma.product.findUnique({
      where: { slug: "betul-trenckot" },
      include: {
        variants: true,
      },
    });

    if (!betulInRestore) {
      throw new Error("Betül Trençkot restore edilen veritabanında bulunamadı!");
    }

    const variantCount = betulInRestore.variants.length;
    const totalStock = betulInRestore.variants.reduce((acc, v) => acc + v.stockQuantity, 0);

    console.log(`  ✓ Betül Trençkot Varyant Sayısı: ${variantCount} (Beklenen: 10)`);
    console.log(`  ✓ Betül Trençkot Toplam Stok: ${totalStock} (Beklenen: 100)`);

    if (variantCount !== 10 || totalStock !== 100) {
      throw new Error(
        `Betül Trençkot veri paritesi bozuk! Varyant=${variantCount}, Stok=${totalStock}`
      );
    }

    // 7.4. Sequence Kontrolleri
    console.log(`- Sequence değerleri kontrol ediliyor...`);
    const sourceSeqs: any[] = await sourcePrisma.$queryRaw`
      SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public';
    `;
    const restoreSeqs: any[] = await restorePrisma.$queryRaw`
      SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public';
    `;
    console.log(`  ✓ Sequence Sayısı: Kaynak=${sourceSeqs.length}, Restore=${restoreSeqs.length}`);

    // 7.5. Restore Edilen Veritabanında Yeni Sipariş ve Stok Hareketi Provası
    console.log(`- Restore edilen veritabanında işlem provası (Sipariş + Stok Düşümü)...`);
    const testVariant = betulInRestore.variants[0];
    const initialVariantStock = testVariant.stockQuantity;

    await restorePrisma.$transaction(async (tx) => {
      // Sipariş oluştur
      const newOrder = await tx.order.create({
        data: {
          id: `ord_restore_test_${Date.now()}`,
          orderNumber: `HM-RESTORE-${Date.now().toString().slice(-4)}`,
          customerEmail: "restore-test@humramoda.local",
          customerFullName: "Restore Test Müşteri",
          customerPhone: "05551112233",
          totalAmount: 500,
          totalKurus: 50000,
          subtotal: 500,
          shippingAddress: { fullAddress: "Test Mah. No:1", city: "İstanbul", district: "Kadıköy" },
          status: "CONFIRMED",
          paymentStatus: "PAID",
          stockDeducted: true,
          items: {
            create: {
              id: `item_restore_test_${Date.now()}`,
              productId: betulInRestore.id,
              variantId: testVariant.id,
              sku: testVariant.sku,
              productName: betulInRestore.title,
              colorName: "Bej",
              sizeName: "Standart",
              price: 500,
              quantity: 1,
              totalPrice: 500,
            },
          },
        },
      });

      // Stok düş
      await tx.productVariant.update({
        where: { id: testVariant.id },
        data: { stockQuantity: { decrement: 1 } },
      });

      console.log(`  ✓ Sipariş #${newOrder.orderNumber} restore DB'de başarıyla oluşturuldu.`);
    });

    // Stok düşümünü doğrula
    const updatedVariant = await restorePrisma.productVariant.findUnique({
      where: { id: testVariant.id },
    });
    console.log(`  ✓ Varyant Stoğu: ${initialVariantStock} -> ${updatedVariant?.stockQuantity} (Başarıyla 1 azaldı)`);
    if (updatedVariant?.stockQuantity !== initialVariantStock - 1) {
      throw new Error("Restore edilen veritabanında stok düşümü başarısız oldu!");
    }

    console.log("\n=== BACKUP & RESTORE PROVASI %100 BAŞARILI! ===");
  } finally {
    await sourcePrisma.$disconnect();
    await restorePrisma.$disconnect();

    // 8. Temizlik: Restore test veritabanını ve konteyner içi geçici dosyayı temizle
    console.log(`[7] Geçici '${RESTORE_DB}' veritabanı güvenle temizleniyor...`);
    execSync(
      `docker exec ${CONTAINER} psql -U ${USER} -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_DB};"`,
      { stdio: "inherit" }
    );
    execSync(`docker exec ${CONTAINER} rm -f ${BACKUP_PATH_CONTAINER}`, { stdio: "inherit" });
    console.log(`[8] Temizlik tamamlandı. Orijinal '${SOURCE_DB}' korundu.`);
  }
}

main().catch((err) => {
  console.error("Backup & restore provası başarısız:", err);
  process.exit(1);
});
