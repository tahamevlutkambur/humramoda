import React, { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog";
import { getStoreData } from "@/lib/server/store";
import { ProductDetailView } from "@/components/product/ProductDetailView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

function resolveProduct(slug: string) {
  const decoded = decodeURIComponent(slug);
  try {
    const store = getStoreData();
    const found = store.products.find(
      (p) => p.slug === decoded || p.id === decoded || p.slug.toLowerCase() === decoded.toLowerCase()
    );
    if (found) return found;
  } catch {
    // ignore
  }
  return getProductBySlug(decoded);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = resolveProduct(slug);

  if (!product) {
    return {
      title: "Ürün Bulunamadı | Hümra Butik",
    };
  }

  const primaryImage = product.media[0]?.url || "/uploads/products/IMG_2190-card.webp";

  return {
    title: `${product.title} — ${product.categoryName} | Hümra Butik`,
    description: product.description,
    openGraph: {
      title: `${product.title} | Hümra Butik`,
      description: product.description,
      images: [
        {
          url: primaryImage,
          width: 640,
          height: 853,
          alt: product.title,
        },
      ],
      type: "website",
      locale: "tr_TR",
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.title} | Hümra Butik`,
      description: product.description,
      images: [primaryImage],
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const product = resolveProduct(slug);

  if (!product) {
    notFound();
  }

  const relatedProducts = getRelatedProducts(product.id, 4);

  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "60vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--hm-color-text-muted)",
          }}
        >
          Yükleniyor...
        </div>
      }
    >
      <ProductDetailView product={product} relatedProducts={relatedProducts} />
    </Suspense>
  );
}

