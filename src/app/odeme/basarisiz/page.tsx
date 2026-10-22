"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

function FailContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("orderNumber");

  return (
    <div style={{ backgroundColor: "#FAF9F6", minHeight: "80vh", padding: "4rem 0 6rem 0" }}>
      <Container>
        <div
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            backgroundColor: "#FFF",
            borderRadius: "16px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
            border: "1px solid #EDF2F7",
            padding: "2.5rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              backgroundColor: "rgba(229, 62, 62, 0.1)",
              color: "#E53E3E",
              fontSize: "2.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem auto",
            }}
          >
            ✕
          </div>

          <span
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#E53E3E",
              fontWeight: 700,
              display: "block",
              marginBottom: "0.5rem",
            }}
          >
            Ödeme Tamamlanamadı
          </span>

          <h1
            style={{
              fontFamily: "var(--hm-font-display)",
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              color: "#1A202C",
              marginBottom: "0.75rem",
            }}
          >
            Ödeme Onayı Alınamadı
          </h1>

          <p style={{ color: "#718096", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Ödeme işlemi bankanız veya kart sağlayıcınız tarafından onaylanmadı.
            Kart bilgilerinizde veya bakiyenizde bir sorun yoksa, bankanızla iletişime geçebilir ya da farklı bir kart ile tekrar deneyebilirsiniz.
          </p>

          {orderNumber && (
            <div
              style={{
                backgroundColor: "#F8FAFC",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                border: "1px solid #EDF2F7",
                fontSize: "0.8125rem",
                color: "#4A5568",
                marginBottom: "2rem",
                display: "inline-block",
              }}
            >
              Referans No: <strong style={{ fontFamily: "monospace" }}>{orderNumber}</strong>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
            <Link href="/odeme">
              <Button variant="primary" size="md">
                Ödemeyi Tekrar Dene
              </Button>
            </Link>

            <Link href="/urunler">
              <Button variant="outline" size="md">
                Alışverişe Devam Et
              </Button>
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}

export default function OrderFailPage() {
  return (
    <Suspense fallback={<div style={{ padding: "5rem", textAlign: "center" }}>Yükleniyor...</div>}>
      <FailContent />
    </Suspense>
  );
}
