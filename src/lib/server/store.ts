import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  ProductItem,
  CategoryItem,
  CollectionItem,
  VideoLookItem,
  PRODUCTS,
  CATEGORIES,
  COLLECTIONS,
  FEATURED_VIDEOS,
} from "../catalog";
import { hashPassword, verifyPassword } from "./auth";
import { logAdminAudit } from "./logger";

export interface HomepageContent {
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    primaryCtaText: string;
    primaryCtaLink: string;
    secondaryCtaText: string;
    secondaryCtaLink: string;
    imageUrl: string;
  };
  announcement: {
    text: string;
    isActive: boolean;
  };
  spotlight: {
    tag: string;
    title: string;
    description: string;
    ctaText: string;
    ctaLink: string;
  };
  brandValues: Array<{
    title: string;
    description: string;
  }>;
}

export interface CampaignItem {
  id: string;
  code: string;
  name: string;
  discountPercentage?: number;
  minBasketAmount?: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  description?: string;
}

export interface StoreSettings {
  storeName: string;
  currency: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  freeShippingThreshold: number;
  defaultSeoTitle: string;
  defaultSeoDescription: string;
  defaultSocialShareImage?: string;
  instagramUrl: string;
  tiktokUrl: string;
  // Faz 7: Kurumsal / Yasal Sözleşme Alanları
  companyTitle?: string;
  taxOffice?: string;
  taxNumber?: string;
  mersisNumber?: string;
  kepAddress?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: "ADMIN" | "STAFF";
  isActive: boolean;
  createdAt: string;
}

export type OperationalOrderStatus = "CONFIRMED" | "CANCELLED" | "PENDING";
export type OrderPaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "UNPAID"
  | "INITIALIZED";

export type ShippingStatus =
  | "AWAITING_SHIPMENT"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "SHIPMENT_ISSUE"
  | "RETURNED";

export type CarrierCode =
  | "yurtici"
  | "aras"
  | "mng"
  | "ptt"
  | "surat"
  | "hepsijet"
  | "custom";

export type ShipmentMethod = "MANUAL" | "API_INTEGRATED";

export interface TrackingEvent {
  id: string;
  timestamp: string; // ISO 8601
  status: ShippingStatus;
  description: string;
  location?: string;
  carrierReference?: string;
  createdAt: string;
}

export interface ShipmentRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  carrier: CarrierCode;
  carrierName: string;
  trackingNumber: string;
  trackingUrl?: string;
  labelUrl?: string;
  status: ShippingStatus;
  method: ShipmentMethod;
  providerReference?: string;
  shippedAt?: string;
  deliveredAt?: string;
  notes?: string;
  events: TrackingEvent[];
  createdAt: string;
  updatedAt: string;
}

export type ReturnStatus =
  | "REQUESTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "AWAITING_PACKAGE"
  | "PACKAGE_RECEIVED"
  | "REFUND_PENDING"
  | "REFUND_COMPLETED";

export type ReturnRestockDecision =
  | "PENDING"
  | "RESTOCKED"
  | "DAMAGED_NOT_RESTOCKED"
  | "REJECTED";

export interface ReturnItem {
  id: string;
  orderItemId: string;
  productId: string;
  productName: string;
  variantSku: string;
  colorName?: string;
  sizeName?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  reason: string;
  condition?: string;
}

export type ReturnRequestType = "RETURN" | "CANCEL" | "EXCHANGE";

export interface ExchangeDetails {
  requestedSize?: string;
  requestedColor?: string;
  notes?: string;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerPhone: string;
  requestType?: ReturnRequestType;
  exchangeDetails?: ExchangeDetails;
  items: ReturnItem[];
  requestedAmount: number;
  refundedAmount: number;
  status: ReturnStatus;
  reason: string;
  customerNotes?: string;
  adminNotes?: string;
  restockDecision: ReturnRestockDecision;
  isRestocked: boolean;
  actualRefundVerified: boolean;
  refundTransactionRef?: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
}

export type NotificationChannel = "EMAIL" | "SMS";
export type NotificationEventType =
  | "ORDER_CREATED"
  | "PAYMENT_CONFIRMED"
  | "ORDER_CANCELLED"
  | "SHIPMENT_CREATED"
  | "SHIPMENT_IN_TRANSIT"
  | "SHIPMENT_DELIVERED"
  | "RETURN_REQUESTED"
  | "RETURN_DECISION"
  | "REFUND_CONFIRMED";

export interface CustomerNotification {
  id: string;
  orderId: string;
  orderNumber: string;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  recipient: string;
  subject: string;
  contentHtml: string;
  contentText: string;
  status: "PENDING" | "SENT" | "FAILED";
  idempotencyKey: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
}

export interface OrderItemSnapshot {
  id: string;
  productId: string;
  productName: string;
  variantId?: string;
  colorName: string;
  sizeName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  costPriceSnapshot?: number; // Birim maliyet snapshot'ı (₺)
}

export interface StoreOrder {
  id: string;
  orderNumber: string; // "HM-20261021-0001"
  userId?: string;
  customerFullName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: {
    city: string;
    district: string;
    fullAddress: string;
    postalCode?: string;
  };
  operationalStatus: OperationalOrderStatus; // "CONFIRMED" | "CANCELLED" | "PENDING"
  paymentStatus: OrderPaymentStatus;
  paymentProvider?: string; // "PAYTR"
  paidAt?: string;
  paymentFailedReason?: string;
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  totalAmount: number;
  totalKurus: number;
  items: OrderItemSnapshot[];
  customerNotes?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
  stockDeducted: boolean;
  // Faz 6: Kargo, İade ve Bildirim Alanları
  shippingStatus?: ShippingStatus;
  carrier?: CarrierCode;
  carrierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  labelUrl?: string;
  shippedAt?: string;
  deliveredAt?: string;
  shipmentId?: string;
  shipmentMethod?: ShipmentMethod;
  trackingEvents?: TrackingEvent[];
  refundedAmount?: number;
}

export interface AppStoreData {
  products: ProductItem[];
  categories: CategoryItem[];
  collections: CollectionItem[];
  featuredVideos: VideoLookItem[];
  homepageContent: HomepageContent;
  settings: StoreSettings;
  campaigns: CampaignItem[];
  adminUsers: AdminUser[];
  orders: StoreOrder[];
  shipments?: ShipmentRecord[];
  returnRequests?: ReturnRequest[];
  notifications?: CustomerNotification[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  hero: {
    badge: "2026 İlkbahar / Yaz Koleksiyonu",
    title: "Zamansız Kalıplar,\nKusursuz Siluetler.",
    subtitle:
      "Özenle seçilmiş pamuk gabardinler, dökümlü scuba dokular ve modern terzilik detaylarıyla hazırlanan yeni sezon parçalarını keşfedin.",
    primaryCtaText: "Koleksiyonu Keşfet",
    primaryCtaLink: "/urunler",
    secondaryCtaText: "Trençkot Serisi",
    secondaryCtaLink: "/kategori/dis-giyim",
    imageUrl: "/uploads/hero-editorial.jpg",
  },
  announcement: {
    text: "Tüm Türkiye'ye 3.500 ₺ Üzeri Ücretsiz Kargo & Hızlı Teslimat",
    isActive: true,
  },
  spotlight: {
    tag: "Hümra Moda Terzilik Sanatı",
    title: "Modern Siluetler, Tavizsiz Kumaş Kalitesi",
    description:
      "Şehir hayatının dinamizmine eşlik eden dökümlü formlar, nefes alan doğal iplikler ve özenle seçilmiş renk paletiyle gardırobunuzu yeniden tanımlayın.",
    ctaText: "Çok Satanları Keşfet",
    ctaLink: "/koleksiyon/cok-satanlar",
  },
  brandValues: [
    {
      title: "Özenli Terzilik & Kumaş",
      description: "Kusursuz dikiş detayları, birinci sınıf pamuk gabardin ve akıcı scuba kumaşlar.",
    },
    {
      title: "3.500 ₺ Üzeri Ücretsiz Kargo",
      description: "Tüm Türkiye'ye hızlı ve sigortalı teslimat ile siparişiniz güvenle kapınızda.",
    },
    {
      title: "14 Gün Kolay Değişim",
      description: "Koşulsuz müşteri memnuniyeti ilkesiyle 14 gün içinde hızlı değişim ve iade imkanı.",
    },
    {
      title: "256-Bit SSL Güvenli Ödeme",
      description: "Tüm banka ve kredi kartlarıyla %100 güvenli, 3D Secure onaylı alışveriş konforu.",
    },
  ],
};

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: "Hümra Moda",
  currency: "TRY",
  phone: "+90 850 000 00 00",
  whatsapp: "+90 555 000 00 00",
  email: "destek@humramoda.com",
  address: "Nişantaşı, İstanbul, Türkiye",
  freeShippingThreshold: 3500,
  defaultSeoTitle: "Hümra Moda — Zamansız Kadın Giyim & Modern Koleksiyonlar",
  defaultSeoDescription:
    "Hümra Moda: Seçkin kadın giyim, ikili takımlar ve zamansız koleksiyonlar. Premium kumaş kalitesi ve modern kalıplarla güvenli alışveriş.",
  defaultSocialShareImage: "/uploads/products/IMG_2237-card.webp",
  instagramUrl: "https://instagram.com/humramoda",
  tiktokUrl: "https://tiktok.com/@humramoda",
  companyTitle: "Hümra Moda Tekstil San. ve Tic. Ltd. Şti. [Hukuki Unvan Tescil Aşamasında]",
  taxOffice: "Beşiktaş Vergi Dairesi [Doğrulama Bekliyor]",
  taxNumber: "[Vergi No: Panelden Tanımlanacak]",
  mersisNumber: "[Mersis No: Panelden Tanımlanacak]",
  kepAddress: "[KEP Adresi: Opsiyonel]",
};

const DEFAULT_CAMPAIGNS: CampaignItem[] = [
  {
    id: "camp-1",
    code: "YENISEZON10",
    name: "Yeni Sezona Özel %10 İndirim",
    discountPercentage: 10,
    minBasketAmount: 2000,
    startDate: "2026-03-01",
    endDate: "2026-06-30",
    isActive: true,
    description: "2.000 ₺ ve üzeri alışverişlerde sepette anında %10 indirim.",
  },
];

const DEFAULT_ORDERS: StoreOrder[] = [
  {
    id: "ord-101",
    orderNumber: "HM-20261021-0001",
    customerFullName: "Zeynep Kaya",
    customerEmail: "zeynep.kaya@example.com",
    customerPhone: "+90 532 111 22 33",
    shippingAddress: {
      city: "İstanbul",
      district: "Kadıköy",
      fullAddress: "Moda Cad. No: 42 D: 5",
      postalCode: "34710",
    },
    operationalStatus: "CONFIRMED",
    paymentStatus: "PAID",
    subtotal: 1749,
    discountAmount: 174.9,
    shippingAmount: 0,
    totalAmount: 1574.1,
    totalKurus: 157410,
    items: [
      {
        id: "ord-item-1",
        productId: "prod-1",
        productName: "Qapitone Garnili Scuba İkili Takım",
        variantId: "var-prod-1-0",
        colorName: "Siyah",
        sizeName: "1 Beden (36-38)",
        sku: "HM-SCB-SYH-B1",
        unitPrice: 1574.1,
        quantity: 1,
        totalPrice: 1574.1,
        costPriceSnapshot: 650,
      },
    ],
    customerNotes: "Lütfen kapıda arayınız.",
    createdAt: "2026-10-21T10:15:00Z",
    updatedAt: "2026-10-21T10:20:00Z",
    confirmedAt: "2026-10-21T10:20:00Z",
    stockDeducted: true,
  },
  {
    id: "ord-102",
    orderNumber: "HM-20261021-0002",
    customerFullName: "Elif Demir",
    customerEmail: "elif.demir@example.com",
    customerPhone: "+90 544 222 33 44",
    shippingAddress: {
      city: "Ankara",
      district: "Çankaya",
      fullAddress: "Tunalı Hilmi Cad. No: 18",
      postalCode: "06680",
    },
    operationalStatus: "PENDING",
    paymentStatus: "UNPAID",
    subtotal: 2190,
    discountAmount: 0,
    shippingAmount: 0,
    totalAmount: 2190,
    totalKurus: 219000,
    items: [
      {
        id: "ord-item-2",
        productId: "prod-2",
        productName: "Kruvaze Kruşe Detaylı Yün Karışımlı Trençkot",
        variantId: "var-prod-2-0",
        colorName: "Camel",
        sizeName: "38-40",
        sku: "HM-TRN-CML-38",
        unitPrice: 2190,
        quantity: 1,
        totalPrice: 2190,
        costPriceSnapshot: 890,
      },
    ],
    createdAt: "2026-10-21T14:30:00Z",
    updatedAt: "2026-10-21T14:30:00Z",
    stockDeducted: false,
  },
];

/**
 * İlk veri deposunu başlatır veya mevcut olanı okur.
 */
export function getStoreData(): AppStoreData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_FILE)) {
    // İlk admin hesabını oluştur
    const initialEmail = process.env.ADMIN_INITIAL_EMAIL || "admin@humramoda.local";
    let initialPassword = process.env.ADMIN_INITIAL_PASSWORD;

    const adminUsers: AdminUser[] = [];

    // Üretimde sabit şifreyle admin oluşturulması engellenir
    if (process.env.NODE_ENV === "production") {
      if (initialPassword && initialPassword.length >= 10) {
        adminUsers.push({
          id: "admin-1",
          email: initialEmail.toLowerCase().trim(),
          fullName: "Hümra Moda Yöneticisi",
          passwordHash: hashPassword(initialPassword),
          role: "ADMIN",
          isActive: true,
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      // Yerel geliştirmede rastgele veya sağlanan şifre kullanılır
      initialPassword = initialPassword || crypto.randomBytes(16).toString("hex") + "!Aa1";
      adminUsers.push({
        id: "admin-1",
        email: initialEmail.toLowerCase().trim(),
        fullName: "Hümra Moda Yöneticisi",
        passwordHash: hashPassword(initialPassword),
        role: "ADMIN",
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    }

    const initialData: AppStoreData = {
      products: PRODUCTS,
      categories: CATEGORIES,
      collections: COLLECTIONS,
      featuredVideos: FEATURED_VIDEOS,
      homepageContent: DEFAULT_HOMEPAGE_CONTENT,
      settings: DEFAULT_SETTINGS,
      campaigns: DEFAULT_CAMPAIGNS,
      adminUsers,
      orders: DEFAULT_ORDERS,
      shipments: [],
      returnRequests: [],
      notifications: [],
    };

    fs.writeFileSync(STORE_FILE, JSON.stringify(initialData, null, 2), "utf-8");
    return initialData;
  }

  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppStoreData>;
    return {
      products: parsed.products || PRODUCTS,
      categories: parsed.categories || CATEGORIES,
      collections: parsed.collections || COLLECTIONS,
      featuredVideos: parsed.featuredVideos || FEATURED_VIDEOS,
      homepageContent: { ...DEFAULT_HOMEPAGE_CONTENT, ...(parsed.homepageContent || {}) },
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      campaigns: parsed.campaigns || DEFAULT_CAMPAIGNS,
      adminUsers: parsed.adminUsers || [],
      orders: parsed.orders || DEFAULT_ORDERS,
      shipments: parsed.shipments || [],
      returnRequests: parsed.returnRequests || [],
      notifications: parsed.notifications || [],
    };
  } catch (err) {
    console.error("Store data read error:", err);
    return {
      products: PRODUCTS,
      categories: CATEGORIES,
      collections: COLLECTIONS,
      featuredVideos: FEATURED_VIDEOS,
      homepageContent: DEFAULT_HOMEPAGE_CONTENT,
      settings: DEFAULT_SETTINGS,
      campaigns: DEFAULT_CAMPAIGNS,
      adminUsers: [],
      orders: DEFAULT_ORDERS,
      shipments: [],
      returnRequests: [],
      notifications: [],
    };
  }
}

/**
 * Veri deposunu diske atomik olarak kaydeder.
 */
export function saveStoreData(data: AppStoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tempFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs.renameSync(tempFile, STORE_FILE);
  } catch {
    // Windows file locking fallback
    try {
      fs.copyFileSync(tempFile, STORE_FILE);
      fs.unlinkSync(tempFile);
    } catch {
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
    }
  }
}

// -------------------------------------------------------------
// ÜRÜN YÖNETİMİ İŞLEMLERİ (PRODUCTS CRUD)
// -------------------------------------------------------------

export function getAllStoreProducts(): ProductItem[] {
  return getStoreData().products;
}

export function getStoreProductById(id: string): ProductItem | undefined {
  return getStoreData().products.find((p) => p.id === id);
}

export function getStoreProductBySlug(slug: string): ProductItem | undefined {
  return getStoreData().products.find((p) => p.slug === slug);
}

export interface CreateProductInput {
  title: string;
  slug?: string;
  description: string;
  fabricDetails?: string;
  modelDimensions?: string;
  basePrice: number;
  discountPrice?: number;
  costPrice?: number;
  badge?: string;
  isDraft?: boolean;
  categorySlug: string;
  collectionSlugs?: string[];
  colors: Array<{
    name: string;
    slug?: string;
    colorCode?: string;
    hex?: string;
  }>;
  sizes: Array<
    | string
    | {
        name: string;
        slug?: string;
      }
  >;
  variants: Array<{
    colorId?: string;
    colorName?: string;
    sizeId?: string;
    sizeName?: string;
    sku: string;
    stockQuantity?: number;
    stock?: number;
    costPrice?: number;
  }>;
  media?: Array<{
    colorName?: string;
    url: string;
    thumbnailUrl?: string;
    type?: "IMAGE" | "VIDEO";
    altText?: string;
    isThumbnail?: boolean;
  }>;
}

function generateSlug(text: string): string {
  const trMap: Record<string, string> = {
    ç: "c",
    Ç: "c",
    ğ: "g",
    Ğ: "g",
    ı: "i",
    İ: "i",
    ö: "o",
    Ö: "o",
    ş: "s",
    Ş: "s",
    ü: "u",
    Ü: "u",
  };
  return text
    .split("")
    .map((char) => trMap[char] || char)
    .join("")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function createStoreProduct(input: CreateProductInput): { product?: ProductItem; error?: string } {
  const store = getStoreData();

  if (!input.title || input.title.trim().length === 0) {
    return { error: "Ürün başlığı zorunludur." };
  }

  const basePrice = Number(input.basePrice);
  if (isNaN(basePrice) || basePrice <= 0) {
    return { error: "Geçerli bir normal satış fiyatı giriniz." };
  }

  let discountPrice: number | undefined = undefined;
  if (input.discountPrice !== undefined && input.discountPrice !== null) {
    discountPrice = Number(input.discountPrice);
    if (isNaN(discountPrice) || discountPrice <= 0) {
      discountPrice = undefined;
    } else if (discountPrice >= basePrice) {
      return { error: "İndirimli fiyat normal fiyattan düşük olmalıdır." };
    }
  }

  const slug = input.slug?.trim() ? generateSlug(input.slug) : generateSlug(input.title);
  if (store.products.some((p) => p.slug === slug)) {
    return { error: `"${slug}" bağlantı adresi (slug) zaten başka bir üründe kullanılıyor.` };
  }

  const category = store.categories.find((c) => c.slug === input.categorySlug);
  if (!category) {
    return { error: "Geçersiz kategori seçimi." };
  }

  // Renkleri oluştur
  const colors = (input.colors || []).map((c, idx) => ({
    id: `col-${Date.now()}-${idx}`,
    name: c.name.trim(),
    slug: c.slug?.trim() ? generateSlug(c.slug) : generateSlug(c.name),
    colorCode: c.colorCode || "#111111",
    displayOrder: idx + 1,
  }));

  // Bedenleri oluştur
  const sizes = (input.sizes || []).map((s: string | { name: string; slug?: string }, idx) => {
    const rawName = typeof s === "string" ? s : s.name;
    const name = (rawName || "").trim();
    const rawSlug = typeof s === "object" && s.slug ? s.slug : name;
    return {
      id: `size-${Date.now()}-${idx}`,
      name,
      slug: generateSlug(rawSlug),
      displayOrder: idx + 1,
    };
  });

  // Varyantları oluştur ve SKU denetimi yap
  const existingSkus = new Set(
    store.products.flatMap((p) => p.variants.map((v) => v.sku.toUpperCase()))
  );

  const variants = [];
  for (const v of input.variants || []) {
    const sku = v.sku.trim().toUpperCase();
    if (!sku) {
      return { error: "Tüm varyantlar için geçerli bir SKU girilmelidir." };
    }
    if (existingSkus.has(sku)) {
      return { error: `"${sku}" stok kodu (SKU) sistemde zaten mevcut.` };
    }
    existingSkus.add(sku);

    const stock = Number(v.stockQuantity);
    if (isNaN(stock) || stock < 0) {
      return { error: `SKU: ${sku} için stok miktarı 0 veya daha büyük olmalıdır.` };
    }

    const matchedColor = colors.find(
      (c) =>
        (v.colorId && c.id === v.colorId) ||
        (v.colorName && c.name.toLowerCase() === v.colorName.toLowerCase()) ||
        (v.colorId && (c.slug === v.colorId || c.name.toLowerCase() === v.colorId.replace("col-", "").toLowerCase()))
    );
    const matchedSize = sizes.find(
      (s) =>
        (v.sizeId && (s.id === v.sizeId || s.name === v.sizeId || s.slug === v.sizeId)) ||
        (v.sizeName && s.name.toLowerCase() === v.sizeName.toLowerCase()) ||
        (v.sizeId && s.name.toLowerCase() === v.sizeId.replace("size-", "").toLowerCase())
    );

    if (!matchedColor || !matchedSize) {
      continue;
    }

    const costPrice =
      v.costPrice !== undefined && v.costPrice !== null && !isNaN(Number(v.costPrice))
        ? Number(v.costPrice)
        : undefined;

    variants.push({
      id: `var-${Date.now()}-${variants.length}`,
      colorId: matchedColor.id,
      sizeId: matchedSize.id,
      sku,
      stockQuantity: stock,
      costPrice,
      isActive: true,
    });
  }

  // Medyaları oluştur
  const media = (input.media || []).map((m, idx) => {
    let colorId: string | undefined = undefined;
    if (m.colorName) {
      const match = colors.find((c) => c.name.toLowerCase() === m.colorName?.toLowerCase());
      if (match) colorId = match.id;
    }

    return {
      id: `med-${Date.now()}-${idx}`,
      colorId,
      type: m.type || ("IMAGE" as const),
      url: m.url,
      thumbnailUrl: m.thumbnailUrl || m.url,
      altText: m.altText || `${input.title} görseli`,
      isThumbnail: m.isThumbnail || idx === 0,
      displayOrder: idx + 1,
    };
  });

  const newProduct: ProductItem = {
    id: `prod-${Date.now()}`,
    title: input.title.trim(),
    slug,
    description: input.description?.trim() || "",
    fabricDetails: input.fabricDetails?.trim() || "",
    modelDimensions: input.modelDimensions?.trim() || "",
    basePrice,
    discountPrice,
    costPrice: input.costPrice ? Number(input.costPrice) : undefined,
    badge: input.badge || undefined,
    categorySlug: category.slug,
    categoryName: category.name,
    collectionSlugs: input.collectionSlugs || ["yeni-sezon"],
    colors,
    sizes,
    variants,
    media,
    createdAt: new Date().toISOString(),
  };

  store.products.unshift(newProduct);
  saveStoreData(store);

  return { product: newProduct };
}

export function updateStoreProduct(
  id: string,
  input: Partial<CreateProductInput> & { isDraft?: boolean }
): { product?: ProductItem; error?: string } {
  const store = getStoreData();
  const index = store.products.findIndex((p) => p.id === id);
  if (index === -1) {
    return { error: "Güncellenecek ürün bulunamadı." };
  }

  const current = store.products[index];

  if (input.title !== undefined) {
    if (input.title.trim().length === 0) return { error: "Ürün başlığı boş bırakılamaz." };
    current.title = input.title.trim();
  }

  if (input.slug !== undefined) {
    const newSlug = generateSlug(input.slug);
    if (store.products.some((p) => p.id !== id && p.slug === newSlug)) {
      return { error: `"${newSlug}" slug adresi başka bir üründe kullanılıyor.` };
    }
    current.slug = newSlug;
  }

  if (input.basePrice !== undefined) {
    const base = Number(input.basePrice);
    if (isNaN(base) || base <= 0) return { error: "Geçerli bir normal fiyat giriniz." };
    current.basePrice = base;
  }

  if (input.discountPrice !== undefined) {
    if (input.discountPrice === null || input.discountPrice <= 0) {
      current.discountPrice = undefined;
    } else {
      const disc = Number(input.discountPrice);
      if (disc >= current.basePrice) {
        return { error: "İndirimli fiyat normal fiyattan küçük olmalıdır." };
      }
      current.discountPrice = disc;
    }
  }

  if (input.description !== undefined) current.description = input.description;
  if (input.fabricDetails !== undefined) current.fabricDetails = input.fabricDetails;
  if (input.modelDimensions !== undefined) current.modelDimensions = input.modelDimensions;
  if (input.badge !== undefined) current.badge = input.badge || undefined;

  if (input.categorySlug !== undefined) {
    const cat = store.categories.find((c) => c.slug === input.categorySlug);
    if (cat) {
      current.categorySlug = cat.slug;
      current.categoryName = cat.name;
    }
  }

  if (input.collectionSlugs !== undefined) {
    current.collectionSlugs = input.collectionSlugs;
  }

  // Renkler, bedenler veya varyantlar güncellenmişse uygula
  if (input.colors) {
    current.colors = input.colors.map((c, idx) => ({
      id: `col-${id}-${idx}`,
      name: c.name.trim(),
      slug: c.slug ? generateSlug(c.slug) : generateSlug(c.name),
      colorCode: c.colorCode || c.hex || "#000000",
      displayOrder: idx + 1,
    }));
  }

  if (input.sizes) {
    current.sizes = input.sizes.map((s, idx) => {
      const name = (typeof s === "string" ? s : s.name || "").trim();
      const slug = typeof s === "object" && s.slug ? generateSlug(s.slug) : generateSlug(name);
      return {
        id: `size-${id}-${idx}`,
        name,
        slug,
        displayOrder: idx + 1,
      };
    });
  }

  if (input.variants) {
    const otherSkus = new Set(
      store.products
        .filter((p) => p.id !== id)
        .flatMap((p) => p.variants.map((v) => v.sku.toUpperCase()))
    );

    const updatedVariants = [];
    for (const v of input.variants) {
      const sku = v.sku.trim().toUpperCase();
      if (otherSkus.has(sku)) {
        return { error: `"${sku}" stok kodu başka bir üründe kullanılıyor.` };
      }
      otherSkus.add(sku);

      const matchedColor = current.colors.find(
        (c) =>
          (v.colorId && c.id === v.colorId) ||
          (v.colorName && c.name.toLowerCase() === v.colorName.toLowerCase()) ||
          (v.colorId && (c.slug === v.colorId || c.name.toLowerCase() === v.colorId.replace("col-", "").toLowerCase()))
      );
      const matchedSize = current.sizes.find(
        (s) =>
          (v.sizeId && (s.id === v.sizeId || s.name === v.sizeId || s.slug === v.sizeId)) ||
          (v.sizeName && s.name.toLowerCase() === v.sizeName.toLowerCase()) ||
          (v.sizeId && s.name.toLowerCase() === v.sizeId.replace("size-", "").toLowerCase())
      );

      if (!matchedColor || !matchedSize) continue;

      const costPrice =
        v.costPrice !== undefined && v.costPrice !== null && !isNaN(Number(v.costPrice))
          ? Number(v.costPrice)
          : undefined;

      updatedVariants.push({
        id: `var-${id}-${updatedVariants.length}`,
        colorId: matchedColor.id,
        sizeId: matchedSize.id,
        sku,
        stockQuantity: Math.max(0, Number(v.stockQuantity) || 0),
        costPrice,
        isActive: true,
      });
    }
    current.variants = updatedVariants;
  }

  if (input.costPrice !== undefined) {
    current.costPrice = input.costPrice ? Number(input.costPrice) : undefined;
  }

  if (input.media) {
    current.media = input.media.map((m, idx) => {
      let colorId: string | undefined = undefined;
      if (m.colorName) {
        const match = current.colors.find(
          (c) => c.name.toLowerCase() === m.colorName?.toLowerCase()
        );
        if (match) colorId = match.id;
      }
      return {
        id: `med-${id}-${idx}`,
        colorId,
        type: m.type || "IMAGE",
        url: m.url,
        thumbnailUrl: m.thumbnailUrl || m.url,
        altText: m.altText || `${current.title} görseli`,
        isThumbnail: m.isThumbnail || idx === 0,
        displayOrder: idx + 1,
      };
    });
  }

  store.products[index] = current;
  saveStoreData(store);

  return { product: current };
}

export function deleteStoreProduct(id: string): boolean {
  const store = getStoreData();
  const initialLen = store.products.length;
  store.products = store.products.filter((p) => p.id !== id);
  if (store.products.length !== initialLen) {
    saveStoreData(store);
    return true;
  }
  return false;
}

// -------------------------------------------------------------
// KATEGORİ & KOLEKSİYON İŞLEMLERİ
// -------------------------------------------------------------

export function getAllStoreCategories(): CategoryItem[] {
  return getStoreData().categories.sort((a, b) => a.displayOrder - b.displayOrder);
}

export function createStoreCategory(input: {
  name: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
}): { category?: CategoryItem; error?: string } {
  const store = getStoreData();
  if (!input.name || input.name.trim().length === 0) return { error: "Kategori adı zorunludur." };

  const slug = input.slug?.trim() ? generateSlug(input.slug) : generateSlug(input.name);
  if (store.categories.some((c) => c.slug === slug)) {
    return { error: `"${slug}" kategori bağlantısı zaten mevcut.` };
  }

  const newCat: CategoryItem = {
    id: `cat-${Date.now()}`,
    name: input.name.trim(),
    slug,
    description: input.description?.trim() || "",
    imageUrl: input.imageUrl,
    displayOrder: store.categories.length + 1,
  };

  store.categories.push(newCat);
  saveStoreData(store);
  return { category: newCat };
}

export function updateStoreCategory(
  id: string,
  input: Partial<{ name: string; slug: string; description: string; imageUrl: string; displayOrder: number }>
): { category?: CategoryItem; error?: string } {
  const store = getStoreData();
  const cat = store.categories.find((c) => c.id === id);
  if (!cat) return { error: "Kategori bulunamadı." };

  if (input.name !== undefined) cat.name = input.name.trim();
  if (input.slug !== undefined) {
    const slug = generateSlug(input.slug);
    if (store.categories.some((c) => c.id !== id && c.slug === slug)) {
      return { error: `"${slug}" kategori bağlantısı başka bir kategoride kullanılıyor.` };
    }
    cat.slug = slug;
  }
  if (input.description !== undefined) cat.description = input.description;
  if (input.imageUrl !== undefined) cat.imageUrl = input.imageUrl;
  if (input.displayOrder !== undefined) cat.displayOrder = Number(input.displayOrder);

  saveStoreData(store);
  return { category: cat };
}

export function deleteStoreCategory(id: string): boolean {
  const store = getStoreData();
  const init = store.categories.length;
  store.categories = store.categories.filter((c) => c.id !== id);
  if (store.categories.length !== init) {
    saveStoreData(store);
    return true;
  }
  return false;
}

export function getAllStoreCollections(): CollectionItem[] {
  return getStoreData().collections.sort((a, b) => a.displayOrder - b.displayOrder);
}

export function createStoreCollection(input: {
  name: string;
  slug?: string;
  description?: string;
}): { collection?: CollectionItem; error?: string } {
  const store = getStoreData();
  if (!input.name || input.name.trim().length === 0) return { error: "Koleksiyon adı zorunludur." };

  const slug = input.slug?.trim() ? generateSlug(input.slug) : generateSlug(input.name);
  if (store.collections.some((c) => c.slug === slug)) {
    return { error: `"${slug}" koleksiyon bağlantısı zaten mevcut.` };
  }

  const newCol: CollectionItem = {
    id: `col-${Date.now()}`,
    name: input.name.trim(),
    slug,
    description: input.description?.trim() || "",
    displayOrder: store.collections.length + 1,
  };

  store.collections.push(newCol);
  saveStoreData(store);
  return { collection: newCol };
}

export function updateStoreCollection(
  id: string,
  input: Partial<{ name: string; slug: string; description: string; displayOrder: number }>
): { collection?: CollectionItem; error?: string } {
  const store = getStoreData();
  const col = store.collections.find((c) => c.id === id);
  if (!col) return { error: "Koleksiyon bulunamadı." };

  if (input.name !== undefined) col.name = input.name.trim();
  if (input.slug !== undefined) {
    const slug = generateSlug(input.slug);
    if (store.collections.some((c) => c.id !== id && c.slug === slug)) {
      return { error: `"${slug}" koleksiyon bağlantısı başka bir koleksiyonda kullanılıyor.` };
    }
    col.slug = slug;
  }
  if (input.description !== undefined) col.description = input.description;
  if (input.displayOrder !== undefined) col.displayOrder = Number(input.displayOrder);

  saveStoreData(store);
  return { collection: col };
}

export function deleteStoreCollection(id: string): boolean {
  const store = getStoreData();
  const initialLen = store.collections.length;
  store.collections = store.collections.filter((c) => c.id !== id);
  if (store.collections.length !== initialLen) {
    saveStoreData(store);
    return true;
  }
  return false;
}

// -------------------------------------------------------------
// VİTRİN & MAĞAZA AYARLARI İŞLEMLERİ
// -------------------------------------------------------------

export function getStoreHomepageContent(): HomepageContent {
  return getStoreData().homepageContent;
}

export function updateStoreHomepageContent(content: Partial<HomepageContent>): HomepageContent {
  const store = getStoreData();
  store.homepageContent = {
    ...store.homepageContent,
    ...content,
  };
  saveStoreData(store);
  return store.homepageContent;
}

export function getStoreSettings(): StoreSettings {
  return getStoreData().settings;
}

export function updateStoreSettings(settings: Partial<StoreSettings>): StoreSettings {
  const store = getStoreData();
  store.settings = {
    ...store.settings,
    ...settings,
  };
  saveStoreData(store);
  return store.settings;
}

// -------------------------------------------------------------
// KAMPANYA İŞLEMLERİ (CAMPAIGNS CRUD)
// -------------------------------------------------------------

export function getAllStoreCampaigns(): CampaignItem[] {
  return getStoreData().campaigns || [];
}

export function createStoreCampaign(input: {
  code: string;
  name: string;
  discountPercentage?: number;
  minBasketAmount?: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  description?: string;
}): { campaign?: CampaignItem; error?: string } {
  const store = getStoreData();
  const code = input.code.trim().toUpperCase();
  if (!code) return { error: "Kampanya kodu zorunludur." };
  if (!input.name || !input.name.trim()) return { error: "Kampanya adı zorunludur." };

  if (store.campaigns.some((c) => c.code === code)) {
    return { error: `"${code}" kampanya kodu zaten mevcut.` };
  }

  const newCamp: CampaignItem = {
    id: `camp-${Date.now()}`,
    code,
    name: input.name.trim(),
    discountPercentage: input.discountPercentage ? Number(input.discountPercentage) : undefined,
    minBasketAmount: input.minBasketAmount ? Number(input.minBasketAmount) : undefined,
    startDate: input.startDate,
    endDate: input.endDate,
    isActive: input.isActive ?? true,
    description: input.description?.trim(),
  };

  store.campaigns.push(newCamp);
  saveStoreData(store);
  return { campaign: newCamp };
}

export function updateStoreCampaign(
  id: string,
  input: Partial<Omit<CampaignItem, "id">>
): { campaign?: CampaignItem; error?: string } {
  const store = getStoreData();
  const camp = store.campaigns.find((c) => c.id === id);
  if (!camp) return { error: "Kampanya bulunamadı." };

  if (input.code !== undefined) {
    const code = input.code.trim().toUpperCase();
    if (store.campaigns.some((c) => c.id !== id && c.code === code)) {
      return { error: `"${code}" kampanya kodu başka bir kampanyada kullanılıyor.` };
    }
    camp.code = code;
  }
  if (input.name !== undefined) camp.name = input.name.trim();
  if (input.discountPercentage !== undefined) camp.discountPercentage = Number(input.discountPercentage);
  if (input.minBasketAmount !== undefined) camp.minBasketAmount = Number(input.minBasketAmount);
  if (input.startDate !== undefined) camp.startDate = input.startDate;
  if (input.endDate !== undefined) camp.endDate = input.endDate;
  if (input.isActive !== undefined) camp.isActive = Boolean(input.isActive);
  if (input.description !== undefined) camp.description = input.description;

  saveStoreData(store);
  return { campaign: camp };
}

export function deleteStoreCampaign(id: string): boolean {
  const store = getStoreData();
  const initialLen = store.campaigns.length;
  store.campaigns = store.campaigns.filter((c) => c.id !== id);
  if (store.campaigns.length !== initialLen) {
    saveStoreData(store);
    return true;
  }
  return false;
}

// -------------------------------------------------------------
// YÖNETİCİ KULLANICI İŞLEMLERİ
// -------------------------------------------------------------

export function authenticateAdmin(
  email: string,
  pass: string
): { user?: Omit<AdminUser, "passwordHash">; error?: string } {
  const store = getStoreData();
  const cleanEmail = email.toLowerCase().trim();
  const admin = store.adminUsers.find((u) => u.email === cleanEmail && u.isActive);

  if (!admin) {
    return { error: "Geçersiz e-posta adresi veya şifre." };
  }

  const isMatch = verifyPassword(pass, admin.passwordHash);
  if (!isMatch) {
    return { error: "Geçersiz e-posta adresi veya şifre." };
  }

  const safeUser: Omit<AdminUser, "passwordHash"> = {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    isActive: admin.isActive,
    createdAt: admin.createdAt,
  };
  return { user: safeUser };
}

// -------------------------------------------------------------
// SİPARİŞ VE FİNANSAL YÖNETİM (FAZ 4.6)
// -------------------------------------------------------------

export function getAllOrders(): StoreOrder[] {
  const store = getStoreData();
  return store.orders || [];
}

export function getOrderById(id: string): StoreOrder | undefined {
  const store = getStoreData();
  return store.orders?.find((o) => o.id === id || o.orderNumber === id);
}

/**
 * Sipariş operasyonel durumunu günceller ("CONFIRMED" veya "CANCELLED").
 * İdempotent: Aynı durum tekrar çağrıldığında mükerrer stok veya finansal kayıt üretmez.
 */
export function updateOrderOperationalStatus(
  id: string,
  newStatus: "CONFIRMED" | "CANCELLED",
  adminInfo?: { adminId?: string; adminEmail?: string; ip?: string }
): { success: boolean; order?: StoreOrder; error?: string; idempotent?: boolean } {
  const store = getStoreData();
  const order = store.orders?.find((o) => o.id === id || o.orderNumber === id);

  if (!order) {
    return { success: false, error: "Sipariş bulunamadı." };
  }

  // İdempotentlik kontrolü: Zaten bu durumdaysa işlem tekrarlanmaz
  if (order.operationalStatus === newStatus) {
    return { success: true, order, idempotent: true };
  }

  const previousStatus = order.operationalStatus;

  if (newStatus === "CONFIRMED") {
    // Stok düşme kuralı: Eğer daha önce stok düşülmemişse atomik düş
    if (!order.stockDeducted) {
      for (const item of order.items) {
        for (const p of store.products) {
          const v = p.variants.find(
            (variant) =>
              variant.id === item.variantId ||
              variant.sku.toUpperCase() === item.sku.toUpperCase()
          );
          if (v) {
            v.stockQuantity = Math.max(0, v.stockQuantity - item.quantity);
            break;
          }
        }
      }
      order.stockDeducted = true;
      order.confirmedAt = new Date().toISOString();
    }
    order.operationalStatus = "CONFIRMED";
  } else if (newStatus === "CANCELLED") {
    // İptal kuralı: Eğer daha önce stok düşülmüşse stoku geri iade et
    if (order.stockDeducted) {
      for (const item of order.items) {
        for (const p of store.products) {
          const v = p.variants.find(
            (variant) =>
              variant.id === item.variantId ||
              variant.sku.toUpperCase() === item.sku.toUpperCase()
          );
          if (v) {
            v.stockQuantity += item.quantity;
            break;
          }
        }
      }
      order.stockDeducted = false;
      order.cancelledAt = new Date().toISOString();
    }
    order.operationalStatus = "CANCELLED";
  }

  order.updatedAt = new Date().toISOString();
  saveStoreData(store);

  // Denetim loguna kaydet
  if (adminInfo) {
    logAdminAudit({
      adminId: adminInfo.adminId || "system",
      adminEmail: adminInfo.adminEmail || "admin@humramoda.com",
      action: newStatus === "CONFIRMED" ? "ORDER_CONFIRMED" : "ORDER_CANCELLED",
      targetType: "ORDER",
      targetId: order.orderNumber,
      result: "SUCCESS",
      ipAddress: adminInfo.ip || "127.0.0.1",
      details: {
        orderId: order.id,
        previousStatus,
        newStatus,
        totalAmount: order.totalAmount,
        stockDeducted: order.stockDeducted,
        items: order.items.map((i) => ({ sku: i.sku, qty: i.quantity, price: i.unitPrice })),
      },
    });
  }

  return { success: true, order, idempotent: false };
}

export interface FinancialOrderItemSummary {
  sku: string;
  productName: string;
  colorName: string;
  sizeName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  costPriceSnapshot?: number;
  itemCogs?: number;
  itemProfit?: number;
  isCostMissing: boolean;
}

export interface OrderProfitBreakdown {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  customerFullName: string;
  operationalStatus: OperationalOrderStatus;
  paymentStatus: OrderPaymentStatus;
  totalAmount: number;
  discountAmount: number;
  shippingAmount: number;
  cogs?: number;
  grossProfit?: number;
  isCostMissing: boolean;
  items: FinancialOrderItemSummary[];
}

export interface FinancialReport {
  grossSalesRevenue: number; // Toplam Satış Tutarı (İptal edilmemiş)
  totalDiscounts: number; // İndirimler
  cancelledAmount: number; // İptal / İade Edilen Tutar
  netSalesRevenue: number; // Gerçekleşen Net Satış Geliri
  totalCogs: number; // Satılan Malların Toplam Maliyeti
  estimatedShippingExpenses: number; // Kargo Giderleri
  estimatedPaymentCommissions: number; // PayTR / Ödeme Komisyonu (%2.5)
  estimatedGrossProfit: number; // Tahmini Brüt Kâr (Net Satış - COGS)
  estimatedNetProfit: number; // Tahmini Net Kâr (Brüt Kâr - Kargo - Komisyon)
  hasMissingCosts: boolean; // Bilinmeyen maliyet uyarısı
  orderCount: number;
  confirmedCount: number;
  cancelledCount: number;
  pendingCount: number;
  orders: OrderProfitBreakdown[];
}

/**
 * Satış ve gerçek kâr hesaplama motoru (Faz 4.6).
 * Satış geliri kâr değildir ilkesini uygular.
 * Bilinmeyen maliyeti 0 kabul ederek yapay kâr üretmez; "eksik maliyet verisi" olarak etiketler.
 */
export function getFinancialReport(filters?: {
  startDate?: string;
  endDate?: string;
}): FinancialReport {
  const store = getStoreData();
  let orders = store.orders || [];

  if (filters?.startDate) {
    const start = new Date(filters.startDate).getTime();
    orders = orders.filter((o) => new Date(o.createdAt).getTime() >= start);
  }
  if (filters?.endDate) {
    const end = new Date(filters.endDate).getTime();
    orders = orders.filter((o) => new Date(o.createdAt).getTime() <= end);
  }

  let grossSalesRevenue = 0;
  let totalDiscounts = 0;
  let cancelledAmount = 0;
  let totalCogs = 0;
  let hasMissingCosts = false;

  let confirmedCount = 0;
  let cancelledCount = 0;
  let pendingCount = 0;

  const orderBreakdowns: OrderProfitBreakdown[] = [];

  for (const o of orders) {
    if (o.operationalStatus === "CONFIRMED") confirmedCount++;
    else if (o.operationalStatus === "CANCELLED") cancelledCount++;
    else pendingCount++;

    const isCancelled = o.operationalStatus === "CANCELLED";

    if (isCancelled) {
      cancelledAmount += o.totalAmount;
    } else {
      grossSalesRevenue += o.totalAmount;
      totalDiscounts += o.discountAmount || 0;
    }

    let orderCogs = 0;
    let orderHasMissing = false;

    const itemsSummary: FinancialOrderItemSummary[] = (o.items || []).map((item) => {
      const isMissing = item.costPriceSnapshot === undefined || item.costPriceSnapshot === null;
      if (isMissing) {
        orderHasMissing = true;
        if (!isCancelled) hasMissingCosts = true;
      }

      const itemCogs = !isMissing ? item.costPriceSnapshot! * item.quantity : undefined;
      const itemProfit = itemCogs !== undefined ? item.totalPrice - itemCogs : undefined;

      if (!isCancelled && itemCogs !== undefined) {
        orderCogs += itemCogs;
      }

      return {
        sku: item.sku,
        productName: item.productName,
        colorName: item.colorName,
        sizeName: item.sizeName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        costPriceSnapshot: item.costPriceSnapshot,
        itemCogs,
        itemProfit,
        isCostMissing: isMissing,
      };
    });

    if (!isCancelled) {
      totalCogs += orderCogs;
    }

    orderBreakdowns.push({
      orderId: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      customerFullName: o.customerFullName,
      operationalStatus: o.operationalStatus,
      paymentStatus: o.paymentStatus,
      totalAmount: o.totalAmount,
      discountAmount: o.discountAmount || 0,
      shippingAmount: o.shippingAmount || 0,
      cogs: !orderHasMissing ? orderCogs : undefined,
      grossProfit: !orderHasMissing && !isCancelled ? o.totalAmount - orderCogs : undefined,
      isCostMissing: orderHasMissing,
      items: itemsSummary,
    });
  }

  const netSalesRevenue = grossSalesRevenue;
  // Kargo gideri: İptal edilmemiş siparişler için ortalama 70 ₺ varsayımı
  const activeOrdersCount = orders.filter((o) => o.operationalStatus !== "CANCELLED").length;
  const estimatedShippingExpenses = activeOrdersCount * 70;
  // Ödeme komisyonu: Net ciro üzerinden tahmini %2.5
  const estimatedPaymentCommissions = Math.round(netSalesRevenue * 0.025 * 100) / 100;

  const estimatedGrossProfit = netSalesRevenue - totalCogs;
  const estimatedNetProfit = estimatedGrossProfit - estimatedShippingExpenses - estimatedPaymentCommissions;

  return {
    grossSalesRevenue,
    totalDiscounts,
    cancelledAmount,
    netSalesRevenue,
    totalCogs,
    estimatedShippingExpenses,
    estimatedPaymentCommissions,
    estimatedGrossProfit,
    estimatedNetProfit,
    hasMissingCosts,
    orderCount: orders.length,
    confirmedCount,
    cancelledCount,
    pendingCount,
    orders: orderBreakdowns,
  };
}

export interface CreateOrderCustomerInput {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  district: string;
  fullAddress: string;
  postalCode?: string;
  customerNotes?: string;
}

export interface CreateOrderItemInput {
  productId: string;
  variantId?: string;
  sku?: string;
  colorName?: string;
  sizeName?: string;
  quantity: number;
}

export interface CreateOrderInput {
  customer: CreateOrderCustomerInput;
  items: CreateOrderItemInput[];
  campaignCode?: string;
}

/**
 * Müşteri sepetinden sunucu taraflı güvenli sipariş oluşturur.
 * İstemciden gelen fiyat veya toplam tutarlara ASLA güvenilmez;
 * ürünlerin geçerli fiyatı doğrudan sunucu kataloğundan okunup hesaplanır.
 */
export function createPendingOrder(input: CreateOrderInput): {
  success: boolean;
  order?: StoreOrder;
  error?: string;
} {
  const store = getStoreData();

  // 1. Müşteri bilgisi doğrulama
  const { customer, items } = input;
  if (!customer?.fullName?.trim()) return { success: false, error: "Lütfen adınızı ve soyadınızı giriniz." };
  if (!customer?.email?.trim() || !customer.email.includes("@")) return { success: false, error: "Geçerli bir e-posta adresi giriniz." };
  if (!customer?.phone?.trim() || customer.phone.trim().length < 10) return { success: false, error: "Geçerli bir telefon numarası giriniz." };
  if (!customer?.city?.trim()) return { success: false, error: "Lütfen il seçiniz." };
  if (!customer?.district?.trim()) return { success: false, error: "Lütfen ilçe giriniz." };
  if (!customer?.fullAddress?.trim()) return { success: false, error: "Lütfen açık adresinizi giriniz." };

  if (!items || items.length === 0) {
    return { success: false, error: "Sepetinizde ürün bulunamadı." };
  }

  // 2. Sunucu taraflı ürün ve fiyat doğrulaması
  const validatedItems: OrderItemSnapshot[] = [];
  let subtotal = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const qty = Number(it.quantity);
    if (!qty || qty <= 0) {
      return { success: false, error: "Geçersiz ürün adedi." };
    }

    const product = store.products.find(
      (p) => p.id === it.productId || p.slug === it.productId
    );

    if (!product) {
      return { success: false, error: `Seçilen ürün katalogda bulunamadı (ID: ${it.productId}).` };
    }

    // Varyantı SKU veya variantId ile bul
    const variant =
      product.variants.find(
        (v) =>
          (it.variantId && v.id === it.variantId) ||
          (it.sku && v.sku.toUpperCase() === it.sku.toUpperCase())
      ) || product.variants[0];

    if (!variant) {
      return { success: false, error: `"${product.title}" için geçerli varyant bulunamadı.` };
    }

    // Stok denetimi
    if (variant.stockQuantity < qty) {
      return {
        success: false,
        error: `"${product.title}" (${variant.sku}) için yeterli stok bulunmuyor. Kalan stok: ${variant.stockQuantity}`,
      };
    }

    const color = product.colors.find((c) => c.id === variant.colorId);
    const size = product.sizes.find((s) => s.id === variant.sizeId);

    // Fiyatı daima sunucu verisinden al
    const unitPrice =
      typeof product.discountPrice === "number" && product.discountPrice > 0
        ? product.discountPrice
        : product.basePrice;

    const itemTotal = unitPrice * qty;
    subtotal += itemTotal;

    validatedItems.push({
      id: `ord-item-${Date.now()}-${i}`,
      productId: product.id,
      productName: product.title,
      variantId: variant.id,
      colorName: it.colorName || color?.name || "Standart",
      sizeName: it.sizeName || size?.name || "Standart",
      sku: variant.sku,
      unitPrice,
      quantity: qty,
      totalPrice: itemTotal,
      costPriceSnapshot: variant.costPrice ?? product.costPrice,
    });
  }

  // 3. Kampanya ve İndirim Hesaplaması (Sunucu taraflı)
  let discountAmount = 0;
  if (input.campaignCode) {
    const cleanCode = input.campaignCode.trim().toUpperCase();
    const nowIso = new Date().toISOString().slice(0, 10);
    const campaign = store.campaigns?.find(
      (c) => c.code.toUpperCase() === cleanCode && c.isActive
    );

    if (campaign) {
      const isStarted = !campaign.startDate || campaign.startDate <= nowIso;
      const isNotExpired = !campaign.endDate || campaign.endDate >= nowIso;
      const meetsMinSpend = !campaign.minBasketAmount || subtotal >= campaign.minBasketAmount;

      if (isStarted && isNotExpired && meetsMinSpend && campaign.discountPercentage) {
        discountAmount = Math.round(((subtotal * campaign.discountPercentage) / 100) * 100) / 100;
      }
    }
  }

  // 4. Kargo Ücreti
  const freeShippingThreshold = store.settings?.freeShippingThreshold || 3500;
  const eligibleAmount = subtotal - discountAmount;
  const shippingAmount = eligibleAmount >= freeShippingThreshold ? 0 : 0;

  const totalAmount = Math.max(0, subtotal - discountAmount + shippingAmount);
  const totalKurus = Math.round(totalAmount * 100);

  // 5. Benzersiz Sipariş Numarası Üretimi
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = `HM-${dateStr}-${randomSuffix}`;
  const nowIso = now.toISOString();

  const order: StoreOrder = {
    id: `ord-${Date.now()}`,
    orderNumber,
    customerFullName: customer.fullName.trim(),
    customerEmail: customer.email.trim().toLowerCase(),
    customerPhone: customer.phone.trim(),
    shippingAddress: {
      city: customer.city.trim(),
      district: customer.district.trim(),
      fullAddress: customer.fullAddress.trim(),
      postalCode: customer.postalCode?.trim(),
    },
    operationalStatus: "PENDING",
    paymentStatus: "PENDING",
    paymentProvider: "PAYTR",
    subtotal,
    discountAmount,
    shippingAmount,
    totalAmount,
    totalKurus,
    items: validatedItems,
    customerNotes: customer.customerNotes?.trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
    stockDeducted: false,
    shippingStatus: "AWAITING_SHIPMENT",
    refundedAmount: 0,
  };

  store.orders = store.orders || [];
  store.orders.unshift(order);
  saveStoreData(store);

  return { success: true, order };
}

/**
 * Müşterinin sipariş durumunu güvenle denetlemesini sağlar (hassas verileri maskeler).
 */
export function getOrderPublicStatus(orderNumberOrId: string) {
  const store = getStoreData();
  const cleanId = orderNumberOrId.trim();
  const order = store.orders?.find(
    (o) => o.orderNumber === cleanId || o.id === cleanId
  );

  if (!order) return null;

  const names = order.customerFullName.split(" ");
  const maskedName = names
    .map((n) => (n.length > 1 ? `${n[0]}${"*".repeat(n.length - 1)}` : n))
    .join(" ");

  return {
    orderNumber: order.orderNumber,
    customerName: maskedName,
    paymentStatus: order.paymentStatus,
    operationalStatus: order.operationalStatus,
    paymentProvider: order.paymentProvider || "PAYTR",
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    shippingAmount: order.shippingAmount,
    totalAmount: order.totalAmount,
    totalKurus: order.totalKurus,
    city: order.shippingAddress.city,
    district: order.shippingAddress.district,
    itemCount: order.items.reduce((sum, it) => sum + it.quantity, 0),
    items: order.items.map((it) => ({
      productName: it.productName,
      colorName: it.colorName,
      sizeName: it.sizeName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
    })),
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    paymentFailedReason: order.paymentFailedReason,
  };
}

