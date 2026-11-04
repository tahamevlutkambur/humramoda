"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "../ui/Container";

export function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer
      style={{
        backgroundColor: "var(--hm-color-surface-dark)",
        color: "var(--hm-color-text-light)",
        marginTop: "auto",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
        paddingTop: "var(--hm-space-16)",
        paddingBottom: "var(--hm-space-12)",
      }}
    >
      <Container>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--hm-space-10)",
            paddingBottom: "var(--hm-space-12)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
          }}
        >
          {/* Marka & İletişim */}
          <div>
            <span
              style={{
                fontFamily: "var(--hm-font-display)",
                fontSize: "1.375rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontWeight: "var(--hm-font-regular)",
                display: "block",
                marginBottom: "var(--hm-space-3)",
              }}
            >
              HÜMRA MODA
            </span>
            <p
              style={{
                fontSize: "var(--hm-text-xs)",
                lineHeight: 1.8,
                color: "var(--hm-color-text-light-muted)",
              }}
            >
              Seçkin kadın giyim ve modern tesettür modasının adresi.
              Zarafet ve konforun buluştuğu zamansız tasarımlar.
            </p>
          </div>

          {/* Önemli Bilgiler */}
          <div>
            <h4
              style={{
                fontSize: "var(--hm-text-xs)",
                letterSpacing: "var(--hm-tracking-wider)",
                textTransform: "uppercase",
                fontWeight: "var(--hm-font-medium)",
                marginBottom: "var(--hm-space-4)",
              }}
            >
              Müşteri Hizmetleri
            </h4>
            <ul
              style={{
                listStyle: "none",
                fontSize: "var(--hm-text-sm)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--hm-space-2)",
                color: "var(--hm-color-text-light-muted)",
              }}
            >
              <li>
                <Link href="/siparis-takip" style={{ color: "inherit", textDecoration: "none" }}>
                  Sipariş ve Kargo Takibi
                </Link>
              </li>
              <li>
                <Link href="/iade-degisim" style={{ color: "inherit", textDecoration: "none" }}>
                  İptal, İade ve Değişim Talebi
                </Link>
              </li>
              <li>
                <Link href="/mesafeli-satis-sozlesmesi" style={{ color: "inherit", textDecoration: "none" }}>
                  Mesafeli Satış Sözleşmesi
                </Link>
              </li>
              <li>
                <Link href="/gizlilik-ve-cerez-politikasi" style={{ color: "inherit", textDecoration: "none" }}>
                  Gizlilik ve Çerez Politikası
                </Link>
              </li>
              <li>
                <Link href="/kvkk-aydinlatma-metni" style={{ color: "inherit", textDecoration: "none" }}>
                  KVKK Aydınlatma Metni
                </Link>
              </li>
            </ul>
          </div>

          {/* Kategoriler */}
          <div>
            <h4
              style={{
                fontSize: "var(--hm-text-xs)",
                letterSpacing: "var(--hm-tracking-wider)",
                textTransform: "uppercase",
                fontWeight: "var(--hm-font-medium)",
                marginBottom: "var(--hm-space-4)",
              }}
            >
              Koleksiyonlar
            </h4>
            <ul
              style={{
                listStyle: "none",
                fontSize: "var(--hm-text-sm)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--hm-space-2)",
                color: "var(--hm-color-text-light-muted)",
              }}
            >
              <li>
                <Link href="/kategori/yeni-koleksiyon">Yeni Koleksiyon</Link>
              </li>
              <li>
                <Link href="/kategori/takim">İkili &amp; Üçlü Takımlar</Link>
              </li>
              <li>
                <Link href="/kategori/dis-giyim">Dış Giyim &amp; Trençkot</Link>
              </li>
              <li>
                <Link href="/kategori/triko">Triko &amp; Tunik</Link>
              </li>
              <li>
                <Link href="/koleksiyon/cok-satanlar">Çok Satanlar</Link>
              </li>
            </ul>
          </div>

          {/* Popüler Aramalar & SEO İç Bağlantılar */}
          <div>
            <h4
              style={{
                fontSize: "var(--hm-text-xs)",
                letterSpacing: "var(--hm-tracking-wider)",
                textTransform: "uppercase",
                fontWeight: "var(--hm-font-medium)",
                marginBottom: "var(--hm-space-4)",
              }}
            >
              Popüler Aramalar
            </h4>
            <ul
              style={{
                listStyle: "none",
                fontSize: "var(--hm-text-sm)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--hm-space-2)",
                color: "var(--hm-color-text-light-muted)",
              }}
            >
              <li>
                <Link href="/kategori/takim">Kadın İkili Takım Modelleri</Link>
              </li>
              <li>
                <Link href="/kategori/dis-giyim">Kadın Trençkot &amp; Ceket</Link>
              </li>
              <li>
                <Link href="/urunler?q=gömlek">Modern Kadın Gömlek</Link>
              </li>
              <li>
                <Link href="/urunler">Yeni Sezon Kadın Giyim</Link>
              </li>
              <li>
                <Link href="/siparis-takip">Kargo Takip &amp; Destek</Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Alt Çubuk (Telif & Ödeme Güvenliği) */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--hm-space-4)",
            paddingTop: "var(--hm-space-8)",
            fontSize: "var(--hm-text-2xs)",
            color: "var(--hm-color-text-light-muted)",
            letterSpacing: "var(--hm-tracking-wide)",
          }}
        >
          <span>© 2026 Hümra Moda. Tüm hakları saklıdır.</span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              textTransform: "uppercase",
              fontWeight: "var(--hm-font-medium)",
            }}
          >
            <span>256-Bit SSL Güvenli Altyapı</span>
            <span>•</span>
            <span>PayTR ile 3D Secure Ödeme</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}

export default Footer;
