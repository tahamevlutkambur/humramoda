"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ProductItem } from "@/lib/catalog";
import { formatCurrency } from "@/lib/formatters";
import { useFavorites } from "@/context/FavoritesContext";
import { Badge } from "../ui/Badge";

interface ProductCardProps {
  product: ProductItem;
  initialColorSlug?: string;
}

export function ProductCard({ product, initialColorSlug }: ProductCardProps) {
  // Varsayılan rengi belirle
  const defaultColor =
    product.colors.find((c) => c.slug === initialColorSlug) || product.colors[0];

  const [selectedColor, setSelectedColor] = useState(defaultColor);
  const [isHovered, setIsHovered] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();

  const isFav = isFavorite(product.id);

  // Seçili renge ait görselleri filtrele
  const colorMedia = product.media.filter((m) => m.colorId === selectedColor.id);
  const primaryMedia = colorMedia[0] || product.media[0];
  const secondaryMedia = colorMedia[1] || primaryMedia;

  const currentMedia = isHovered && secondaryMedia ? secondaryMedia : primaryMedia;

  const currentPrice = product.discountPrice || product.basePrice;
  const hasDiscount = !!product.discountPrice && product.discountPrice < product.basePrice;
  const discountPercent = hasDiscount
    ? Math.round(((product.basePrice - product.discountPrice!) / product.basePrice) * 100)
    : 0;

  const productUrl = `/urun/${product.slug}?renk=${selectedColor.slug}`;

  return (
    <div
      className="hm-product-card"
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 1. Ürün Görsel Alanı (3:4 Oran) */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4",
          backgroundColor: "var(--hm-color-surface-subtle)",
          overflow: "hidden",
          borderRadius: "var(--hm-radius-xs)",
        }}
      >
        <Link href={productUrl} style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          {currentMedia && (
            <Image
              src={currentMedia.url}
              alt={currentMedia.altText || product.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              style={{
                objectFit: "cover",
                transition: "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                transform: isHovered ? "scale(1.03)" : "scale(1)",
              }}
            />
          )}
        </Link>

        {/* Sol Üst Rozetler */}
        <div
          style={{
            position: "absolute",
            top: "8px",
            left: "8px",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            pointerEvents: "none",
          }}
        >
          {hasDiscount && (
            <Badge variant="discount">%{discountPercent}</Badge>
          )}
          {product.badge && (
            <Badge variant="status">{product.badge}</Badge>
          )}
        </div>

        {/* Sağ Üst Favori Kalp Butonu */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFavorite(product.id);
          }}
          aria-label={isFav ? "Favorilerden Çıkar" : "Favorilere Ekle"}
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            zIndex: 15,
            width: "34px",
            height: "34px",
            borderRadius: "50%",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--hm-shadow-subtle)",
            color: isFav ? "var(--hm-color-accent-merat)" : "var(--hm-color-text-main)",
            transition: "transform var(--hm-transition-fast)",
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill={isFav ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        {/* Sağ Alt Renk Butonları (Color Swatches) */}
        {product.colors.length > 1 && (
          <div
            style={{
              position: "absolute",
              bottom: "8px",
              right: "8px",
              zIndex: 10,
              backgroundColor: "rgba(255, 255, 255, 0.92)",
              backdropFilter: "blur(6px)",
              padding: "4px 8px",
              borderRadius: "var(--hm-radius-pill)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "var(--hm-shadow-subtle)",
            }}
          >
            {product.colors.map((color) => {
              const isCurrent = color.id === selectedColor.id;
              return (
                <button
                  key={color.id}
                  type="button"
                  title={color.name}
                  aria-label={`${color.name} rengini seç`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedColor(color);
                  }}
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    backgroundColor: color.colorCode,
                    border: isCurrent ? "1px solid var(--hm-color-text-main)" : "1px solid rgba(0,0,0,0.15)",
                    outline: isCurrent ? "2px solid var(--hm-color-text-main)" : "none",
                    outlineOffset: "1px",
                    cursor: "pointer",
                    transition: "transform var(--hm-transition-fast)",
                    transform: isCurrent ? "scale(1.15)" : "scale(1)",
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Kart Başlığı ve Fiyatlandırma */}
      <div style={{ paddingTop: "0.75rem", paddingBottom: "0.25rem" }}>
        {/* Kategori ve Renk Adı */}
        <div
          style={{
            fontSize: "0.6875rem",
            color: "var(--hm-color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "var(--hm-tracking-wide)",
            marginBottom: "2px",
          }}
        >
          {product.categoryName} • {selectedColor.name}
        </div>

        {/* Ürün Başlığı */}
        <Link
          href={productUrl}
          style={{
            fontSize: "var(--hm-text-xs)",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "var(--hm-tracking-wide)",
            color: "var(--hm-color-text-main)",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {product.title}
        </Link>

        {/* Fiyat Satırı */}
        <div
          style={{
            marginTop: "0.375rem",
            display: "flex",
            alignItems: "baseline",
            gap: "0.5rem",
          }}
        >
          {hasDiscount && (
            <span
              className="tabular-nums"
              style={{
                fontSize: "var(--hm-text-xs)",
                color: "var(--hm-color-text-muted)",
                textDecoration: "line-through",
              }}
            >
              {formatCurrency(product.basePrice)}
            </span>
          )}

          <span
            className="tabular-nums"
            style={{
              fontSize: "var(--hm-text-sm)",
              fontWeight: 600,
              color: hasDiscount ? "var(--hm-color-discount)" : "var(--hm-color-text-main)",
            }}
          >
            {hasDiscount && (
              <span
                style={{
                  fontSize: "0.625rem",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  marginRight: "4px",
                }}
              >
                Sepette
              </span>
            )}
            {formatCurrency(currentPrice)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default ProductCard;
