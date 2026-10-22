"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ProductItem, ProductColorItem, ProductMediaItem } from "@/lib/catalog";
import { ProductGallery } from "./ProductGallery";
import { ProductBuyBox } from "./ProductBuyBox";
import { ProductCard } from "./ProductCard";
import { Container } from "../ui/Container";

interface ProductDetailViewProps {
  product: ProductItem;
  relatedProducts: ProductItem[];
}

export function ProductDetailView({ product, relatedProducts }: ProductDetailViewProps) {
  const searchParams = useSearchParams();
  const initialRenkSlug = searchParams.get("renk");

  // İlk rengi belirle: query param renk eşleşirse onu seç, eşleşmezse ilk rengi seç
  const getInitialColor = useCallback((): ProductColorItem => {
    if (initialRenkSlug && product.colors?.length > 0) {
      const match = product.colors.find((c) => c.slug === initialRenkSlug);
      if (match) return match;
    }
    return product.colors[0];
  }, [initialRenkSlug, product.colors]);

  const [selectedColor, setSelectedColor] = useState<ProductColorItem>(getInitialColor);

  // Tarayıcı geçmişi (back/forward) ile query param değişirse rengi güncelle
  useEffect(() => {
    if (initialRenkSlug) {
      const match = product.colors.find((c) => c.slug === initialRenkSlug);
      if (match && match.id !== selectedColor.id) {
        setSelectedColor(match);
      }
    }
  }, [initialRenkSlug, product.colors, selectedColor.id]);

  // Renge özel medya listesi (Asla diğer renklerin görselleri karışmaz)
  const colorMedia = useMemo<ProductMediaItem[]>(() => {
    const filtered = product.media.filter((m) => m.colorId === selectedColor.id);
    if (filtered.length > 0) return filtered;
    // Eğer renge atanmış görsel yoksa renksiz veya varsayılan görselleri göster
    return product.media.filter((m) => !m.colorId);
  }, [product.media, selectedColor.id]);

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
    image: colorMedia.map((m) => (m.url.startsWith("http") ? m.url : `https://humramoda.com${m.url}`)),
    offers: {
      "@type": "Offer",
      priceCurrency: "TRY",
      price: product.discountPrice || product.basePrice,
      availability:
        product.variants.some((v) => v.stockQuantity > 0)
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: `https://humramoda.com/urun/${product.slug}`,
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
          <div
            className="hm-product-detail-layout"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "var(--hm-space-8)",
              alignItems: "start",
            }}
          >
            {/* Sol: Renge Özel Galeri */}
            <div>
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

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "var(--hm-space-4)",
                }}
                className="hm-related-products-grid"
              >
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

