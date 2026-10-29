import defaultCatalog from "./default-catalog.json";
/**
 * Hümra Moda — Tip-Güvenli Katalog Veri Katmanı
 * Bu modül; veritabanı aktif olmadığında da gerçek çekim görsellerini (manifest.json)
 * ve dikey videoları referans alarak tip güvenli katalog verisini sunar.
 */

export interface ProductMediaItem {
  id: string;
  colorId?: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  thumbnailUrl: string;
  posterUrl?: string;
  altText: string;
  isThumbnail: boolean;
  displayOrder: number;
}

export interface ProductColorItem {
  id: string;
  name: string;
  slug: string;
  colorCode: string;
  displayOrder: number;
}

export interface ProductSizeItem {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
}

export interface ProductVariantItem {
  id: string;
  colorId: string;
  sizeId: string;
  sku: string;
  stockQuantity: number;
  costPrice?: number; // Birim maliyet / alış fiyatı (₺)
  barcode?: string;
  isActive: boolean;
}

export interface ProductItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  fabricDetails: string;
  modelDimensions: string;
  basePrice: number;
  discountPrice?: number;
  costPrice?: number; // Birim maliyet (₺)
  isPreOrder?: boolean;
  preOrderNote?: string;
  badge?: string; // "YENİ ÜRÜN", "ÇOK SATAN", "ÖN SİPARİŞ"
  categorySlug: string;
  categoryName: string;
  collectionSlugs: string[];
  colors: ProductColorItem[];
  sizes: ProductSizeItem[];
  variants: ProductVariantItem[];
  media: ProductMediaItem[];
  createdAt: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl?: string;
  displayOrder: number;
}

export interface CollectionItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  displayOrder: number;
}

export interface VideoLookItem {
  id: string;
  title: string;
  productSlug: string;
  colorSlug: string;
  videoUrl: string;
  posterUrl: string;
  price: number;
}

// -------------------------------------------------------------
// 1. KATEGORİLER & KOLEKSİYONLAR
// -------------------------------------------------------------
export const CATEGORIES: CategoryItem[] = defaultCatalog.categories as CategoryItem[];

export const COLLECTIONS: CollectionItem[] = [
  {
    id: "col-1",
    name: "Yeni Sezon",
    slug: "yeni-sezon",
    description: "Yeni gelen en taze parçalar.",
    displayOrder: 1,
  },
  {
    id: "col-2",
    name: "Çok Satanlar",
    slug: "cok-satanlar",
    description: "En çok tercih edilen Hümra Moda klasikleri.",
    displayOrder: 2,
  },
  {
    id: "col-3",
    name: "Özel Fırsatlar",
    slug: "ozel-firsatlar",
    description: "Seçili parçalarda sepet indirimleri.",
    displayOrder: 3,
  },
];

// -------------------------------------------------------------
// 2. GERÇEK GÖRSELLER İLE EŞLEŞTİRİLMİŞ KATALOG ÜRÜNLERİ
// -------------------------------------------------------------
export const PRODUCTS: ProductItem[] = defaultCatalog.products as ProductItem[];

// -------------------------------------------------------------
// 3. DİKEY VİDEO MODA GÖRÜNÜMLERİ (humravideolar/)
// -------------------------------------------------------------
export const FEATURED_VIDEOS: VideoLookItem[] = [
  {
    id: "vid-1",
    title: "Oversize Kemerli Trençkot",
    productSlug: "dugmeli-kemerli-oversize-trenckot",
    colorSlug: "camel",
    videoUrl: "/uploads/videos/model-beige-trench.mp4",
    posterUrl: "/uploads/products/IMG_2237-card.webp",
    price: 2250,
  },
  {
    id: "vid-2",
    title: "Qapitone Garnili Scuba Takım",
    productSlug: "qapitone-garnili-scuba-ikili-takim",
    colorSlug: "siyah",
    videoUrl: "/uploads/videos/woman-fashion-wear.mp4",
    posterUrl: "/uploads/products/IMG_2190-card.webp",
    price: 1574.1,
  },
];

// -------------------------------------------------------------
// 4. VERİ ERİŞİM YARDIMCILARI (DATA ACCESS METHODS)
// -------------------------------------------------------------

function getActiveProductsList(): ProductItem[] {
  const globalStore = (globalThis as { __humraStoreState?: { inMemoryStore?: { products?: ProductItem[] } } })
    .__humraStoreState?.inMemoryStore;
  if (globalStore && Array.isArray(globalStore.products)) {
    return globalStore.products;
  }
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getStoreData } = require("./server/store");
      return getStoreData().products;
    } catch {
      return PRODUCTS;
    }
  }
  return PRODUCTS;
}

function getActiveCategoriesList(): CategoryItem[] {
  const globalStore = (globalThis as { __humraStoreState?: { inMemoryStore?: { categories?: CategoryItem[] } } })
    .__humraStoreState?.inMemoryStore;
  if (globalStore && Array.isArray(globalStore.categories)) {
    return globalStore.categories;
  }
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getStoreData } = require("./server/store");
      return getStoreData().categories;
    } catch {
      return CATEGORIES;
    }
  }
  return CATEGORIES;
}

function getActiveCollectionsList(): CollectionItem[] {
  const globalStore = (globalThis as { __humraStoreState?: { inMemoryStore?: { collections?: CollectionItem[] } } })
    .__humraStoreState?.inMemoryStore;
  if (globalStore && Array.isArray(globalStore.collections)) {
    return globalStore.collections;
  }
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getStoreData } = require("./server/store");
      return getStoreData().collections;
    } catch {
      return COLLECTIONS;
    }
  }
  return COLLECTIONS;
}

function getActiveVideosList(): VideoLookItem[] {
  const globalStore = (globalThis as { __humraStoreState?: { inMemoryStore?: { featuredVideos?: VideoLookItem[] } } })
    .__humraStoreState?.inMemoryStore;
  if (globalStore && Array.isArray(globalStore.featuredVideos)) {
    return globalStore.featuredVideos;
  }
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getStoreData } = require("./server/store");
      return getStoreData().featuredVideos;
    } catch {
      return FEATURED_VIDEOS;
    }
  }
  return FEATURED_VIDEOS;
}

export function getAllCategories(): CategoryItem[] {
  const cats = [...getActiveCategoriesList()];
  return cats.sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getCategoryBySlug(slug: string): CategoryItem | undefined {
  if (!slug) return undefined;
  const decoded = decodeURIComponent(slug).trim();
  const lower = decoded.toLowerCase();
  return getActiveCategoriesList().find(
    (c) =>
      c.slug === slug ||
      c.id === slug ||
      c.slug === decoded ||
      c.id === decoded ||
      c.slug.toLowerCase() === lower ||
      c.id.toLowerCase() === lower
  );
}

export function getAllCollections(): CollectionItem[] {
  const cols = [...getActiveCollectionsList()];
  return cols.sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getCollectionBySlug(slug: string): CollectionItem | undefined {
  if (!slug) return undefined;
  const decoded = decodeURIComponent(slug).trim();
  const lower = decoded.toLowerCase();
  return getActiveCollectionsList().find(
    (c) =>
      c.slug === slug ||
      c.id === slug ||
      c.slug === decoded ||
      c.id === decoded ||
      c.slug.toLowerCase() === lower ||
      c.id.toLowerCase() === lower
  );
}

export interface GetProductsOptions {
  categorySlug?: string;
  collectionSlug?: string;
  query?: string;
  sort?: "price-asc" | "price-desc" | "newest";
}

export function getProducts(options: GetProductsOptions = {}): ProductItem[] {
  let list = [...getActiveProductsList()];

  if (options.categorySlug) {
    const catSlug = options.categorySlug.toLowerCase();
    list = list.filter((p) => p.categorySlug.toLowerCase() === catSlug);
  }

  if (options.collectionSlug) {
    const colSlug = options.collectionSlug.toLowerCase();
    list = list.filter((p) => p.collectionSlugs.some((s) => s.toLowerCase() === colSlug));
  }

  if (options.query) {
    const q = options.query.toLowerCase().trim();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.colors.some((c) => c.name.toLowerCase().includes(q))
    );
  }

  if (options.sort === "price-asc") {
    list.sort((a, b) => (a.discountPrice || a.basePrice) - (b.discountPrice || b.basePrice));
  } else if (options.sort === "price-desc") {
    list.sort((a, b) => (b.discountPrice || b.basePrice) - (a.discountPrice || a.basePrice));
  } else {
    // En yeniye göre sırala
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return list;
}

export function getProductBySlug(slug: string): ProductItem | undefined {
  if (!slug) return undefined;
  const decoded = decodeURIComponent(slug).trim();
  const lower = decoded.toLowerCase();
  return getActiveProductsList().find(
    (p) =>
      p.slug === slug ||
      p.id === slug ||
      p.slug === decoded ||
      p.id === decoded ||
      p.slug.toLowerCase() === lower ||
      p.id.toLowerCase() === lower
  );
}

export function getRelatedProducts(productId: string, limit = 4): ProductItem[] {
  const all = getActiveProductsList();
  const current = all.find((p) => p.id === productId);
  if (!current) return all.slice(0, limit);

  return all
    .filter((p) => p.id !== productId && p.categorySlug === current.categorySlug)
    .concat(all.filter((p) => p.id !== productId && p.categorySlug !== current.categorySlug))
    .slice(0, limit);
}

export function getFeaturedVideos(): VideoLookItem[] {
  return getActiveVideosList();
}

