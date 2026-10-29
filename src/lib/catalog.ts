/**
 * Hümra Moda — Tip-Güvenli Katalog Veri Katmanı
 * Bu modül; veritabanı aktif olmadığında da gerçek çekim görsellerini (manifest.json)
 * ve dikey videoları referans alarak tip güvenli katalog verisini sunar.
 */

export interface ProductMediaItem {
  id: string;
  colorId?: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  thumbnailUrl: string;
  posterUrl?: string;
  altText: string;
  isThumbnail: boolean;
  displayOrder: number;
}

export interface ProductColorItem {
  id: string;
  name: string;
  slug: string;
  colorCode: string;
  displayOrder: number;
}

export interface ProductSizeItem {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
}

export interface ProductVariantItem {
  id: string;
  colorId: string;
  sizeId: string;
  sku: string;
  stockQuantity: number;
  costPrice?: number; // Birim maliyet / alış fiyatı (₺)
  barcode?: string;
  isActive: boolean;
}

export interface ProductItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  fabricDetails: string;
  modelDimensions: string;
  basePrice: number;
  discountPrice?: number;
  costPrice?: number; // Birim maliyet (₺)
  isPreOrder?: boolean;
  preOrderNote?: string;
  badge?: string; // "YENİ ÜRÜN", "ÇOK SATAN", "ÖN SİPARİŞ"
  categorySlug: string;
  categoryName: string;
  collectionSlugs: string[];
  colors: ProductColorItem[];
  sizes: ProductSizeItem[];
  variants: ProductVariantItem[];
  media: ProductMediaItem[];
  createdAt: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl?: string;
  displayOrder: number;
}

export interface CollectionItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  displayOrder: number;
}

export interface VideoLookItem {
  id: string;
  title: string;
  productSlug: string;
  colorSlug: string;
  videoUrl: string;
  posterUrl: string;
  price: number;
}

// -------------------------------------------------------------
// 1. KATEGORİLER & KOLEKSİYONLAR
// -------------------------------------------------------------
export const CATEGORIES: CategoryItem[] = [
  {
    id: "cat-1",
    name: "Yeni Koleksiyon",
    slug: "yeni-koleksiyon",
    description: "2026 İlkbahar / Yaz sezonunun öne çıkan siluetleri ve zamansız parçaları.",
    imageUrl: "/uploads/products/IMG_2190-card.webp",
    displayOrder: 1,
  },
  {
    id: "cat-2",
    name: "İkili & Üçlü Takım",
    slug: "takim",
    description: "Zahmetsiz şıklık sunan şardonlu, scuba ve dökümlü takım tasarımları.",
    imageUrl: "/uploads/products/IMG_2217-card.webp",
    displayOrder: 2,
  },
  {
    id: "cat-3",
    name: "Dış Giyim & Trenç",
    slug: "dis-giyim",
    description: "Modern kalıplı pamuklu trençkotlar ve mevsimlik koruyucu ceketler.",
    imageUrl: "/uploads/products/IMG_2237-card.webp",
    displayOrder: 3,
  },
  {
    id: "cat-4",
    name: "Triko & Tunik",
    slug: "triko",
    description: "Doğal ipliklerden dokunan nefes alan trikolar ve dökümlü üstler.",
    imageUrl: "/uploads/products/IMG_2263-card.webp",
    displayOrder: 4,
  },
];

export const COLLECTIONS: CollectionItem[] = [
  {
    id: "col-1",
    name: "Yeni Sezon",
    slug: "yeni-sezon",
    description: "Yeni gelen en taze parçalar.",
    displayOrder: 1,
  },
  {
    id: "col-2",
    name: "Çok Satanlar",
    slug: "cok-satanlar",
    description: "En çok tercih edilen Hümra Moda klasikleri.",
    displayOrder: 2,
  },
  {
    id: "col-3",
    name: "Özel Fırsatlar",
    slug: "ozel-firsatlar",
    description: "Seçili parçalarda sepet indirimleri.",
    displayOrder: 3,
  },
];

// -------------------------------------------------------------
// 2. GERÇEK GÖRSELLER İLE EŞLEŞTİRİLMİŞ KATALOG ÜRÜNLERİ
// -------------------------------------------------------------
export const PRODUCTS: ProductItem[] = [
  {
    id: "prod-1",
    title: "Qapitone Garnili Scuba İkili Takım",
    slug: "qapitone-garnili-scuba-ikili-takim",
    description:
      "Ön panelinde mikro kapitone garni detayları, dik yaka formu ve dökümlü scuba kumaşıyla hem günlük hem özel davetlerde zamansız bir zarafet sunar. Pantolonu beli lastikli ve konforlu boru paçadır.",
    fabricDetails: "%70 Viskon, %25 Poliamid, %5 Elastan (Scuba kumaş). Kırışmaya dayanıklı, nefes alabilir yapı.",
    modelDimensions: "Boy: 176 cm, Göğüs: 84 cm, Bel: 62 cm, Basen: 90 cm. Manken üzerindeki beden: 1 Beden (36-38).",
    basePrice: 1749,
    discountPrice: 1574.1,
    badge: "YENİ ÜRÜN",
    categorySlug: "takim",
    categoryName: "İkili & Üçlü Takım",
    collectionSlugs: ["yeni-sezon", "cok-satanlar"],
    createdAt: "2026-10-15T10:00:00Z",
    colors: [
      {
        id: "col-p1-siyah",
        name: "Siyah",
        slug: "siyah",
        colorCode: "#141414",
        displayOrder: 1,
      },
      {
        id: "col-p1-haki",
        name: "Haki",
        slug: "haki",
        colorCode: "#4B5320",
        displayOrder: 2,
      },
    ],
    sizes: [
      { id: "size-1", name: "1 Beden (36-38)", slug: "1-beden-36-38", displayOrder: 1 },
      { id: "size-2", name: "2 Beden (40-42)", slug: "2-beden-40-42", displayOrder: 2 },
    ],
    variants: [
      // Siyah varyantları
      {
        id: "var-1",
        colorId: "col-p1-siyah",
        sizeId: "size-1",
        sku: "HM-SCB-SYH-B1",
        stockQuantity: 12,
        isActive: true,
      },
      {
        id: "var-2",
        colorId: "col-p1-siyah",
        sizeId: "size-2",
        sku: "HM-SCB-SYH-B2",
        stockQuantity: 0, // Tükendi durumunu test etmek için 0
        isActive: true,
      },
      // Haki varyantları
      {
        id: "var-3",
        colorId: "col-p1-haki",
        sizeId: "size-1",
        sku: "HM-SCB-HKI-B1",
        stockQuantity: 8,
        isActive: true,
      },
      {
        id: "var-4",
        colorId: "col-p1-haki",
        sizeId: "size-2",
        sku: "HM-SCB-HKI-B2",
        stockQuantity: 5,
        isActive: true,
      },
    ],
    media: [
      // Siyah görselleri (IMG_2190, 2192, 2193, 2198)
      {
        id: "med-1",
        colorId: "col-p1-siyah",
        type: "IMAGE",
        url: "/uploads/products/IMG_2190-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2190-thumb.webp",
        altText: "Qapitone Garnili Scuba İkili Takım — Siyah Önden Görünüm",
        isThumbnail: true,
        displayOrder: 1,
      },
      {
        id: "med-2",
        colorId: "col-p1-siyah",
        type: "IMAGE",
        url: "/uploads/products/IMG_2192-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2192-thumb.webp",
        altText: "Qapitone Garnili Scuba İkili Takım — Siyah Yan Detay",
        isThumbnail: false,
        displayOrder: 2,
      },
      {
        id: "med-3",
        colorId: "col-p1-siyah",
        type: "IMAGE",
        url: "/uploads/products/IMG_2193-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2193-thumb.webp",
        altText: "Qapitone Garnili Scuba İkili Takım — Siyah Kumaş Dokusu",
        isThumbnail: false,
        displayOrder: 3,
      },
      {
        id: "med-4",
        colorId: "col-p1-siyah",
        type: "IMAGE",
        url: "/uploads/products/IMG_2198-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2198-thumb.webp",
        altText: "Qapitone Garnili Scuba İkili Takım — Siyah Boydan Duruş",
        isThumbnail: false,
        displayOrder: 4,
      },
      // Haki görselleri (IMG_2199, 2200, 2201)
      {
        id: "med-5",
        colorId: "col-p1-haki",
        type: "IMAGE",
        url: "/uploads/products/IMG_2199-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2199-thumb.webp",
        altText: "Qapitone Garnili Scuba İkili Takım — Haki Önden Görünüm",
        isThumbnail: true,
        displayOrder: 1,
      },
      {
        id: "med-6",
        colorId: "col-p1-haki",
        type: "IMAGE",
        url: "/uploads/products/IMG_2200-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2200-thumb.webp",
        altText: "Qapitone Garnili Scuba İkili Takım — Haki Yakın Detay",
        isThumbnail: false,
        displayOrder: 2,
      },
      {
        id: "med-7",
        colorId: "col-p1-haki",
        type: "IMAGE",
        url: "/uploads/products/IMG_2201-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2201-thumb.webp",
        altText: "Qapitone Garnili Scuba İkili Takım — Haki Boydan",
        isThumbnail: false,
        displayOrder: 3,
      },
    ],
  },
  {
    id: "prod-2",
    title: "Şardonlu Ceket & Geniş Paça Pantolon Takımı",
    slug: "sardonlu-ceket-genis-paca-pantolon-takimi",
    description:
      "İç kısmı yumuşak şardonlu pamuk dokusuyla serin havalarda sıcak tutan, vatkalı dik omuz formu ve akıcı paça kesimiyle modern şehir stilini tanımlayan takım.",
    fabricDetails: "%80 Pamuk, %20 Polyester (Şardonlu 3 İplik). Tüylenme yapmayan kompakt iplik.",
    modelDimensions: "Boy: 177 cm, Göğüs: 82 cm, Bel: 60 cm, Basen: 89 cm. Manken üzerindeki beden: 1 Beden.",
    basePrice: 1890,
    discountPrice: 1701,
    badge: "ÇOK SATAN",
    categorySlug: "takim",
    categoryName: "İkili & Üçlü Takım",
    collectionSlugs: ["yeni-sezon", "cok-satanlar"],
    createdAt: "2026-10-16T11:00:00Z",
    colors: [
      {
        id: "col-p2-vizon",
        name: "Vizon Bej",
        slug: "vizon-bej",
        colorCode: "#C8B89C",
        displayOrder: 1,
      },
      {
        id: "col-p2-bordo",
        name: "Bordo Merat",
        slug: "bordo-merat",
        colorCode: "#8B2635",
        displayOrder: 2,
      },
    ],
    sizes: [
      { id: "size-1", name: "1 Beden (36-38)", slug: "1-beden-36-38", displayOrder: 1 },
      { id: "size-2", name: "2 Beden (40-42)", slug: "2-beden-40-42", displayOrder: 2 },
    ],
    variants: [
      {
        id: "var-2-1",
        colorId: "col-p2-vizon",
        sizeId: "size-1",
        sku: "HM-SRD-VZN-B1",
        stockQuantity: 15,
        isActive: true,
      },
      {
        id: "var-2-2",
        colorId: "col-p2-vizon",
        sizeId: "size-2",
        sku: "HM-SRD-VZN-B2",
        stockQuantity: 7,
        isActive: true,
      },
      {
        id: "var-2-3",
        colorId: "col-p2-bordo",
        sizeId: "size-1",
        sku: "HM-SRD-BRD-B1",
        stockQuantity: 6,
        isActive: true,
      },
      {
        id: "var-2-4",
        colorId: "col-p2-bordo",
        sizeId: "size-2",
        sku: "HM-SRD-BRD-B2",
        stockQuantity: 4,
        isActive: true,
      },
    ],
    media: [
      // Vizon Bej görselleri (IMG_2217, 2218, 2219, 2226)
      {
        id: "med-2-1",
        colorId: "col-p2-vizon",
        type: "IMAGE",
        url: "/uploads/products/IMG_2217-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2217-thumb.webp",
        altText: "Şardonlu Takım — Vizon Bej",
        isThumbnail: true,
        displayOrder: 1,
      },
      {
        id: "med-2-2",
        colorId: "col-p2-vizon",
        type: "IMAGE",
        url: "/uploads/products/IMG_2218-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2218-thumb.webp",
        altText: "Şardonlu Takım — Vizon Detay",
        isThumbnail: false,
        displayOrder: 2,
      },
      {
        id: "med-2-3",
        colorId: "col-p2-vizon",
        type: "IMAGE",
        url: "/uploads/products/IMG_2219-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2219-thumb.webp",
        altText: "Şardonlu Takım — Vizon Yan",
        isThumbnail: false,
        displayOrder: 3,
      },
      {
        id: "med-2-4",
        colorId: "col-p2-vizon",
        type: "IMAGE",
        url: "/uploads/products/IMG_2226-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2226-thumb.webp",
        altText: "Şardonlu Takım — Vizon Arka Kesim",
        isThumbnail: false,
        displayOrder: 4,
      },
      // Bordo Merat görselleri (IMG_2228, 2231, 2235)
      {
        id: "med-2-5",
        colorId: "col-p2-bordo",
        type: "IMAGE",
        url: "/uploads/products/IMG_2228-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2228-thumb.webp",
        altText: "Şardonlu Takım — Bordo Merat",
        isThumbnail: true,
        displayOrder: 1,
      },
      {
        id: "med-2-6",
        colorId: "col-p2-bordo",
        type: "IMAGE",
        url: "/uploads/products/IMG_2231-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2231-thumb.webp",
        altText: "Şardonlu Takım — Bordo Yaka Detay",
        isThumbnail: false,
        displayOrder: 2,
      },
      {
        id: "med-2-7",
        colorId: "col-p2-bordo",
        type: "IMAGE",
        url: "/uploads/products/IMG_2235-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2235-thumb.webp",
        altText: "Şardonlu Takım — Bordo Duruş",
        isThumbnail: false,
        displayOrder: 3,
      },
    ],
  },
  {
    id: "prod-3",
    title: "Düğmeli ve Kemerli Oversize Trençkot",
    slug: "dugmeli-kemerli-oversize-trenckot",
    description:
      "Zamansız camel rengi, geniş klapa yakası, çift sıra boynuz düğmeleri ve tok kumaşıyla sonbahar-kış gardırobunun temel yıldız parçası. Astarı saten dokulu olup dökümlü duruş sağlar.",
    fabricDetails: "%65 Pamuk Gabardin, %35 Polyester. Su itici apre kaplama.",
    modelDimensions: "Boy: 175 cm. Manken üzerindeki beden: Standart (36-42 uyumlu).",
    basePrice: 2250,
    badge: "ÖN SİPARİŞ",
    isPreOrder: true,
    preOrderNote: "Tahmini kargoya veriliş: 5 iş günü içerisinde.",
    categorySlug: "dis-giyim",
    categoryName: "Dış Giyim & Trenç",
    collectionSlugs: ["yeni-sezon"],
    createdAt: "2026-10-17T09:00:00Z",
    colors: [
      {
        id: "col-p3-camel",
        name: "Camel",
        slug: "camel",
        colorCode: "#BFA07A",
        displayOrder: 1,
      },
      {
        id: "col-p3-siyah",
        name: "Siyah",
        slug: "siyah",
        colorCode: "#141414",
        displayOrder: 2,
      },
    ],
    sizes: [
      { id: "size-std", name: "Standart (36-42)", slug: "standart", displayOrder: 1 },
    ],
    variants: [
      {
        id: "var-3-1",
        colorId: "col-p3-camel",
        sizeId: "size-std",
        sku: "HM-TRN-CML-STD",
        stockQuantity: 20,
        isActive: true,
      },
      {
        id: "var-3-2",
        colorId: "col-p3-siyah",
        sizeId: "size-std",
        sku: "HM-TRN-SYH-STD",
        stockQuantity: 14,
        isActive: true,
      },
    ],
    media: [
      // Camel görselleri (IMG_2237, 2246, 2257)
      {
        id: "med-3-1",
        colorId: "col-p3-camel",
        type: "IMAGE",
        url: "/uploads/products/IMG_2237-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2237-thumb.webp",
        altText: "Oversize Trençkot — Camel",
        isThumbnail: true,
        displayOrder: 1,
      },
      {
        id: "med-3-2",
        colorId: "col-p3-camel",
        type: "IMAGE",
        url: "/uploads/products/IMG_2246-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2246-thumb.webp",
        altText: "Oversize Trençkot — Camel Kemer Detay",
        isThumbnail: false,
        displayOrder: 2,
      },
      {
        id: "med-3-3",
        colorId: "col-p3-camel",
        type: "IMAGE",
        url: "/uploads/products/IMG_2257-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2257-thumb.webp",
        altText: "Oversize Trençkot — Camel Yaka Detay",
        isThumbnail: false,
        displayOrder: 3,
      },
      // Siyah görselleri (IMG_2259, 2262)
      {
        id: "med-3-4",
        colorId: "col-p3-siyah",
        type: "IMAGE",
        url: "/uploads/products/IMG_2259-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2259-thumb.webp",
        altText: "Oversize Trençkot — Siyah",
        isThumbnail: true,
        displayOrder: 1,
      },
      {
        id: "med-3-5",
        colorId: "col-p3-siyah",
        type: "IMAGE",
        url: "/uploads/products/IMG_2262-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2262-thumb.webp",
        altText: "Oversize Trençkot — Siyah Boydan",
        isThumbnail: false,
        displayOrder: 2,
      },
    ],
  },
  {
    id: "prod-4",
    title: "Brode Garnili Triko İkili Takım",
    slug: "brode-garnili-triko-ikili-takim",
    description:
      "Zarif brode işlemeleri, manşet detayları ve dökümlü triko eteği ile feminen ve asil bir görünüm sunar. Özel günlerde ve günlük şıklıkta yüksek konfor sağlar.",
    fabricDetails: "%50 Pamuk, %50 Akrilik Triko dokuma. Yumuşak tuşe, batma yapmaz.",
    modelDimensions: "Boy: 176 cm. Manken üzerindeki beden: 1 Beden.",
    basePrice: 1650,
    discountPrice: 1485,
    badge: "YENİ ÜRÜN",
    categorySlug: "triko",
    categoryName: "Triko & Tunik",
    collectionSlugs: ["yeni-sezon", "ozel-firsatlar"],
    createdAt: "2026-10-18T14:00:00Z",
    colors: [
      {
        id: "col-p4-ekru",
        name: "Ekru",
        slug: "ekru",
        colorCode: "#F5F2EB",
        displayOrder: 1,
      },
      {
        id: "col-p4-lacivert",
        name: "Gece Laciverti",
        slug: "gece-laciverti",
        colorCode: "#1E293B",
        displayOrder: 2,
      },
    ],
    sizes: [
      { id: "size-1", name: "1 Beden (36-38)", slug: "1-beden-36-38", displayOrder: 1 },
      { id: "size-2", name: "2 Beden (40-42)", slug: "2-beden-40-42", displayOrder: 2 },
    ],
    variants: [
      {
        id: "var-4-1",
        colorId: "col-p4-ekru",
        sizeId: "size-1",
        sku: "HM-BRD-EKR-B1",
        stockQuantity: 10,
        isActive: true,
      },
      {
        id: "var-4-2",
        colorId: "col-p4-ekru",
        sizeId: "size-2",
        sku: "HM-BRD-EKR-B2",
        stockQuantity: 8,
        isActive: true,
      },
      {
        id: "var-4-3",
        colorId: "col-p4-lacivert",
        sizeId: "size-1",
        sku: "HM-BRD-LCV-B1",
        stockQuantity: 5,
        isActive: true,
      },
      {
        id: "var-4-4",
        colorId: "col-p4-lacivert",
        sizeId: "size-2",
        sku: "HM-BRD-LCV-B2",
        stockQuantity: 0, // Lacivert 2 beden tükendi
        isActive: true,
      },
    ],
    media: [
      // Ekru görselleri (IMG_2263, 2270)
      {
        id: "med-4-1",
        colorId: "col-p4-ekru",
        type: "IMAGE",
        url: "/uploads/products/IMG_2263-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2263-thumb.webp",
        altText: "Brode Garnili Triko — Ekru",
        isThumbnail: true,
        displayOrder: 1,
      },
      {
        id: "med-4-2",
        colorId: "col-p4-ekru",
        type: "IMAGE",
        url: "/uploads/products/IMG_2270-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2270-thumb.webp",
        altText: "Brode Garnili Triko — Ekru Detay",
        isThumbnail: false,
        displayOrder: 2,
      },
      // Lacivert görselleri (IMG_2279)
      {
        id: "med-4-3",
        colorId: "col-p4-lacivert",
        type: "IMAGE",
        url: "/uploads/products/IMG_2279-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2279-thumb.webp",
        altText: "Brode Garnili Triko — Gece Laciverti",
        isThumbnail: true,
        displayOrder: 1,
      },
    ],
  },
  {
    id: "prod-1793199201268",
    title: "Gömlek",
    slug: "gomlek",
    description: "Zarif dikiş detayları ve dökümlü formuyla modern kadın gardırobunun vazgeçilmez parçası. Nefes alan kaliteli kumaşı gün boyu konfor sunar.",
    fabricDetails: "%100 Pamuklu Gabardin. 30 derecede hassas yıkama tavsiye edilir.",
    modelDimensions: "Model Boy: 176 cm, Göğüs: 84 cm, Bel: 62 cm, Kalça: 90 cm. Beden: M.",
    basePrice: 249,
    discountPrice: 199,
    badge: "YENİ SEZON",
    categorySlug: "yeni-koleksiyon",
    categoryName: "Yeni Koleksiyon",
    collectionSlugs: ["yeni-sezon"],
    createdAt: "2026-10-28T12:00:00Z",
    colors: [
      {
        id: "col-fuhse",
        name: "FUHŞE",
        slug: "fuhse",
        colorCode: "#6B1D2F",
        displayOrder: 1,
      },
    ],
    sizes: [
      {
        id: "size-m",
        name: "M",
        slug: "m",
        displayOrder: 1,
      },
      {
        id: "size-s",
        name: "S",
        slug: "s",
        displayOrder: 2,
      },
      {
        id: "size-l",
        name: "L",
        slug: "l",
        displayOrder: 3,
      },
    ],
    variants: [
      {
        id: "var-fuhse-m",
        colorId: "col-fuhse",
        sizeId: "size-m",
        sku: "FUHŞE-M",
        stockQuantity: 100,
        isActive: true,
      },
      {
        id: "var-fuhse-s",
        colorId: "col-fuhse",
        sizeId: "size-s",
        sku: "FUHŞE-S",
        stockQuantity: 100,
        isActive: true,
      },
      {
        id: "var-fuhse-l",
        colorId: "col-fuhse",
        sizeId: "size-l",
        sku: "FUHŞE-L",
        stockQuantity: 100,
        isActive: true,
      },
    ],
    media: [
      {
        id: "med-gomlek-1",
        colorId: "col-fuhse",
        type: "IMAGE",
        url: "/uploads/products/IMG_2190-detail.webp",
        thumbnailUrl: "/uploads/products/IMG_2190-thumb.webp",
        altText: "Gömlek FUHŞE",
        isThumbnail: true,
        displayOrder: 1,
      },
    ],
  },
];

// -------------------------------------------------------------
// 3. DİKEY VİDEO MODA GÖRÜNÜMLERİ (humravideolar/)
// -------------------------------------------------------------
export const FEATURED_VIDEOS: VideoLookItem[] = [
  {
    id: "vid-1",
    title: "Oversize Kemerli Trençkot",
    productSlug: "dugmeli-kemerli-oversize-trenckot",
    colorSlug: "camel",
    videoUrl: "/uploads/videos/model-beige-trench.mp4",
    posterUrl: "/uploads/products/IMG_2237-card.webp",
    price: 2250,
  },
  {
    id: "vid-2",
    title: "Qapitone Garnili Scuba Takım",
    productSlug: "qapitone-garnili-scuba-ikili-takim",
    colorSlug: "siyah",
    videoUrl: "/uploads/videos/woman-fashion-wear.mp4",
    posterUrl: "/uploads/products/IMG_2190-card.webp",
    price: 1574.1,
  },
];

// -------------------------------------------------------------
// 4. VERİ ERİŞİM YARDIMCILARI (DATA ACCESS METHODS)
// -------------------------------------------------------------

function getActiveProductsList(): ProductItem[] {
  const globalStore = (globalThis as { __humraStoreState?: { inMemoryStore?: { products?: ProductItem[] } } })
    .__humraStoreState?.inMemoryStore;
  if (globalStore && Array.isArray(globalStore.products)) {
    return globalStore.products;
  }
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getStoreData } = require("./server/store");
      return getStoreData().products;
    } catch {
      return PRODUCTS;
    }
  }
  return PRODUCTS;
}

function getActiveCategoriesList(): CategoryItem[] {
  const globalStore = (globalThis as { __humraStoreState?: { inMemoryStore?: { categories?: CategoryItem[] } } })
    .__humraStoreState?.inMemoryStore;
  if (globalStore && Array.isArray(globalStore.categories)) {
    return globalStore.categories;
  }
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getStoreData } = require("./server/store");
      return getStoreData().categories;
    } catch {
      return CATEGORIES;
    }
  }
  return CATEGORIES;
}

function getActiveCollectionsList(): CollectionItem[] {
  const globalStore = (globalThis as { __humraStoreState?: { inMemoryStore?: { collections?: CollectionItem[] } } })
    .__humraStoreState?.inMemoryStore;
  if (globalStore && Array.isArray(globalStore.collections)) {
    return globalStore.collections;
  }
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getStoreData } = require("./server/store");
      return getStoreData().collections;
    } catch {
      return COLLECTIONS;
    }
  }
  return COLLECTIONS;
}

function getActiveVideosList(): VideoLookItem[] {
  const globalStore = (globalThis as { __humraStoreState?: { inMemoryStore?: { featuredVideos?: VideoLookItem[] } } })
    .__humraStoreState?.inMemoryStore;
  if (globalStore && Array.isArray(globalStore.featuredVideos)) {
    return globalStore.featuredVideos;
  }
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getStoreData } = require("./server/store");
      return getStoreData().featuredVideos;
    } catch {
      return FEATURED_VIDEOS;
    }
  }
  return FEATURED_VIDEOS;
}

export function getAllCategories(): CategoryItem[] {
  const cats = [...getActiveCategoriesList()];
  return cats.sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getCategoryBySlug(slug: string): CategoryItem | undefined {
  if (!slug) return undefined;
  const decoded = decodeURIComponent(slug).trim();
  const lower = decoded.toLowerCase();
  return getActiveCategoriesList().find(
    (c) =>
      c.slug === slug ||
      c.id === slug ||
      c.slug === decoded ||
      c.id === decoded ||
      c.slug.toLowerCase() === lower ||
      c.id.toLowerCase() === lower
  );
}

export function getAllCollections(): CollectionItem[] {
  const cols = [...getActiveCollectionsList()];
  return cols.sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getCollectionBySlug(slug: string): CollectionItem | undefined {
  if (!slug) return undefined;
  const decoded = decodeURIComponent(slug).trim();
  const lower = decoded.toLowerCase();
  return getActiveCollectionsList().find(
    (c) =>
      c.slug === slug ||
      c.id === slug ||
      c.slug === decoded ||
      c.id === decoded ||
      c.slug.toLowerCase() === lower ||
      c.id.toLowerCase() === lower
  );
}

export interface GetProductsOptions {
  categorySlug?: string;
  collectionSlug?: string;
  query?: string;
  sort?: "price-asc" | "price-desc" | "newest";
}

export function getProducts(options: GetProductsOptions = {}): ProductItem[] {
  let list = [...getActiveProductsList()];

  if (options.categorySlug) {
    const catSlug = options.categorySlug.toLowerCase();
    list = list.filter((p) => p.categorySlug.toLowerCase() === catSlug);
  }

  if (options.collectionSlug) {
    const colSlug = options.collectionSlug.toLowerCase();
    list = list.filter((p) => p.collectionSlugs.some((s) => s.toLowerCase() === colSlug));
  }

  if (options.query) {
    const q = options.query.toLowerCase().trim();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.colors.some((c) => c.name.toLowerCase().includes(q))
    );
  }

  if (options.sort === "price-asc") {
    list.sort((a, b) => (a.discountPrice || a.basePrice) - (b.discountPrice || b.basePrice));
  } else if (options.sort === "price-desc") {
    list.sort((a, b) => (b.discountPrice || b.basePrice) - (a.discountPrice || a.basePrice));
  } else {
    // En yeniye göre sırala
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return list;
}

export function getProductBySlug(slug: string): ProductItem | undefined {
  if (!slug) return undefined;
  const decoded = decodeURIComponent(slug).trim();
  const lower = decoded.toLowerCase();
  return getActiveProductsList().find(
    (p) =>
      p.slug === slug ||
      p.id === slug ||
      p.slug === decoded ||
      p.id === decoded ||
      p.slug.toLowerCase() === lower ||
      p.id.toLowerCase() === lower
  );
}

export function getRelatedProducts(productId: string, limit = 4): ProductItem[] {
  const all = getActiveProductsList();
  const current = all.find((p) => p.id === productId);
  if (!current) return all.slice(0, limit);

  return all
    .filter((p) => p.id !== productId && p.categorySlug === current.categorySlug)
    .concat(all.filter((p) => p.id !== productId && p.categorySlug !== current.categorySlug))
    .slice(0, limit);
}

export function getFeaturedVideos(): VideoLookItem[] {
  return getActiveVideosList();
}

