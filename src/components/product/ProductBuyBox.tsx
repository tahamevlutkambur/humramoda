"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ProductItem, ProductColorItem, ProductSizeItem } from "@/lib/catalog";
import { formatCurrency } from "@/lib/formatters";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { event as trackMetaEvent } from "@/lib/meta-pixel";

interface ProductBuyBoxProps {
  product: ProductItem;
  selectedColor: ProductColorItem;
  onSelectColor: (color: ProductColorItem) => void;
}

export function ProductBuyBox({
  product,
  selectedColor,
  onSelectColor,
}: ProductBuyBoxProps) {
  const getColorVariants = React.useCallback(
    (colorId: string) => {
      const exact = product.variants.filter((v) => v.colorId === colorId && v.isActive !== false);
      if (exact.length > 0) return exact;
      return product.variants.filter((v) => v.isActive !== false);
    },
    [product.variants]
  );

  const getDefaultSizeForColor = React.useCallback(
    (colorId: string): ProductSizeItem | null => {
      const cVars = getColorVariants(colorId);
      const inStockVar = cVars.find((v) => v.stockQuantity > 0) || cVars[0];
      if (!inStockVar) return product.sizes?.[0] || null;
      return (
        product.sizes?.find((s) => s.id === inStockVar.sizeId) || {
          id: inStockVar.sizeId,
          name: inStockVar.sizeId,
          slug: inStockVar.sizeId,
          displayOrder: 1,
        }
      );
    },
    [getColorVariants, product.sizes]
  );

  const [selectedSize, setSelectedSize] = useState<ProductSizeItem | null>(() =>
    getDefaultSizeForColor(selectedColor.id)
  );
  const [quantity, setQuantity] = useState(1);
  const [openAccordion, setOpenAccordion] = useState<string | null>("fabric");

  React.useEffect(() => {
    setSelectedSize((prev) => {
      const cVars = getColorVariants(selectedColor.id);
      if (prev && cVars.some((v) => v.sizeId === prev.id && v.stockQuantity > 0)) {
        return prev;
      }
      return getDefaultSizeForColor(selectedColor.id);
    });
  }, [selectedColor.id, product.id, getColorVariants, getDefaultSizeForColor]);

  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isFav = isFavorite(product.id);

  // Seçili renk ve bedenin stok durumunu bul
  const getVariantForSize = (sizeId: string) => {
    const cVars = getColorVariants(selectedColor.id);
    return cVars.find((v) => v.sizeId === sizeId) || product.variants.find((v) => v.sizeId === sizeId);
  };

  const selectedVariant = selectedSize ? getVariantForSize(selectedSize.id) : null;
  const isOutOfStock = selectedVariant ? selectedVariant.stockQuantity <= 0 : false;

  const currentPrice = product.discountPrice || product.basePrice;
  const hasDiscount = !!product.discountPrice && product.discountPrice < product.basePrice;
  const discountPercent = hasDiscount
    ? Math.round(((product.basePrice - product.discountPrice!) / product.basePrice) * 100)
    : 0;

  const handleAddToCart = () => {
    if (!selectedSize || isOutOfStock) return;
    addItem(product, selectedColor, selectedSize, quantity);
    trackMetaEvent("AddToCart", {
      content_name: product.title,
      content_ids: [product.id],
      content_type: "product",
      value: currentPrice * quantity,
      currency: "TRY",
    });
  };

  const toggleAccordion = (key: string) => {
    setOpenAccordion((prev) => (prev === key ? null : key));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--hm-space-6)" }}>
      {/* 1. Kategori & Rozetler */}
      <div>
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "var(--hm-text-xs)",
            color: "var(--hm-color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "var(--hm-tracking-wider)",
            marginBottom: "0.5rem",
          }}
        >
          <Link href="/" style={{ color: "var(--hm-color-text-muted)" }}>
            Ana Sayfa
          </Link>
          <span>/</span>
          <Link
            href={`/kategori/${product.categorySlug}`}
            style={{ color: "var(--hm-color-text-muted)" }}
          >
            {product.categoryName}
          </Link>
        </nav>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          {hasDiscount && <Badge variant="campaign">Sepette %{discountPercent} İndirim</Badge>}
          {product.badge && <Badge variant="status">{product.badge}</Badge>}
        </div>

        <h1
          style={{
            fontFamily: "var(--hm-font-display)",
            fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
            fontWeight: "var(--hm-font-regular)",
            letterSpacing: "var(--hm-tracking-tight)",
            lineHeight: 1.25,
            color: "var(--hm-color-text-main)",
          }}
        >
          {product.title}
        </h1>
      </div>

      {/* 2. Fiyat Alanı */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "1rem",
          paddingBottom: "var(--hm-space-4)",
          borderBottom: "1px solid var(--hm-color-border-subtle)",
        }}
      >
        {hasDiscount && (
          <span
            className="tabular-nums"
            style={{
              fontSize: "var(--hm-text-base)",
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
            fontSize: "var(--hm-text-2xl)",
            fontWeight: 600,
            color: hasDiscount ? "var(--hm-color-discount)" : "var(--hm-color-text-main)",
          }}
        >
          {formatCurrency(currentPrice)}
        </span>
      </div>

      {/* 3. Renk Seçimi (Color Swatches) */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <span
            style={{
              fontSize: "var(--hm-text-xs)",
              letterSpacing: "var(--hm-tracking-wider)",
              textTransform: "uppercase",
              color: "var(--hm-color-text-muted)",
            }}
          >
            Renk: <strong style={{ color: "var(--hm-color-text-main)" }}>{selectedColor.name}</strong>
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {product.colors.map((color) => {
            const isSelected = color.id === selectedColor.id;
            return (
              <button
                key={color.id}
                type="button"
                onClick={() => {
                  onSelectColor(color);
                  // Renk değişince bedeni yeniden doğrula: önceki bedenin bu renkte geçerli stoku var mı?
                  if (selectedSize) {
                    const nextVariant = product.variants.find(
                      (v) => v.colorId === color.id && v.sizeId === selectedSize.id && v.isActive
                    );
                    if (!nextVariant || nextVariant.stockQuantity <= 0) {
                      setSelectedSize(null);
                    }
                  }
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.4rem 0.85rem",
                  border: isSelected ? "1px solid var(--hm-color-text-main)" : "1px solid var(--hm-color-border-main)",
                  borderRadius: "var(--hm-radius-xs)",
                  backgroundColor: isSelected ? "var(--hm-color-surface-subtle)" : "var(--hm-color-surface)",
                  cursor: "pointer",
                  transition: "all var(--hm-transition-fast)",
                }}
              >
                <span
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    backgroundColor: color.colorCode,
                    border: "1px solid rgba(0,0,0,0.15)",
                  }}
                />
                <span
                  style={{
                    fontSize: "var(--hm-text-xs)",
                    letterSpacing: "var(--hm-tracking-wide)",
                    textTransform: "uppercase",
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {color.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Beden Seçimi (Renge Özel Beden ve Stok Matrisi) */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <span
            style={{
              fontSize: "var(--hm-text-xs)",
              letterSpacing: "var(--hm-tracking-wider)",
              textTransform: "uppercase",
              color: "var(--hm-color-text-muted)",
            }}
          >
            Beden:{" "}
            <strong style={{ color: "var(--hm-color-text-main)" }}>
              {selectedSize ? selectedSize.name : "Seçim Yapınız"}
            </strong>
          </span>

          {selectedVariant && (
            <span
              style={{
                fontSize: "0.6875rem",
                color: isOutOfStock ? "var(--hm-color-discount)" : "var(--hm-color-success)",
                fontWeight: 500,
              }}
            >
              {isOutOfStock ? "Tükendi" : `Stokta (${selectedVariant.stockQuantity} adet)`}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {(() => {
            const colorVariants = getColorVariants(selectedColor.id);

            if (colorVariants.length === 0) {
              return (
                <p style={{ fontSize: "var(--hm-text-xs)", color: "var(--hm-color-text-muted)", margin: 0 }}>
                  Bu renk için henüz beden tanımlanmamıştır.
                </p>
              );
            }

            return colorVariants.map((variant) => {
              const sizeObj = product.sizes.find((s) => s.id === variant.sizeId) || {
                id: variant.sizeId,
                name: variant.sizeId,
                slug: variant.sizeId,
                displayOrder: 0,
              };
              const isSelected = selectedSize?.id === sizeObj.id;
              const sizeOutOfStock = variant.stockQuantity <= 0;

              return (
                <button
                  key={variant.id || sizeObj.id}
                  type="button"
                  disabled={sizeOutOfStock}
                  onClick={() => setSelectedSize(sizeObj)}
                  style={{
                    position: "relative",
                    minWidth: "70px",
                    padding: "0.75rem 1rem",
                    fontSize: "var(--hm-text-xs)",
                    letterSpacing: "var(--hm-tracking-wide)",
                    textTransform: "uppercase",
                    fontWeight: isSelected ? 600 : 400,
                    textAlign: "center",
                    border: isSelected
                      ? "2px solid var(--hm-color-text-main)"
                      : "1px solid var(--hm-color-border-main)",
                    borderRadius: "var(--hm-radius-xs)",
                    backgroundColor: isSelected
                      ? "var(--hm-color-text-main)"
                      : "var(--hm-color-surface)",
                    color: isSelected
                      ? "var(--hm-color-text-light)"
                      : sizeOutOfStock
                      ? "var(--hm-color-text-muted)"
                      : "var(--hm-color-text-main)",
                    cursor: sizeOutOfStock ? "not-allowed" : "pointer",
                    opacity: sizeOutOfStock ? 0.45 : 1,
                    textDecoration: sizeOutOfStock ? "line-through" : "none",
                    transition: "all var(--hm-transition-fast)",
                  }}
                >
                  {sizeObj.name}
                  {sizeOutOfStock && (
                    <span
                      style={{
                        position: "absolute",
                        top: "-8px",
                        right: "-6px",
                        backgroundColor: "var(--hm-color-discount)",
                        color: "#fff",
                        fontSize: "9px",
                        padding: "1px 4px",
                        borderRadius: "3px",
                        fontWeight: 600,
                        letterSpacing: "0",
                      }}
                    >
                      Tükendi
                    </span>
                  )}
                </button>
              );
            });
          })()}
        </div>
      </div>

      {/* 5. Satın Alma Alanı (Adet + Sepete Ekle + Favori) */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "stretch" }}>
        {/* Adet Kontrolü */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            border: "1px solid var(--hm-color-border-main)",
            borderRadius: "var(--hm-radius-xs)",
            backgroundColor: "var(--hm-color-surface)",
          }}
        >
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            style={{ padding: "0.75rem 1rem", fontSize: "1rem" }}
          >
            −
          </button>
          <span
            className="tabular-nums"
            style={{ minWidth: "32px", textAlign: "center", fontWeight: 600 }}
          >
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            style={{ padding: "0.75rem 1rem", fontSize: "1rem" }}
          >
            +
          </button>
        </div>

        {/* Sepete Ekle Butonu */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!selectedSize || isOutOfStock}
          onClick={handleAddToCart}
          style={{ flex: 1 }}
        >
          {!selectedSize
            ? "Beden Seçiniz"
            : isOutOfStock
            ? "Tükendi"
            : "Sepete Ekle"}
        </Button>

        {/* Favori Butonu */}
        <button
          type="button"
          onClick={() => toggleFavorite(product.id)}
          aria-label={isFav ? "Favorilerden Çıkar" : "Favorilere Ekle"}
          style={{
            width: "52px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--hm-color-border-main)",
            borderRadius: "var(--hm-radius-xs)",
            backgroundColor: "var(--hm-color-surface)",
            color: isFav ? "var(--hm-color-accent-merat)" : "var(--hm-color-text-main)",
            cursor: "pointer",
            transition: "all var(--hm-transition-fast)",
          }}
        >
          <svg
            width="20"
            height="20"
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
      </div>

      {/* 6. Bilgi Akordiyonları (Kumaş, Manken, Teslimat) */}
      <div
        style={{
          borderTop: "1px solid var(--hm-color-border-subtle)",
          marginTop: "var(--hm-space-4)",
        }}
      >
        {/* Kumaş ve Bakım */}
        <div style={{ borderBottom: "1px solid var(--hm-color-border-subtle)" }}>
          <button
            type="button"
            onClick={() => toggleAccordion("fabric")}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem 0",
              fontSize: "var(--hm-text-xs)",
              letterSpacing: "var(--hm-tracking-wider)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            <span>Kumaş &amp; Bakım Bilgisi</span>
            <span>{openAccordion === "fabric" ? "−" : "+"}</span>
          </button>
          {openAccordion === "fabric" && (
            <div
              style={{
                paddingBottom: "1rem",
                fontSize: "var(--hm-text-sm)",
                color: "var(--hm-color-text-secondary)",
                lineHeight: 1.6,
              }}
            >
              <p>{product.fabricDetails}</p>
              <p style={{ marginTop: "0.5rem" }}>
                30°C&apos;de hassas yıkama önerilir. Ağartıcı kullanılmaz. Düşük ısıda ütüleyiniz.
              </p>
            </div>
          )}
        </div>

        {/* Manken Ölçüleri */}
        <div style={{ borderBottom: "1px solid var(--hm-color-border-subtle)" }}>
          <button
            type="button"
            onClick={() => toggleAccordion("model")}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem 0",
              fontSize: "var(--hm-text-xs)",
              letterSpacing: "var(--hm-tracking-wider)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            <span>Manken Ölçüleri</span>
            <span>{openAccordion === "model" ? "−" : "+"}</span>
          </button>
          {openAccordion === "model" && (
            <div
              style={{
                paddingBottom: "1rem",
                fontSize: "var(--hm-text-sm)",
                color: "var(--hm-color-text-secondary)",
                lineHeight: 1.6,
              }}
            >
              <p>{product.modelDimensions}</p>
            </div>
          )}
        </div>

        {/* Teslimat ve İade */}
        <div style={{ borderBottom: "1px solid var(--hm-color-border-subtle)" }}>
          <button
            type="button"
            onClick={() => toggleAccordion("shipping")}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem 0",
              fontSize: "var(--hm-text-xs)",
              letterSpacing: "var(--hm-tracking-wider)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            <span>Teslimat &amp; İade</span>
            <span>{openAccordion === "shipping" ? "−" : "+"}</span>
          </button>
          {openAccordion === "shipping" && (
            <div
              style={{
                paddingBottom: "1rem",
                fontSize: "var(--hm-text-sm)",
                color: "var(--hm-color-text-secondary)",
                lineHeight: 1.6,
              }}
            >
              <p>
                Siparişleriniz 1-3 iş günü içerisinde özenle hazırlanarak Yurtiçi Kargo güvencesiyle kargoya teslim edilir.
              </p>
              <p style={{ marginTop: "0.5rem" }}>
                Teslimat tarihinden itibaren 14 gün içerisinde ücretsiz iade veya değişim hakkınız bulunmaktadır.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductBuyBox;
