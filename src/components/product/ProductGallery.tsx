"use client";

import React, { useState } from "react";
import Image from "next/image";
import { ProductMediaItem } from "@/lib/catalog";

interface ProductGalleryProps {
  media: ProductMediaItem[];
  productTitle: string;
}

export function ProductGallery({ media, productTitle }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!media || media.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "3 / 4",
          backgroundColor: "var(--hm-color-surface-subtle)",
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
    );
  }

  const currentMedia = media[activeIndex] || media[0];

  const handlePrev = () => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : media.length - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev < media.length - 1 ? prev + 1 : 0));
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        width: "100%",
      }}
    >
      {/* Masaüstü: Yan Dikey Küçük Resimler + Büyük Görsel */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "flex-start",
        }}
      >
        {/* Dikey Thumbnail Listesi (Masaüstünde Görünür) */}
        {media.length > 1 && (
          <div
            className="hm-gallery-thumbnails"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              width: "74px",
              flexShrink: 0,
            }}
          >
            {media.map((item, idx) => {
              const isActive = idx === activeIndex;
              const isVideoItem = item.type === "VIDEO" || item.url.endsWith(".mp4");
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "3 / 4",
                    backgroundColor: "var(--hm-color-surface-subtle)",
                    overflow: "hidden",
                    borderRadius: "var(--hm-radius-xs)",
                    border: isActive ? "1px solid var(--hm-color-text-main)" : "1px solid var(--hm-color-border-subtle)",
                    opacity: isActive ? 1 : 0.65,
                    transition: "all var(--hm-transition-fast)",
                  }}
                  aria-label={`${productTitle} ${isVideoItem ? "videosu" : "fotoğrafı"} ${idx + 1}`}
                >
                  <Image
                    src={item.thumbnailUrl && !item.thumbnailUrl.endsWith(".mp4") ? item.thumbnailUrl : (item.posterUrl || item.url)}
                    alt={`${productTitle} küçük önizleme ${idx + 1}`}
                    fill
                    sizes="74px"
                    style={{ objectFit: "cover" }}
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
        <div
          style={{
            position: "relative",
            flex: 1,
            aspectRatio: "3 / 4",
            backgroundColor: "var(--hm-color-surface-subtle)",
            overflow: "hidden",
            borderRadius: "var(--hm-radius-xs)",
          }}
        >
          {currentMedia.type === "VIDEO" || currentMedia.url.endsWith(".mp4") ? (
            <video
              key={currentMedia.url}
              src={currentMedia.url}
              poster={currentMedia.posterUrl || (currentMedia.thumbnailUrl && !currentMedia.thumbnailUrl.endsWith(".mp4") ? currentMedia.thumbnailUrl : undefined)}
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
            <Image
              src={currentMedia.url}
              alt={currentMedia.altText || `${productTitle} detay görseli`}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              style={{ objectFit: "cover" }}
            />
          )}

          {/* Önceki / Sonraki Okları */}
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
                      backgroundColor: idx === activeIndex ? "var(--hm-color-text-main)" : "rgba(0,0,0,0.25)",
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
  );
}

export default ProductGallery;
