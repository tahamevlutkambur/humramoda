"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ProductItem } from "@/lib/catalog";
import { ProductCard } from "@/components/product/ProductCard";

interface HomeProductGridProps {
  initialProducts: ProductItem[];
  mode: "new-arrivals" | "best-sellers";
}

export function HomeProductGrid({ initialProducts, mode }: HomeProductGridProps) {
  const [products, setProducts] = useState<ProductItem[]>(initialProducts);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/products?public=1", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (Array.isArray(data.products)) {
          setProducts(data.products);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const displayedProducts = useMemo(() => {
    const sorted = [...products].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (mode === "new-arrivals") {
      const tagged = sorted.filter((p) =>
        p.collectionSlugs?.some((s) => s.toLowerCase() === "yeni-sezon")
      );
      const untagged = sorted.filter(
        (p) => !p.collectionSlugs?.some((s) => s.toLowerCase() === "yeni-sezon")
      );
      return [...tagged, ...untagged];
    }

    // best-sellers
    const bestTagged = sorted.filter((p) =>
      p.collectionSlugs?.some((s) => s.toLowerCase() === "cok-satanlar")
    );
    if (bestTagged.length > 0) {
      const others = sorted.filter(
        (p) => !p.collectionSlugs?.some((s) => s.toLowerCase() === "cok-satanlar")
      );
      return [...bestTagged, ...others];
    }
    return sorted;
  }, [products, mode]);

  if (displayedProducts.length === 0) {
    return (
      <div
        style={{
          padding: "2.5rem 1rem",
          textAlign: "center",
          color: "var(--hm-color-text-muted)",
          fontSize: "var(--hm-text-sm)",
        }}
      >
        Yeni sezon ürünleri hazırlanıyor.
      </div>
    );
  }

  return (
    <div className="hm-catalog-grid">
      {displayedProducts.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
