import React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { HeroSection } from "@/components/home/HeroSection";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { HomeProductGrid } from "@/components/home/HomeProductGrid";
import { VerticalVideoLooks } from "@/components/home/VerticalVideoLooks";
import { BrandValues } from "@/components/home/BrandValues";
import { getStoreData, getStoreHomepageContent } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  await getPersistentStoreData().catch(() => {});
  const store = getStoreData();
  const homepage = getStoreHomepageContent();

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* 1. Editorial Hero Banner */}
      <HeroSection content={homepage.hero} />

      {/* 2. Kategori Kartları */}
      <CategoryTiles initialCategories={store.categories} />

      {/* 3. Yeni Gelenler (New Arrivals) */}
      <section style={{ padding: "var(--hm-space-12) 0 var(--hm-space-16)" }}>
        <Container>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "var(--hm-space-8)",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "var(--hm-text-2xs)",
                  letterSpacing: "var(--hm-tracking-wider)",
                  textTransform: "uppercase",
                  color: "var(--hm-color-text-muted)",
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                Yeni Gelenler
              </span>
              <h2
                style={{
                  fontFamily: "var(--hm-font-display)",
                  fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
                  fontWeight: "var(--hm-font-regular)",
                  letterSpacing: "var(--hm-tracking-tight)",
                  color: "var(--hm-color-text-main)",
                }}
              >
                Sezonun Öne Çıkan Parçaları
              </h2>
            </div>

            <Link
              href="/urunler"
              style={{
                fontSize: "var(--hm-text-xs)",
                letterSpacing: "var(--hm-tracking-wider)",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "var(--hm-color-text-main)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              Tümünü Gör →
            </Link>
          </div>

          <HomeProductGrid initialProducts={store.products} mode="new-arrivals" />
        </Container>
      </section>

      {/* 4. Editorial Koleksiyon Vurgusu (Spotlight Banner) */}
      <section
        style={{
          position: "relative",
          backgroundColor: "#1C1C1C",
          color: "#FFFFFF",
          padding: "clamp(4rem, 10vw, 7rem) 0",
          overflow: "hidden",
        }}
      >
        <Container size="editorial">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              maxWidth: "680px",
              margin: "0 auto",
            }}
          >
            <span
              style={{
                fontSize: "var(--hm-text-xs)",
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "var(--hm-color-accent-gold)",
                marginBottom: "1rem",
              }}
            >
              {homepage.spotlight.tag}
            </span>
            <h2
              style={{
                fontFamily: "var(--hm-font-display)",
                fontSize: "clamp(2rem, 4.5vw, 3.25rem)",
                fontWeight: "var(--hm-font-regular)",
                letterSpacing: "var(--hm-tracking-tight)",
                lineHeight: 1.2,
                marginBottom: "1.25rem",
              }}
            >
              {homepage.spotlight.title}
            </h2>
            <p
              style={{
                fontSize: "clamp(0.9375rem, 1.8vw, 1.0625rem)",
                color: "rgba(255, 255, 255, 0.78)",
                lineHeight: 1.7,
                marginBottom: "2rem",
              }}
            >
              {homepage.spotlight.description}
            </p>
            <Link href={homepage.spotlight.ctaLink}>
              <Button
                variant="outline"
                size="lg"
                style={{
                  borderColor: "rgba(255, 255, 255, 0.6)",
                  color: "#FFFFFF",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                }}
              >
                {homepage.spotlight.ctaText}
              </Button>
            </Link>
          </div>
        </Container>
      </section>

      {/* 5. Dikey Video Moda Görünümleri (Reels / Dynamic Looks) */}
      <VerticalVideoLooks />

      {/* 6. Çok Satanlar (Best Sellers) */}
      <section style={{ padding: "var(--hm-space-16) 0" }}>
        <Container>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "var(--hm-space-8)",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "var(--hm-text-2xs)",
                  letterSpacing: "var(--hm-tracking-wider)",
                  textTransform: "uppercase",
                  color: "var(--hm-color-text-muted)",
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                Koleksiyonun Favorileri
              </span>
              <h2
                style={{
                  fontFamily: "var(--hm-font-display)",
                  fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
                  fontWeight: "var(--hm-font-regular)",
                  letterSpacing: "var(--hm-tracking-tight)",
                  color: "var(--hm-color-text-main)",
                }}
              >
                En Çok Tercih Edilenler
              </h2>
            </div>

            <Link
              href="/koleksiyon/cok-satanlar"
              style={{
                fontSize: "var(--hm-text-xs)",
                letterSpacing: "var(--hm-tracking-wider)",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "var(--hm-color-text-main)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              Tüm Favoriler →
            </Link>
          </div>

          <HomeProductGrid initialProducts={store.products} mode="best-sellers" />
        </Container>
      </section>

      {/* 7. Marka Değerleri & Güvenceler */}
      <BrandValues />
    </div>
  );
}
