"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Container } from "../ui/Container";
import { ProductCard } from "../product/ProductCard";
import { ProductItem, CategoryItem } from "@/lib/catalog";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface CatalogViewProps {
  title: string;
  description?: string;
  initialProducts: ProductItem[];
  categories: CategoryItem[];
  currentCategorySlug?: string;
  currentCollectionSlug?: string;
  breadcrumbs: BreadcrumbItem[];
}

export function CatalogView({
  title: initialTitle,
  description: initialDescription,
  initialProducts,
  categories: initialCategories,
  currentCategorySlug,
  currentCollectionSlug,
  breadcrumbs,
}: CatalogViewProps) {
  const [products, setProducts] = useState<ProductItem[]>(initialProducts);
  const [categories, setCategories] = useState<CategoryItem[]>(initialCategories);
  const [title, setTitle] = useState<string>(initialTitle);
  const [description, setDescription] = useState<string | undefined>(initialDescription);
  const [sortOption, setSortOption] = useState<"newest" | "price-asc" | "price-desc">("newest");
  const [selectedColorSlug, setSelectedColorSlug] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/products?public=1", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
          if (currentCategorySlug) {
            const matchedCat = data.categories.find(
              (c: CategoryItem) =>
                c.slug.toLowerCase() === currentCategorySlug.toLowerCase() ||
                c.id.toLowerCase() === currentCategorySlug.toLowerCase()
            );
            if (matchedCat) {
              setTitle(matchedCat.name);
              setDescription(matchedCat.description);
            }
          }
        }
        if (Array.isArray(data.products)) {
          let list: ProductItem[] = data.products;
          if (currentCategorySlug) {
            const catSlug = currentCategorySlug.toLowerCase();
            list = list.filter((p) => p.categorySlug.toLowerCase() === catSlug);
          }
          if (currentCollectionSlug) {
            const colSlug = currentCollectionSlug.toLowerCase();
            const tagged = list.filter((p) =>
              p.collectionSlugs?.some((s) => s.toLowerCase() === colSlug)
            );
            list = tagged.length > 0 || colSlug !== "cok-satanlar" ? tagged : list;
          }
          setProducts(list);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [currentCategorySlug, currentCollectionSlug]);

  // Mevcut ürünlerdeki tüm benzersiz renkleri çıkar
  const availableColors = useMemo(() => {
    const map = new Map<string, { name: string; colorCode: string; slug: string }>();
    products.forEach((p) => {
      p.colors.forEach((c) => {
        if (!map.has(c.slug)) {
          map.set(c.slug, { name: c.name, colorCode: c.colorCode, slug: c.slug });
        }
      });
    });
    return Array.from(map.values());
  }, [products]);

  // Filtrelenmiş ve sıralanmış ürünler
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Renk filtresi
    if (selectedColorSlug) {
      result = result.filter((p) => p.colors.some((c) => c.slug === selectedColorSlug));
    }

    // Sıralama
    if (sortOption === "price-asc") {
      result.sort((a, b) => (a.discountPrice || a.basePrice) - (b.discountPrice || b.basePrice));
    } else if (sortOption === "price-desc") {
      result.sort((a, b) => (b.discountPrice || b.basePrice) - (a.discountPrice || a.basePrice));
    } else {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [products, selectedColorSlug, sortOption]);

  const hasActiveFilters = selectedColorSlug !== null;

  return (
    <div style={{ padding: "var(--hm-space-6) 0 var(--hm-space-20)" }}>
      <Container>
        {/* Breadcrumb Gezintisi */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "var(--hm-text-xs)",
            color: "var(--hm-color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "var(--hm-tracking-wider)",
            marginBottom: "var(--hm-space-4)",
          }}
        >
          {breadcrumbs.map((b, idx) => (
            <React.Fragment key={idx}>
              {b.href ? (
                <Link href={b.href} style={{ color: "var(--hm-color-text-muted)" }}>
                  {b.label}
                </Link>
              ) : (
                <span style={{ color: "var(--hm-color-text-main)" }}>{b.label}</span>
              )}
              {idx < breadcrumbs.length - 1 && <span>/</span>}
            </React.Fragment>
          ))}
        </nav>

        {/* Başlık ve Açıklama */}
        <div style={{ marginBottom: "var(--hm-space-8)" }}>
          <h1
            style={{
              fontFamily: "var(--hm-font-display)",
              fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)",
              fontWeight: "var(--hm-font-regular)",
              letterSpacing: "var(--hm-tracking-tight)",
              color: "var(--hm-color-text-main)",
            }}
          >
            {title}
          </h1>
          {description && (
            <p
              style={{
                fontSize: "var(--hm-text-sm)",
                color: "var(--hm-color-text-secondary)",
                marginTop: "0.5rem",
                maxWidth: "600px",
                lineHeight: 1.6,
              }}
            >
              {description}
            </p>
          )}
        </div>

        {/* Kategori Sekmeleri (Pills) */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            overflowX: "auto",
            paddingBottom: "0.5rem",
            marginBottom: "var(--hm-space-6)",
            scrollbarWidth: "none",
          }}
        >
          <Link
            href="/urunler"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--hm-radius-pill)",
              fontSize: "var(--hm-text-xs)",
              letterSpacing: "var(--hm-tracking-wider)",
              textTransform: "uppercase",
              fontWeight: 500,
              whiteSpace: "nowrap",
              backgroundColor: !currentCategorySlug
                ? "var(--hm-color-text-main)"
                : "var(--hm-color-surface-subtle)",
              color: !currentCategorySlug ? "#FFF" : "var(--hm-color-text-main)",
              border: "1px solid var(--hm-color-border-subtle)",
              transition: "all var(--hm-transition-fast)",
            }}
          >
            Tüm Modeller
          </Link>

          {categories.map((cat) => {
            const isActive = currentCategorySlug === cat.slug;
            return (
              <Link
                key={cat.id}
                href={`/kategori/${cat.slug}`}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "var(--hm-radius-pill)",
                  fontSize: "var(--hm-text-xs)",
                  letterSpacing: "var(--hm-tracking-wider)",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  backgroundColor: isActive
                    ? "var(--hm-color-text-main)"
                    : "var(--hm-color-surface-subtle)",
                  color: isActive ? "#FFF" : "var(--hm-color-text-main)",
                  border: "1px solid var(--hm-color-border-subtle)",
                  transition: "all var(--hm-transition-fast)",
                }}
              >
                {cat.name}
              </Link>
            );
          })}
        </div>

        {/* Filtreleme ve Sıralama Çubuğu */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            padding: "var(--hm-space-4) 0",
            borderTop: "1px solid var(--hm-color-border-subtle)",
            borderBottom: "1px solid var(--hm-color-border-subtle)",
            marginBottom: "var(--hm-space-8)",
          }}
        >
          {/* Renk Filtresi Butonları */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "var(--hm-text-xs)",
                letterSpacing: "var(--hm-tracking-wider)",
                textTransform: "uppercase",
                color: "var(--hm-color-text-muted)",
                marginRight: "0.25rem",
              }}
            >
              Renk:
            </span>

            {availableColors.map((color) => {
              const isSelected = selectedColorSlug === color.slug;
              return (
                <button
                  key={color.slug}
                  type="button"
                  onClick={() =>
                    setSelectedColorSlug((prev) => (prev === color.slug ? null : color.slug))
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.3rem 0.65rem",
                    borderRadius: "var(--hm-radius-pill)",
                    backgroundColor: isSelected
                      ? "var(--hm-color-text-main)"
                      : "var(--hm-color-surface)",
                    color: isSelected ? "#FFF" : "var(--hm-color-text-main)",
                    border: isSelected
                      ? "1px solid var(--hm-color-text-main)"
                      : "1px solid var(--hm-color-border-main)",
                    fontSize: "var(--hm-text-xs)",
                    transition: "all var(--hm-transition-fast)",
                  }}
                >
                  <span
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: color.colorCode,
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  />
                  <span>{color.name}</span>
                </button>
              );
            })}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => setSelectedColorSlug(null)}
                style={{
                  fontSize: "var(--hm-text-xs)",
                  color: "var(--hm-color-discount)",
                  textDecoration: "underline",
                  marginLeft: "0.5rem",
                }}
              >
                Filtreyi Sıfırla
              </button>
            )}
          </div>

          {/* Sağ: Ürün Sayısı & Sıralama Seçimi */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span
              style={{
                fontSize: "var(--hm-text-xs)",
                color: "var(--hm-color-text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {filteredProducts.length} Ürün Listelendi
            </span>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                border: "1px solid var(--hm-color-border-main)",
                borderRadius: "var(--hm-radius-xs)",
                padding: "0.35rem 0.75rem",
                backgroundColor: "var(--hm-color-surface)",
              }}
            >
              <label
                htmlFor="sort-select"
                style={{
                  fontSize: "var(--hm-text-xs)",
                  textTransform: "uppercase",
                  color: "var(--hm-color-text-muted)",
                  letterSpacing: "var(--hm-tracking-wider)",
                }}
              >
                Sırala:
              </label>
              <select
                id="sort-select"
                value={sortOption}
                onChange={(e) =>
                  setSortOption(e.target.value as "newest" | "price-asc" | "price-desc")
                }
                style={{
                  fontSize: "var(--hm-text-xs)",
                  color: "var(--hm-color-text-main)",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <option value="newest">En Yeniler</option>
                <option value="price-asc">Fiyat: Düşükten Yükseğe</option>
                <option value="price-desc">Fiyat: Yüksekten Düşüğe</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ürün Listesi Izgarası */}
        {filteredProducts.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "var(--hm-space-16) var(--hm-space-4)",
              backgroundColor: "var(--hm-color-surface-subtle)",
              borderRadius: "var(--hm-radius-sm)",
            }}
          >
            <h3
              style={{
                fontFamily: "var(--hm-font-display)",
                fontSize: "var(--hm-text-xl)",
                color: "var(--hm-color-text-main)",
                marginBottom: "0.5rem",
              }}
            >
              Eşleşen Ürün Bulunamadı
            </h3>
            <p
              style={{
                fontSize: "var(--hm-text-sm)",
                color: "var(--hm-color-text-secondary)",
                marginBottom: "1.5rem",
              }}
            >
              Seçtiğiniz filtre kriterlerine uygun ürün bulunamadı. Filtreleri temizleyerek diğer parçalarımıza göz atabilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => setSelectedColorSlug(null)}
              style={{
                padding: "0.6rem 1.25rem",
                backgroundColor: "var(--hm-color-text-main)",
                color: "#FFF",
                borderRadius: "var(--hm-radius-xs)",
                fontSize: "var(--hm-text-xs)",
                letterSpacing: "var(--hm-tracking-wider)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Filtreleri Temizle
            </button>
          </div>
        ) : (
          <div className="hm-catalog-grid">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}

export default CatalogView;
