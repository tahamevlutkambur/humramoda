import React from "react";
import { Container } from "../ui/Container";

const VALUES = [
  {
    title: "Özenli Terzilik & Kumaş",
    description: "Kusursuz dikiş detayları, birinci sınıf pamuk gabardin ve akıcı scuba kumaşlar.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    title: "150 ₺ Sabit Kargo",
    description: "Tüm Türkiye'ye 150 ₺ sabit kargo ücreti ile hızlı ve güvenli teslimat.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
        <circle cx="17" cy="18" r="2" />
        <circle cx="7" cy="18" r="2" />
      </svg>
    ),
  },
  {
    title: "14 Gün Kolay Değişim",
    description: "Koşulsuz müşteri memnuniyeti ilkesiyle 14 gün içinde hızlı değişim ve iade imkanı.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
  },
  {
    title: "256-Bit SSL Güvenli Ödeme",
    description: "Tüm banka ve kredi kartlarıyla %100 güvenli, 3D Secure onaylı alışveriş konforu.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
];

export function BrandValues() {
  return (
    <section
      style={{
        padding: "var(--hm-space-12) 0",
        borderTop: "1px solid var(--hm-color-border-subtle)",
        borderBottom: "1px solid var(--hm-color-border-subtle)",
        backgroundColor: "var(--hm-color-surface)",
      }}
    >
      <Container>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "var(--hm-space-8)",
          }}
        >
          {VALUES.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  color: "var(--hm-color-text-main)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.icon}
              </div>
              <h4
                style={{
                  fontSize: "var(--hm-text-xs)",
                  fontWeight: 600,
                  letterSpacing: "var(--hm-tracking-wider)",
                  textTransform: "uppercase",
                  color: "var(--hm-color-text-main)",
                }}
              >
                {item.title}
              </h4>
              <p
                style={{
                  fontSize: "var(--hm-text-xs)",
                  color: "var(--hm-color-text-secondary)",
                  lineHeight: 1.5,
                  maxWidth: "260px",
                }}
              >
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export default BrandValues;
