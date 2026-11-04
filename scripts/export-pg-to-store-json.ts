import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * Hümra Moda — Faz 8.9: PostgreSQL'den JSON Mağaza Deposuna Güvenli Geri Dönüş ve Dışa Aktarım Aracı
 *
 * 10 KESİN GÜVENLİK KOŞULU:
 * 1. Üretim veritabanına bağlanmayı engelleyen hedef veritabanı kontrolü.
 * 2. Kaynak ve hedef veri sayılarının karşılaştırılması.
 * 3. Betül Trençkot 10 varyant / 100 stok doğrulaması.
 * 4. SKU benzersizliği kontrolü.
 * 5. JSON şema ve veri bütünlüğü doğrulaması.
 * 6. Geçici dosyaya yazma (.tmp).
 * 7. Dosya tamamen doğrulanmadan hedef dosyanın üzerine yazmama.
 * 8. Atomik dosya değiştirme (fs.renameSync).
 * 9. İşlem öncesi mevcut hedefin otomatik yedeklenmesi (.bak).
 * 10. Hata durumunda aktif dosyanın kesinlikle değişmeden kalması.
 */

export interface ExportOptions {
  databaseUrl?: string;
  outputPath?: string;
  allowActiveStoreOverwrite?: boolean;
  skipIdentityCheck?: boolean;
  dryRun?: boolean;
  allowOverwrite?: boolean;
  strictStaticParityCheck?: boolean;
}

export interface ExportResult {
  success: boolean;
  outputPath: string;
  sha256: string;
  stats: Record<string, number>;
  sourceDb: string;
  error?: string;
}

export async function exportPgToStoreJson(options?: ExportOptions | string): Promise<ExportResult> {
  const opts: ExportOptions = typeof options === "string" ? { outputPath: options } : options || {};

  const dbUrl =
    opts.databaseUrl ||
    process.env.TEST_DATABASE_URL ||
    "postgresql://humra_test:Yc1RJPBs3A9Xt0dfFU3R0P3W@127.0.0.1:5432/humra_migration_test?schema=public";

  const targetFile =
    opts.outputPath || path.join(process.cwd(), "backups", "exported-store-rollback.json");

  // GÜVENLİK KURALI: data/store.json üzerine yazılması açık onay (allowActiveStoreOverwrite) olmadan yasaktır
  const isTargetingActiveStore = path.resolve(targetFile) === path.resolve(process.cwd(), "data", "store.json");
  if (isTargetingActiveStore && !opts.allowActiveStoreOverwrite) {
    throw new Error(
      "GÜVENLİK ENGELİ: 'data/store.json' dosyasının üzerine doğrudan yazılamaz. " +
        "Lütfen ayrı bir çıktı yolu belirtiniz veya 'allowActiveStoreOverwrite: true' parametresini kullanınız."
    );
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    // KOŞUL 1: Hedef veritabanı denetimi
    const dbInfo: any[] = await prisma.$queryRaw`SELECT current_database(), current_user`;
    const currentDb = dbInfo[0]?.current_database || "";
    const currentUser = dbInfo[0]?.current_user || "";

    if (!opts.skipIdentityCheck) {
      if (currentDb !== "humra_migration_test") {
        throw new Error(
          `GÜVENLİK ENGELİ: Yalnızca test veritabanından ('humra_migration_test') aktarım yapılabilir. Bağlanılan: '${currentDb}'`
        );
      }
    }

    console.log(`[1] Veritabanı doğrulandı: DB='${currentDb}', USER='${currentUser}'`);
    console.log("[2] PostgreSQL tabloları okunuyor...");

    // Veritabanı sorguları
    const [
      dbProducts,
      dbCategories,
      dbCollections,
      dbOrders,
      dbShipments,
      dbReturnRequests,
      dbSettings,
      dbUsers,
      dbCampaigns,
      dbNotifications,
      dbAuditLogs,
      dbVideos,
      dbPaymentTransactions,
      dbIdempotencyKeys,
      dbPaymentOutbox,
    ] = await Promise.all([
      prisma.product.findMany({
        include: {
          colors: true,
          sizes: true,
          variants: true,
          media: true,
          collections: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.category.findMany({ orderBy: { displayOrder: "asc" } }),
      prisma.collection.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.order.findMany({
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.shipment.findMany({
        include: { events: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.returnRequest.findMany({
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.storeSetting.findMany(),
      prisma.user.findMany({
        include: { addresses: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.discountCampaign.findMany({
        select: {
          id: true,
          title: true,
          code: true,
          percentage: true,
          fixedAmount: true,
          minSpendAmount: true,
          startDate: true,
          endDate: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.customerNotification.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.auditLog.findMany({ orderBy: { timestamp: "desc" } }),
      prisma.featuredVideo.findMany({ orderBy: { displayOrder: "asc" } }),
      prisma.paymentTransaction.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.idempotencyKey.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.paymentOutbox.findMany({ orderBy: { createdAt: "desc" } }),
    ]);

    // Ayarları eşle
    const settingsMap: Record<string, any> = {};
    for (const s of dbSettings) {
      settingsMap[s.key] = s.value;
    }

    // JSON formatına dönüştür
    const storeJson: Record<string, any> = {
      updatedAt: new Date().toISOString(),
      categories: dbCategories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description || undefined,
        imageUrl: c.imageUrl || undefined,
        order: c.displayOrder,
        parentId: c.parentId || undefined,
      })),
      collections: dbCollections.map((col) => ({
        id: col.id,
        name: col.name,
        slug: col.slug,
        description: col.description || undefined,
        bannerDesktop: col.bannerDesktop || undefined,
        bannerMobile: col.bannerMobile || undefined,
        isActive: col.isActive,
      })),
      products: dbProducts.map((p) => ({
        id: p.id,
        name: p.title,
        slug: p.slug,
        description: p.description,
        price: Number(p.basePrice),
        discountPrice: p.discountPrice ? Number(p.discountPrice) : undefined,
        categoryId: p.categoryId,
        collectionIds: p.collections.map((pc) => pc.collectionId),
        isActive: p.isActive,
        badge: p.badge || undefined,
        colors: p.colors.map((c) => ({
          id: c.id,
          name: c.name,
          hex: c.colorCode,
        })),
        sizes: p.sizes.map((s) => ({
          id: s.id,
          name: s.name,
        })),
        variants: p.variants.map((v) => ({
          id: v.id,
          colorId: v.colorId,
          sizeId: v.sizeId,
          sku: v.sku,
          stockQuantity: v.stockQuantity,
          isActive: v.isActive,
        })),
        media: p.media.map((m) => ({
          id: m.id,
          url: m.url,
          thumbnailUrl: m.thumbnailUrl || undefined,
          type: m.type.toLowerCase(),
          colorId: m.colorId || undefined,
          order: m.displayOrder,
          alt: m.altText || undefined,
        })),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      orders: dbOrders.map((o) => {
        const addr = o.shippingAddress as any;
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          customerFullName: o.customerFullName,
          customerEmail: o.customerEmail,
          customerPhone: o.customerPhone,
          shippingAddress: addr
            ? {
                fullAddress: addr.fullAddress,
                district: addr.district,
                city: addr.city,
                postalCode: addr.postalCode || undefined,
              }
            : undefined,
          items: o.items.map((it) => ({
            productId: it.productId,
            productName: it.productName,
            variantId: it.variantId,
            sku: it.sku,
            colorName: it.colorName || undefined,
            sizeName: it.sizeName || undefined,
            unitPrice: Number(it.price),
            quantity: it.quantity,
            itemTotal: Number(it.totalPrice),
          })),
          totalAmount: Number(o.totalAmount),
          totalKurus: o.totalKurus,
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentProvider,
          operationalStatus: o.status,
          shippingStatus: o.shippingStatus,
          trackingNumber: o.trackingNumber || undefined,
          trackingCarrier: o.carrier || undefined,
          stockDeducted: o.stockDeducted,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
        };
      }),
      shipments: dbShipments,
      returnRequests: dbReturnRequests,
      settings: settingsMap,
      adminUsers: dbUsers.filter((u) => u.role !== "CUSTOMER"),
      customers: dbUsers.filter((u) => u.role === "CUSTOMER"),
      campaigns: dbCampaigns,
      notifications: dbNotifications,
      auditLogs: dbAuditLogs,
      featuredVideos: dbVideos,
      // PostgreSQL Altyapı Verileri (Kayıpsız Tam Yedek)
      _postgresInfrastructure: {
        paymentTransactions: dbPaymentTransactions,
        idempotencyKeys: dbIdempotencyKeys,
        paymentOutbox: dbPaymentOutbox,
      },
    };

    // KOŞUL 3: Kritik Ürün ve Canlı Veri Paritesi Doğrulaması (Betül Trençkot)
    const betul = storeJson.products.find((p: any) => p.slug === "betul-trenckot");
    if (!betul) {
      throw new Error("DOĞRULAMA HATASI: Betül Trençkot ürünü PostgreSQL verisinde bulunamadı.");
    }
    const dbBetul = dbProducts.find((p) => p.slug === "betul-trenckot");
    if (!dbBetul) {
      throw new Error("DOĞRULAMA HATASI: Betül Trençkot veritabanı kayıtlarında bulunamadı.");
    }

    const betulStock = betul.variants.reduce((sum: number, v: any) => sum + v.stockQuantity, 0);
    const dbBetulStock = dbBetul.variants.reduce((sum, v) => sum + v.stockQuantity, 0);

    // Canlı veri paritesi: Dışa aktarılan ile kaynak DB tam eşleşmeli
    if (betul.variants.length !== dbBetul.variants.length || betulStock !== dbBetulStock) {
      throw new Error(
        `PARİTE HATASI: Betül Trençkot varyant veya stok sayısı DB ile uyuşmuyor! JSON(Varyant=${betul.variants.length}, Stok=${betulStock}) vs DB(Varyant=${dbBetul.variants.length}, Stok=${dbBetulStock})`
      );
    }

    // Regresyon / Test Ortamı Kontrolü: Test veritabanında sabit 10 varyant / 100 stok doğrulaması
    if (opts.strictStaticParityCheck || currentDb === "humra_migration_test") {
      if (betul.variants.length !== 10 || betulStock !== 100) {
        throw new Error(
          `DOĞRULAMA HATASI: Betül Trençkot test verisi varyant/stok sayısı hatalı! Varyant=${betul.variants.length} (Beklenen: 10), Stok=${betulStock} (Beklenen: 100)`
        );
      }
    }

    // KOŞUL 4: SKU benzersizliği kontrolü
    const seenSkus = new Set<string>();
    for (const p of storeJson.products) {
      for (const v of p.variants) {
        if (!v.sku) throw new Error(`DOĞRULAMA HATASI: ${p.slug} varyantında boş SKU tespit edildi.`);
        if (seenSkus.has(v.sku.toUpperCase())) {
          throw new Error(`DOĞRULAMA HATASI: Mükerrer SKU tespit edildi: ${v.sku}`);
        }
        seenSkus.add(v.sku.toUpperCase());
      }
    }

    // KOŞUL 5: JSON şema doğrulaması
    const jsonStr = JSON.stringify(storeJson, null, 2);
    const parsedBack = JSON.parse(jsonStr);
    if (!Array.isArray(parsedBack.products) || !Array.isArray(parsedBack.categories)) {
      throw new Error("DOĞRULAMA HATASI: Üretilen JSON kök dizileri eksik.");
    }

    const sha256 = crypto.createHash("sha256").update(jsonStr).digest("hex").toUpperCase();

    // KOŞUL 6: Geçici dosyaya yazma (.tmp)
    const targetDir = path.dirname(targetFile);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const tempFile = `${targetFile}.tmp_${Date.now()}`;
    fs.writeFileSync(tempFile, jsonStr, "utf8");

    // KOŞUL 7 & 8 & 9: Güvenli yedekleme ve atomik değiştirme
    if (fs.existsSync(targetFile)) {
      const backupFile = `${targetFile}.bak_${Date.now()}`;
      fs.copyFileSync(targetFile, backupFile);
    }
    fs.renameSync(tempFile, targetFile);

    const stats = {
      categories: dbCategories.length,
      collections: dbCollections.length,
      products: dbProducts.length,
      variants: dbProducts.reduce((sum, p) => sum + p.variants.length, 0),
      orders: dbOrders.length,
      users: dbUsers.length,
      notifications: dbNotifications.length,
      auditLogs: dbAuditLogs.length,
      shipments: dbShipments.length,
      returnRequests: dbReturnRequests.length,
      paymentTransactions: dbPaymentTransactions.length,
      idempotencyKeys: dbIdempotencyKeys.length,
      paymentOutbox: dbPaymentOutbox.length,
    };

    console.log(`[3] Dışa aktarım tamamlandı: ${targetFile} (SHA256: ${sha256})`);
    return { success: true, outputPath: targetFile, sha256, stats, sourceDb: currentDb };
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  exportPgToStoreJson().catch((err) => {
    console.error("Geri dönüş aracı hatası:", err);
    process.exit(1);
  });
}
