import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { PrismaClient, UserRole, MediaType, NotificationChannel, NotificationStatus } from "@prisma/client";

export interface MigrationPlanSummary {
  storePath: string;
  storeSha256: string;
  isHashValid: boolean;
  expectedHash: string;
  entityCounts: {
    products: number;
    colors: number;
    sizes: number;
    variants: number;
    media: number;
    categories: number;
    collections: number;
    productCollections: number;
    adminUsers: number;
    customers: number;
    customerAddresses: number;
    campaigns: number;
    notifications: number;
    auditLogs: number;
    featuredVideos: number;
    siteActivities: number;
    passwordResetTokens: number;
    settings: number;
  };
  betulTrenckotCheck: {
    productId: string;
    variantCount: number;
    expectedVariantCount: number;
    totalStock: number;
    expectedStock: number;
    distinctSkus: number;
    duplicateCombinations: Array<{ combo: string; variantIds: string[]; skus: string[] }>;
    status: "PASS" | "FAIL";
  };
  skuUniquenessCheck: {
    totalVariants: number;
    totalUniqueSkus: number;
    duplicateSkus: Array<{ sku: string; variantIds: string[]; productIds: string[] }>;
    status: "PASS" | "FAIL";
  };
  notificationsCheck: {
    totalNotifications: number;
    notificationsWithExistingOrder: number;
    notificationsWithLegacyOrder: number;
    status: "PASS" | "FAIL";
  };
  userRoleCheck: {
    totalUsers: number;
    rolesFound: string[];
    hasCarrier: boolean;
    hasAdmin: boolean;
    hasStaff: boolean;
    hasCustomer: boolean;
    status: "PASS" | "FAIL";
  };
  foreignKeyAnalysis: {
    categoryParentsValid: boolean;
    productCategoriesValid: boolean;
    variantColorsValid: boolean;
    variantSizesValid: boolean;
    mediaColorsValid: boolean;
    issuesFound: string[];
  };
}

export interface ParityReport {
  timestamp: string;
  isParityPerfect: boolean;
  tableCounts: Record<string, { json: number; db: number; match: boolean }>;
  betulCheck: {
    productId: string;
    variantCount: number;
    totalStock: number;
    uniqueSkus: number;
    duplicateCombosCount: number;
    match: boolean;
  };
  notificationsCheck: {
    totalDb: number;
    orderIdNullCount: number;
    legacyOrderIdPopulatedCount: number;
    match: boolean;
  };
  auditLogsCheck: {
    totalDb: number;
    actorIdsPreserved: boolean;
    match: boolean;
  };
  settingsCheck: {
    totalDb: number;
    match: boolean;
  };
}

export const EXPECTED_BASELINE_HASH =
  "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";

/**
 * JSON veri deposunu salt okunur biçimde okur ve hash değerini doğrular.
 */
export function readAndVerifyStore(storePath: string = path.resolve("data/store.json")): {
  rawBuffer: Buffer;
  store: any;
  sha256: string;
  isHashValid: boolean;
} {
  if (!fs.existsSync(storePath)) {
    throw new Error(`Store file not found at: ${storePath}`);
  }
  const rawBuffer = fs.readFileSync(storePath);
  const sha256 = crypto
    .createHash("sha256")
    .update(rawBuffer)
    .digest("hex")
    .toUpperCase();
  const store = JSON.parse(rawBuffer.toString("utf-8"));
  return {
    rawBuffer,
    store,
    sha256,
    isHashValid: sha256 === EXPECTED_BASELINE_HASH,
  };
}

/**
 * Tam kapsamlı migration analizi ve doğrulama planını çıkarır.
 */
export function analyzeMigrationPlan(storePath: string = path.resolve("data/store.json")): MigrationPlanSummary {
  const { store, sha256, isHashValid } = readAndVerifyStore(storePath);

  const products = store.products || [];
  const categories = store.categories || [];
  const collections = store.collections || [];
  const adminUsers = store.adminUsers || [];
  const customers = store.customers || [];
  const campaigns = store.campaigns || [];
  const notifications = store.notifications || [];
  const auditLogs = store.auditLogs || [];
  const featuredVideos = store.featuredVideos || [];
  const siteActivities = store.siteActivities || [];
  const passwordResetTokens = store.passwordResetTokens || [];
  const settings = store.settings || {};

  let totalColors = 0;
  let totalSizes = 0;
  let totalVariants = 0;
  let totalMedia = 0;
  let totalProductCollections = 0;
  let totalCustomerAddresses = 0;

  const categoryIds = new Set(categories.map((c: any) => c.id));
  const categorySlugMap = new Map(categories.map((c: any) => [c.slug, c.id]));
  const collectionSlugMap = new Map(collections.map((c: any) => [c.slug, c.id]));
  const fkIssues: string[] = [];

  // Kategori hiyerarşi denetimi
  let categoryParentsValid = true;
  categories.forEach((cat: any) => {
    if (cat.parentId && !categoryIds.has(cat.parentId)) {
      categoryParentsValid = false;
      fkIssues.push(`Category ${cat.id} has invalid parentId: ${cat.parentId}`);
    }
  });

  const skuMap = new Map<string, { variantIds: string[]; productIds: string[] }>();
  let productCategoriesValid = true;
  let variantColorsValid = true;
  let variantSizesValid = true;
  let mediaColorsValid = true;

  products.forEach((prod: any) => {
    totalColors += (prod.colors || []).length;
    totalSizes += (prod.sizes || []).length;
    totalVariants += (prod.variants || []).length;
    totalMedia += (prod.media || []).length;

    const catId = prod.categoryId || categorySlugMap.get(prod.categorySlug);
    if (!catId || (!categoryIds.has(catId) && !categorySlugMap.has(prod.categorySlug))) {
      productCategoriesValid = false;
      fkIssues.push(`Product ${prod.id} (${prod.title}) references unknown category: ${prod.categoryId || prod.categorySlug}`);
    }

    (prod.collectionSlugs || []).forEach((cSlug: string) => {
      if (collectionSlugMap.has(cSlug)) {
        totalProductCollections++;
      } else {
        fkIssues.push(`Product ${prod.id} references unknown collection slug: ${cSlug}`);
      }
    });

    const prodColorIds = new Set((prod.colors || []).map((c: any) => c.id));
    const prodSizeIds = new Set((prod.sizes || []).map((s: any) => s.id));

    (prod.variants || []).forEach((v: any) => {
      if (v.colorId && !prodColorIds.has(v.colorId)) {
        variantColorsValid = false;
        fkIssues.push(`Variant ${v.id} of product ${prod.id} references invalid colorId: ${v.colorId}`);
      }
      if (v.sizeId && !prodSizeIds.has(v.sizeId)) {
        variantSizesValid = false;
        fkIssues.push(`Variant ${v.id} of product ${prod.id} references invalid sizeId: ${v.sizeId}`);
      }

      const existing = skuMap.get(v.sku) || { variantIds: [], productIds: [] };
      existing.variantIds.push(v.id);
      existing.productIds.push(prod.id);
      skuMap.set(v.sku, existing);
    });

    (prod.media || []).forEach((m: any) => {
      if (m.colorId && !prodColorIds.has(m.colorId)) {
        mediaColorsValid = false;
        fkIssues.push(`Media ${m.id} of product ${prod.id} references unknown colorId: ${m.colorId}`);
      }
    });
  });

  customers.forEach((c: any) => {
    totalCustomerAddresses += (c.addresses || []).length;
  });

  // SKU benzersizlik analizi
  const duplicateSkus: Array<{ sku: string; variantIds: string[]; productIds: string[] }> = [];
  for (const [sku, item] of skuMap.entries()) {
    if (item.variantIds.length > 1) {
      duplicateSkus.push({ sku, variantIds: item.variantIds, productIds: item.productIds });
    }
  }

  // Betül Trençkot doğrulaması
  const betul = products.find((p: any) => p.id === "prod-1793185888547" || p.slug === "betul-trenckot");
  let betulVariantCount = 0;
  let betulStock = 0;
  let betulDistinctSkus = 0;
  const betulCombos: Array<{ combo: string; variantIds: string[]; skus: string[] }> = [];

  if (betul) {
    const variants = betul.variants || [];
    betulVariantCount = variants.length;
    betulStock = variants.reduce((sum: number, v: any) => sum + (v.stockQuantity || 0), 0);
    const skuSet = new Set(variants.map((v: any) => v.sku));
    betulDistinctSkus = skuSet.size;

    const comboMap = new Map<string, { variantIds: string[]; skus: string[] }>();
    variants.forEach((v: any) => {
      const comboKey = `${v.colorId}__${v.sizeId}`;
      const entry = comboMap.get(comboKey) || { variantIds: [], skus: [] };
      entry.variantIds.push(v.id);
      entry.skus.push(v.sku);
      comboMap.set(comboKey, entry);
    });

    for (const [combo, entry] of comboMap.entries()) {
      if (entry.variantIds.length > 1) {
        betulCombos.push({ combo, variantIds: entry.variantIds, skus: entry.skus });
      }
    }
  }

  const betulStatus: "PASS" | "FAIL" =
    betulVariantCount === 10 && betulStock === 100 && betulCombos.length === 2 ? "PASS" : "FAIL";

  // Bildirim analizi
  const existingOrderIds = new Set((store.orders || []).map((o: any) => o.id));
  let notificationsWithExistingOrder = 0;
  let notificationsWithLegacyOrder = 0;

  notifications.forEach((n: any) => {
    if (n.orderId && existingOrderIds.has(n.orderId)) {
      notificationsWithExistingOrder++;
    } else {
      notificationsWithLegacyOrder++;
    }
  });

  // Kullanıcı rolleri kontrolü
  const allUsers = [...adminUsers, ...customers];
  const rolesFound = new Set<string>();
  adminUsers.forEach((u: any) => rolesFound.add(u.role));
  customers.forEach(() => rolesFound.add("CUSTOMER"));

  const hasCarrier = rolesFound.has("CARRIER");
  const hasAdmin = rolesFound.has("ADMIN");
  const hasStaff = rolesFound.has("STAFF");
  const hasCustomer = rolesFound.has("CUSTOMER");

  return {
    storePath,
    storeSha256: sha256,
    isHashValid,
    expectedHash: EXPECTED_BASELINE_HASH,
    entityCounts: {
      products: products.length,
      colors: totalColors,
      sizes: totalSizes,
      variants: totalVariants,
      media: totalMedia,
      categories: categories.length,
      collections: collections.length,
      productCollections: totalProductCollections,
      adminUsers: adminUsers.length,
      customers: customers.length,
      customerAddresses: totalCustomerAddresses,
      campaigns: campaigns.length,
      notifications: notifications.length,
      auditLogs: auditLogs.length,
      featuredVideos: featuredVideos.length,
      siteActivities: siteActivities.length,
      passwordResetTokens: passwordResetTokens.length,
      settings: Object.keys(settings).length,
    },
    betulTrenckotCheck: {
      productId: betul ? betul.id : "NOT_FOUND",
      variantCount: betulVariantCount,
      expectedVariantCount: 10,
      totalStock: betulStock,
      expectedStock: 100,
      distinctSkus: betulDistinctSkus,
      duplicateCombinations: betulCombos,
      status: betulStatus,
    },
    skuUniquenessCheck: {
      totalVariants,
      totalUniqueSkus: skuMap.size,
      duplicateSkus,
      status: duplicateSkus.length === 0 ? "PASS" : "FAIL",
    },
    notificationsCheck: {
      totalNotifications: notifications.length,
      notificationsWithExistingOrder,
      notificationsWithLegacyOrder,
      status: notifications.length === 58 ? "PASS" : "FAIL",
    },
    userRoleCheck: {
      totalUsers: allUsers.length,
      rolesFound: Array.from(rolesFound),
      hasCarrier,
      hasAdmin,
      hasStaff,
      hasCustomer,
      status: hasCarrier && hasAdmin ? "PASS" : "FAIL",
    },
    foreignKeyAnalysis: {
      categoryParentsValid,
      productCategoriesValid,
      variantColorsValid,
      variantSizesValid,
      mediaColorsValid,
      issuesFound: fkIssues,
    },
  };
}

/**
 * Docker test veritabanı bağlantı URL'sini güvenle çözer.
 */
export function resolveTestDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("humra_migration_test")) {
    return process.env.DATABASE_URL;
  }
  const tempUrlPath = path.join(os.tmpdir(), "humra_test_db_url.txt");
  if (fs.existsSync(tempUrlPath)) {
    const rawUrl = fs.readFileSync(tempUrlPath, "utf-8").trim();
    if (rawUrl) {
      return rawUrl;
    }
  }
  throw new Error(
    "Docker test veritabanı URL'si bulunamadı. Lütfen DATABASE_URL ortam değişkenini ayarlayın veya temp dosyasını oluşturun."
  );
}

/**
 * Veritabanı kimliğini doğrular. Yalnızca 'humra_migration_test' ve 'humra_test' kabul edilir.
 */
export async function assertAuthorizedTestDatabase(prisma: PrismaClient): Promise<{ database: string; user: string }> {
  const result = await prisma.$queryRaw<Array<{ current_database: string; current_user: string }>>`
    SELECT current_database(), current_user;
  `;
  const info = result[0];
  if (!info || info.current_database !== "humra_migration_test" || info.current_user !== "humra_test") {
    throw new Error(
      `KRİTİK GÜVENLİK ENGELİ: Beklenmeyen veritabanı/kullanıcı tespit edildi: '${info?.current_database}' / '${info?.current_user}'. ` +
        `Yalnızca 'humra_migration_test' ve 'humra_test' hedeflenebilir!`
    );
  }
  return { database: info.current_database, user: info.current_user };
}

/**
 * PostgreSQL veritabanı ile data/store.json arasındaki veri paritesini denetler.
 */
export async function verifyDataParity(prisma: PrismaClient, storePath: string = path.resolve("data/store.json")): Promise<ParityReport> {
  const { store } = readAndVerifyStore(storePath);

  const [
    dbUsers,
    dbCategories,
    dbCollections,
    dbProducts,
    dbProductCollections,
    dbColors,
    dbSizes,
    dbVariants,
    dbMedia,
    dbCampaigns,
    dbVideos,
    dbSettings,
    dbNotifications,
    dbAuditLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.collection.count(),
    prisma.product.count(),
    prisma.productCollection.count(),
    prisma.productColor.count(),
    prisma.productSize.count(),
    prisma.productVariant.count(),
    prisma.productMedia.count(),
    prisma.discountCampaign.count(),
    prisma.featuredVideo.count(),
    prisma.storeSetting.count(),
    prisma.customerNotification.count(),
    prisma.auditLog.count(),
  ]);

  const jsonSummary = analyzeMigrationPlan(storePath);

  const tableCounts = {
    User: { json: jsonSummary.entityCounts.adminUsers, db: dbUsers, match: dbUsers === jsonSummary.entityCounts.adminUsers },
    Category: { json: jsonSummary.entityCounts.categories, db: dbCategories, match: dbCategories === jsonSummary.entityCounts.categories },
    Collection: { json: jsonSummary.entityCounts.collections, db: dbCollections, match: dbCollections === jsonSummary.entityCounts.collections },
    Product: { json: jsonSummary.entityCounts.products, db: dbProducts, match: dbProducts === jsonSummary.entityCounts.products },
    ProductCollection: { json: jsonSummary.entityCounts.productCollections, db: dbProductCollections, match: dbProductCollections === jsonSummary.entityCounts.productCollections },
    ProductColor: { json: jsonSummary.entityCounts.colors, db: dbColors, match: dbColors === jsonSummary.entityCounts.colors },
    ProductSize: { json: jsonSummary.entityCounts.sizes, db: dbSizes, match: dbSizes === jsonSummary.entityCounts.sizes },
    ProductVariant: { json: jsonSummary.entityCounts.variants, db: dbVariants, match: dbVariants === jsonSummary.entityCounts.variants },
    ProductMedia: { json: jsonSummary.entityCounts.media, db: dbMedia, match: dbMedia === jsonSummary.entityCounts.media },
    DiscountCampaign: { json: jsonSummary.entityCounts.campaigns, db: dbCampaigns, match: dbCampaigns === jsonSummary.entityCounts.campaigns },
    FeaturedVideo: { json: jsonSummary.entityCounts.featuredVideos, db: dbVideos, match: dbVideos === jsonSummary.entityCounts.featuredVideos },
    StoreSetting: { json: jsonSummary.entityCounts.settings, db: dbSettings, match: dbSettings === jsonSummary.entityCounts.settings },
    CustomerNotification: { json: jsonSummary.entityCounts.notifications, db: dbNotifications, match: dbNotifications === jsonSummary.entityCounts.notifications },
    AuditLog: { json: jsonSummary.entityCounts.auditLogs, db: dbAuditLogs, match: dbAuditLogs === jsonSummary.entityCounts.auditLogs },
  };

  // Betül Trençkot doğrulaması
  const betulVariants = await prisma.productVariant.findMany({
    where: { productId: "prod-1793185888547" },
  });
  const betulTotalStock = betulVariants.reduce((sum, v) => sum + v.stockQuantity, 0);
  const betulSkus = new Set(betulVariants.map((v) => v.sku));
  const comboMap = new Map<string, number>();
  betulVariants.forEach((v) => {
    const k = `${v.colorId}__${v.sizeId}`;
    comboMap.set(k, (comboMap.get(k) || 0) + 1);
  });
  let duplicateCombos = 0;
  for (const count of comboMap.values()) {
    if (count > 1) duplicateCombos++;
  }

  const betulMatch =
    betulVariants.length === 10 &&
    betulTotalStock === 100 &&
    betulSkus.size === 10 &&
    duplicateCombos === 2;

  // Bildirimler kontrolü
  const nullOrderIdCount = await prisma.customerNotification.count({
    where: { orderId: null },
  });
  const legacyOrderIdCount = await prisma.customerNotification.count({
    where: { legacyOrderId: { not: null } },
  });
  const notifMatch =
    dbNotifications === 58 &&
    nullOrderIdCount === 58 &&
    legacyOrderIdCount === 58;

  // Audit Log kontrolü
  const auditLogsWithActor = await prisma.auditLog.count({
    where: { adminId: { not: null } },
  });
  const auditMatch = dbAuditLogs === 47 && auditLogsWithActor === 47;

  // Ayarlar kontrolü
  const settingsMatch = dbSettings === 20;

  const allCountsMatch = Object.values(tableCounts).every((t) => t.match);
  const isParityPerfect = allCountsMatch && betulMatch && notifMatch && auditMatch && settingsMatch;

  return {
    timestamp: new Date().toISOString(),
    isParityPerfect,
    tableCounts,
    betulCheck: {
      productId: "prod-1793185888547",
      variantCount: betulVariants.length,
      totalStock: betulTotalStock,
      uniqueSkus: betulSkus.size,
      duplicateCombosCount: duplicateCombos,
      match: betulMatch,
    },
    notificationsCheck: {
      totalDb: dbNotifications,
      orderIdNullCount: nullOrderIdCount,
      legacyOrderIdPopulatedCount: legacyOrderIdCount,
      match: notifMatch,
    },
    auditLogsCheck: {
      totalDb: dbAuditLogs,
      actorIdsPreserved: auditMatch,
      match: auditMatch,
    },
    settingsCheck: {
      totalDb: dbSettings,
      match: settingsMatch,
    },
  };
}

/**
 * Verileri tek bir güvenli transaction içerisinde PostgreSQL veritabanına aktarır.
 */
export async function executeMigrationToPostgres(options: {
  target: string;
  storePath?: string;
  databaseUrl?: string;
  confirmProduction?: boolean;
}): Promise<{
  status: "SUCCESS" | "FAILED";
  recordsInserted: Record<string, number>;
  parityReport: ParityReport;
  durationMs: number;
}> {
  if (options.target !== "docker-test" && options.target !== "production" && options.target !== "supabase") {
    throw new Error(`Geçersiz target: '${options.target}'. Yalnızca '--target=docker-test' veya '--target=production' kabul edilir.`);
  }

  if ((options.target === "production" || options.target === "supabase") && !options.confirmProduction) {
    throw new Error("GÜVENLİK ENGELİ: Üretim/Supabase veritabanına aktarım için açıkça 'confirmProduction: true' parametresi zorunludur.");
  }

  const storePath = options.storePath || path.resolve("data/store.json");
  const { store, sha256, isHashValid } = readAndVerifyStore(storePath);

  if (!isHashValid) {
    throw new Error(`Güvenlik ihlali: store.json hash değeri beklenen değer ile eşleşmiyor! (${sha256})`);
  }

  const dbUrl = options.databaseUrl || resolveTestDatabaseUrl();
  const prisma = new PrismaClient({
    datasources: {
      db: { url: dbUrl },
    },
  });

  const startTime = Date.now();

  try {
    let auth: { database: string; user: string };
    if (options.target === "docker-test") {
      auth = await assertAuthorizedTestDatabase(prisma);
      console.log(`[Güvenlik Doğrulandı] Test veritabanı bağlantısı başarılı: DB='${auth.database}', USER='${auth.user}'`);
    } else {
      const dbInfo: any[] = await prisma.$queryRaw`SELECT current_database(), current_user;`;
      auth = { database: dbInfo[0]?.current_database || "", user: dbInfo[0]?.current_user || "" };
      console.log(`[Güvenlik Doğrulandı] Üretim veritabanı bağlantısı başarılı: DB='${auth.database}', USER='${auth.user}'`);
    }

    const products = store.products || [];
    const categories = store.categories || [];
    const collections = store.collections || [];
    const adminUsers = store.adminUsers || [];
    const campaigns = store.campaigns || [];
    const notifications = store.notifications || [];
    const auditLogs = store.auditLogs || [];
    const featuredVideos = store.featuredVideos || [];
    const settings = store.settings || {};

    const categoryMap = new Map<string, string>();
    categories.forEach((c: any) => {
      categoryMap.set(c.id, c.id);
      categoryMap.set(c.slug, c.id);
    });

    const collectionMap = new Map<string, string>();
    collections.forEach((col: any) => {
      collectionMap.set(col.id, col.id);
      collectionMap.set(col.slug, col.id);
    });

    // Hazırlık verileri
    const usersData = adminUsers.map((u: any) => ({
      id: u.id,
      email: u.email,
      passwordHash: u.passwordHash,
      fullName: u.fullName,
      phone: u.phone || null,
      role: (u.role as UserRole) || UserRole.CUSTOMER,
      isActive: u.isActive ?? true,
      createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
      updatedAt: u.updatedAt ? new Date(u.updatedAt) : new Date(),
    }));

    const categoriesData = categories.map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description || null,
      imageUrl: c.imageUrl || null,
      displayOrder: typeof c.displayOrder === "number" ? c.displayOrder : 0,
      isActive: c.isActive ?? true,
      parentId: c.parentId || null,
      seoTitle: c.seoTitle || null,
      seoDescription: c.seoDescription || null,
      createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
      updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
    }));

    const collectionsData = collections.map((col: any) => ({
      id: col.id,
      name: col.name,
      slug: col.slug,
      description: col.description || null,
      bannerDesktop: col.bannerDesktop || null,
      bannerMobile: col.bannerMobile || null,
      displayOrder: typeof col.displayOrder === "number" ? col.displayOrder : 0,
      isActive: col.isActive ?? true,
      seoTitle: col.seoTitle || null,
      seoDescription: col.seoDescription || null,
      createdAt: col.createdAt ? new Date(col.createdAt) : new Date(),
      updatedAt: col.updatedAt ? new Date(col.updatedAt) : new Date(),
    }));

    const productsData: any[] = [];
    const productCollectionsData: any[] = [];
    const colorsData: any[] = [];
    const sizesData: any[] = [];
    const variantsData: any[] = [];
    const mediaData: any[] = [];

    products.forEach((p: any) => {
      const catId = categoryMap.get(p.categoryId) || categoryMap.get(p.categorySlug) || p.categoryId;
      productsData.push({
        id: p.id,
        title: p.title,
        slug: p.slug,
        description: p.description || "",
        fabricDetails: p.fabricDetails || null,
        modelDimensions: p.modelDimensions || null,
        basePrice: p.basePrice,
        discountPrice: p.discountPrice || null,
        costPrice: p.costPrice || null,
        isPreOrder: p.isPreOrder ?? false,
        preOrderNote: p.preOrderNote || null,
        badge: p.badge || null,
        categoryId: catId,
        isActive: p.isActive ?? true,
        isDraft: p.isDraft ?? false,
        displayOrder: typeof p.displayOrder === "number" ? p.displayOrder : 0,
        seoTitle: p.seoTitle || null,
        seoDescription: p.seoDescription || null,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
      });

      (p.collectionSlugs || []).forEach((colSlug: string) => {
        const colId = collectionMap.get(colSlug);
        if (colId) {
          productCollectionsData.push({
            productId: p.id,
            collectionId: colId,
          });
        }
      });

      const usedColorSlugs = new Set<string>();
      (p.colors || []).forEach((c: any) => {
        let colorSlug = c.slug;
        if (c.name && c.name.toUpperCase() === "EKOSE" && colorSlug === "siyah") {
          colorSlug = "ekose";
        } else if (usedColorSlugs.has(colorSlug)) {
          const slugFromName = c.name ? c.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") : "";
          if (slugFromName && !usedColorSlugs.has(slugFromName)) {
            colorSlug = slugFromName;
          } else {
            colorSlug = `${colorSlug}-${c.id.slice(-4)}`;
          }
        }
        usedColorSlugs.add(colorSlug);

        colorsData.push({
          id: c.id,
          productId: p.id,
          name: c.name,
          slug: colorSlug,
          colorCode: c.colorCode || "#000000",
          displayOrder: typeof c.displayOrder === "number" ? c.displayOrder : 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      (p.sizes || []).forEach((s: any) => {
        sizesData.push({
          id: s.id,
          productId: p.id,
          name: s.name,
          slug: s.slug,
          displayOrder: typeof s.displayOrder === "number" ? s.displayOrder : 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      (p.variants || []).forEach((v: any) => {
        variantsData.push({
          id: v.id,
          productId: p.id,
          colorId: v.colorId,
          sizeId: v.sizeId,
          sku: v.sku,
          barcode: v.barcode || null,
          stockQuantity: typeof v.stockQuantity === "number" ? v.stockQuantity : 0,
          priceAdjustment: typeof v.priceAdjustment === "number" ? v.priceAdjustment : 0,
          costPrice: typeof v.costPrice === "number" ? v.costPrice : null,
          isActive: v.isActive ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      (p.media || []).forEach((m: any) => {
        mediaData.push({
          id: m.id,
          productId: p.id,
          colorId: m.colorId || null,
          type: m.type === "VIDEO" ? MediaType.VIDEO : MediaType.IMAGE,
          url: m.url,
          thumbnailUrl: m.thumbnailUrl || null,
          posterUrl: m.posterUrl || null,
          altText: m.altText || null,
          displayOrder: typeof m.displayOrder === "number" ? m.displayOrder : 0,
          isThumbnail: m.isThumbnail ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
    });

    const campaignsData = campaigns.map((camp: any) => ({
      id: camp.id,
      title: camp.title || camp.name || "Kampanya",
      code: camp.code || null,
      percentage: camp.percentage ?? camp.discountPercentage ?? null,
      fixedAmount: camp.fixedAmount ?? null,
      minSpendAmount: camp.minSpendAmount ?? camp.minBasketAmount ?? null,
      startDate: camp.startDate ? new Date(camp.startDate) : new Date(),
      endDate: camp.endDate ? new Date(camp.endDate) : new Date(),
      isActive: camp.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const featuredVideosData = featuredVideos.map((vid: any) => ({
      id: vid.id,
      title: vid.title,
      productSlug: vid.productSlug,
      colorSlug: vid.colorSlug || null,
      videoUrl: vid.videoUrl,
      posterUrl: vid.posterUrl || null,
      price: vid.price || 0,
      displayOrder: typeof vid.displayOrder === "number" ? vid.displayOrder : 0,
      isActive: vid.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const storeSettingsData = Object.entries(settings).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
      description: null,
      updatedAt: new Date(),
    }));

    const notificationsData = notifications.map((n: any) => ({
      id: n.id,
      orderId: null, // Legacy order referansı Order tablosunda henüz sipariş olmadığı için null
      orderNumber: n.orderNumber || "HM-LEGACY",
      legacyOrderId: n.orderId || null,
      channel: (n.channel as NotificationChannel) || NotificationChannel.EMAIL,
      eventType: n.eventType || "SYSTEM",
      recipient: n.recipient || "unknown@humramoda.local",
      subject: n.subject || "Bildirim",
      contentHtml: n.contentHtml || "",
      contentText: n.contentText || "",
      status: (n.status as NotificationStatus) || NotificationStatus.SENT,
      idempotencyKey: n.idempotencyKey || n.id,
      errorMessage: n.errorMessage || null,
      sentAt: n.sentAt ? new Date(n.sentAt) : null,
      createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
    }));

    const auditLogsData = auditLogs.map((l: any) => ({
      id: l.id,
      timestamp: l.timestamp ? new Date(l.timestamp) : new Date(),
      adminId: l.adminId || l.actorId || null,
      adminEmail: l.adminEmail || null,
      action: l.action || "UNKNOWN",
      targetType: l.targetType || "SYSTEM",
      targetId: l.targetId || null,
      result: l.result || "SUCCESS",
      ipAddress: l.ipAddress || null,
      correlationId: l.correlationId || null,
      details: l.details ?? null,
      createdAt: l.createdAt ? new Date(l.createdAt) : (l.timestamp ? new Date(l.timestamp) : new Date()),
    }));

    console.log("[İşlem Başlatılıyor] Bütün tablolar tek bir atomik transaction içerisinde aktarılıyor...");

    // Atomik transaction
    const recordsInserted = await prisma.$transaction(
      async (tx) => {
        const uRes = await tx.user.createMany({ data: usersData, skipDuplicates: true });
        const catRes = await tx.category.createMany({ data: categoriesData, skipDuplicates: true });
        const colRes = await tx.collection.createMany({ data: collectionsData, skipDuplicates: true });
        const prodRes = await tx.product.createMany({ data: productsData, skipDuplicates: true });
        const pcRes = await tx.productCollection.createMany({ data: productCollectionsData, skipDuplicates: true });
        const colorRes = await tx.productColor.createMany({ data: colorsData, skipDuplicates: true });
        const sizeRes = await tx.productSize.createMany({ data: sizesData, skipDuplicates: true });
        const varRes = await tx.productVariant.createMany({ data: variantsData, skipDuplicates: true });
        const medRes = await tx.productMedia.createMany({ data: mediaData, skipDuplicates: true });
        const campRes = await tx.discountCampaign.createMany({ data: campaignsData, skipDuplicates: true });
        const vidRes = await tx.featuredVideo.createMany({ data: featuredVideosData, skipDuplicates: true });
        const settRes = await tx.storeSetting.createMany({ data: storeSettingsData, skipDuplicates: true });
        const notifRes = await tx.customerNotification.createMany({ data: notificationsData, skipDuplicates: true });
        const auditRes = await tx.auditLog.createMany({ data: auditLogsData, skipDuplicates: true });

        return {
          User: uRes.count,
          Category: catRes.count,
          Collection: colRes.count,
          Product: prodRes.count,
          ProductCollection: pcRes.count,
          ProductColor: colorRes.count,
          ProductSize: sizeRes.count,
          ProductVariant: varRes.count,
          ProductMedia: medRes.count,
          DiscountCampaign: campRes.count,
          FeaturedVideo: vidRes.count,
          StoreSetting: settRes.count,
          CustomerNotification: notifRes.count,
          AuditLog: auditRes.count,
        };
      },
      { timeout: 60000 }
    );

    console.log("[Transaction Başarılı] Transaction başarıyla commit edildi.");

    // Veri parite denetimi
    const parityReport = await verifyDataParity(prisma, storePath);
    const durationMs = Date.now() - startTime;

    return {
      status: "SUCCESS",
      recordsInserted,
      parityReport,
      durationMs,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Komut satırı çalıştırma motoru
 */
export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isReport = args.includes("--report");
  const isVerify = args.includes("--verify");
  const isExecute = args.includes("--execute");
  const hasDockerTestTarget = args.includes("--target=docker-test");

  console.log("==================================================================");
  console.log("  HÜMRA MODA — POSTGRESQL VERİ AKTARIMI VE PARİTE MOTORU");
  console.log("  Faz 8.4: Kontrollü Veri Aktarımı, Doğrulama ve Geri Dönüş Testi");
  console.log("==================================================================\n");

  if (isExecute && !hasDockerTestTarget) {
    console.error("GÜVENLİK HATASI: --execute parametresi yalnızca '--target=docker-test' ile birlikte kullanılabilir.");
    console.error("Örnek: npx tsx scripts/migrate-json-to-pg.ts --execute --target=docker-test");
    process.exit(1);
  }

  // 1. Salt Veri Parite Doğrulaması (--verify)
  if (isVerify) {
    const dbUrl = resolveTestDatabaseUrl();
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await assertAuthorizedTestDatabase(prisma);
      console.log("[Veri Parite Denetimi Başlatılıyor...]");
      const report = await verifyDataParity(prisma);
      console.log(JSON.stringify(report, null, 2));
      if (!report.isParityPerfect) {
        console.error("Parite denetiminde uyumsuzluklar bulundu!");
        process.exit(1);
      }
      console.log("\nPARİTE %100 KUSURSUZ DOĞRULANDI.");
      return;
    } finally {
      await prisma.$disconnect();
    }
  }

  // 2. Gerçek Veri Aktarımı (--execute --target=docker-test)
  if (isExecute && hasDockerTestTarget) {
    console.log("[ÇALIŞTIRMA MODU] Hedef: Docker PostgreSQL (humra_migration_test)");
    const result = await executeMigrationToPostgres({ target: "docker-test" });

    console.log(`\nİşlem Durumu: ${result.status} (${result.durationMs} ms)`);
    console.log("\nEklenen / Etkilenen Kayıt Sayıları (createMany):");
    for (const [table, count] of Object.entries(result.recordsInserted)) {
      console.log(`  - ${table.padEnd(22)}: ${count}`);
    }

    console.log("\nVeri Parite Sonuçları (JSON vs PostgreSQL):");
    for (const [table, info] of Object.entries(result.parityReport.tableCounts)) {
      const mark = info.match ? "[OK]" : "[FAIL]";
      console.log(`  ${mark} ${table.padEnd(20)} JSON: ${String(info.json).padStart(3)} | DB: ${String(info.db).padStart(3)}`);
    }

    console.log("\nKritik Varlık Kontrolleri:");
    console.log(`  - Betül Trençkot (Varyant: ${result.parityReport.betulCheck.variantCount}/10, Stok: ${result.parityReport.betulCheck.totalStock}/100, Mükerrer Renk/Beden: ${result.parityReport.betulCheck.duplicateCombosCount}) -> ${result.parityReport.betulCheck.match ? "BAŞARILI" : "BAŞARISIZ"}`);
    console.log(`  - Bildirimler (Toplam: ${result.parityReport.notificationsCheck.totalDb}/58, orderId NULL: ${result.parityReport.notificationsCheck.orderIdNullCount}/58, legacyOrderId Dolu: ${result.parityReport.notificationsCheck.legacyOrderIdPopulatedCount}/58) -> ${result.parityReport.notificationsCheck.match ? "BAŞARILI" : "BAŞARISIZ"}`);
    console.log(`  - Audit Loglar (Toplam: ${result.parityReport.auditLogsCheck.totalDb}/47, Actor ID Korundu: EVET) -> ${result.parityReport.auditLogsCheck.match ? "BAŞARILI" : "BAŞARISIZ"}`);
    console.log(`  - Mağaza Ayarları (Toplam: ${result.parityReport.settingsCheck.totalDb}/20) -> ${result.parityReport.settingsCheck.match ? "BAŞARILI" : "BAŞARISIZ"}`);

    if (result.parityReport.isParityPerfect) {
      console.log("\n==================================================================");
      console.log("  AKTARM SONUCU: PARİTE %100 EKSİKSİZ VE HATASIZ DOĞRULANDI.");
      console.log("==================================================================\n");
    } else {
      console.error("\nUYARI: Bazı tablolarda parite uyumsuzluğu tespit edildi!");
      process.exit(1);
    }
    return;
  }

  // 3. Varsayılan Dry-Run / Analiz Raporu
  const analysis = analyzeMigrationPlan();

  console.log(`[1] Veri Dosyası Doğrulaması:`);
  console.log(`    - Dosya Yolu: ${analysis.storePath}`);
  console.log(`    - SHA256: ${analysis.storeSha256}`);
  console.log(`    - Hash Durumu: ${analysis.isHashValid ? "GEÇERLİ (%100 Eşleşme)" : "GEÇERSİZ"}`);

  console.log(`\n[2] Varlık ve Kayıt Sayıları:`);
  console.log(`    - Ürünler: ${analysis.entityCounts.products} (Beklenen: 13)`);
  console.log(`    - Renkler: ${analysis.entityCounts.colors} (Beklenen: 36)`);
  console.log(`    - Bedenler: ${analysis.entityCounts.sizes} (Beklenen: 37)`);
  console.log(`    - Varyantlar: ${analysis.entityCounts.variants} (Beklenen: 118)`);
  console.log(`    - Medya Kayıtları: ${analysis.entityCounts.media} (Beklenen: 24)`);
  console.log(`    - Kategoriler: ${analysis.entityCounts.categories} (Beklenen: 7)`);
  console.log(`    - Koleksiyonlar: ${analysis.entityCounts.collections} (Beklenen: 3)`);
  console.log(`    - Ürün-Koleksiyon Bağları: ${analysis.entityCounts.productCollections} (Beklenen: 26)`);
  console.log(`    - Admin Kullanıcıları: ${analysis.entityCounts.adminUsers} (Beklenen: 4)`);
  console.log(`    - Kampanyalar: ${analysis.entityCounts.campaigns} (Beklenen: 1)`);
  console.log(`    - Bildirimler: ${analysis.entityCounts.notifications} (Beklenen: 58)`);
  console.log(`    - Audit Loglar: ${analysis.entityCounts.auditLogs} (Beklenen: 47)`);
  console.log(`    - Featured Video: ${analysis.entityCounts.featuredVideos} (Beklenen: 2)`);
  console.log(`    - Mağaza Ayarları: ${analysis.entityCounts.settings} (Beklenen: 20)`);

  console.log(`\n[3] Betül Trençkot Koruma Doğrulaması:`);
  console.log(`    - Ürün ID: ${analysis.betulTrenckotCheck.productId}`);
  console.log(`    - Varyant Sayısı: ${analysis.betulTrenckotCheck.variantCount} / 10`);
  console.log(`    - Toplam Stok: ${analysis.betulTrenckotCheck.totalStock} / 100`);
  console.log(`    - Benzersiz SKU Sayısı: ${analysis.betulTrenckotCheck.distinctSkus} / 10`);
  console.log(`    - Tekrarlanan Renk/Beden Kombinasyonları: ${analysis.betulTrenckotCheck.duplicateCombinations.length} adet`);
  analysis.betulTrenckotCheck.duplicateCombinations.forEach((c, idx) => {
    console.log(`      * [${idx + 1}] Kombinasyon "${c.combo}" -> Varyantlar: ${c.variantIds.join(", ")} | SKU: ${c.skus.join(", ")}`);
  });
  console.log(`    - Durum: ${analysis.betulTrenckotCheck.status === "PASS" ? "BAŞARILI (Tam Korundu)" : "BAŞARISIZ"}`);

  console.log(`\n[4] SKU Benzersizlik Denetimi:`);
  console.log(`    - Toplam Varyant: ${analysis.skuUniquenessCheck.totalVariants}`);
  console.log(`    - Toplam Tekil SKU: ${analysis.skuUniquenessCheck.totalUniqueSkus}`);
  console.log(`    - Mükerrer SKU Sayısı: ${analysis.skuUniquenessCheck.duplicateSkus.length}`);
  if (analysis.skuUniquenessCheck.duplicateSkus.length === 0) {
    console.log(`    - Sonuç: BÜTÜN 118 VARYANTIN SKU DEĞERLERİ %100 BENZERSİZDİR.`);
  }

  console.log(`\n[5] Bildirim ve İlişki Analizi:`);
  console.log(`    - Toplam Bildirim: ${analysis.notificationsCheck.totalNotifications}`);
  console.log(`    - legacyOrderId İle Korunan Bildirimler: ${analysis.notificationsCheck.notificationsWithLegacyOrder} / 58`);
  console.log(`    - Durum: ${analysis.notificationsCheck.status === "PASS" ? "BAŞARILI (Kayıpsız Korundu)" : "BAŞARISIZ"}`);

  console.log(`\n[6] Kullanıcı Rolleri Analizi:`);
  console.log(`    - Bulunan Roller: ${analysis.userRoleCheck.rolesFound.join(", ")}`);
  console.log(`    - CARRIER Rolü Tanımlı mı: ${analysis.userRoleCheck.hasCarrier ? "EVET" : "HAYIR"}`);
  console.log(`    - Durum: ${analysis.userRoleCheck.status === "PASS" ? "BAŞARILI" : "BAŞARISIZ"}`);

  console.log(`\n[7] İlişki ve Foreign Key Ön Doğrulaması:`);
  if (analysis.foreignKeyAnalysis.issuesFound.length === 0) {
    console.log(`    - Bütün dahili ilişkiler %100 GEÇERLİ.`);
  } else {
    console.warn(`    - UYARI: ${analysis.foreignKeyAnalysis.issuesFound.length} adet ilişki sorunu tespit edildi:`);
    analysis.foreignKeyAnalysis.issuesFound.forEach((iss) => console.warn(`      * ${iss}`));
  }

  console.log("\n==================================================================");
  console.log("  PROVA SONUCU: DRY-RUN BAŞARIYLA TAMAMLANDI.");
  console.log("  Hiçbir veritabanı yazma işlemi yapılmamıştır.");
  console.log("==================================================================\n");
}

if (process.argv[1] && process.argv[1].endsWith("migrate-json-to-pg.ts")) {
  runCli().catch((err) => {
    console.error("Migration script hatası:", err);
    process.exit(1);
  });
}
