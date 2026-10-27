import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCategoryBySlug,
  getProducts,
  getAllCategories,
} from "@/lib/catalog";
import { getStoreData } from "@/lib/server/store";
import { CatalogView } from "@/components/catalog/CatalogView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CategoryPageProps {
  params: Promise<{
    slug: string;
  }>;
}

function resolveCategory(slug: string) {
  const decoded = decodeURIComponent(slug);
  try {
    const store = getStoreData();
    const found = store.categories.find(
      (c) => c.slug === decoded || c.id === decoded || c.slug.toLowerCase() === decoded.toLowerCase()
    );
    if (found) return found;
  } catch {
    // ignore
  }
  return getCategoryBySlug(decoded);
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = resolveCategory(slug);

  if (!category) {
    return {
      title: "Kategori Bulunamadı | Hümra Butik",
    };
  }

  return {
    title: `${category.name} Modelleri`,
    description: category.description,
    openGraph: {
      title: `${category.name} | Hümra Moda`,
      description: category.description,
      locale: "tr_TR",
      type: "website",
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = resolveCategory(slug);

  if (!category) {
    notFound();
  }

  const products = getProducts({ categorySlug: category.slug });
  const allCategories = getAllCategories();

  return (
    <CatalogView
      title={category.name}
      description={category.description}
      initialProducts={products}
      categories={allCategories}
      currentCategorySlug={category.slug}
      breadcrumbs={[
        { label: "Ana Sayfa", href: "/" },
        { label: "Kategoriler", href: "/urunler" },
        { label: category.name },
      ]}
    />
  );
}
