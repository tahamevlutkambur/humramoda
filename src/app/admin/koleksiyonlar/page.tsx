import React from "react";
import { getStoreData } from "@/lib/server/store";
import { CollectionManager } from "./CollectionManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Koleksiyon Yönetimi | Hümra Moda Yönetim Paneli",
};

export default function AdminCollectionsPage() {
  const store = getStoreData();

  return (
    <CollectionManager
      initialCollections={store.collections}
      initialProducts={store.products}
    />
  );
}
