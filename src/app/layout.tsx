import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans, Playfair_Display } from "next/font/google";
import "@/styles/globals.css";
import { Header } from "@/components/shell/Header";
import { Footer } from "@/components/shell/Footer";
import { AnnouncementBar } from "@/components/shell/AnnouncementBar";
import { CookieConsent } from "@/components/ui/CookieConsent";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { StoreProviders } from "@/components/providers/StoreProviders";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { getStoreData } from "@/lib/server/store";
import { getPersistentStoreData } from "@/lib/server/persistent-store";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--hm-font-sans-loaded",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--hm-font-display-loaded",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://humrabutik.com";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Hümra Butik — Zamansız Kadın Giyim & Modern Koleksiyonlar",
    template: "%s | Hümra Butik",
  },
  description:
    "Hümra Butik: Seçkin kadın giyim, ikili takımlar, trençkot modelleri, tunik ve modern tesettür giyim koleksiyonları. 3.500 ₺ üzeri ücretsiz kargo, PayTR 256-bit SSL güvencesiyle hemen sipariş verin.",
  keywords: [
    "hümra butik",
    "hümra moda",
    "kadın giyim",
    "ikili takım",
    "trençkot",
    "tesettür giyim",
    "kadın ceket",
    "tunik",
    "pantolon",
    "kadın takım",
    "yeni sezon giyim",
    "modern tesettür",
  ],
  authors: [{ name: "Hümra Butik" }],
  creator: "Hümra Butik",
  publisher: "Hümra Butik",
  alternates: {
    canonical: siteUrl,
  },
  verification: {
    google: "google8c400ca3bd0c0c06",
  },
  other: {
    "google-site-verification": "google8c400ca3bd0c0c06",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Hümra Butik — Zamansız Kadın Giyim & Modern Koleksiyonlar",
    description: "Seçkin kadın giyim, ikili takımlar, trençkot ve zamansız koleksiyonlar. Premium kumaş kalitesi ve modern kalıplar.",
    locale: "tr_TR",
    type: "website",
    url: siteUrl,
    siteName: "Hümra Butik",
    images: [
      {
        url: "/uploads/products/IMG_2237-card.webp",
        width: 1200,
        height: 630,
        alt: "Hümra Butik Kadın Giyim Koleksiyonu",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hümra Butik — Kadın Giyim & Modern Koleksiyonlar",
    description: "Seçkin kadın giyim, ikili takımlar ve zamansız trençkot modelleri.",
    images: ["/uploads/products/IMG_2237-card.webp"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let store;
  try {
    store = await getPersistentStoreData();
  } catch (error) {
    console.error("Persistent store load failed; using local fallback:", error);
    store = getStoreData();
  }
  const announcement = store.homepageContent.announcement;
  const freeShippingThreshold = store.settings.freeShippingThreshold;

  const jsonLdOrganization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Hümra Butik",
    "url": siteUrl,
    "logo": `${siteUrl}/uploads/products/IMG_2237-card.webp`,
    "description": "Seçkin kadın giyim, ikili takımlar ve zamansız koleksiyonlar.",
    "telephone": store.settings?.phone || "+90 542 799 44 28",
    "email": store.settings?.email || "destek@humrabutik.com",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": store.settings?.address || "Nişantaşı",
      "addressLocality": "İstanbul",
      "addressCountry": "TR"
    },
    "sameAs": [
      store.settings?.instagramUrl || "https://instagram.com/humramoda",
      store.settings?.tiktokUrl || "https://tiktok.com/@humramoda",
      `https://wa.me/905427994428`
    ]
  };

  const jsonLdWebsite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Hümra Butik",
    "url": siteUrl,
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${siteUrl}/urunler?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <html
      lang="tr"
      className={`${plusJakartaSans.variable} ${playfairDisplay.variable}`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrganization) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebsite) }}
        />
      </head>
      <body>
        <Suspense fallback={null}>
          <MetaPixel />
        </Suspense>
        <StoreProviders freeShippingThreshold={freeShippingThreshold}>
          <AnnouncementBar
            text={announcement.text}
            isActive={announcement.isActive}
          />
          <Header categories={store.categories} />
          <main style={{ flex: 1 }}>{children}</main>
          <Footer />
          <WhatsAppButton phoneNumber={store.settings?.whatsapp} />
          <CookieConsent />
        </StoreProviders>
      </body>
    </html>
  );
}

