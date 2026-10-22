import React from "react";
import { notFound } from "next/navigation";
import { getStoreData, getStoreProductById } from "@/lib/server/store";
import { ProductEditor } from "@/components/admin/ProductEditor";

interface EditProductPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  const product = getStoreProductById(id);

  if (!product) {
    notFound();
  }

  const store = getStoreData();

  return (
    <ProductEditor
      initialProduct={product}
      categories={store.categories}
      collections={store.collections}
      isNew={false}
    />
  );
}
