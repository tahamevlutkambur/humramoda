import React, { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug, getRelatedProducts, PRODUCTS } from "@/lib/catalog";
import { ProductDetailView } from "@/components/product/ProductDetailView";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return PRODUCTS.map((product) => ({
    slug: product.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) {
    return {
      title: "Ürün Bulunamadı | Hümra Moda",
    };
  }

  const primaryImage = product.media[0]?.url || "/uploads/products/IMG_2190-card.webp";

  return {
    title: `${product.title} — ${product.categoryName}`,
    description: product.description,
    openGraph: {
      title: `${product.title} | Hümra Moda`,
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
      title: `${product.title} | Hümra Moda`,
      description: product.description,
      images: [primaryImage],
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const product = getProductBySlug(slug);

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

