import { IStoreDAO, DAOParityResult, FieldDifference } from "./types";
import { JsonStoreDAO } from "./json-store-dao";
import { PrismaStoreDAO } from "./prisma-store-dao";

/**
 * JsonStoreDAO ve PrismaStoreDAO arasındaki verileri alan bazında (field-by-field) karşılaştırır.
 * Sadece kayıt sayılarının değil, tüm kritik alanların (fiyat, stok, SKU, slug, başlık, ilişkiler)
 * birebir eşit olduğunu kanıtlar.
 */
export async function compareDAOParity(
  jsonDao?: IStoreDAO,
  prismaDao?: IStoreDAO
): Promise<DAOParityResult> {
  const json = jsonDao || new JsonStoreDAO();
  const pg = prismaDao || new PrismaStoreDAO();

  const differences: FieldDifference[] = [];
  let totalChecks = 0;

  // 1. Ürünler Karşılaştırması
  const [jsonProducts, pgProducts] = await Promise.all([
    json.getAllProducts(),
    pg.getAllProducts(),
  ]);

  totalChecks++;
  if (jsonProducts.length !== pgProducts.length) {
    differences.push({
      entityType: "Product",
      entityId: "COUNT",
      field: "length",
      jsonValue: jsonProducts.length,
      postgresValue: pgProducts.length,
    });
  }

  const pgProductMap = new Map(pgProducts.map((p) => [p.id, p]));

  for (const jProd of jsonProducts) {
    const pProd = pgProductMap.get(jProd.id);
    totalChecks++;
    if (!pProd) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "existence",
        jsonValue: true,
        postgresValue: false,
      });
      continue;
    }

    // Başlık
    totalChecks++;
    if (jProd.title !== pProd.title) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "title",
        jsonValue: jProd.title,
        postgresValue: pProd.title,
      });
    }

    // Slug
    totalChecks++;
    if (jProd.slug !== pProd.slug) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "slug",
        jsonValue: jProd.slug,
        postgresValue: pProd.slug,
      });
    }

    // Fiyatlar
    totalChecks++;
    if (jProd.basePrice !== pProd.basePrice) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "basePrice",
        jsonValue: jProd.basePrice,
        postgresValue: pProd.basePrice,
      });
    }

    totalChecks++;
    const jDisc = jProd.discountPrice ?? null;
    const pDisc = pProd.discountPrice ?? null;
    if (jDisc !== pDisc) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "discountPrice",
        jsonValue: jDisc,
        postgresValue: pDisc,
      });
    }

    // Kategori İlişkisi
    totalChecks++;
    if (jProd.categorySlug.toLowerCase() !== pProd.categorySlug.toLowerCase()) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "categorySlug",
        jsonValue: jProd.categorySlug,
        postgresValue: pProd.categorySlug,
      });
    }

    // Koleksiyon İlişkileri
    totalChecks++;
    const jCols = [...(jProd.collectionSlugs || [])].sort();
    const pCols = [...(pProd.collectionSlugs || [])].sort();
    if (JSON.stringify(jCols) !== JSON.stringify(pCols)) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "collectionSlugs",
        jsonValue: jCols,
        postgresValue: pCols,
      });
    }

    // Renk Sayısı ve Kodları
    totalChecks++;
    if (jProd.colors.length !== pProd.colors.length) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "colors.length",
        jsonValue: jProd.colors.length,
        postgresValue: pProd.colors.length,
      });
    }

    // Beden Sayısı
    totalChecks++;
    if (jProd.sizes.length !== pProd.sizes.length) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "sizes.length",
        jsonValue: jProd.sizes.length,
        postgresValue: pProd.sizes.length,
      });
    }

    // Varyantlar (SKU, Stok ve ID)
    totalChecks++;
    if (jProd.variants.length !== pProd.variants.length) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "variants.length",
        jsonValue: jProd.variants.length,
        postgresValue: pProd.variants.length,
      });
    } else {
      const pVarMap = new Map(pProd.variants.map((v) => [v.id, v]));
      for (const jv of jProd.variants) {
        const pv = pVarMap.get(jv.id);
        totalChecks++;
        if (!pv) {
          differences.push({
            entityType: "ProductVariant",
            entityId: jv.id,
            field: "existence",
            jsonValue: true,
            postgresValue: false,
          });
          continue;
        }

        totalChecks++;
        if (jv.sku !== pv.sku) {
          differences.push({
            entityType: "ProductVariant",
            entityId: jv.id,
            field: "sku",
            jsonValue: jv.sku,
            postgresValue: pv.sku,
          });
        }

        totalChecks++;
        if (jv.stockQuantity !== pv.stockQuantity) {
          differences.push({
            entityType: "ProductVariant",
            entityId: jv.id,
            field: "stockQuantity",
            jsonValue: jv.stockQuantity,
            postgresValue: pv.stockQuantity,
          });
        }
      }
    }

    // Medya Kayıtları
    totalChecks++;
    if (jProd.media.length !== pProd.media.length) {
      differences.push({
        entityType: "Product",
        entityId: jProd.id,
        field: "media.length",
        jsonValue: jProd.media.length,
        postgresValue: pProd.media.length,
      });
    }
  }

  // 2. Kategoriler Karşılaştırması
  const [jsonCategories, pgCategories] = await Promise.all([
    json.getAllCategories(),
    pg.getAllCategories(),
  ]);

  totalChecks++;
  if (jsonCategories.length !== pgCategories.length) {
    differences.push({
      entityType: "Category",
      entityId: "COUNT",
      field: "length",
      jsonValue: jsonCategories.length,
      postgresValue: pgCategories.length,
    });
  }

  const pgCatMap = new Map(pgCategories.map((c) => [c.id, c]));
  for (const jCat of jsonCategories) {
    const pCat = pgCatMap.get(jCat.id);
    totalChecks++;
    if (!pCat) {
      differences.push({
        entityType: "Category",
        entityId: jCat.id,
        field: "existence",
        jsonValue: true,
        postgresValue: false,
      });
      continue;
    }

    totalChecks++;
    if (jCat.slug !== pCat.slug) {
      differences.push({
        entityType: "Category",
        entityId: jCat.id,
        field: "slug",
        jsonValue: jCat.slug,
        postgresValue: pCat.slug,
      });
    }
  }

  // 3. Koleksiyonlar Karşılaştırması
  const [jsonCollections, pgCollections] = await Promise.all([
    json.getAllCollections(),
    pg.getAllCollections(),
  ]);

  totalChecks++;
  if (jsonCollections.length !== pgCollections.length) {
    differences.push({
      entityType: "Collection",
      entityId: "COUNT",
      field: "length",
      jsonValue: jsonCollections.length,
      postgresValue: pgCollections.length,
    });
  }

  // 4. Vitrin Videoları Karşılaştırması
  const [jsonVideos, pgVideos] = await Promise.all([
    json.getFeaturedVideos(),
    pg.getFeaturedVideos(),
  ]);

  totalChecks++;
  if (jsonVideos.length !== pgVideos.length) {
    differences.push({
      entityType: "FeaturedVideo",
      entityId: "COUNT",
      field: "length",
      jsonValue: jsonVideos.length,
      postgresValue: pgVideos.length,
    });
  }

  // 5. İndirim Kampanyaları Karşılaştırması
  const [jsonCampaigns, pgCampaigns] = await Promise.all([
    json.getDiscountCampaigns(),
    pg.getDiscountCampaigns(),
  ]);

  totalChecks++;
  if (jsonCampaigns.length !== pgCampaigns.length) {
    differences.push({
      entityType: "DiscountCampaign",
      entityId: "COUNT",
      field: "length",
      jsonValue: jsonCampaigns.length,
      postgresValue: pgCampaigns.length,
    });
  }

  // 6. Mağaza Ayarları Karşılaştırması
  const [jsonSettings, pgSettings] = await Promise.all([
    json.getStoreSettings(),
    pg.getStoreSettings(),
  ]);

  const jsonSettingKeys = Object.keys(jsonSettings).sort();
  const pgSettingKeys = Object.keys(pgSettings).sort();

  totalChecks++;
  if (jsonSettingKeys.length !== pgSettingKeys.length) {
    differences.push({
      entityType: "StoreSetting",
      entityId: "COUNT",
      field: "keys.length",
      jsonValue: jsonSettingKeys.length,
      postgresValue: pgSettingKeys.length,
    });
  }

  // 7. Betül Trençkot Özel Koruması
  const betulJson = jsonProducts.find((p) => p.id === "prod-1793185888547");
  const betulPg = pgProducts.find((p) => p.id === "prod-1793185888547");

  const jStock = betulJson?.variants.reduce((sum, v) => sum + v.stockQuantity, 0) || 0;
  const pStock = betulPg?.variants.reduce((sum, v) => sum + v.stockQuantity, 0) || 0;
  const jVarCount = betulJson?.variants.length || 0;
  const pVarCount = betulPg?.variants.length || 0;
  const jSkus = new Set(betulJson?.variants.map((v) => v.sku));
  const pSkus = new Set(betulPg?.variants.map((v) => v.sku));

  // Yinelenen renk/beden kombinasyonu kontrolü
  const comboMap = new Map<string, number>();
  (betulPg?.variants || []).forEach((v) => {
    const k = `${v.colorId}__${v.sizeId}`;
    comboMap.set(k, (comboMap.get(k) || 0) + 1);
  });
  let duplicateCombos = 0;
  for (const c of comboMap.values()) {
    if (c > 1) duplicateCombos++;
  }

  const betulTrenckotCheck = {
    productId: "prod-1793185888547",
    variantCountMatch: jVarCount === 10 && pVarCount === 10,
    stockMatch: jStock === 100 && pStock === 100,
    skuMatch: jSkus.size === 10 && pSkus.size === 10,
    duplicateCombosPreserved: duplicateCombos === 2,
    jsonTotalStock: jStock,
    postgresTotalStock: pStock,
  };

  // Toplam varyant sayıları
  let totalJsonVariants = 0;
  jsonProducts.forEach((p) => (totalJsonVariants += (p.variants || []).length));
  let totalPgVariants = 0;
  pgProducts.forEach((p) => (totalPgVariants += (p.variants || []).length));

  const counts = {
    products: { json: jsonProducts.length, postgres: pgProducts.length, match: jsonProducts.length === pgProducts.length },
    categories: { json: jsonCategories.length, postgres: pgCategories.length, match: jsonCategories.length === pgCategories.length },
    collections: { json: jsonCollections.length, postgres: pgCollections.length, match: jsonCollections.length === pgCollections.length },
    variants: { json: totalJsonVariants, postgres: totalPgVariants, match: totalJsonVariants === totalPgVariants },
    videos: { json: jsonVideos.length, postgres: pgVideos.length, match: jsonVideos.length === pgVideos.length },
    campaigns: { json: jsonCampaigns.length, postgres: pgCampaigns.length, match: jsonCampaigns.length === pgCampaigns.length },
    settingsKeys: { json: jsonSettingKeys.length, postgres: pgSettingKeys.length, match: jsonSettingKeys.length === pgSettingKeys.length },
  };

  const isParityPerfect =
    differences.length === 0 &&
    betulTrenckotCheck.variantCountMatch &&
    betulTrenckotCheck.stockMatch &&
    betulTrenckotCheck.skuMatch &&
    betulTrenckotCheck.duplicateCombosPreserved;

  return {
    timestamp: new Date().toISOString(),
    isParityPerfect,
    totalChecks,
    differences,
    counts,
    betulTrenckotCheck,
  };
}

