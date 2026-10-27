import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCollectionBySlug,
  getProducts,
  getAllCategories,
} from "@/lib/catalog";
import { getStoreData } from "@/lib/server/store";
import { CatalogView } from "@/components/catalog/CatalogView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CollectionPageProps {
  params: Promise<{
    slug: string;
  }>;
}

function resolveCollection(slug: string) {
  const decoded = decodeURIComponent(slug);
  try {
    const store = getStoreData();
    const found = store.collections.find(
      (c) => c.slug === decoded || c.id === decoded || c.slug.toLowerCase() === decoded.toLowerCase()
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
  const collection = resolveCollection(slug);

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
  const collection = resolveCollection(slug);

  if (!collection) {
    notFound();
  }

  const products = getProducts({ collectionSlug: collection.slug });
  const allCategories = getAllCategories();

  return (
    <CatalogView
      title={collection.name}
      description={collection.description}
      initialProducts={products}
      categories={allCategories}
      breadcrumbs={[
        { label: "Ana Sayfa", href: "/" },
        { label: "Koleksiyonlar", href: "/urunler" },
        { label: collection.name },
      ]}
    />
  );
}
