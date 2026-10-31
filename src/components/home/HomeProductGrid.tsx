"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ProductItem } from "@/lib/catalog";
import { ProductCard } from "@/components/product/ProductCard";
import {
  getClientStoreSnapshot,
  fetchSharedStore,
  subscribeStoreChanges,
} from "@/lib/client-store-sync";

interface HomeProductGridProps {
  initialProducts: ProductItem[];
  mode: "new-arrivals" | "best-sellers";
}

export function HomeProductGrid({ initialProducts, mode }: HomeProductGridProps) {
  const [products, setProducts] = useState<ProductItem[]>(() => {
    if (Array.isArray(initialProducts) && initialProducts.length > 0) {
      return initialProducts;
    }
    const snap = getClientStoreSnapshot();
    return snap && snap.products.length > 0 ? snap.products : [];
  });

  useEffect(() => {
    if (Array.isArray(initialProducts) && initialProducts.length > 0) {
      setProducts(initialProducts);
    }
  }, [initialProducts]);

  useEffect(() => {
    const unsubscribe = subscribeStoreChanges((snap) => {
      if (Array.isArray(snap.products)) {
        setProducts(snap.products);
      }
    });

    fetchSharedStore().then((snap) => {
      if (Array.isArray(snap.products)) {
        setProducts(snap.products);
      }
    });

    return unsubscribe;
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

