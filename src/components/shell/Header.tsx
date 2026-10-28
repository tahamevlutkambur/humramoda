"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Container } from "../ui/Container";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { SearchDrawer } from "../search/SearchDrawer";
import { MobileNav } from "./MobileNav";
import { getAllCategories, CategoryItem } from "@/lib/catalog";
import { usePathname } from "next/navigation";

export interface HeaderProps {
  categories?: CategoryItem[];
}

export function Header({ categories: propCategories }: HeaderProps = {}) {
  const pathname = usePathname();
  const { totalCount: cartCount, openCart } = useCart();
  const { totalCount: favCount } = useFavorites();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>(() =>
    propCategories && propCategories.length > 0 ? propCategories : getAllCategories()
  );

  React.useEffect(() => {
    if (pathname?.startsWith("/admin")) return;
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
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          backgroundColor: "rgba(250, 249, 246, 0.96)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--hm-color-border-subtle)",
        }}
      >
        <Container>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: "76px",
            }}
          >
            {/* Mobil Menü Butonu (Sol) */}
            <div style={{ display: "flex", alignItems: "center" }} className="hm-header-mobile-toggle">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Menüyü Aç"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.5rem",
                  color: "var(--hm-color-text-main)",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>

            {/* Orijinal Hümra Moda Yazı Logosu (Wordmark) */}
            <Link
              href="/"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--hm-font-display)",
                  fontSize: "clamp(1.25rem, 2.5vw, 1.625rem)",
                  letterSpacing: "0.24em",
                  textTransform: "uppercase",
                  fontWeight: "var(--hm-font-regular)",
                  color: "var(--hm-color-text-main)",
                  lineHeight: 1,
                }}
              >
                HÜMRA
              </span>
              <span
                style={{
                  fontSize: "0.5625rem",
                  letterSpacing: "0.42em",
                  textTransform: "uppercase",
                  fontWeight: "var(--hm-font-light)",
                  color: "var(--hm-color-text-muted)",
                  marginTop: "3px",
                }}
              >
                MODA
              </span>
            </Link>

            {/* Masaüstü Navigasyon Kategorileri (Desktop Navigation) */}
            <nav className="hm-header-desktop-nav" style={{ display: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
                <Link
                  href="/urunler"
                  style={{
                    fontSize: "var(--hm-text-xs)",
                    letterSpacing: "var(--hm-tracking-wider)",
                    textTransform: "uppercase",
                    fontWeight: 500,
                    color: "var(--hm-color-text-main)",
                  }}
                >
                  Tüm Ürünler
                </Link>

                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/kategori/${cat.slug}`}
                    style={{
                      fontSize: "var(--hm-text-xs)",
                      letterSpacing: "var(--hm-tracking-wider)",
                      textTransform: "uppercase",
                      fontWeight: 500,
                      color: "var(--hm-color-text-secondary)",
                      transition: "color var(--hm-transition-fast)",
                    }}
                  >
                    {cat.name}
                  </Link>
                ))}

                <Link
                  href="/koleksiyon/cok-satanlar"
                  style={{
                    fontSize: "var(--hm-text-xs)",
                    letterSpacing: "var(--hm-tracking-wider)",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    color: "var(--hm-color-accent-merat)",
                  }}
                >
                  Çok Satanlar
                </Link>
              </div>
            </nav>

            {/* Sağ Eylemler: Arama, Favoriler, Sepet */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1.25rem",
              }}
            >
              {/* Arama */}
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                aria-label="Arama Yap"
                style={{
                  padding: "0.25rem",
                  color: "var(--hm-color-text-main)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>

              {/* Sipariş Takibi */}
              <Link
                href="/siparis-takip"
                aria-label="Sipariş Takibi"
                title="Sipariş ve Kargo Takibi"
                style={{
                  padding: "0.25rem",
                  color: "var(--hm-color-text-main)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.78 0l-8-4A2 2 0 0 1 2 16.76V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0z" />
                  <polyline points="2.32 6.16 12 11 21.68 6.16" />
                  <line x1="12" y1="22.76" x2="12" y2="11" />
                </svg>
              </Link>

              {/* Favoriler (Masaüstü) */}
              <Link
                href="/favoriler"
                aria-label="Favorilerim"
                className="hm-header-desktop-fav"
                style={{
                  position: "relative",
                  padding: "0.25rem",
                  color: "var(--hm-color-text-main)",
                  display: "none",
                  alignItems: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {favCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      width: "15px",
                      height: "15px",
                      borderRadius: "50%",
                      backgroundColor: "var(--hm-color-text-main)",
                      color: "#FFF",
                      fontSize: "9px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                    }}
                  >
                    {favCount}
                  </span>
                )}
              </Link>

              {/* Sepet Butonu */}
              <button
                type="button"
                onClick={openCart}
                aria-label={`Sepetim (${cartCount})`}
                style={{
                  position: "relative",
                  padding: "0.25rem",
                  color: "var(--hm-color-text-main)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                {cartCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      width: "15px",
                      height: "15px",
                      borderRadius: "50%",
                      backgroundColor: "var(--hm-color-accent-merat)",
                      color: "#FFF",
                      fontSize: "9px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                    }}
                  >
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </Container>
      </header>

      {/* Arama Çekmecesi */}
      <SearchDrawer isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Mobil Menü Çekmecesi ve Alt Bar */}
      <MobileNav
        categories={categories}
        isMenuOpen={isMobileMenuOpen}
        onCloseMenu={() => setIsMobileMenuOpen(false)}
        onOpenSearch={() => {
          setIsMobileMenuOpen(false);
          setIsSearchOpen(true);
        }}
      />
    </>
  );
}

export default Header;
