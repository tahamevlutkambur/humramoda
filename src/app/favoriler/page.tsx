"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/product/ProductCard";
import { useFavorites } from "@/context/FavoritesContext";
import { PRODUCTS } from "@/lib/catalog";

export default function FavoritesPage() {
  const { favorites, clearFavorites, totalCount } = useFavorites();

  const favoriteProducts = useMemo(() => {
    return PRODUCTS.filter((p) => favorites.includes(p.id));
  }, [favorites]);

  return (
    <div style={{ padding: "var(--hm-space-8) 0 var(--hm-space-20)" }}>
      <Container>
        {/* Başlık ve Eylemler */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderBottom: "1px solid var(--hm-color-border-subtle)",
            paddingBottom: "var(--hm-space-6)",
            marginBottom: "var(--hm-space-8)",
          }}
        >
          <div>
            <nav
              style={{
                fontSize: "var(--hm-text-xs)",
                color: "var(--hm-color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "var(--hm-tracking-wider)",
                marginBottom: "0.25rem",
              }}
            >
              <Link href="/">Ana Sayfa</Link> / <span>Favorilerim</span>
            </nav>
            <h1
              style={{
                fontFamily: "var(--hm-font-display)",
                fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
                fontWeight: "var(--hm-font-regular)",
                letterSpacing: "var(--hm-tracking-tight)",
                color: "var(--hm-color-text-main)",
              }}
            >
              Favorilerim ({totalCount})
            </h1>
          </div>

          {totalCount > 0 && (
            <button
              type="button"
              onClick={clearFavorites}
              style={{
                fontSize: "var(--hm-text-xs)",
                letterSpacing: "var(--hm-tracking-wider)",
                textTransform: "uppercase",
                color: "var(--hm-color-text-muted)",
                transition: "color var(--hm-transition-fast)",
              }}
            >
              Tümünü Temizle
            </button>
          )}
        </div>

        {/* İçerik */}
        {favoriteProducts.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "var(--hm-space-16) var(--hm-space-4)",
              backgroundColor: "var(--hm-color-surface-subtle)",
              borderRadius: "var(--hm-radius-sm)",
              maxWidth: "600px",
              margin: "0 auto",
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--hm-color-text-muted)", margin: "0 auto 1rem" }}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <h2
              style={{
                fontFamily: "var(--hm-font-display)",
                fontSize: "var(--hm-text-xl)",
                color: "var(--hm-color-text-main)",
                marginBottom: "0.5rem",
              }}
            >
              Henüz Favori Ürününüz Yok
            </h2>
            <p
              style={{
                fontSize: "var(--hm-text-sm)",
                color: "var(--hm-color-text-secondary)",
                marginBottom: "1.5rem",
                lineHeight: 1.6,
              }}
            >
              Beğendiğiniz modellerin üzerindeki kalp ikonuna tıklayarak favorilerinize ekleyebilir, daha sonra kolayca inceleyebilirsiniz.
            </p>
            <Link href="/urunler">
              <Button variant="primary" size="md">
                Koleksiyonu Keşfet
              </Button>
            </Link>
          </div>
        ) : (
          <div className="hm-catalog-grid">
            {favoriteProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
