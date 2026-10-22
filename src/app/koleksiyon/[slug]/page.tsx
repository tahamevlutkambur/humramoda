import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCollectionBySlug,
  getProducts,
  getAllCategories,
  COLLECTIONS,
} from "@/lib/catalog";
import { CatalogView } from "@/components/catalog/CatalogView";

interface CollectionPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return COLLECTIONS.map((col) => ({
    slug: col.slug,
  }));
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = getCollectionBySlug(slug);

  if (!collection) {
    return {
      title: "Koleksiyon Bulunamadı | Hümra Moda",
    };
  }

  return {
    title: `${collection.name} Koleksiyonu`,
    description: collection.description,
    openGraph: {
      title: `${collection.name} | Hümra Moda`,
      description: collection.description,
      locale: "tr_TR",
      type: "website",
    },
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const collection = getCollectionBySlug(slug);

  if (!collection) {
    notFound();
  }

  const products = getProducts({ collectionSlug: slug });
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
