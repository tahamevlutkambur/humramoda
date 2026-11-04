"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ProductItem, ProductColorItem, ProductMediaItem } from "@/lib/catalog";
import { ProductGallery } from "./ProductGallery";
import { ProductBuyBox } from "./ProductBuyBox";
import { ProductCard } from "./ProductCard";
import { Container } from "../ui/Container";
import {
  getClientStoreSnapshot,
  fetchSharedStore,
  subscribeStoreChanges,
} from "@/lib/client-store-sync";

interface ProductDetailViewProps {
  product?: ProductItem | null;
  slug?: string;
  relatedProducts: ProductItem[];
}

const DEFAULT_FALLBACK_COLOR: ProductColorItem = {
  id: "col-default",
  name: "Standart",
  slug: "standart",
  colorCode: "#141414",
  displayOrder: 1,
};

export function ProductDetailView({
  product: initialProduct,
  slug,
  relatedProducts: initialRelatedProducts,
}: ProductDetailViewProps) {
  const searchParams = useSearchParams();
  const initialRenkSlug = searchParams.get("renk");

  const findInProducts = useCallback(
    (list: ProductItem[], lookupKey: string): ProductItem | undefined => {
      if (!lookupKey) return undefined;
      const decoded = decodeURIComponent(lookupKey).trim();
      const lower = decoded.toLowerCase();
      return list.find(
        (p) =>
          p.slug === decoded ||
          p.id === decoded ||
          p.slug.toLowerCase() === lower ||
          p.id.toLowerCase() === lower
      );
    },
    []
  );

  const [product, setProduct] = useState<ProductItem | null>(() => {
    if (initialProduct) return initialProduct;
    const snap = getClientStoreSnapshot();
    const lookup = slug || "";
    if (snap && lookup) {
      return findInProducts(snap.products, lookup) || null;
    }
    return null;
  });
  const [relatedProducts, setRelatedProducts] = useState<ProductItem[]>(initialRelatedProducts);
  const [isLoading, setIsLoading] = useState<boolean>(() => !product);

  const getInitialColor = useCallback(
    (prod?: ProductItem | null): ProductColorItem => {
      if (!prod || !prod.colors || prod.colors.length === 0) {
        return DEFAULT_FALLBACK_COLOR;
      }
      if (initialRenkSlug) {
        const match = prod.colors.find((c) => c.slug === initialRenkSlug);
        if (match) return match;
      }
      return prod.colors[0];
    },
    [initialRenkSlug]
  );

  const [selectedColor, setSelectedColor] = useState<ProductColorItem>(() =>
    getInitialColor(product)
  );

  useEffect(() => {
    let active = true;
    const lookup = slug || initialProduct?.slug || initialProduct?.id || "";

    const applyStore = (productsList: ProductItem[]) => {
      if (!active || !Array.isArray(productsList)) return;
      const matched = findInProducts(productsList, lookup);
      if (matched) {
        setProduct(matched);
        setSelectedColor((prev) => {
          const valid = matched.colors?.find((c) => c.id === prev.id || c.slug === prev.slug);
          return valid || getInitialColor(matched);
        });
        const rel = productsList.filter((p) => p.id !== matched.id).slice(0, 4);
        setRelatedProducts(rel);
      }
    };

    const unsubscribe = subscribeStoreChanges((snap) => {
      applyStore(snap.products);
    });

    fetchSharedStore()
      .then((snap) => {
        applyStore(snap.products);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [slug, initialProduct?.slug, initialProduct?.id, findInProducts, getInitialColor]);

  // Tarayıcı geçmişi (back/forward) ile query param değişirse rengi güncelle
  useEffect(() => {
    if (initialRenkSlug && product?.colors) {
      const match = product.colors.find((c) => c.slug === initialRenkSlug);
      if (match && match.id !== selectedColor.id) {
        setSelectedColor(match);
      }
    }
  }, [initialRenkSlug, product?.colors, selectedColor.id]);

  // Renge özel medya listesi (kapak görseli öncelikli ve sıralı)
  const colorMedia = useMemo<ProductMediaItem[]>(() => {
    if (!product?.media || product.media.length === 0) return [];
    
    // 1. Doğrudan colorId veya renk adına göre filtrele
    const matchingColor = product.media.filter(
      (m) =>
        m.colorId === selectedColor.id ||
        (m as { colorName?: string }).colorName?.toLowerCase() === selectedColor.name.toLowerCase()
    );

    let baseList: ProductMediaItem[];
    if (matchingColor.length > 0) {
      baseList = matchingColor;
    } else {
      const uncolored = product.media.filter((m) => !m.colorId && !(m as { colorName?: string }).colorName);
      baseList = uncolored.length > 0 ? uncolored : product.media;
    }

    // 2. Kapak görseli (isThumbnail) ilk sırada, ardından displayOrder'a göre sırala
    return [...baseList].sort((a, b) => {
      if (a.isThumbnail && !b.isThumbnail) return -1;
      if (!a.isThumbnail && b.isThumbnail) return 1;
      return (a.displayOrder || 0) - (b.displayOrder || 0);
    });
  }, [product?.media, selectedColor.id, selectedColor.name]);

  if (isLoading && !product) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--hm-color-text-muted)",
        }}
      >
        Ürün yükleniyor...
      </div>
    );
  }

  if (!product) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          color: "var(--hm-color-text-muted)",
        }}
      >
        <p>Aradığınız ürün bulunamadı.</p>
      </div>
    );
  }

  // Renk değiştirildiğinde URL query parametresini sayfa yenilenmeden güncelle
  const handleSelectColor = (color: ProductColorItem) => {
    setSelectedColor(color);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("renk", color.slug);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // Structured Data (JSON-LD)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: colorMedia.map((m) => (m.url.startsWith("http") ? m.url : `https://humrabutik.com${m.url}`)),
    offers: {
      "@type": "Offer",
      priceCurrency: "TRY",
      price: product.discountPrice || product.basePrice,
      availability:
        product.variants.some((v) => v.stockQuantity > 0)
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: `https://humrabutik.com/urun/${product.slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div style={{ padding: "var(--hm-space-6) 0 var(--hm-space-16)" }}>
        <Container>
          {/* İki Kolonlu Detay Düzeni (Masaüstü: Sol Galeri, Sağ Satın Alma Kutusu) */}
          <div className="hm-product-detail-layout">
            {/* Sol: Renge Özel Galeri */}
            <div style={{ width: "100%" }}>
              <ProductGallery
                key={selectedColor.id}
                media={colorMedia}
                productTitle={`${product.title} - ${selectedColor.name}`}
              />
            </div>

            {/* Sağ: Bilgi & Satın Alma Kutusu (Sticky Desktop) */}
            <div
              style={{
                position: "sticky",
                top: "100px",
              }}
            >
              <ProductBuyBox
                product={product}
                selectedColor={selectedColor}
                onSelectColor={handleSelectColor}
              />
            </div>
          </div>

          {/* İlgili Ürünler / Kombini Tamamla */}
          {relatedProducts.length > 0 && (
            <section
              style={{
                marginTop: "var(--hm-space-16)",
                paddingTop: "var(--hm-space-10)",
                borderTop: "1px solid var(--hm-color-border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "var(--hm-space-6)",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "var(--hm-text-xs)",
                      letterSpacing: "var(--hm-tracking-wider)",
                      textTransform: "uppercase",
                      color: "var(--hm-color-text-muted)",
                      display: "block",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Seçkimiz
                  </span>
                  <h3
                    style={{
                      fontFamily: "var(--hm-font-display)",
                      fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)",
                      fontWeight: "var(--hm-font-regular)",
                      color: "var(--hm-color-text-main)",
                    }}
                  >
                    Kombini Tamamla &amp; Benzer Modeller
                  </h3>
                </div>
              </div>

              <div className="hm-related-products-grid">
                {relatedProducts.map((relProduct) => (
                  <ProductCard key={relProduct.id} product={relProduct} />
                ))}
              </div>
            </section>
          )}
        </Container>
      </div>
    </>
  );
}

export default ProductDetailView;

