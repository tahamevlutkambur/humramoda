import type { Metadata } from "next";
import { getCategoryBySlug } from "@/lib/catalog";
import { getStoreData } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import { CatalogView } from "@/components/catalog/CatalogView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CategoryPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function resolveCategory(slug: string) {
  await getPersistentStoreData().catch(() => {});
  const decoded = decodeURIComponent(slug).trim();
  try {
    const store = getStoreData();
    const found = store.categories.find(
      (c) =>
        c.slug === decoded ||
        c.id === decoded ||
        c.slug.toLowerCase() === decoded.toLowerCase()
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
  const category = await resolveCategory(slug);

  if (!category) {
    return {
      title: "Koleksiyon | Hümra Butik",
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
  const decoded = decodeURIComponent(slug).trim();
  const category = (await resolveCategory(slug)) || {
    id: decoded,
    name: decoded.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    slug: decoded,
    description: "",
    displayOrder: 99,
  };

  const store = getStoreData();
  const products = store.products
    .filter((p) => p.categorySlug.toLowerCase() === category.slug.toLowerCase())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const allCategories = [...store.categories].sort(
    (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)
  );

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
