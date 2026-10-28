import React from "react";
import { notFound } from "next/navigation";
import { getStoreData, getStoreProductById } from "@/lib/server/store";
import { ProductEditor } from "@/components/admin/ProductEditor";

import { CATEGORIES, COLLECTIONS, PRODUCTS } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface EditProductPageProps {
  params: Promise<{
    id: string;
  }> | { id: string };
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const resolvedParams = await Promise.resolve(params);
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

  if (!product) {
    notFound();
  }

  const safeCategories = store.categories.length > 0 ? store.categories : CATEGORIES;
  const safeCollections = store.collections.length > 0 ? store.collections : COLLECTIONS;

  return (
    <ProductEditor
      initialProduct={product}
      categories={safeCategories}
      collections={safeCollections}
      isNew={false}
    />
  );
}
