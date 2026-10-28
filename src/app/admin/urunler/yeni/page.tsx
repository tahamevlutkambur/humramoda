import React from "react";
import { getStoreData } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import { ProductEditor } from "@/components/admin/ProductEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewProductPage() {
  await getPersistentStoreData().catch(() => {});
  const store = getStoreData();

  return (
    <ProductEditor
      categories={store.categories}
      collections={store.collections}
      isNew={true}
    />
  );
}
