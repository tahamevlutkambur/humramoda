import React from "react";
import { getStoreData } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import { CategoryManager } from "./CategoryManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Kategori Yönetimi | Hümra Moda Yönetim Paneli",
};

export default async function AdminCategoriesPage() {
  await getPersistentStoreData().catch(() => {});
  const store = getStoreData();

  return (
    <CategoryManager
      initialCategories={store.categories}
      products={store.products}
    />
  );
}
