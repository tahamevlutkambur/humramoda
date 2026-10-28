"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Container } from "../ui/Container";
import { getAllCategories, CategoryItem } from "@/lib/catalog";
import {
  getClientStoreSnapshot,
  fetchSharedStore,
  subscribeStoreChanges,
} from "@/lib/client-store-sync";

interface CategoryTilesProps {
  initialCategories?: CategoryItem[];
}

export function CategoryTiles({ initialCategories }: CategoryTilesProps) {
  const [categories, setCategories] = useState<CategoryItem[]>(() => {
    const snap = getClientStoreSnapshot();
    if (snap && snap.categories.length > 0) {
      return [...snap.categories].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    }
    return initialCategories && initialCategories.length > 0
      ? initialCategories
      : getAllCategories();
  });

  useEffect(() => {
    const applyCategories = (cats?: CategoryItem[]) => {
      if (Array.isArray(cats) && cats.length > 0) {
        const sorted = [...cats].sort(
          (a: CategoryItem, b: CategoryItem) => (a.displayOrder || 0) - (b.displayOrder || 0)
        );
        setCategories(sorted);
      }
    };

    const unsubscribe = subscribeStoreChanges((snap) => {
      applyCategories(snap.categories);
    });

    fetchSharedStore().then((snap) => {
      applyCategories(snap.categories);
    });

    return unsubscribe;
  }, []);

  return (
    <section style={{ padding: "var(--hm-space-16) 0" }}>
      <Container>
        <div style={{ textAlign: "center", marginBottom: "var(--hm-space-10)" }}>
          <span
            style={{
              fontSize: "var(--hm-text-2xs)",
              letterSpacing: "var(--hm-tracking-wider)",
              textTransform: "uppercase",
              color: "var(--hm-color-text-muted)",
              display: "block",
              marginBottom: "0.5rem",
            }}
          >
            Seçkin Kategoriler
          </span>
          <h2
            style={{
              fontFamily: "var(--hm-font-display)",
              fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
              fontWeight: "var(--hm-font-regular)",
              letterSpacing: "var(--hm-tracking-tight)",
              color: "var(--hm-color-text-main)",
            }}
          >
            Hümra Kadınının Gardırobu
          </h2>
        </div>

        <div className="hm-category-tiles-grid">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/kategori/${cat.slug}`}
              className="hm-category-card"
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderRadius: "var(--hm-radius-xs)",
                backgroundColor: "var(--hm-color-surface-subtle)",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "3 / 4",
                  overflow: "hidden",
                }}
              >
                {cat.imageUrl && (
                  <Image
                    src={cat.imageUrl}
                    alt={cat.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"
                    style={{
                      objectFit: "cover",
                      transition: "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  />
                )}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(to top, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0) 50%)",
                  }}
                />

                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: "var(--hm-space-4)",
                    color: "var(--hm-color-text-light)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                  }}
                >
                  <h3
                    style={{
                      fontFamily: "var(--hm-font-display)",
                      fontSize: "clamp(1rem, 2vw, 1.25rem)",
                      fontWeight: "var(--hm-font-regular)",
                      letterSpacing: "var(--hm-tracking-wide)",
                    }}
                  >
                    {cat.name}
                  </h3>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      opacity: 0.85,
                    }}
                  >
                    Koleksiyonu İncele →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

export default CategoryTiles;
