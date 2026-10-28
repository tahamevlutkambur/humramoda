"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ProductMediaItem } from "@/lib/catalog";

interface ProductGalleryProps {
  media: ProductMediaItem[];
  productTitle: string;
}

export function ProductGallery({ media, productTitle }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const handlePrev = useCallback(() => {
    if (!media || media.length === 0) return;
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : media.length - 1));
  }, [media]);

  const handleNext = useCallback(() => {
    if (!media || media.length === 0) return;
    setActiveIndex((prev) => (prev < media.length - 1 ? prev + 1 : 0));
  }, [media]);

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsLightboxOpen(false);
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, handlePrev, handleNext]);

  if (!media || media.length === 0) {
    return (
      <div className="hm-product-gallery-wrapper">
        <div
          className="hm-product-gallery-main"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--hm-color-text-muted)",
            textTransform: "uppercase",
            fontSize: "var(--hm-text-xs)",
          }}
        >
          Görsel Hazırlanıyor
        </div>
      </div>
    );
  }

  const currentMedia = media[activeIndex] || media[0];
  const isCurrentVideo =
    currentMedia.type === "VIDEO" || currentMedia.url.endsWith(".mp4");

  return (
    <>
      <div className="hm-product-gallery-wrapper">
        <div className="hm-product-gallery-inner">
          {/* Küçük Resimler (Masaüstünde Sol Dikey, Mobilde Alt Yatay) */}
          {media.length > 1 && (
            <div className="hm-gallery-thumbnails">
              {media.map((item, idx) => {
                const isActive = idx === activeIndex;
                const isVideoItem =
                  item.type === "VIDEO" || item.url.endsWith(".mp4");
                const thumbSrc =
                  item.thumbnailUrl && !item.thumbnailUrl.endsWith(".mp4")
                    ? item.thumbnailUrl
                    : item.posterUrl || item.url;
                return (
                  <button
                    key={item.id || idx}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    style={{
                      position: "relative",
                      width: "100%",
                      aspectRatio: "3 / 4",
                      backgroundColor: "var(--hm-color-surface-subtle)",
                      overflow: "hidden",
                      borderRadius: "var(--hm-radius-xs)",
                      border: isActive
                        ? "1.5px solid var(--hm-color-text-main)"
                        : "1px solid var(--hm-color-border-subtle)",
                      opacity: isActive ? 1 : 0.65,
                      transition: "all var(--hm-transition-fast)",
                    }}
                    aria-label={`${productTitle} ${isVideoItem ? "videosu" : "fotoğrafı"} ${idx + 1}`}
                  >
                    <Image
                      src={thumbSrc}
                      alt={`${productTitle} küçük önizleme ${idx + 1}`}
                      fill
                      unoptimized={thumbSrc.startsWith("data:")}
                      sizes="74px"
                      style={{ objectFit: "cover", objectPosition: "center top" }}
                    />
                    {isVideoItem && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: "3px",
                          right: "3px",
                          backgroundColor: "rgba(0,0,0,0.65)",
                          color: "#fff",
                          borderRadius: "50%",
                          width: "18px",
                          height: "18px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "9px",
                        }}
                      >
                        ▶
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Ana Büyük Görsel veya Video */}
          <div className="hm-product-gallery-main">
            {isCurrentVideo ? (
              <video
                key={currentMedia.url}
                src={currentMedia.url}
                poster={
                  currentMedia.posterUrl ||
                  (currentMedia.thumbnailUrl &&
                  !currentMedia.thumbnailUrl.endsWith(".mp4")
                    ? currentMedia.thumbnailUrl
                    : undefined)
                }
                controls
                playsInline
                autoPlay
                muted
                loop
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : (
              <div
                onClick={() => setIsLightboxOpen(true)}
                title="Büyütmek için tıklayın"
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  cursor: "zoom-in",
                }}
              >
                <Image
                  src={currentMedia.url}
                  alt={currentMedia.altText || `${productTitle} detay görseli`}
                  fill
                  priority
                  unoptimized={currentMedia.url.startsWith("data:")}
                  sizes="(max-width: 768px) 100vw, 520px"
                  style={{
                    objectFit: "cover",
                    objectPosition: "center top",
                  }}
                />

                {/* Sağ Üst Büyütme İkonu */}
                <span
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    width: "34px",
                    height: "34px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 255, 255, 0.85)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--hm-color-text-main)",
                    boxShadow: "var(--hm-shadow-subtle)",
                    pointerEvents: "none",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </span>
              </div>
            )}

            {/* Önceki / Sonraki Okları */}
            {media.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrev();
                  }}
                  aria-label="Önceki Görsel"
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 255, 255, 0.85)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--hm-color-text-main)",
                    boxShadow: "var(--hm-shadow-subtle)",
                    zIndex: 10,
                    transition: "background-color var(--hm-transition-fast)",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNext();
                  }}
                  aria-label="Sonraki Görsel"
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 255, 255, 0.85)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--hm-color-text-main)",
                    boxShadow: "var(--hm-shadow-subtle)",
                    zIndex: 10,
                    transition: "background-color var(--hm-transition-fast)",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>

                {/* Alt Gösterge Noktaları */}
                <div
                  style={{
                    position: "absolute",
                    bottom: "12px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    gap: "6px",
                    zIndex: 10,
                  }}
                >
                  {media.map((_, idx) => (
                    <span
                      key={idx}
                      style={{
                        width: idx === activeIndex ? "16px" : "6px",
                        height: "6px",
                        borderRadius: "var(--hm-radius-pill)",
                        backgroundColor:
                          idx === activeIndex
                            ? "var(--hm-color-text-main)"
                            : "rgba(0,0,0,0.25)",
                        transition: "all 0.3s ease",
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox / Görsel Büyütme Modalı */}
      {isLightboxOpen && !isCurrentVideo && (
        <div
          className="hm-lightbox-backdrop"
          onClick={() => setIsLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={productTitle}
        >
          <div
            className="hm-lightbox-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentMedia.url}
              alt={currentMedia.altText || productTitle}
              style={{
                width: "100%",
                height: "auto",
                maxHeight: "82vh",
                objectFit: "contain",
                display: "block",
              }}
            />

            {/* Kapatma Butonu */}
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              aria-label="Kapat"
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                width: "38px",
                height: "38px",
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.9)",
                color: "#111",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.125rem",
                fontWeight: 600,
                boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              }}
            >
              ✕
            </button>

            {media.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label="Önceki Görsel"
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 255, 255, 0.9)",
                    color: "#111",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Sonraki Görsel"
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 255, 255, 0.9)",
                    color: "#111",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                  }}
                >
                  ›
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default ProductGallery;
