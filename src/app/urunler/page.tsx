import type { Metadata } from "next";
import { getStoreData } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import { CatalogView } from "@/components/catalog/CatalogView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Tüm Modeller & Koleksiyonlar",
  description:
    "Hümra Moda: Zamansız ikili takımlar, şardonlu modeller, dökümlü scuba parçalar ve trençkot tasarımlarının yer aldığı tüm kadın giyim koleksiyonu.",
  openGraph: {
    title: "Tüm Modeller | Hümra Moda",
    description: "Hümra Moda tüm koleksiyon ve modelleri keşfedin.",
    locale: "tr_TR",
    type: "website",
  },
};

export default async function AllProductsPage() {
  await getPersistentStoreData().catch(() => {});
  const store = getStoreData();
  const products = [...store.products].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const categories = [...store.categories].sort(
    (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)
  );

  return (
    <CatalogView
      title="Tüm Modeller"
      description="2026 Sezonu için hazırlanan, modern kalıplarla zamansız şıklığı bir araya getiren tüm Hümra Moda tasarımları."
      initialProducts={products}
      categories={categories}
      breadcrumbs={[
        { label: "Ana Sayfa", href: "/" },
        { label: "Tüm Modeller" },
      ]}
    />
  );
}
