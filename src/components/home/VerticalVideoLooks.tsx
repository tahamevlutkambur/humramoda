"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { Container } from "../ui/Container";
import { getFeaturedVideos, VideoLookItem } from "@/lib/catalog";
import { formatCurrency } from "@/lib/formatters";

function VideoLookCard({ item }: { item: VideoLookItem }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.warn("Video play error:", err);
      });
    }
  };

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "var(--hm-radius-xs)",
        overflow: "hidden",
        backgroundColor: "var(--hm-color-surface-subtle)",
        boxShadow: "var(--hm-shadow-subtle)",
      }}
    >
      {/* 9:16 Dikey Moda Video Alanı */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "9 / 16",
          maxHeight: "680px",
          backgroundColor: "#000",
          cursor: "pointer",
        }}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={item.videoUrl}
          poster={item.posterUrl}
          playsInline
          muted
          loop
          preload="none"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
          onEnded={() => setIsPlaying(false)}
        />

        {/* Oynat / Durdur İkonu Katmanı */}
        {!isPlaying && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 0.3s ease",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.88)",
                backdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--hm-color-text-main)",
                boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </div>
        )}

        {/* Üstte Canlı Çekim Etiketi */}
        <div
          style={{
            position: "absolute",
            top: "1rem",
            left: "1rem",
            padding: "0.3rem 0.65rem",
            backgroundColor: "rgba(20, 20, 20, 0.65)",
            backdropFilter: "blur(4px)",
            borderRadius: "var(--hm-radius-pill)",
            fontSize: "var(--hm-text-2xs)",
            letterSpacing: "var(--hm-tracking-wider)",
            textTransform: "uppercase",
            color: "#FFF",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            zIndex: 10,
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: isPlaying ? "#22C55E" : "#E2E8F0",
            }}
          />
          {isPlaying ? "Oynatılıyor" : "Video Görünüm"}
        </div>
      </div>

      {/* Alt Ürün Bilgisi ve Satın Al Kartı */}
      <div
        style={{
          padding: "var(--hm-space-4)",
          backgroundColor: "var(--hm-color-surface)",
          borderTop: "1px solid var(--hm-color-border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4
            style={{
              fontSize: "var(--hm-text-xs)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "var(--hm-tracking-wide)",
              color: "var(--hm-color-text-main)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.title}
          </h4>
          <span
            className="tabular-nums"
            style={{
              fontSize: "var(--hm-text-xs)",
              color: "var(--hm-color-text-secondary)",
              fontWeight: 500,
              marginTop: "2px",
              display: "block",
            }}
          >
            {formatCurrency(item.price)}
          </span>
        </div>

        <Link
          href={`/urun/${item.productSlug}?renk=${item.colorSlug}`}
          style={{
            fontSize: "var(--hm-text-2xs)",
            letterSpacing: "var(--hm-tracking-wider)",
            textTransform: "uppercase",
            fontWeight: 600,
            padding: "0.5rem 0.85rem",
            backgroundColor: "var(--hm-color-text-main)",
            color: "var(--hm-color-text-light)",
            borderRadius: "var(--hm-radius-xs)",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          Ürünü İncele
        </Link>
      </div>
    </div>
  );
}

export function VerticalVideoLooks() {
  const videos = getFeaturedVideos();

  return (
    <section
      style={{
        padding: "var(--hm-space-16) 0",
        backgroundColor: "var(--hm-color-surface-subtle)",
      }}
    >
      <Container size="editorial">
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
            Hareket Halinde Zarafet
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
            Kumaşın Akışı &amp; Duruşu
          </h2>
          <p
            style={{
              fontSize: "var(--hm-text-sm)",
              color: "var(--hm-color-text-secondary)",
              maxWidth: "520px",
              margin: "0.5rem auto 0",
              lineHeight: 1.5,
            }}
          >
            Modellerimizin üzerindeki akıcı formu, kumaş dokularını ve hareket anındaki dökümünü dikey video sunumuyla keşfedin.
          </p>
        </div>

        <div className="hm-video-looks-grid">
          {videos.map((vid) => (
            <VideoLookCard key={vid.id} item={vid} />
          ))}
        </div>
      </Container>
    </section>
  );
}

export default VerticalVideoLooks;
