import type { MetadataRoute } from "next";
import { PRODUCTS, CATEGORIES, COLLECTIONS } from "@/lib/catalog";
import { getStoreData } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://humrabutik.com";
  const now = new Date();

  // Dinamik mağaza verisini oku (admin tarafından eklenen yeni ürün/kategorileri de kapsasın)
  let allProducts = PRODUCTS;
  let allCategories = CATEGORIES;
  let allCollections = COLLECTIONS;

  try {
    const store = getStoreData();
    if (store.products && store.products.length > 0) {
      allProducts = store.products;
    }
    if (store.categories && store.categories.length > 0) {
      allCategories = store.categories;
    }
    if (store.collections && store.collections.length > 0) {
      allCollections = store.collections;
    }
  } catch {
    // Fallback static catalog
  }

  // 1. Sabit Ana Sayfa ve Statik Sayfalar
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/urunler`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${baseUrl}/koleksiyonlar`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/siparis-takip`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/iade-degisim`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/gizlilik-ve-cerez-politikasi`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/mesafeli-satis-sozlesmesi`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/kvkk-aydinlatma-metni`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  // 2. Kategori Sayfaları
  const categoryPages: MetadataRoute.Sitemap = allCategories.map((cat) => ({
    url: `${baseUrl}/kategori/${cat.slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.9,
  }));

  // 3. Koleksiyon Sayfaları
  const collectionPages: MetadataRoute.Sitemap = allCollections.map((col) => ({
    url: `${baseUrl}/koleksiyonlar/${col.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.85,
  }));

  // 4. Ürün Detay Sayfaları
  const productPages: MetadataRoute.Sitemap = allProducts.map((prod) => ({
    url: `${baseUrl}/urun/${prod.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...categoryPages, ...collectionPages, ...productPages];
}

