import { PrismaClient, Prisma } from "@prisma/client";
import {
  ProductItem,
  CategoryItem,
  CollectionItem,
  ProductVariantItem,
  VideoLookItem,
  ProductColorItem,
  ProductSizeItem,
  ProductMediaItem,
} from "../../catalog";
import { CampaignItem, StoreSettings } from "../store";
import { IStoreDAO } from "./types";

export const EXPECTED_TEST_DATABASE = "humra_migration_test";
export const EXPECTED_TEST_USER = "humra_test";

/**
 * PrismaStoreDAO
 * PostgreSQL veritabanı (Docker test konteyneri) için salt okunur IStoreDAO adaptörü.
 * Decimal dönüşümleri, tarih formatları, ilişki hiyerarşisi ve sıralama kuralları
 * JSON sürücüsüyle %100 uyumlu olacak şekilde dönüştürülür.
 */
export class PrismaStoreDAO implements IStoreDAO {
  public readonly driverName = "postgres" as const;
  private prisma: PrismaClient;
  private isVerified = false;

  constructor(options?: { prisma?: PrismaClient; databaseUrl?: string; skipIdentityCheck?: boolean }) {
    if (options?.prisma) {
      this.prisma = options.prisma;
    } else {
      const url = options?.databaseUrl || process.env.DATABASE_URL;
      this.prisma = new PrismaClient({
        datasources: url ? { db: { url } } : undefined,
      });
    }

    if (options?.skipIdentityCheck) {
      this.isVerified = true;
    }
  }

  /**
   * Güvenlik kontrolü: Bağlanılan veritabanının geçerli olduğunu denetler.
   */
  public async assertAuthorizedDatabase(): Promise<void> {
    if (this.isVerified) return;

    try {
      const result = await this.prisma.$queryRaw<Array<{ current_database: string; current_user: string }>>`
        SELECT current_database(), current_user;
      `;
      const info = result[0];

      if (!info || !info.current_database) {
        throw new Error("Veritabanı bağlantı bilgisi alınamadı.");
      }

      // Canlı / Production ortamında veya açıkça postgres sürücüsü istendiğinde geçerli DB kabul edilir
      const isProdOrExplicitPostgres =
        process.env.NODE_ENV === "production" ||
        process.env.DATA_STORE_DRIVER === "postgres";

      if (!isProdOrExplicitPostgres) {
        if (info.current_database !== EXPECTED_TEST_DATABASE || info.current_user !== EXPECTED_TEST_USER) {
          throw new Error(
            `GÜVENLİK ENGELİ: PrismaStoreDAO test modunda yalnızca '${EXPECTED_TEST_DATABASE}' veritabanı ve '${EXPECTED_TEST_USER}' kullanıcısına bağlanabilir. ` +
              `Tespit edilen: DB='${info?.current_database}', USER='${info?.current_user}'`
          );
        }
      }

      this.isVerified = true;
    } catch (err: any) {
      if (err.message && err.message.includes("GÜVENLİK ENGELİ")) {
        throw err;
      }
      throw new Error(`PostgreSQL bağlantı ve kimlik doğrulama hatası: ${err.message}`);
    }
  }

  // 1. Ürün Sorguları
  public async getAllProducts(): Promise<ProductItem[]> {
    await this.assertAuthorizedDatabase();

    const products = await this.prisma.product.findMany({
      include: {
        category: true,
        collections: {
          include: {
            collection: true,
          },
        },
        colors: {
          orderBy: { displayOrder: "asc" },
        },
        sizes: {
          orderBy: { displayOrder: "asc" },
        },
        variants: {
          orderBy: { sku: "asc" },
        },
        media: {
          orderBy: { displayOrder: "asc" },
        },
      },
      orderBy: { displayOrder: "asc" },
    });

    return products.map((p) => this.mapPrismaProductToItem(p));
  }

  public async getProductById(idOrSlug: string): Promise<ProductItem | null> {
    if (!idOrSlug) return null;
    await this.assertAuthorizedDatabase();

    const trimmed = idOrSlug.trim();

    // Önce ID ile ara, bulunamazsa slug ile ara
    let product = await this.prisma.product.findUnique({
      where: { id: trimmed },
      include: {
        category: true,
        collections: { include: { collection: true } },
        colors: { orderBy: { displayOrder: "asc" } },
        sizes: { orderBy: { displayOrder: "asc" } },
        variants: { orderBy: { sku: "asc" } },
        media: { orderBy: { displayOrder: "asc" } },
      },
    });

    if (!product) {
      product = await this.prisma.product.findUnique({
        where: { slug: trimmed },
        include: {
          category: true,
          collections: { include: { collection: true } },
          colors: { orderBy: { displayOrder: "asc" } },
          sizes: { orderBy: { displayOrder: "asc" } },
          variants: { orderBy: { sku: "asc" } },
          media: { orderBy: { displayOrder: "asc" } },
        },
      });
    }

    return product ? this.mapPrismaProductToItem(product) : null;
  }

  public async getProductBySlug(slug: string): Promise<ProductItem | null> {
    if (!slug) return null;
    await this.assertAuthorizedDatabase();

    const product = await this.prisma.product.findUnique({
      where: { slug: slug.trim() },
      include: {
        category: true,
        collections: { include: { collection: true } },
        colors: { orderBy: { displayOrder: "asc" } },
        sizes: { orderBy: { displayOrder: "asc" } },
        variants: { orderBy: { sku: "asc" } },
        media: { orderBy: { displayOrder: "asc" } },
      },
    });

    return product ? this.mapPrismaProductToItem(product) : null;
  }

  public async getFeaturedProducts(limit = 8): Promise<ProductItem[]> {
    await this.assertAuthorizedDatabase();

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        isDraft: false,
        collections: {
          some: {
            collection: {
              slug: { in: ["cok-satanlar", "yeni-sezon"] },
            },
          },
        },
      },
      take: limit,
      include: {
        category: true,
        collections: { include: { collection: true } },
        colors: { orderBy: { displayOrder: "asc" } },
        sizes: { orderBy: { displayOrder: "asc" } },
        variants: { orderBy: { sku: "asc" } },
        media: { orderBy: { displayOrder: "asc" } },
      },
      orderBy: { displayOrder: "asc" },
    });

    return products.map((p) => this.mapPrismaProductToItem(p));
  }

  public async getCategoryProducts(categorySlug: string): Promise<ProductItem[]> {
    if (!categorySlug) return [];
    await this.assertAuthorizedDatabase();

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        isDraft: false,
        category: {
          slug: categorySlug.trim().toLowerCase(),
        },
      },
      include: {
        category: true,
        collections: { include: { collection: true } },
        colors: { orderBy: { displayOrder: "asc" } },
        sizes: { orderBy: { displayOrder: "asc" } },
        variants: { orderBy: { sku: "asc" } },
        media: { orderBy: { displayOrder: "asc" } },
      },
      orderBy: { displayOrder: "asc" },
    });

    return products.map((p) => this.mapPrismaProductToItem(p));
  }

  // 2. Kategori Sorguları
  public async getAllCategories(): Promise<CategoryItem[]> {
    await this.assertAuthorizedDatabase();

    const categories = await this.prisma.category.findMany({
      orderBy: { displayOrder: "asc" },
    });

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description || "",
      imageUrl: c.imageUrl || undefined,
      displayOrder: c.displayOrder,
    }));
  }

  public async getCategoryBySlug(slug: string): Promise<CategoryItem | null> {
    if (!slug) return null;
    await this.assertAuthorizedDatabase();

    const category = await this.prisma.category.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });

    if (!category) return null;

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      imageUrl: category.imageUrl || undefined,
      displayOrder: category.displayOrder,
    };
  }

  // 3. Koleksiyon Sorguları
  public async getAllCollections(): Promise<CollectionItem[]> {
    await this.assertAuthorizedDatabase();

    const collections = await this.prisma.collection.findMany({
      orderBy: { displayOrder: "asc" },
    });

    return collections.map((col) => ({
      id: col.id,
      name: col.name,
      slug: col.slug,
      description: col.description || "",
      displayOrder: col.displayOrder,
    }));
  }

  public async getCollectionBySlug(slug: string): Promise<CollectionItem | null> {
    if (!slug) return null;
    await this.assertAuthorizedDatabase();

    const collection = await this.prisma.collection.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });

    if (!collection) return null;

    return {
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description || "",
      displayOrder: collection.displayOrder,
    };
  }

  // 4. Varyant Sorguları
  public async getVariantById(id: string): Promise<ProductVariantItem | null> {
    if (!id) return null;
    await this.assertAuthorizedDatabase();

    const v = await this.prisma.productVariant.findUnique({
      where: { id: id.trim() },
    });

    if (!v) return null;

    return {
      id: v.id,
      colorId: v.colorId,
      sizeId: v.sizeId,
      sku: v.sku,
      stockQuantity: v.stockQuantity,
      costPrice: v.costPrice ? Number(v.costPrice) : undefined,
      barcode: v.barcode || undefined,
      isActive: v.isActive,
    };
  }

  public async getVariantBySku(sku: string): Promise<ProductVariantItem | null> {
    if (!sku) return null;
    await this.assertAuthorizedDatabase();

    const v = await this.prisma.productVariant.findUnique({
      where: { sku: sku.trim() },
    });

    if (!v) return null;

    return {
      id: v.id,
      colorId: v.colorId,
      sizeId: v.sizeId,
      sku: v.sku,
      stockQuantity: v.stockQuantity,
      costPrice: v.costPrice ? Number(v.costPrice) : undefined,
      barcode: v.barcode || undefined,
      isActive: v.isActive,
    };
  }

  public async getVariantsByProductId(productId: string): Promise<ProductVariantItem[]> {
    if (!productId) return [];
    await this.assertAuthorizedDatabase();

    const variants = await this.prisma.productVariant.findMany({
      where: { productId: productId.trim() },
      orderBy: { sku: "asc" },
    });

    return variants.map((v) => ({
      id: v.id,
      colorId: v.colorId,
      sizeId: v.sizeId,
      sku: v.sku,
      stockQuantity: v.stockQuantity,
      costPrice: v.costPrice ? Number(v.costPrice) : undefined,
      barcode: v.barcode || undefined,
      isActive: v.isActive,
    }));
  }

  // 5. Vitrin ve Ayar Sorguları
  public async getFeaturedVideos(): Promise<VideoLookItem[]> {
    await this.assertAuthorizedDatabase();

    const videos = await this.prisma.featuredVideo.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    });

    return videos.map((vid) => ({
      id: vid.id,
      title: vid.title,
      productSlug: vid.productSlug,
      colorSlug: vid.colorSlug || "",
      videoUrl: vid.videoUrl,
      posterUrl: vid.posterUrl || "",
      price: Number(vid.price),
    }));
  }

  public async getStoreSettings(): Promise<StoreSettings> {
    await this.assertAuthorizedDatabase();

    const rows = await this.prisma.storeSetting.findMany();
    const settings: Record<string, any> = {};

    for (const row of rows) {
      try {
        // JSON formatındaki alanları ayrıştır (örn. paytr objesi)
        if (row.value.startsWith("{") || row.value.startsWith("[")) {
          settings[row.key] = JSON.parse(row.value);
        } else if (row.value === "true") {
          settings[row.key] = true;
        } else if (row.value === "false") {
          settings[row.key] = false;
        } else if (
          (row.key === "freeShippingThreshold" || row.key === "shippingFee") &&
          !isNaN(Number(row.value))
        ) {
          settings[row.key] = Number(row.value);
        } else {
          settings[row.key] = row.value;
        }
      } catch {
        settings[row.key] = row.value;
      }
    }

    return settings as StoreSettings;
  }

  public async getDiscountCampaigns(): Promise<CampaignItem[]> {
    await this.assertAuthorizedDatabase();

    const campaigns = await this.prisma.discountCampaign.findMany({
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
      orderBy: { startDate: "desc" },
    });

    return campaigns.map((camp) => ({
      id: camp.id,
      code: camp.code || "",
      name: camp.title,
      discountPercentage: camp.percentage ? Number(camp.percentage) : undefined,
      minBasketAmount: camp.minSpendAmount ? Number(camp.minSpendAmount) : undefined,
      startDate: camp.startDate.toISOString().split("T")[0],
      endDate: camp.endDate.toISOString().split("T")[0],
      isActive: camp.isActive,
    }));
  }

  /**
   * Prisma ürün kaydını JSON uyumlu ProductItem yapısına dönüştürür.
   */
  private mapPrismaProductToItem(p: any): ProductItem {
    const colors: ProductColorItem[] = (p.colors || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      colorCode: c.colorCode,
      displayOrder: c.displayOrder,
    }));

    const sizes: ProductSizeItem[] = (p.sizes || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      displayOrder: s.displayOrder,
    }));

    const variants: ProductVariantItem[] = (p.variants || []).map((v: any) => ({
      id: v.id,
      colorId: v.colorId,
      sizeId: v.sizeId,
      sku: v.sku,
      stockQuantity: v.stockQuantity,
      costPrice: v.costPrice ? Number(v.costPrice) : undefined,
      barcode: v.barcode || undefined,
      isActive: v.isActive,
    }));

    const media: ProductMediaItem[] = (p.media || []).map((m: any) => ({
      id: m.id,
      colorId: m.colorId || undefined,
      type: m.type as "IMAGE" | "VIDEO",
      url: m.url,
      thumbnailUrl: m.thumbnailUrl || "",
      posterUrl: m.posterUrl || undefined,
      altText: m.altText || "",
      isThumbnail: m.isThumbnail,
      displayOrder: m.displayOrder,
    }));

    const collectionSlugs: string[] = (p.collections || [])
      .map((pc: any) => pc.collection?.slug)
      .filter(Boolean);

    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: p.description || "",
      fabricDetails: p.fabricDetails || "",
      modelDimensions: p.modelDimensions || "",
      basePrice: Number(p.basePrice),
      discountPrice: p.discountPrice ? Number(p.discountPrice) : undefined,
      costPrice: p.costPrice ? Number(p.costPrice) : undefined,
      isPreOrder: p.isPreOrder ?? false,
      preOrderNote: p.preOrderNote || undefined,
      badge: p.badge || undefined,
      categorySlug: p.category?.slug || "",
      categoryName: p.category?.name || "",
      collectionSlugs,
      colors,
      sizes,
      variants,
      media,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    };
  }

  /**
   * Veritabanı bağlantısını güvenle kapatır.
   */
  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
