"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { getAllCategories, CategoryItem } from "@/lib/catalog";

interface MobileNavProps {
  categories?: CategoryItem[];
  isMenuOpen: boolean;
  onCloseMenu: () => void;
  onOpenSearch: () => void;
}

export function MobileNav({
  categories: propCategories,
  isMenuOpen,
  onCloseMenu,
  onOpenSearch,
}: MobileNavProps) {
  const pathname = usePathname();
  const { totalCount: cartCount, openCart } = useCart();
  const { totalCount: favCount } = useFavorites();
  const categories = propCategories && propCategories.length > 0 ? propCategories : getAllCategories();

  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return (
    <>
      {/* 1. Sol Kayan Menü (Mobile Drawer) */}
      <div
        onClick={onCloseMenu}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(4px)",
          zIndex: 85,
          opacity: isMenuOpen ? 1 : 0,
          pointerEvents: isMenuOpen ? "auto" : "none",
          transition: "opacity var(--hm-transition-base)",
        }}
      />

      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "82%",
          maxWidth: "340px",
          backgroundColor: "var(--hm-color-surface)",
          zIndex: 88,
          boxShadow: "var(--hm-shadow-drawer)",
          transform: isMenuOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform var(--hm-transition-base)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Çekmece Başlığı */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--hm-space-5)",
            borderBottom: "1px solid var(--hm-color-border-subtle)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--hm-font-display)",
              fontSize: "1.125rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            HÜMRA MODA
          </span>
          <button
            onClick={onCloseMenu}
            type="button"
            aria-label="Menüyü Kapat"
            style={{ padding: "0.25rem", color: "var(--hm-color-text-muted)" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Kategori Linkleri */}
        <nav style={{ padding: "var(--hm-space-4) var(--hm-space-5)", flex: 1 }}>
          <span
            style={{
              fontSize: "var(--hm-text-2xs)",
              letterSpacing: "var(--hm-tracking-wider)",
              textTransform: "uppercase",
              color: "var(--hm-color-text-muted)",
              display: "block",
              marginBottom: "var(--hm-space-3)",
            }}
          >
            Kategoriler
          </span>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <Link
              href="/urunler"
              onClick={onCloseMenu}
              style={{
                padding: "0.875rem 0",
                fontSize: "var(--hm-text-sm)",
                letterSpacing: "var(--hm-tracking-wide)",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "var(--hm-color-text-main)",
                borderBottom: "1px solid var(--hm-color-border-subtle)",
              }}
            >
              Tüm Ürünler
            </Link>

            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/kategori/${cat.slug}`}
                onClick={onCloseMenu}
                style={{
                  padding: "0.875rem 0",
                  fontSize: "var(--hm-text-sm)",
                  letterSpacing: "var(--hm-tracking-wide)",
                  textTransform: "uppercase",
                  color: "var(--hm-color-text-main)",
                  borderBottom: "1px solid var(--hm-color-border-subtle)",
                }}
              >
                {cat.name}
              </Link>
            ))}

            <Link
              href="/koleksiyon/cok-satanlar"
              onClick={onCloseMenu}
              style={{
                padding: "0.875rem 0",
                fontSize: "var(--hm-text-sm)",
                letterSpacing: "var(--hm-tracking-wide)",
                textTransform: "uppercase",
                color: "var(--hm-color-accent-merat)",
                fontWeight: 600,
                borderBottom: "1px solid var(--hm-color-border-subtle)",
              }}
            >
              Çok Satanlar
            </Link>

            <Link
              href="/siparis-takip"
              onClick={onCloseMenu}
              style={{
                padding: "0.875rem 0",
                fontSize: "var(--hm-text-sm)",
                letterSpacing: "var(--hm-tracking-wide)",
                textTransform: "uppercase",
                color: "var(--hm-color-text-main)",
                fontWeight: 600,
                borderBottom: "1px solid var(--hm-color-border-subtle)",
              }}
            >
              📦 Sipariş ve Kargo Takibi
            </Link>

            <Link
              href="/iade-degisim"
              onClick={onCloseMenu}
              style={{
                padding: "0.875rem 0",
                fontSize: "var(--hm-text-sm)",
                letterSpacing: "var(--hm-tracking-wide)",
                textTransform: "uppercase",
                color: "var(--hm-color-text-main)",
                fontWeight: 600,
                borderBottom: "1px solid var(--hm-color-border-subtle)",
              }}
            >
              🔄 İptal, İade ve Değişim
            </Link>
          </div>
        </nav>

        {/* Alt Bilgilendirme */}
        <div
          style={{
            padding: "var(--hm-space-5)",
            backgroundColor: "var(--hm-color-surface-subtle)",
            fontSize: "var(--hm-text-xs)",
            color: "var(--hm-color-text-muted)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <span>WhatsApp Sipariş & Destek</span>
          <span>Hafta içi 09:00 - 18:00</span>
        </div>
      </aside>

      {/* 2. Sabit Mobil Alt Bar (Mobile Bottom Navigation) */}
      <nav
        className="hm-mobile-bottom-bar"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid var(--hm-color-border-subtle)",
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          padding: "0.5rem 0.25rem 0.625rem",
          zIndex: 70,
        }}
      >
        {/* 1. Ana Sayfa */}
        <Link
          href="/"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2px",
            fontSize: "0.5625rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: pathname === "/" ? "var(--hm-color-text-main)" : "var(--hm-color-text-muted)",
            fontWeight: pathname === "/" ? 600 : 400,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Ana Sayfa</span>
        </Link>

        {/* 2. Ara */}
        <button
          type="button"
          onClick={onOpenSearch}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2px",
            fontSize: "0.5625rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--hm-color-text-muted)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Ara</span>
        </button>

        {/* 3. Koleksiyon / Ürünler */}
        <Link
          href="/urunler"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2px",
            fontSize: "0.5625rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color:
              pathname === "/urunler" || pathname.startsWith("/kategori")
                ? "var(--hm-color-text-main)"
                : "var(--hm-color-text-muted)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          <span>Koleksiyon</span>
        </Link>

        {/* 4. Favoriler */}
        <Link
          href="/favoriler"
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2px",
            fontSize: "0.5625rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: pathname === "/favoriler" ? "var(--hm-color-text-main)" : "var(--hm-color-text-muted)",
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
                right: "18px",
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                backgroundColor: "var(--hm-color-text-main)",
                color: "#FFF",
                fontSize: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
              }}
            >
              {favCount}
            </span>
          )}
          <span>Favoriler</span>
        </Link>

        {/* 5. Sepet */}
        <button
          type="button"
          onClick={openCart}
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2px",
            fontSize: "0.5625rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--hm-color-text-muted)",
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
                right: "18px",
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                backgroundColor: "var(--hm-color-accent-merat)",
                color: "#FFF",
                fontSize: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
              }}
            >
              {cartCount}
            </span>
          )}
          <span>Sepetim</span>
        </button>
      </nav>
    </>
  );
}

export default MobileNav;
