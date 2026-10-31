import { NextResponse } from "next/server";
import {
  getAllStoreProducts,
  getAllStoreCategories,
  getStoreData,
} from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Vercel Edge CDN Önbellekleme:
// Fast Origin Transfer kotasının (10 GB) tükenmesini önlemek için katalog Edge CDN'de önbelleğe alınır.
// Ziyaretçiler doğrudan CDN'den yıldırım hızında yanıt alır, sunucusuz fonksiyona yük binmez.
// Yönetici ürün güncellediğinde revalidatePath('/api/catalog') ile CDN anında yenilenir.
const EDGE_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  "CDN-Cache-Control": "public, s-maxage=120",
  "Vercel-CDN-Cache-Control": "public, s-maxage=120",
};

export async function GET() {
  try {
    await getPersistentStoreData().catch(() => {});
    const store = getStoreData();
    const products = getAllStoreProducts();
    const categories = getAllStoreCategories();

    return NextResponse.json(
      {
        updatedAt: store.updatedAt || Date.now(),
        products,
        categories,
        collections: store.collections,
        featuredVideos: store.featuredVideos,
        homepageContent: store.homepageContent,
      },
      { headers: EDGE_CACHE_HEADERS }
    );
  } catch (err) {
    console.error("Public catalog API error:", err);
    const store = getStoreData();
    return NextResponse.json(
      {
        updatedAt: store.updatedAt || Date.now(),
        products: getAllStoreProducts(),
        categories: getAllStoreCategories(),
        collections: store.collections,
      },
      { headers: EDGE_CACHE_HEADERS }
    );
  }
}

