import {
  ProductItem,
  CategoryItem,
  CollectionItem,
  ProductVariantItem,
  VideoLookItem,
} from "../../catalog";
import {
  getAllStoreProducts,
  getStoreProductById,
  getStoreProductBySlug,
  getAllStoreCategories,
  getAllStoreCollections,
  getStoreData,
  getStoreSettings,
  getAllStoreCampaigns,
  CampaignItem,
  StoreSettings,
} from "../store";
import { IStoreDAO } from "./types";

/**
 * JsonStoreDAO
 * Mevcut JSON tabanlı veri erişim sistemini (data/store.json) IStoreDAO arayüzüne uyarlar.
 * Mevcut iş mantığını, atomiklik kurallarını ve API dönüş formatlarını %100 korur.
 */
export class JsonStoreDAO implements IStoreDAO {
  public readonly driverName = "json" as const;

  // 1. Ürün Sorguları
  public async getAllProducts(): Promise<ProductItem[]> {
    const products = getAllStoreProducts();
    // Derin kopya döndürerek referans sızıntısını ve yan etkileri engelle
    return JSON.parse(JSON.stringify(products));
  }

  public async getProductById(idOrSlug: string): Promise<ProductItem | null> {
    if (!idOrSlug) return null;
    const product = getStoreProductById(idOrSlug);
    return product ? JSON.parse(JSON.stringify(product)) : null;
  }

  public async getProductBySlug(slug: string): Promise<ProductItem | null> {
    if (!slug) return null;
    const product = getStoreProductBySlug(slug);
    return product ? JSON.parse(JSON.stringify(product)) : null;
  }

  public async getFeaturedProducts(limit = 8): Promise<ProductItem[]> {
    const products = getAllStoreProducts();
    const featured = products
      .filter((p) => {
        // Taslak veya pasif ürünleri hariç tut
        if ((p as any).isDraft || (p as any).isActive === false) return false;
        const colSlugs = p.collectionSlugs || [];
        return colSlugs.includes("cok-satanlar") || colSlugs.includes("yeni-sezon");
      })
      .slice(0, limit);

    return JSON.parse(JSON.stringify(featured));
  }

  public async getCategoryProducts(categorySlug: string): Promise<ProductItem[]> {
    if (!categorySlug) return [];
    const products = getAllStoreProducts();
    const targetSlug = categorySlug.trim().toLowerCase();

    const filtered = products.filter((p) => {
      if ((p as any).isDraft || (p as any).isActive === false) return false;
      return (
        p.categorySlug.toLowerCase() === targetSlug ||
        (p as any).categoryId?.toLowerCase() === targetSlug
      );
    });

    return JSON.parse(JSON.stringify(filtered));
  }

  // 2. Kategori Sorguları
  public async getAllCategories(): Promise<CategoryItem[]> {
    const categories = getAllStoreCategories();
    return JSON.parse(JSON.stringify(categories));
  }

  public async getCategoryBySlug(slug: string): Promise<CategoryItem | null> {
    if (!slug) return null;
    const categories = getAllStoreCategories();
    const targetSlug = slug.trim().toLowerCase();
    const category = categories.find(
      (c) => c.slug.toLowerCase() === targetSlug || c.id.toLowerCase() === targetSlug
    );
    return category ? JSON.parse(JSON.stringify(category)) : null;
  }

  // 3. Koleksiyon Sorguları
  public async getAllCollections(): Promise<CollectionItem[]> {
    const collections = getAllStoreCollections();
    return JSON.parse(JSON.stringify(collections));
  }

  public async getCollectionBySlug(slug: string): Promise<CollectionItem | null> {
    if (!slug) return null;
    const collections = getAllStoreCollections();
    const targetSlug = slug.trim().toLowerCase();
    const collection = collections.find(
      (col) => col.slug.toLowerCase() === targetSlug || col.id.toLowerCase() === targetSlug
    );
    return collection ? JSON.parse(JSON.stringify(collection)) : null;
  }

  // 4. Varyant Sorguları
  public async getVariantById(id: string): Promise<ProductVariantItem | null> {
    if (!id) return null;
    const store = getStoreData();
    const targetId = id.trim();

    for (const product of store.products) {
      const variant = (product.variants || []).find((v) => v.id === targetId);
      if (variant) {
        return JSON.parse(JSON.stringify(variant));
      }
    }
    return null;
  }

  public async getVariantBySku(sku: string): Promise<ProductVariantItem | null> {
    if (!sku) return null;
    const store = getStoreData();
    const targetSku = sku.trim().toUpperCase();

    for (const product of store.products) {
      const variant = (product.variants || []).find(
        (v) => (v.sku || "").trim().toUpperCase() === targetSku
      );
      if (variant) {
        return JSON.parse(JSON.stringify(variant));
      }
    }
    return null;
  }

  public async getVariantsByProductId(productId: string): Promise<ProductVariantItem[]> {
    if (!productId) return [];
    const product = getStoreProductById(productId);
    if (!product || !product.variants) return [];
    return JSON.parse(JSON.stringify(product.variants));
  }

  // 5. Vitrin ve Ayar Sorguları
  public async getFeaturedVideos(): Promise<VideoLookItem[]> {
    const store = getStoreData();
    const videos = store.featuredVideos || [];
    return JSON.parse(JSON.stringify(videos));
  }

  public async getStoreSettings(): Promise<StoreSettings> {
    const settings = getStoreSettings();
    return JSON.parse(JSON.stringify(settings));
  }

  public async getDiscountCampaigns(): Promise<CampaignItem[]> {
    const campaigns = getAllStoreCampaigns();
    return JSON.parse(JSON.stringify(campaigns));
  }
}
