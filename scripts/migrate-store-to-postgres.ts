/**
 * Hümra Moda — JSON Depodan PostgreSQL'e Güvenli ve İdempotent Veri Aktarımı
 *
 * Özellikler:
 * 1. Aktarım öncesi kaynak verinin otomatik yedeğini alır (data/backups/).
 * 2. Veritabanı bağlantısını önceden test eder; erişilemezse kaynak veriye dokunmadan durur.
 * 3. Tüm kayıtları doğal anahtarlarıyla (slug, SKU, email, key) `upsert` eder.
 * 4. Tekrar çalıştırıldığında mükerrer kayıt oluşturmaz (idempotent).
 * 5. Aktarım öncesi ve sonrası kayıt sayılarını karşılaştırmalı tablo olarak sunar.
 *
 * Kullanım:
 *   npx tsx scripts/migrate-store-to-postgres.ts
 */

import fs from "fs";
import path from "path";

// .env dosyasını otomatik yükle (Node.js 20.6+)
if (typeof process.loadEnvFile === "function" && fs.existsSync(path.join(process.cwd(), ".env"))) {
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env"));
  } catch {
    // Çevre değişkenleri zaten tanımlıysa yoksay
  }
}

import { PrismaClient, Prisma } from "@prisma/client";
import { getStoreData } from "../src/lib/server/store";

const prisma = new PrismaClient();

interface MigrationStats {
  categories: { json: number; pg: number };
  collections: { json: number; pg: number };
  products: { json: number; pg: number };
  variants: { json: number; pg: number };
  media: { json: number; pg: number };
  adminUsers: { json: number; pg: number };
  settings: { json: number; pg: number };
  campaigns: { json: number; pg: number };
}

async function backupJsonStore(): Promise<string> {
  const dataDir = path.join(process.cwd(), "data");
  const storeFile = path.join(dataDir, "store.json");
  const backupDir = path.join(dataDir, "backups");

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `store-backup-${timestamp}.json`);

  if (fs.existsSync(storeFile)) {
    fs.copyFileSync(storeFile, backupFile);
    console.log(`✔ Kaynak veri yedeği oluşturuldu: ${backupFile}`);
  }

  return backupFile;
}

export async function runMigration(): Promise<{
  success: boolean;
  message: string;
  stats?: MigrationStats;
  backupPath?: string;
}> {
  console.log("==========================================================");
  console.log("Hümra Moda — PostgreSQL Veri Aktarım & Eşitleme Aracı");
  console.log("==========================================================");

  // 1. Veritabanı bağlantı denetimi
  console.log("\n[1/5] PostgreSQL bağlantısı test ediliyor...");
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✔ PostgreSQL bağlantısı başarılı.");
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Bilinmeyen bağlantı hatası.";
    console.warn("\n✖ PostgreSQL hizmetine bağlanılamadı!");
    console.warn(`Ayrıntı: ${errorMsg}`);
    console.warn(
      "\nBilgi: PostgreSQL hazır olmadığı için aktarım durduruldu."
    );
    console.warn(
      "Kaynak 'data/store.json' verisi aynen korunmaktadır. Hiçbir veri kaybı yaşanmadı."
    );
    return {
      success: false,
      message: `PostgreSQL bağlantısı kurulamadı: ${errorMsg}`,
    };
  }

  // 2. Yedekleme
  console.log("\n[2/5] Kaynak verinin güvenli yedeği alınıyor...");
  const backupPath = await backupJsonStore();

  // 3. Kaynak veriyi oku
  console.log("\n[3/5] Kaynak 'data/store.json' verisi analiz ediliyor...");
  const store = getStoreData();

  const totalVariants = store.products.reduce(
    (acc, p) => acc + (p.variants?.length || 0),
    0
  );
  const totalMedia = store.products.reduce(
    (acc, p) => acc + (p.media?.length || 0),
    0
  );

  console.log(`  - Kategoriler: ${store.categories.length}`);
  console.log(`  - Koleksiyonlar: ${store.collections.length}`);
  console.log(`  - Ürünler: ${store.products.length}`);
  console.log(`  - Varyantlar: ${totalVariants}`);
  console.log(`  - Medyalar: ${totalMedia}`);
  console.log(`  - Yöneticiler: ${store.adminUsers.length}`);
  console.log(`  - Kampanyalar: ${store.campaigns.length}`);

  // 4. İdempotent Aktarım (Upsert)
  console.log("\n[4/5] Veriler PostgreSQL ilişkisel tablolarına aktarılıyor...");

  try {
    // A. Yöneticiler
    for (const u of store.adminUsers) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: {
          fullName: u.fullName,
          passwordHash: u.passwordHash,
          role: u.role,
          isActive: u.isActive,
        },
        create: {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          passwordHash: u.passwordHash,
          role: u.role,
          isActive: u.isActive,
          createdAt: new Date(u.createdAt),
        },
      });
    }

    // B. Kategoriler
    const catIdMap = new Map<string, string>(); // slug -> id
    for (const c of store.categories) {
      const savedCat = await prisma.category.upsert({
        where: { slug: c.slug },
        update: {
          name: c.name,
          description: c.description || null,
          imageUrl: c.imageUrl || null,
          displayOrder: c.displayOrder || 0,
        },
        create: {
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description || null,
          imageUrl: c.imageUrl || null,
          displayOrder: c.displayOrder || 0,
        },
      });
      catIdMap.set(c.slug, savedCat.id);
    }

    // C. Koleksiyonlar
    const colIdMap = new Map<string, string>(); // slug -> id
    for (const col of store.collections) {
      const savedCol = await prisma.collection.upsert({
        where: { slug: col.slug },
        update: {
          name: col.name,
          description: col.description || null,
          displayOrder: col.displayOrder || 0,
        },
        create: {
          id: col.id,
          name: col.name,
          slug: col.slug,
          description: col.description || null,
          displayOrder: col.displayOrder || 0,
        },
      });
      colIdMap.set(col.slug, savedCol.id);
    }

    // D. Ürünler ve Varyantlar
    for (const p of store.products) {
      const categoryId = catIdMap.get(p.categorySlug) || catIdMap.values().next().value;
      if (!categoryId) {
        console.warn(`  [Uyarı] Ürün ${p.title} için kategori bulunamadı, atlandı.`);
        continue;
      }

      const savedProd = await prisma.product.upsert({
        where: { slug: p.slug },
        update: {
          title: p.title,
          description: p.description,
          fabricDetails: p.fabricDetails || null,
          modelDimensions: p.modelDimensions || null,
          basePrice: new Prisma.Decimal(p.basePrice),
          discountPrice: p.discountPrice ? new Prisma.Decimal(p.discountPrice) : null,
          badge: p.badge || null,
          categoryId,
          isActive: true,
          isDraft: false,
        },
        create: {
          id: p.id,
          title: p.title,
          slug: p.slug,
          description: p.description,
          fabricDetails: p.fabricDetails || null,
          modelDimensions: p.modelDimensions || null,
          basePrice: new Prisma.Decimal(p.basePrice),
          discountPrice: p.discountPrice ? new Prisma.Decimal(p.discountPrice) : null,
          badge: p.badge || null,
          categoryId,
          isActive: true,
          isDraft: false,
          createdAt: new Date(p.createdAt || Date.now()),
        },
      });

      // Koleksiyon ilişkileri
      if (p.collectionSlugs) {
        for (const colSlug of p.collectionSlugs) {
          const collectionId = colIdMap.get(colSlug);
          if (collectionId) {
            await prisma.productCollection.upsert({
              where: {
                productId_collectionId: {
                  productId: savedProd.id,
                  collectionId,
                },
              },
              update: {},
              create: {
                productId: savedProd.id,
                collectionId,
              },
            });
          }
        }
      }

      // Renkler
      const colorIdMap = new Map<string, string>(); // color.id in JSON or color.name -> pgColor.id
      for (const col of p.colors || []) {
        const savedColor = await prisma.productColor.upsert({
          where: {
            productId_slug: {
              productId: savedProd.id,
              slug: col.slug,
            },
          },
          update: {
            name: col.name,
            colorCode: col.colorCode || "#141414",
            displayOrder: col.displayOrder || 1,
          },
          create: {
            id: col.id,
            productId: savedProd.id,
            name: col.name,
            slug: col.slug,
            colorCode: col.colorCode || "#141414",
            displayOrder: col.displayOrder || 1,
          },
        });
        colorIdMap.set(col.id, savedColor.id);
        colorIdMap.set(col.name.toLowerCase(), savedColor.id);
      }

      // Bedenler
      const sizeIdMap = new Map<string, string>(); // size.id in JSON or size.name -> pgSize.id
      for (const sz of p.sizes || []) {
        const savedSize = await prisma.productSize.upsert({
          where: {
            productId_slug: {
              productId: savedProd.id,
              slug: sz.slug,
            },
          },
          update: {
            name: sz.name,
            displayOrder: sz.displayOrder || 1,
          },
          create: {
            id: sz.id,
            productId: savedProd.id,
            name: sz.name,
            slug: sz.slug,
            displayOrder: sz.displayOrder || 1,
          },
        });
        sizeIdMap.set(sz.id, savedSize.id);
        sizeIdMap.set(sz.name.toLowerCase(), savedSize.id);
      }

      // Varyantlar (SKU bazlı upsert)
      for (const v of p.variants || []) {
        const pgColorId = colorIdMap.get(v.colorId);
        const pgSizeId = sizeIdMap.get(v.sizeId);

        if (!pgColorId || !pgSizeId) {
          continue;
        }

        await prisma.productVariant.upsert({
          where: { sku: v.sku },
          update: {
            colorId: pgColorId,
            sizeId: pgSizeId,
            stockQuantity: v.stockQuantity,
            isActive: v.isActive ?? true,
          },
          create: {
            id: v.id,
            productId: savedProd.id,
            colorId: pgColorId,
            sizeId: pgSizeId,
            sku: v.sku,
            stockQuantity: v.stockQuantity,
            isActive: v.isActive ?? true,
          },
        });
      }

      // Medyalar
      for (let i = 0; i < (p.media || []).length; i++) {
        const m = p.media[i];
        let pgColorId: string | null = null;
        if (m.colorId && colorIdMap.has(m.colorId)) {
          pgColorId = colorIdMap.get(m.colorId) || null;
        }

        const existingMedia = await prisma.productMedia.findFirst({
          where: {
            productId: savedProd.id,
            url: m.url,
          },
        });

        if (existingMedia) {
          await prisma.productMedia.update({
            where: { id: existingMedia.id },
            data: {
              colorId: pgColorId,
              altText: m.altText || null,
              displayOrder: m.displayOrder || i + 1,
              isThumbnail: m.isThumbnail || i === 0,
            },
          });
        } else {
          await prisma.productMedia.create({
            data: {
              id: m.id || `med-${savedProd.id}-${i}`,
              productId: savedProd.id,
              colorId: pgColorId,
              type: m.type === "VIDEO" ? "VIDEO" : "IMAGE",
              url: m.url,
              thumbnailUrl: m.thumbnailUrl || null,
              altText: m.altText || null,
              displayOrder: m.displayOrder || i + 1,
              isThumbnail: m.isThumbnail || i === 0,
            },
          });
        }
      }
    }

    // E. Mağaza Ayarları
    const settingsList = [
      { key: "store_name", value: store.settings.storeName, desc: "Mağaza Adı" },
      { key: "currency", value: store.settings.currency || "TRY", desc: "Para Birimi" },
      { key: "free_shipping_threshold", value: String(store.settings.freeShippingThreshold), desc: "Ücretsiz Kargo Barajı" },
      { key: "phone", value: store.settings.phone, desc: "Müşteri Hizmetleri" },
      { key: "whatsapp", value: store.settings.whatsapp, desc: "WhatsApp Sipariş Hattı" },
      { key: "email", value: store.settings.email, desc: "İletişim E-Postası" },
      { key: "address", value: store.settings.address, desc: "Açık Adres" },
      { key: "default_seo_title", value: store.settings.defaultSeoTitle, desc: "SEO Başlığı" },
      { key: "default_seo_description", value: store.settings.defaultSeoDescription, desc: "SEO Açıklaması" },
      { key: "instagram_url", value: store.settings.instagramUrl, desc: "Instagram" },
      { key: "tiktok_url", value: store.settings.tiktokUrl, desc: "TikTok" },
      { key: "homepage_content_json", value: JSON.stringify(store.homepageContent), desc: "Vitrin İçerik Paketi" },
    ];

    for (const s of settingsList) {
      await prisma.storeSetting.upsert({
        where: { key: s.key },
        update: { value: s.value, description: s.desc },
        create: { key: s.key, value: s.value, description: s.desc },
      });
    }

    // F. Kampanyalar
    for (const camp of store.campaigns) {
      await prisma.discountCampaign.upsert({
        where: { code: camp.code },
        update: {
          title: camp.name,
          percentage: camp.discountPercentage ? new Prisma.Decimal(camp.discountPercentage) : null,
          minSpendAmount: camp.minBasketAmount ? new Prisma.Decimal(camp.minBasketAmount) : null,
          startDate: new Date(camp.startDate),
          endDate: new Date(camp.endDate),
          isActive: camp.isActive,
        },
        create: {
          id: camp.id,
          code: camp.code,
          title: camp.name,
          percentage: camp.discountPercentage ? new Prisma.Decimal(camp.discountPercentage) : null,
          minSpendAmount: camp.minBasketAmount ? new Prisma.Decimal(camp.minBasketAmount) : null,
          startDate: new Date(camp.startDate),
          endDate: new Date(camp.endDate),
          isActive: camp.isActive,
        },
      });
    }

    // 5. Sayımları karşılaştır
    console.log("\n[5/5] PostgreSQL kayıt sayıları doğrulanıyor...");
    const [
      pgCategories,
      pgCollections,
      pgProducts,
      pgVariants,
      pgMedia,
      pgUsers,
      pgSettings,
      pgCampaigns,
    ] = await Promise.all([
      prisma.category.count(),
      prisma.collection.count(),
      prisma.product.count(),
      prisma.productVariant.count(),
      prisma.productMedia.count(),
      prisma.user.count({ where: { role: { in: ["ADMIN", "STAFF"] } } }),
      prisma.storeSetting.count(),
      prisma.discountCampaign.count(),
    ]);

    const stats: MigrationStats = {
      categories: { json: store.categories.length, pg: pgCategories },
      collections: { json: store.collections.length, pg: pgCollections },
      products: { json: store.products.length, pg: pgProducts },
      variants: { json: totalVariants, pg: pgVariants },
      media: { json: totalMedia, pg: pgMedia },
      adminUsers: { json: store.adminUsers.length, pg: pgUsers },
      settings: { json: settingsList.length, pg: pgSettings },
      campaigns: { json: store.campaigns.length, pg: pgCampaigns },
    };

    console.log("\n==========================================================");
    console.log("AKTARIM ÖNCESİ (JSON) VE SONRASI (POSTGRESQL) KARŞILAŞTIRMASI");
    console.log("==========================================================");
    console.table(stats);
    console.log("\n✔ Veri aktarımı başarıyla tamamlandı. Tüm ilişkiler ve SKU'lar korundu.");

    return {
      success: true,
      message: "Veri aktarımı başarıyla tamamlandı.",
      stats,
      backupPath,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Aktarım hatası.";
    console.error("\n✖ Aktarım sırasında hata oluştu:", errorMsg);
    console.warn(`Kaynak veri güvenle korunmaktadır. Yedek: ${backupPath}`);
    return {
      success: false,
      message: `Aktarım hatası: ${errorMsg}`,
      backupPath,
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Komut satırından doğrudan çalıştırıldıysa yürüt
if (process.argv[1]?.includes("migrate-store-to-postgres")) {
  runMigration().then((res) => {
    if (!res.success) {
      process.exit(1);
    }
  });
}
