import { NextResponse } from "next/server";
import {
  getAllStoreProducts,
  getAllStoreCategories,
  getStoreData,
} from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
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
      { headers: NO_STORE_HEADERS }
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
      { headers: NO_STORE_HEADERS }
    );
  }
}

