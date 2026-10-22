"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { getProducts } from "@/lib/catalog";
import { formatCurrency } from "@/lib/formatters";

interface SearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchDrawer({ isOpen, onClose }: SearchDrawerProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return getProducts({ query });
  }, [query]);

  // ESC ile kapatma
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(6px)",
          zIndex: 80,
        }}
      />

      {/* Arama Paneli (Üstten Açılan Modal) */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: "var(--hm-color-surface)",
          zIndex: 85,
          borderBottom: "1px solid var(--hm-color-border-main)",
          boxShadow: "var(--hm-shadow-dropdown)",
          padding: "var(--hm-space-6) 0 var(--hm-space-10)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ maxWidth: "800px", width: "100%", margin: "0 auto", padding: "0 1.5rem" }}>
          {/* Giriş ve Kapatma Butonu */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              borderBottom: "2px solid var(--hm-color-text-main)",
              paddingBottom: "0.75rem",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--hm-color-text-muted)", flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün adı, renk, kumaş veya kategori arayınız..."
              style={{
                flex: 1,
                fontSize: "clamp(1rem, 2.5vw, 1.25rem)",
                fontWeight: "var(--hm-font-regular)",
                color: "var(--hm-color-text-main)",
              }}
            />

            <button
              onClick={handleClose}
              type="button"
              aria-label="Kapat"
              style={{
                padding: "0.5rem",
                color: "var(--hm-color-text-muted)",
              }}
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

          {/* Hızlı Arama Etiketleri */}
          {!query.trim() && (
            <div style={{ marginTop: "1.5rem" }}>
              <span
                style={{
                  fontSize: "var(--hm-text-2xs)",
                  letterSpacing: "var(--hm-tracking-wider)",
                  textTransform: "uppercase",
                  color: "var(--hm-color-text-muted)",
                  display: "block",
                  marginBottom: "0.75rem",
                }}
              >
                Popüler Aramalar
              </span>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {["Scuba Takım", "Trençkot", "Şardonlu Takım", "Ekru Triko", "Camel"].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setQuery(tag)}
                    style={{
                      padding: "0.4rem 0.8rem",
                      backgroundColor: "var(--hm-color-surface-subtle)",
                      border: "1px solid var(--hm-color-border-subtle)",
                      borderRadius: "var(--hm-radius-pill)",
                      fontSize: "var(--hm-text-xs)",
                      color: "var(--hm-color-text-main)",
                      transition: "border-color var(--hm-transition-fast)",
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sonuç Listesi */}
          {query.trim() && (
            <div
              style={{
                marginTop: "1.5rem",
                overflowY: "auto",
                maxHeight: "50vh",
                paddingRight: "0.5rem",
              }}
            >
              {results.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--hm-color-text-muted)" }}>
                  <p style={{ fontSize: "var(--hm-text-sm)" }}>
                    &ldquo;{query}&rdquo; ile eşleşen ürün bulunamadı.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <span
                    style={{
                      fontSize: "var(--hm-text-2xs)",
                      letterSpacing: "var(--hm-tracking-wider)",
                      textTransform: "uppercase",
                      color: "var(--hm-color-text-muted)",
                    }}
                  >
                    {results.length} Ürün Bulundu
                  </span>

                  {results.map((product) => {
                    const firstImage = product.media[0];
                    const price = product.discountPrice || product.basePrice;

                    return (
                      <Link
                        key={product.id}
                        href={`/urun/${product.slug}`}
                        onClick={handleClose}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "1rem",
                          padding: "0.75rem",
                          borderRadius: "var(--hm-radius-xs)",
                          backgroundColor: "var(--hm-color-surface)",
                          border: "1px solid var(--hm-color-border-subtle)",
                          transition: "border-color var(--hm-transition-fast)",
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            width: "56px",
                            aspectRatio: "3/4",
                            backgroundColor: "var(--hm-color-surface-subtle)",
                            overflow: "hidden",
                            borderRadius: "var(--hm-radius-xs)",
                            flexShrink: 0,
                          }}
                        >
                          {firstImage && (
                            <Image
                              src={firstImage.thumbnailUrl || firstImage.url}
                              alt={product.title}
                              fill
                              sizes="56px"
                              style={{ objectFit: "cover" }}
                            />
                          )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              color: "var(--hm-color-text-muted)",
                              textTransform: "uppercase",
                              display: "block",
                            }}
                          >
                            {product.categoryName}
                          </span>
                          <h4
                            style={{
                              fontSize: "var(--hm-text-xs)",
                              fontWeight: 500,
                              textTransform: "uppercase",
                              color: "var(--hm-color-text-main)",
                              marginTop: "2px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {product.title}
                          </h4>
                          <span
                            className="tabular-nums"
                            style={{
                              fontSize: "var(--hm-text-xs)",
                              fontWeight: 600,
                              color: product.discountPrice ? "var(--hm-color-discount)" : "var(--hm-color-text-main)",
                              marginTop: "4px",
                              display: "block",
                            }}
                          >
                            {formatCurrency(price)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default SearchDrawer;
