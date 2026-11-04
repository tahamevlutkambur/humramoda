import React from "react";
import { getStoreData, getStoreProductById } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import { ProductEditor } from "@/components/admin/ProductEditor";

import { CATEGORIES, COLLECTIONS, PRODUCTS } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface EditProductPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  await getPersistentStoreData().catch(() => {});
  const resolvedParams = await params;
  const rawId = resolvedParams?.id || "";
  const id = typeof rawId === "string" ? rawId.trim() : String(rawId || "").trim();
  const decoded = decodeURIComponent(id || "").trim();

  const store = getStoreData();

  const product =
    getStoreProductById(decoded) ||
    getStoreProductById(id) ||
    store.products.find(
      (p) =>
        p.id === id ||
        p.slug === id ||
        p.id === decoded ||
        p.slug === decoded ||
        p.id.toLowerCase() === decoded.toLowerCase() ||
        p.slug.toLowerCase() === decoded.toLowerCase() ||
        p.id.toLowerCase() === id.toLowerCase() ||
        p.slug.toLowerCase() === id.toLowerCase()
    ) ||
    PRODUCTS.find(
      (p) =>
        p.id === id ||
        p.slug === id ||
        p.id === decoded ||
        p.slug === decoded ||
        p.id.toLowerCase() === decoded.toLowerCase() ||
        p.slug.toLowerCase() === decoded.toLowerCase()
    );

  const safeCategories = store.categories.length > 0 ? store.categories : CATEGORIES;
  const safeCollections = store.collections.length > 0 ? store.collections : COLLECTIONS;

  return (
    <ProductEditor
      productId={decoded}
      initialProduct={product || undefined}
      categories={safeCategories}
      collections={safeCollections}
      isNew={false}
    />
  );
}
