import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Container } from "../ui/Container";
import { Button } from "../ui/Button";

interface HeroProps {
  content?: {
    badge?: string;
    title?: string;
    subtitle?: string;
    primaryCtaText?: string;
    primaryCtaLink?: string;
    secondaryCtaText?: string;
    secondaryCtaLink?: string;
    imageUrl?: string;
  };
}

export function HeroSection({ content }: HeroProps = {}) {
  const badge = content?.badge || "2026 İlkbahar / Yaz Koleksiyonu";
  const title = content?.title || "Zamansız Kalıplar,\nKusursuz Siluetler.";
  const subtitle =
    content?.subtitle ||
    "Özenle seçilmiş pamuk gabardinler, dökümlü scuba dokular ve modern terzilik detaylarıyla hazırlanan yeni sezon parçalarını keşfedin.";
  const primaryText = content?.primaryCtaText || "Koleksiyonu Keşfet";
  const primaryLink = content?.primaryCtaLink || "/urunler";
  const secondaryText = content?.secondaryCtaText || "Trençkot Serisi";
  const secondaryLink = content?.secondaryCtaLink || "/kategori/dis-giyim";
  const bgImage = content?.imageUrl || "/uploads/hero-editorial.jpg";

  return (
    <section
      style={{
        position: "relative",
        width: "100%",
        minHeight: "clamp(540px, 80vh, 760px)",
        display: "flex",
        alignItems: "center",
        backgroundColor: "var(--hm-color-surface-subtle)",
        overflow: "hidden",
      }}
    >
      {/* Arka Plan Görseli (Editorial Hero Image) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
        }}
      >
        <Image
          src={bgImage}
          alt="Hümra Moda Yeni Sezon Koleksiyonu"
          fill
          priority
          sizes="100vw"
          style={{
            objectFit: "cover",
            objectPosition: "center 28%",
          }}
        />
        {/* Zarif Editorial Gradyan Katmanı */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to right, rgba(20, 20, 20, 0.72) 0%, rgba(20, 20, 20, 0.4) 45%, rgba(20, 20, 20, 0.1) 100%)",
          }}
        />
      </div>

      {/* İçerik */}
      <Container style={{ position: "relative", zIndex: 2 }}>
        <div style={{ maxWidth: "600px", color: "var(--hm-color-text-light)" }}>
          <span
            style={{
              display: "inline-block",
              fontSize: "var(--hm-text-xs)",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: "var(--hm-font-regular)",
              color: "rgba(255, 255, 255, 0.85)",
              marginBottom: "1rem",
            }}
          >
            {badge}
          </span>

          <h1
            style={{
              fontFamily: "var(--hm-font-display)",
              fontSize: "clamp(2.25rem, 5.5vw, 3.75rem)",
              fontWeight: "var(--hm-font-regular)",
              letterSpacing: "var(--hm-tracking-tight)",
              lineHeight: 1.15,
              textTransform: "none",
              marginBottom: "1.25rem",
              textShadow: "0 2px 10px rgba(0,0,0,0.25)",
              whiteSpace: "pre-line",
            }}
          >
            {title}
          </h1>

          <p
            style={{
              fontSize: "clamp(0.9375rem, 1.8vw, 1.0625rem)",
              lineHeight: 1.6,
              color: "rgba(255, 255, 255, 0.9)",
              maxWidth: "480px",
              marginBottom: "2rem",
            }}
          >
            {subtitle}
          </p>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <Link href={primaryLink}>
              <Button
                variant="primary"
                size="lg"
                style={{
                  backgroundColor: "#FFFFFF",
                  color: "#141414",
                  border: "none",
                }}
              >
                {primaryText}
              </Button>
            </Link>

            {secondaryText && secondaryLink && (
              <Link href={secondaryLink}>
                <Button
                  variant="outline"
                  size="lg"
                  style={{
                    borderColor: "rgba(255, 255, 255, 0.7)",
                    color: "#FFFFFF",
                    backgroundColor: "rgba(0, 0, 0, 0.2)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  {secondaryText}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}

export default HeroSection;
