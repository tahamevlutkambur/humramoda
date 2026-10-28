import React from "react";
import { getStoreData } from "@/lib/server/store";
import { CategoryManager } from "./CategoryManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Kategori Yönetimi | Hümra Moda Yönetim Paneli",
};

export default function AdminCategoriesPage() {
  const store = getStoreData();

  return (
    <CategoryManager
      initialCategories={store.categories}
      products={store.products}
    />
  );
}
