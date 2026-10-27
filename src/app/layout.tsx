import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Playfair_Display } from "next/font/google";
import "@/styles/globals.css";
import { Header } from "@/components/shell/Header";
import { Footer } from "@/components/shell/Footer";
import { AnnouncementBar } from "@/components/shell/AnnouncementBar";
import { CookieConsent } from "@/components/ui/CookieConsent";
import { StoreProviders } from "@/components/providers/StoreProviders";
import { getStoreData } from "@/lib/server/store";

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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Hümra Butik — Zamansız Kadın Giyim & Modern Koleksiyonlar",
    template: "%s | Hümra Butik",
  },
  description:
    "Hümra Butik: Seçkin kadın giyim, ikili takımlar ve zamansız koleksiyonlar. Premium kumaş kalitesi ve modern kalıplarla güvenli alışveriş.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Hümra Butik",
    description: "Seçkin kadın giyim ve modern koleksiyonlar.",
    locale: "tr_TR",
    type: "website",
    url: siteUrl,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const store = getStoreData();
  const announcement = store.homepageContent.announcement;
  const freeShippingThreshold = store.settings.freeShippingThreshold;

  return (
    <html
      lang="tr"
      className={`${plusJakartaSans.variable} ${playfairDisplay.variable}`}
    >
      <body>
        <StoreProviders freeShippingThreshold={freeShippingThreshold}>
          <AnnouncementBar
            text={announcement.text}
            isActive={announcement.isActive}
          />
          <Header categories={store.categories} />
          <main style={{ flex: 1 }}>{children}</main>
          <Footer />
          <CookieConsent />
        </StoreProviders>
      </body>
    </html>
  );
}

