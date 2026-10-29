"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "../ui/Button";

export function CartDrawer() {
  const router = useRouter();
  const {
    items,
    isOpen,
    closeCart,
    removeItem,
    updateQuantity,
    totalCount,
    subtotal,
    freeShippingThreshold,
    amountNeededForFreeShipping,
  } = useCart();

  // ESC tuşuyla kapatma
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closeCart();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeCart]);

  // Açıkken arkadaki kaydırmayı engelle
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const progressPercent = Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100));

  return (
    <>
      {/* Karartma Katmanı (Backdrop) */}
      <div
        onClick={closeCart}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          backdropFilter: "blur(4px)",
          zIndex: 90,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity var(--hm-transition-base)",
        }}
      />

      {/* Sepet Çekmecesi (Drawer Panel) */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: "440px",
          backgroundColor: "var(--hm-color-surface)",
          zIndex: 95,
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--hm-shadow-drawer)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform var(--hm-transition-base)",
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2
              style={{
                fontSize: "var(--hm-text-xs)",
                letterSpacing: "var(--hm-tracking-wider)",
                textTransform: "uppercase",
                fontWeight: "var(--hm-font-medium)",
              }}
            >
              Sepetim ({totalCount})
            </h2>
          </div>

          <button
            onClick={closeCart}
            type="button"
            aria-label="Kapat"
            style={{
              padding: "0.25rem",
              color: "var(--hm-color-text-muted)",
              transition: "color var(--hm-transition-fast)",
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

        {/* Ücretsiz Kargo Baremi */}
        <div
          style={{
            padding: "var(--hm-space-4) var(--hm-space-5)",
            backgroundColor: "var(--hm-color-surface-subtle)",
            borderBottom: "1px solid var(--hm-color-border-subtle)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "var(--hm-text-xs)",
              lineHeight: 1.4,
              color: "var(--hm-color-text-main)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--hm-color-text-muted)", flexShrink: 0 }}
            >
              <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
              <path d="M15 18H9" />
              <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
              <circle cx="17" cy="18" r="2" />
              <circle cx="7" cy="18" r="2" />
            </svg>
            <span>
              {amountNeededForFreeShipping > 0 ? (
                <>
                  Sepete{" "}
                  <strong className="tabular-nums" style={{ fontWeight: 600 }}>
                    {formatCurrency(amountNeededForFreeShipping)}
                  </strong>{" "}
                  daha ekle, <strong>kargo ücretsiz</strong>!
                </>
              ) : (
                <strong style={{ color: "var(--hm-color-success)" }}>
                  Tebrikler! Kargonuz ücretsiz.
                </strong>
              )}
            </span>
          </div>

          <div
            style={{
              marginTop: "0.625rem",
              height: "4px",
              width: "100%",
              backgroundColor: "rgba(0,0,0,0.08)",
              borderRadius: "var(--hm-radius-pill)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                backgroundColor: "var(--hm-color-text-main)",
                transition: "width 0.4s ease-out",
              }}
            />
          </div>
        </div>

        {/* Ürün Listesi */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--hm-space-5)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--hm-space-4)",
          }}
        >
          {items.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                textAlign: "center",
                padding: "var(--hm-space-10) var(--hm-space-4)",
                gap: "var(--hm-space-3)",
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "var(--hm-color-text-muted)" }}
              >
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <p style={{ fontSize: "var(--hm-text-sm)", color: "var(--hm-color-text-secondary)" }}>
                Sepetiniz şu anda boş.
              </p>
              <Button variant="outline" size="sm" onClick={closeCart} style={{ marginTop: "0.5rem" }}>
                Koleksiyonu İncele
              </Button>
            </div>
          ) : (
            items.map((item) => {
              const itemPrice = item.product.discountPrice || item.product.basePrice;
              // Renge özel ilk görseli bul
              const colorMedia =
                item.product.media.find((m) => m.colorId === item.color.id && m.isThumbnail) ||
                item.product.media.find((m) => m.colorId === item.color.id) ||
                item.product.media[0];

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    gap: "var(--hm-space-4)",
                    paddingBottom: "var(--hm-space-4)",
                    borderBottom: "1px solid var(--hm-color-border-subtle)",
                  }}
                >
                  {/* Ürün Görseli (3:4 Oranlı Küçük Resim) */}
                  <Link
                    href={`/urun/${item.product.slug}?renk=${item.color.slug}`}
                    onClick={closeCart}
                    style={{
                      position: "relative",
                      width: "72px",
                      aspectRatio: "3/4",
                      flexShrink: 0,
                      backgroundColor: "var(--hm-color-surface-subtle)",
                      overflow: "hidden",
                      borderRadius: "var(--hm-radius-xs)",
                    }}
                  >
                    {colorMedia && (
                      <Image
                        src={colorMedia.thumbnailUrl || colorMedia.url}
                        alt={item.product.title}
                        fill
                        unoptimized={(colorMedia.thumbnailUrl || colorMedia.url).startsWith("data:")}
                        sizes="72px"
                        style={{ objectFit: "cover" }}
                      />
                    )}
                  </Link>

                  {/* Detaylar */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                      <Link
                        href={`/urun/${item.product.slug}?renk=${item.color.slug}`}
                        onClick={closeCart}
                        style={{
                          fontSize: "var(--hm-text-xs)",
                          fontWeight: "var(--hm-font-medium)",
                          lineHeight: 1.3,
                          textTransform: "uppercase",
                          color: "var(--hm-color-text-main)",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {item.product.title}
                      </Link>

                      <button
                        onClick={() => removeItem(item.id)}
                        type="button"
                        aria-label="Ürünü Sil"
                        style={{
                          color: "var(--hm-color-text-muted)",
                          padding: "0.2rem",
                          lineHeight: 1,
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
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

                    <div
                      style={{
                        marginTop: "0.25rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        fontSize: "var(--hm-text-xs)",
                        color: "var(--hm-color-text-muted)",
                      }}
                    >
                      <span>Renk: <strong style={{ color: "var(--hm-color-text-secondary)" }}>{item.color.name}</strong></span>
                      <span>•</span>
                      <span>Beden: <strong style={{ color: "var(--hm-color-text-secondary)" }}>{item.size.name}</strong></span>
                    </div>

                    <div
                      style={{
                        marginTop: "0.75rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      {/* Adet Kontrolü */}
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          border: "1px solid var(--hm-color-border-main)",
                          borderRadius: "var(--hm-radius-xs)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          style={{
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.875rem",
                            lineHeight: 1,
                            color: "var(--hm-color-text-secondary)",
                          }}
                        >
                          −
                        </button>
                        <span
                          className="tabular-nums"
                          style={{
                            padding: "0 0.5rem",
                            fontSize: "var(--hm-text-xs)",
                            fontWeight: 600,
                          }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          style={{
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.875rem",
                            lineHeight: 1,
                            color: "var(--hm-color-text-secondary)",
                          }}
                        >
                          +
                        </button>
                      </div>

                      {/* Tutar */}
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: "var(--hm-text-xs)",
                          fontWeight: 600,
                          color: "var(--hm-color-text-main)",
                        }}
                      >
                        {formatCurrency(itemPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sepet Alt Özeti ve Sipariş Butonu */}
        {items.length > 0 && (
          <div
            style={{
              padding: "var(--hm-space-5)",
              borderTop: "1px solid var(--hm-color-border-subtle)",
              backgroundColor: "var(--hm-color-surface)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "0.375rem",
              }}
            >
              <span
                style={{
                  fontSize: "var(--hm-text-xs)",
                  color: "var(--hm-color-text-secondary)",
                }}
              >
                Ara Toplam
              </span>
              <span
                className="tabular-nums"
                style={{
                  fontSize: "var(--hm-text-sm)",
                  fontWeight: 600,
                  color: "var(--hm-color-text-main)",
                }}
              >
                {formatCurrency(subtotal)}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "0.625rem",
              }}
            >
              <span
                style={{
                  fontSize: "var(--hm-text-xs)",
                  color: "var(--hm-color-text-secondary)",
                }}
              >
                Kargo Ücreti
              </span>
              <span
                className="tabular-nums"
                style={{
                  fontSize: "var(--hm-text-sm)",
                  fontWeight: 600,
                  color: "var(--hm-color-text-main)",
                }}
              >
                {formatCurrency(150)}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "var(--hm-space-4)",
                borderTop: "1px dashed var(--hm-color-border-subtle)",
                paddingTop: "0.5rem",
              }}
            >
              <span
                style={{
                  fontSize: "var(--hm-text-xs)",
                  letterSpacing: "var(--hm-tracking-wider)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  color: "var(--hm-color-text-main)",
                }}
              >
                Genel Toplam
              </span>
              <span
                className="tabular-nums"
                style={{
                  fontSize: "var(--hm-text-lg)",
                  fontWeight: 700,
                  color: "var(--hm-color-text-main)",
                }}
              >
                {formatCurrency(subtotal + 150)}
              </span>
            </div>

            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => {
                closeCart();
                router.push("/odeme");
              }}
            >
              Siparişi Tamamla
            </Button>

            <p
              style={{
                marginTop: "0.75rem",
                fontSize: "0.6875rem",
                textAlign: "center",
                color: "var(--hm-color-text-muted)",
                lineHeight: 1.4,
              }}
            >
              🔒 256-Bit SSL ile korunan güvenli alışveriş.
            </p>
          </div>
        )}
      </aside>
    </>
  );
}

export default CartDrawer;
