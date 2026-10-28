import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCollectionBySlug } from "@/lib/catalog";
import { getStoreData } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";
import { CatalogView } from "@/components/catalog/CatalogView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CollectionPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function resolveCollection(slug: string) {
  await getPersistentStoreData().catch(() => {});
  const decoded = decodeURIComponent(slug).trim();
  try {
    const store = getStoreData();
    const found = store.collections.find(
      (c) =>
        c.slug === decoded ||
        c.id === decoded ||
        c.slug.toLowerCase() === decoded.toLowerCase()
    );
    if (found) return found;
  } catch {
    // ignore
  }
  return getCollectionBySlug(decoded);
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = await resolveCollection(slug);

  if (!collection) {
    return {
      title: "Koleksiyon Bulunamadı | Hümra Butik",
    };
  }

  return {
    title: `${collection.name} Koleksiyonu | Hümra Butik`,
    description: collection.description,
    openGraph: {
      title: `${collection.name} | Hümra Butik`,
      description: collection.description,
      locale: "tr_TR",
      type: "website",
    },
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const collection = await resolveCollection(slug);

  if (!collection) {
    notFound();
  }

  const store = getStoreData();
  const products = store.products
    .filter((p) => p.collectionSlugs?.some((s) => s.toLowerCase() === collection.slug.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const allCategories = [...store.categories].sort(
    (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)
  );

  return (
    <CatalogView
      title={collection.name}
      description={collection.description}
      initialProducts={products}
      categories={allCategories}
      currentCollectionSlug={collection.slug}
      breadcrumbs={[
        { label: "Ana Sayfa", href: "/" },
        { label: "Koleksiyonlar", href: "/urunler" },
        { label: collection.name },
      ]}
    />
  );
}
