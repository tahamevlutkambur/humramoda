import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCategoryBySlug,
  getProducts,
  getAllCategories,
  CATEGORIES,
} from "@/lib/catalog";
import { CatalogView } from "@/components/catalog/CatalogView";

interface CategoryPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return CATEGORIES.map((cat) => ({
    slug: cat.slug,
  }));
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);

  if (!category) {
    return {
      title: "Kategori Bulunamadı | Hümra Moda",
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
  const category = getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const products = getProducts({ categorySlug: slug });
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
