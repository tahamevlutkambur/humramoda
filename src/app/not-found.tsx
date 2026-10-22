import React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div
      style={{
        padding: "var(--hm-space-20) 0 var(--hm-space-24)",
        textAlign: "center",
      }}
    >
      <Container size="narrow">
        <span
          style={{
            fontFamily: "var(--hm-font-display)",
            fontSize: "clamp(3rem, 8vw, 6rem)",
            fontWeight: "var(--hm-font-light)",
            color: "var(--hm-color-border-main)",
            lineHeight: 1,
            display: "block",
            marginBottom: "1rem",
          }}
        >
          404
        </span>
        <h1
          style={{
            fontFamily: "var(--hm-font-display)",
            fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
            fontWeight: "var(--hm-font-regular)",
            letterSpacing: "var(--hm-tracking-tight)",
            marginBottom: "1rem",
            color: "var(--hm-color-text-main)",
          }}
        >
          Aradığınız Sayfa Bulunamadı
        </h1>
        <p
          style={{
            fontSize: "var(--hm-text-sm)",
            color: "var(--hm-color-text-secondary)",
            maxWidth: "420px",
            margin: "0 auto 2rem",
            lineHeight: 1.6,
          }}
        >
          Ulaşmaya çalıştığınız ürün tükenmiş, silinmiş veya bağlantı adresi değişmiş olabilir. Yeni sezon parçalarımızı keşfetmeye devam edebilirsiniz.
        </p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link href="/">
            <Button variant="primary" size="md">
              Ana Sayfaya Dön
            </Button>
          </Link>
          <Link href="/urunler">
            <Button variant="outline" size="md">
              Tüm Ürünleri İncele
            </Button>
          </Link>
        </div>
      </Container>
    </div>
  );
}
