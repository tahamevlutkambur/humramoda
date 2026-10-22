import type { Metadata } from "next";
import { getProducts, getAllCategories } from "@/lib/catalog";
import { CatalogView } from "@/components/catalog/CatalogView";

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

export default function AllProductsPage() {
  const products = getProducts();
  const categories = getAllCategories();

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
