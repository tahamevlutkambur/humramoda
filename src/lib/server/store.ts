import fs from "fs";
import path from "path";
import os from "os";
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
  // PayTR Ayarları
  paytr?: {
    merchantId?: string;
    merchantKey?: string;
    merchantSalt?: string;
    testMode?: "0" | "1";
    debugOn?: "0" | "1";
  };
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
  updatedAt?: number;
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
const TMP_STORE_FILE = path.join(os.tmpdir(), "humramoda_store.json");

interface GlobalStoreState {
  inMemoryStore: AppStoreData | null;
  persistentStoreOverride: AppStoreData | null;
  lastStoreFileMtime: number;
}

declare global {
  var __humraStoreState: GlobalStoreState | undefined;
}

const storeState: GlobalStoreState =
  globalThis.__humraStoreState ||
  (globalThis.__humraStoreState = {
    inMemoryStore: null,
    persistentStoreOverride: null,
    lastStoreFileMtime: 0,
  });

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
  storeName: "Hümra Butik & Moda",
  currency: "TRY",
  phone: "+90 850 000 00 00",
  whatsapp: "+90 555 000 00 00",
  email: "destek@humrabutik.com",
  address: "Nişantaşı, İstanbul, Türkiye",
  freeShippingThreshold: 3500,
  defaultSeoTitle: "Hümra Butik — Zamansız Kadın Giyim & Modern Koleksiyonlar",
  defaultSeoDescription:
    "Hümra Butik: Seçkin kadın giyim, ikili takımlar ve zamansız koleksiyonlar. Premium kumaş kalitesi ve modern kalıplarla güvenli alışveriş.",
  defaultSocialShareImage: "/uploads/products/IMG_2237-card.webp",
  instagramUrl: "https://instagram.com/humramoda",
  tiktokUrl: "https://tiktok.com/@humramoda",
  companyTitle: "Hümra Butik Tekstil San. ve Tic. Ltd. Şti.",
  taxOffice: "Beşiktaş Vergi Dairesi",
  taxNumber: "[Vergi No: Panelden Tanımlanacak]",
  mersisNumber: "[Mersis No: Panelden Tanımlanacak]",
  kepAddress: "[KEP Adresi: Opsiyonel]",
  paytr: {
    merchantId: "768079",
    merchantKey: "D3gr1fBEUkkgjRaR",
    merchantSalt: "mzAPqkRnYqakr2Qo",
    testMode: "1",
    debugOn: "1",
  },
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
const DEFAULT_ADMIN_USERS: AdminUser[] = [
  {
    id: "admin-1",
    email: "humramoda@eyup.com",
    fullName: "Hümra Butik & Moda Yöneticisi",
    passwordHash: "d88ba6be78528ec28154bf691409d940:86958fabec9d64e85df791df088d1ed9b96e2f9124b5212238913a802175b5d88c96363d2a21d91f9c88bd2809ba8ca68f8f14c4b8f51e056e3a0bf53b843066", // Eyup.Humra2026
    role: "ADMIN",
    isActive: true,
    createdAt: "2026-10-27T00:00:00.000Z",
  },
  {
    id: "admin-2",
    email: "admin@humrabutik.com",
    fullName: "Hümra Butik Yöneticisi",
    passwordHash: "d88ba6be78528ec28154bf691409d940:86958fabec9d64e85df791df088d1ed9b96e2f9124b5212238913a802175b5d88c96363d2a21d91f9c88bd2809ba8ca68f8f14c4b8f51e056e3a0bf53b843066", // Eyup.Humra2026
    role: "ADMIN",
    isActive: true,
    createdAt: "2026-10-27T00:00:00.000Z",
  },
];

/**
 * İlk veri deposunu başlatır veya mevcut olanı okur.
 * Vercel / Serverless ortamında salt-okunur dosya sistemi hatalarını (EROFS) engeller.
 */
export function getStoreData(): AppStoreData {
  let fileMtime = 0;
  let activeFile = "";
  try {
    let tmpMtime = 0;
    let storeMtime = 0;
    if (fs.existsSync(TMP_STORE_FILE)) {
      tmpMtime = fs.statSync(TMP_STORE_FILE).mtimeMs;
    }
    if (fs.existsSync(STORE_FILE)) {
      storeMtime = fs.statSync(STORE_FILE).mtimeMs;
    }

    if (tmpMtime > 0 && (process.env.VERCEL || tmpMtime >= storeMtime)) {
      fileMtime = tmpMtime;
      activeFile = TMP_STORE_FILE;
    } else if (storeMtime > 0) {
      fileMtime = storeMtime;
      activeFile = STORE_FILE;
    } else if (tmpMtime > 0) {
      fileMtime = tmpMtime;
      activeFile = TMP_STORE_FILE;
    }
  } catch {
    // Okuma hatası
  }

  if (
    storeState.inMemoryStore &&
    fileMtime > 0 &&
    Math.abs(fileMtime - storeState.lastStoreFileMtime) < 10
  ) {
    return storeState.inMemoryStore;
  }

  if (storeState.persistentStoreOverride && fileMtime === 0) {
    return storeState.persistentStoreOverride;
  }

  let raw: string | null = null;

  // 1. Tespit edilen aktif dosyadan oku
  try {
    if (activeFile && fs.existsSync(activeFile)) {
      raw = fs.readFileSync(activeFile, "utf-8");
      storeState.lastStoreFileMtime = fileMtime;
    }
  } catch {
    // Okuma hatası
  }

  // 2. Eğer bulunamadıysa /tmp dizinini dene
  if (!raw) {
    try {
      if (fs.existsSync(TMP_STORE_FILE)) {
        raw = fs.readFileSync(TMP_STORE_FILE, "utf-8");
      }
    } catch {
      // Okuma hatası
    }
  }

  // Dosya mevcut değilse başlangıç verisi ile başlat
  if (!raw) {
    if (storeState.inMemoryStore) {
      return storeState.inMemoryStore;
    }
    const initialData: AppStoreData = {
      products: PRODUCTS,
      categories: CATEGORIES,
      collections: COLLECTIONS,
      featuredVideos: FEATURED_VIDEOS,
      homepageContent: DEFAULT_HOMEPAGE_CONTENT,
      settings: DEFAULT_SETTINGS,
      campaigns: DEFAULT_CAMPAIGNS,
      adminUsers: DEFAULT_ADMIN_USERS,
      orders: DEFAULT_ORDERS,
      shipments: [],
      returnRequests: [],
      notifications: [],
    };
    storeState.inMemoryStore = initialData;

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STORE_FILE, JSON.stringify(initialData, null, 2), "utf-8");
    } catch {
      try {
        fs.writeFileSync(TMP_STORE_FILE, JSON.stringify(initialData, null, 2), "utf-8");
      } catch {
        // Vercel serverless ortamında dosya yazımı atlanabilir, inMemoryStore yeterlidir
      }
    }

    return initialData;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppStoreData>;
    const loadedAdminUsers =
      parsed.adminUsers && parsed.adminUsers.length > 0
        ? parsed.adminUsers
        : DEFAULT_ADMIN_USERS;

    const isColdVercelBundle = Boolean(process.env.VERCEL && activeFile === STORE_FILE);
    const data: AppStoreData = {
      updatedAt: isColdVercelBundle
        ? 0
        : typeof parsed.updatedAt === "number"
        ? parsed.updatedAt
        : 0,
      products: parsed.products !== undefined && Array.isArray(parsed.products) ? parsed.products : PRODUCTS,
      categories: parsed.categories !== undefined && Array.isArray(parsed.categories) ? parsed.categories : CATEGORIES,
      collections: parsed.collections !== undefined && Array.isArray(parsed.collections) ? parsed.collections : COLLECTIONS,
      featuredVideos: parsed.featuredVideos || FEATURED_VIDEOS,
      homepageContent: { ...DEFAULT_HOMEPAGE_CONTENT, ...(parsed.homepageContent || {}) },
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings || {}),
        paytr: {
          ...DEFAULT_SETTINGS.paytr,
          ...(parsed.settings?.paytr || {}),
        },
      },
      campaigns: parsed.campaigns || DEFAULT_CAMPAIGNS,
      adminUsers: loadedAdminUsers,
      orders: parsed.orders !== undefined && Array.isArray(parsed.orders) ? parsed.orders : DEFAULT_ORDERS,
      shipments: parsed.shipments || [],
      returnRequests: parsed.returnRequests || [],
      notifications: parsed.notifications || [],
    };

    storeState.inMemoryStore = data;
    return data;
  } catch (err) {
    console.error("Store data read/parse error:", err);
    if (storeState.inMemoryStore) {
      return storeState.inMemoryStore;
    }
    const fallback: AppStoreData = {
      products: PRODUCTS,
      categories: CATEGORIES,
      collections: COLLECTIONS,
      featuredVideos: FEATURED_VIDEOS,
      homepageContent: DEFAULT_HOMEPAGE_CONTENT,
      settings: DEFAULT_SETTINGS,
      campaigns: DEFAULT_CAMPAIGNS,
      adminUsers: DEFAULT_ADMIN_USERS,
      orders: DEFAULT_ORDERS,
      shipments: [],
      returnRequests: [],
      notifications: [],
    };
    storeState.inMemoryStore = fallback;
    return fallback;
  }
}

/**
 * Veri deposunu hem belleğe hem diske güvenli ve hatasız biçimde kaydeder.
 * Vercel / Serverless salt-okunur dosya sisteminde hata fırlatmaz.
 */
export function saveStoreData(data: AppStoreData): void {
  data.updatedAt = Math.max(Date.now(), (data.updatedAt || 0) + 1);
  storeState.inMemoryStore = data;
  storeState.persistentStoreOverride = data;

  // 1. Vercel / Lambda ortamı için /tmp dizinine MUTLAKA yaz
  try {
    fs.writeFileSync(TMP_STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
    try {
      storeState.lastStoreFileMtime = fs.statSync(TMP_STORE_FILE).mtimeMs;
    } catch {
      storeState.lastStoreFileMtime = Date.now();
    }
  } catch (err) {
    console.warn("Could not persist to /tmp:", err);
    storeState.lastStoreFileMtime = Date.now();
  }

  // 2. Proje dizinine yazmayı dene (yerel geliştirme / derleme ortamı)
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    try {
      fs.renameSync(tempFile, STORE_FILE);
    } catch {
      try {
        fs.copyFileSync(tempFile, STORE_FILE);
        fs.unlinkSync(tempFile);
      } catch {
        fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
      }
    }
    try {
      storeState.lastStoreFileMtime = fs.statSync(STORE_FILE).mtimeMs;
    } catch {
      // ignore
    }
  } catch {
    // Vercel serverless salt okunur dosya sistemi - normal
  }
}

/** Hydrate the current request's store from the durable database snapshot. */
export function usePersistentStoreData(data: AppStoreData): void {
  storeState.inMemoryStore = data;
  storeState.persistentStoreOverride = data;
  try {
    fs.writeFileSync(TMP_STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
    storeState.lastStoreFileMtime = fs.statSync(TMP_STORE_FILE).mtimeMs;
  } catch {
    // ignore
  }
}

/**
 * Cold serverless instance rehydration:
 * If a newly spun-up Vercel Lambda container has an older or uninitialized store (updatedAt: 0)
 * and receives a newer verified client/admin snapshot, hydrate the container's store.
 */
export function syncStoreSnapshot(snapshot: {
  updatedAt?: number;
  products?: ProductItem[];
  categories?: CategoryItem[];
  collections?: CollectionItem[];
  _mergeOnly?: boolean;
}): AppStoreData {
  const store = getStoreData();
  const incomingTime = typeof snapshot.updatedAt === "number" ? snapshot.updatedAt : 0;
  const currentTime = store.updatedAt || 0;

  const hasMissingMediaOnServer =
    Array.isArray(snapshot.products) &&
    snapshot.products.some((ip) => {
      if (!ip.media || ip.media.length === 0) return false;
      const sp = store.products.find((s) => s.id === ip.id || s.slug === ip.slug);
      return !sp || !sp.media || sp.media.length === 0;
    });

  if (
    incomingTime >= currentTime ||
    snapshot._mergeOnly ||
    store.products.length === 0 ||
    hasMissingMediaOnServer
  ) {
    if (Array.isArray(snapshot.products) && snapshot.products.length > 0) {
      const existingById = new Map(store.products.map((p) => [p.id, p]));
      const mergedProducts: ProductItem[] = snapshot.products.map((incomingProd) => {
        const existing = existingById.get(incomingProd.id);
        existingById.delete(incomingProd.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isTruncated = Boolean((incomingProd as any)._mediaTruncated);
        const cleanProd: ProductItem = { ...incomingProd };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (cleanProd as any)._mediaTruncated;

        if (
          existing &&
          existing.media &&
          existing.media.length > 0 &&
          ((isTruncated && existing.media.length > (cleanProd.media?.length || 0)) ||
            !cleanProd.media ||
            cleanProd.media.length === 0)
        ) {
          return { ...cleanProd, media: existing.media };
        }
        return cleanProd;
      });
      // Preserve any existing server products that were not in a partial chunk
      for (const leftover of existingById.values()) {
        mergedProducts.push(leftover);
      }
      store.products = mergedProducts;
    }
    if (Array.isArray(snapshot.categories) && snapshot.categories.length > 0) {
      const existingCats = new Map(store.categories.map((c) => [c.id, c]));
      for (const c of snapshot.categories) {
        existingCats.set(c.id, c);
      }
      store.categories = Array.from(existingCats.values());
    }
    if (Array.isArray(snapshot.collections) && snapshot.collections.length > 0) {
      store.collections = snapshot.collections;
    }
    if (incomingTime > currentTime) {
      store.updatedAt = incomingTime;
    }
    usePersistentStoreData(store);
  }
  return store;
}

export function syncStoreProductMedia(input: {
  id?: string;
  slug?: string;
  updatedAt?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  media?: any[];
}): AppStoreData {
  const store = getStoreData();
  if (!Array.isArray(input.media) || input.media.length === 0) {
    return store;
  }
  const target = (input.id || input.slug || "").trim().toLowerCase();
  if (!target) return store;

  const idx = store.products.findIndex(
    (p) =>
      p.id === input.id ||
      p.slug === input.slug ||
      p.id.toLowerCase() === target ||
      p.slug.toLowerCase() === target
  );
  if (idx !== -1) {
    const prod = store.products[idx];
    prod.media = input.media.map((m, i) => {
      let colorId: string | undefined = m.colorId;
      if (!colorId && m.colorName) {
        const match = prod.colors?.find(
          (c) => c.name.trim().toLowerCase() === String(m.colorName).trim().toLowerCase()
        );
        if (match) colorId = match.id;
      }
      return {
        id: m.id || `med-${prod.id}-${i}`,
        colorId,
        type: m.type || "IMAGE",
        url: m.url,
        thumbnailUrl: m.url?.startsWith("data:") ? "" : m.thumbnailUrl || m.url,
        altText: m.altText || `${prod.title} görseli`,
        isThumbnail: Boolean(m.isThumbnail || i === 0),
        displayOrder: m.displayOrder || i + 1,
      };
    });
    store.products[idx] = prod;
    if (typeof input.updatedAt === "number" && input.updatedAt > (store.updatedAt || 0)) {
      store.updatedAt = input.updatedAt;
    }
    usePersistentStoreData(store);
  }
  return store;
}

// -------------------------------------------------------------
// ÜRÜN YÖNETİMİ İŞLEMLERİ (PRODUCTS CRUD)
// -------------------------------------------------------------

export function getAllStoreProducts(): ProductItem[] {
  return getStoreData().products;
}

export function getStoreProductById(idOrSlug: string): ProductItem | undefined {
  if (!idOrSlug) return undefined;
  const store = getStoreData();
  const trimmed = idOrSlug.trim();
  const decoded = decodeURIComponent(trimmed);
  const lower = trimmed.toLowerCase();
  const decodedLower = decoded.toLowerCase();

  return store.products.find(
    (p) =>
      p.id === trimmed ||
      p.slug === trimmed ||
      p.id === decoded ||
      p.slug === decoded ||
      p.id.toLowerCase() === lower ||
      p.slug.toLowerCase() === lower ||
      p.slug.toLowerCase() === decodedLower
  );
}

export function getStoreProductBySlug(slug: string): ProductItem | undefined {
  return getStoreProductById(slug);
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

  // Eğer mağazada hiç kategori yoksa otomatik varsayılan bir kategori oluştur
  if (!store.categories || store.categories.length === 0) {
    store.categories = [
      {
        id: "cat-1",
        name: "Genel",
        slug: "genel",
        description: "Genel Kategori",
        displayOrder: 1,
      },
    ];
  }

  let category = store.categories.find(
    (c) =>
      c.slug === input.categorySlug ||
      c.id === input.categorySlug ||
      c.name.trim().toLowerCase() === (input.categorySlug || "").trim().toLowerCase()
  );

  if (!category) {
    category = store.categories[0];
  }

  // Renkleri oluştur
  let colors = (input.colors || []).map((c, idx) => ({
    id: `col-${Date.now()}-${idx}`,
    name: c.name.trim(),
    slug: c.slug?.trim() ? generateSlug(c.slug) : generateSlug(c.name),
    colorCode: c.colorCode || "#111111",
    displayOrder: idx + 1,
  }));
  if (colors.length === 0) {
    colors = [{
      id: `col-${Date.now()}-0`,
      name: "Siyah",
      slug: "siyah",
      colorCode: "#111111",
      displayOrder: 1,
    }];
  }

  // Bedenleri oluştur
  let sizes = (input.sizes || []).map((s: string | { name: string; slug?: string }, idx) => {
    const rawName = typeof s === "string" ? s : s.name;
    const name = (rawName || "").trim();
    const rawSlug = typeof s === "object" && s.slug ? s.slug : name;
    return {
      id: `size-${Date.now()}-${idx}`,
      name: name || "Standart",
      slug: generateSlug(rawSlug || "standart"),
      displayOrder: idx + 1,
    };
  });
  if (sizes.length === 0) {
    sizes = [{
      id: `size-${Date.now()}-0`,
      name: "Standart",
      slug: "standart",
      displayOrder: 1,
    }];
  }

  // Varyantları oluştur ve SKU denetimi yap
  const existingSkus = new Set(
    store.products.flatMap((p) => p.variants.map((v) => v.sku.toUpperCase()))
  );

  const variants = [];
  for (const v of input.variants || []) {
    let sku = (v.sku || "").trim().toUpperCase();
    if (!sku) {
      sku = `HM-${slug.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "")}-${variants.length + 1}-${Math.floor(100 + Math.random() * 900)}`;
    }
    if (existingSkus.has(sku)) {
      sku = `${sku}-${Math.floor(10 + Math.random() * 90)}`;
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
    ) || colors[0];

    const matchedSize = sizes.find(
      (s) =>
        (v.sizeId && (s.id === v.sizeId || s.name === v.sizeId || s.slug === v.sizeId)) ||
        (v.sizeName && s.name.toLowerCase() === v.sizeName.toLowerCase()) ||
        (v.sizeId && s.name.toLowerCase() === v.sizeId.replace("size-", "").toLowerCase())
    ) || sizes[0];

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

  // Hiçbir varyant üretilememişse otomatik 1 adet varsayılan varyant oluştur
  if (variants.length === 0) {
    const autoSku = `HM-${slug.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
    variants.push({
      id: `var-${Date.now()}-0`,
      colorId: colors[0].id,
      sizeId: sizes[0].id,
      sku: autoSku,
      stockQuantity: 10,
      costPrice: undefined,
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
      thumbnailUrl: m.url?.startsWith("data:") ? "" : m.thumbnailUrl || m.url,
      altText: m.altText || `${input.title} görseli`,
      isThumbnail: m.isThumbnail || idx === 0,
      displayOrder: idx + 1,
    };
  });

  const normalizedCollections =
    Array.isArray(input.collectionSlugs) && input.collectionSlugs.length > 0
      ? input.collectionSlugs
      : ["yeni-sezon", "cok-satanlar"];

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
    collectionSlugs: normalizedCollections,
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
  const trimmed = (id || "").trim();
  const decoded = decodeURIComponent(trimmed);
  const lower = trimmed.toLowerCase();
  const decodedLower = decoded.toLowerCase();

  let index = store.products.findIndex(
    (p) =>
      p.id === trimmed ||
      p.slug === trimmed ||
      p.id === decoded ||
      p.slug === decoded ||
      p.id.toLowerCase() === lower ||
      p.slug.toLowerCase() === lower ||
      p.slug.toLowerCase() === decodedLower
  );
  if (index === -1) {
    if (input.title && input.basePrice) {
      const created = createStoreProduct({
        title: input.title,
        slug: input.slug,
        description: input.description || "",
        fabricDetails: input.fabricDetails,
        modelDimensions: input.modelDimensions,
        basePrice: Number(input.basePrice),
        discountPrice: input.discountPrice,
        costPrice: input.costPrice,
        badge: input.badge,
        categorySlug: input.categorySlug || store.categories[0]?.slug || "takim",
        collectionSlugs: input.collectionSlugs,
        colors: input.colors || [{ name: "Siyah", colorCode: "#141414" }],
        sizes: input.sizes || ["Standart"],
        variants: input.variants || [],
        media: input.media || [],
      });
      if (created.product) {
        if (decoded.startsWith("prod-")) {
          created.product.id = decoded;
        }
        saveStoreData(store);
        return { product: created.product };
      }
    }
    return { error: "Güncellenecek ürün bulunamadı." };
  }

  const current = store.products[index];
  const productId = current.id;

  if (input.title !== undefined) {
    if (input.title.trim().length === 0) return { error: "Ürün başlığı boş bırakılamaz." };
    current.title = input.title.trim();
  }

  if (input.slug !== undefined && input.slug.trim().length > 0) {
    const newSlug = generateSlug(input.slug);
    if (newSlug) {
      if (store.products.some((p) => p.id !== productId && p.slug === newSlug)) {
        return { error: `"${newSlug}" slug adresi başka bir üründe kullanılıyor.` };
      }
      current.slug = newSlug;
    }
  }

  if (input.basePrice !== undefined) {
    const base = Number(input.basePrice);
    if (isNaN(base) || base <= 0) return { error: "Geçerli bir normal fiyat giriniz." };
    current.basePrice = base;
  }

  if (input.discountPrice !== undefined) {
    if (input.discountPrice === null || Number(input.discountPrice) <= 0) {
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
    const cat = store.categories.find(
      (c) =>
        c.slug === input.categorySlug ||
        c.id === input.categorySlug ||
        c.name.trim().toLowerCase() === (input.categorySlug || "").trim().toLowerCase()
    );
    if (cat) {
      current.categorySlug = cat.slug;
      current.categoryName = cat.name;
    }
  }

  if (input.collectionSlugs !== undefined) {
    current.collectionSlugs =
      Array.isArray(input.collectionSlugs) && input.collectionSlugs.length > 0
        ? input.collectionSlugs
        : ["yeni-sezon"];
  }

  // Renkler, bedenler veya varyantlar güncellenmişse uygula
  if (input.colors && input.colors.length > 0) {
    current.colors = input.colors.map((c, idx) => ({
      id: (c as { id?: string }).id || `col-${productId}-${idx}`,
      name: (c.name || "Siyah").trim(),
      slug: c.slug ? generateSlug(c.slug) : generateSlug(c.name || "siyah"),
      colorCode: c.colorCode || c.hex || "#141414",
      displayOrder: idx + 1,
    }));
  }
  if (!current.colors || current.colors.length === 0) {
    current.colors = [
      {
        id: `col-${productId}-0`,
        name: "Siyah",
        slug: "siyah",
        colorCode: "#141414",
        displayOrder: 1,
      },
    ];
  }

  if (input.sizes && input.sizes.length > 0) {
    current.sizes = input.sizes.map((s, idx) => {
      const name = (typeof s === "string" ? s : s.name || "Standart").trim();
      const slug = typeof s === "object" && s.slug ? generateSlug(s.slug) : generateSlug(name);
      return {
        id: (typeof s === "object" && (s as { id?: string }).id) || `size-${productId}-${idx}`,
        name: name || "Standart",
        slug: slug || "standart",
        displayOrder: idx + 1,
      };
    });
  }
  if (!current.sizes || current.sizes.length === 0) {
    current.sizes = [
      {
        id: `size-${productId}-0`,
        name: "Standart",
        slug: "standart",
        displayOrder: 1,
      },
    ];
  }

  if (input.variants) {
    const otherSkus = new Set(
      store.products
        .filter((p) => p.id !== productId)
        .flatMap((p) => p.variants.map((v) => v.sku.toUpperCase()))
    );

    const updatedVariants = [];
    for (const v of input.variants) {
      let sku = (v.sku || "").trim().toUpperCase();
      if (!sku) {
        sku = `HM-${current.slug.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "")}-${updatedVariants.length + 1}-${Math.floor(100 + Math.random() * 900)}`;
      }
      if (otherSkus.has(sku)) {
        sku = `${sku}-${Math.floor(10 + Math.random() * 90)}`;
      }
      otherSkus.add(sku);

      let matchedColor = current.colors.find(
        (c) =>
          (v.colorId && c.id === v.colorId) ||
          (v.colorName && c.name.trim().toLowerCase() === v.colorName.trim().toLowerCase()) ||
          (v.colorId && (c.slug === v.colorId || c.name.toLowerCase() === v.colorId.replace("col-", "").toLowerCase()))
      );
      if (!matchedColor && v.colorName?.trim()) {
        matchedColor = {
          id: `col-${productId}-${current.colors.length}`,
          name: v.colorName.trim(),
          slug: generateSlug(v.colorName.trim()),
          colorCode: "#141414",
          displayOrder: current.colors.length + 1,
        };
        current.colors.push(matchedColor);
      }
      if (!matchedColor) {
        matchedColor = current.colors[0];
      }

      let matchedSize = current.sizes.find(
        (s) =>
          (v.sizeId && (s.id === v.sizeId || s.name === v.sizeId || s.slug === v.sizeId)) ||
          (v.sizeName && s.name.trim().toLowerCase() === v.sizeName.trim().toLowerCase()) ||
          (v.sizeId && s.name.toLowerCase() === v.sizeId.replace("size-", "").toLowerCase())
      );
      if (!matchedSize && v.sizeName?.trim()) {
        matchedSize = {
          id: `size-${productId}-${current.sizes.length}`,
          name: v.sizeName.trim(),
          slug: generateSlug(v.sizeName.trim()),
          displayOrder: current.sizes.length + 1,
        };
        current.sizes.push(matchedSize);
      }
      if (!matchedSize) {
        matchedSize = current.sizes[0];
      }

      const costPrice =
        v.costPrice !== undefined && v.costPrice !== null && !isNaN(Number(v.costPrice))
          ? Number(v.costPrice)
          : undefined;

      updatedVariants.push({
        id: `var-${productId}-${updatedVariants.length}`,
        colorId: matchedColor.id,
        sizeId: matchedSize.id,
        sku,
        stockQuantity: Math.max(0, isNaN(Number(v.stockQuantity)) ? 10 : Number(v.stockQuantity)),
        costPrice,
        isActive: true,
      });
    }

    if (updatedVariants.length === 0) {
      const autoSku = `HM-${current.slug.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
      updatedVariants.push({
        id: `var-${productId}-0`,
        colorId: current.colors[0].id,
        sizeId: current.sizes[0].id,
        sku: autoSku,
        stockQuantity: 10,
        costPrice: undefined,
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
      let colorId: string | undefined = (m as { colorId?: string }).colorId;
      if (m.colorName) {
        const match = current.colors.find(
          (c) => c.name.trim().toLowerCase() === m.colorName?.trim().toLowerCase()
        );
        if (match) colorId = match.id;
      }
      if (colorId && !current.colors.some((c) => c.id === colorId)) {
        colorId = current.colors[0]?.id;
      }
      return {
        id: `med-${productId}-${idx}`,
        colorId,
        type: m.type || "IMAGE",
        url: m.url,
        thumbnailUrl: m.url?.startsWith("data:") ? "" : m.thumbnailUrl || m.url,
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

export function deleteStoreProduct(idOrSlug: string): boolean {
  const store = getStoreData();
  const trimmed = idOrSlug.trim();
  const decoded = decodeURIComponent(trimmed);
  const lower = trimmed.toLowerCase();
  const decodedLower = decoded.toLowerCase();

  const initialLen = store.products.length;
  store.products = store.products.filter(
    (p) =>
      p.id !== trimmed &&
      p.slug !== trimmed &&
      p.id !== decoded &&
      p.slug !== decoded &&
      p.id.toLowerCase() !== lower &&
      p.slug.toLowerCase() !== lower &&
      p.slug.toLowerCase() !== decodedLower
  );
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
  displayOrder?: number;
}): { category?: CategoryItem; error?: string } {
  const store = getStoreData();
  if (!input.name || input.name.trim().length === 0) return { error: "Kategori adı zorunludur." };

  const nameTrimmed = input.name.trim();
  let slug = input.slug?.trim() ? generateSlug(input.slug) : generateSlug(nameTrimmed);
  if (!slug) {
    slug = `kategori-${Date.now()}`;
  }

  // Kullanıcı özel slug belirtmediyse ve çakışma varsa otomatik numara ekle
  if (!input.slug?.trim()) {
    let counter = 1;
    const baseSlug = slug;
    while (store.categories.some((c) => c.slug === slug)) {
      slug = `${baseSlug}-${counter++}`;
    }
  } else if (store.categories.some((c) => c.slug === slug)) {
    return { error: `"${slug}" kategori bağlantısı zaten mevcut.` };
  }

  const newCat: CategoryItem = {
    id: `cat-${Date.now()}`,
    name: nameTrimmed,
    slug,
    description: input.description?.trim() || "",
    imageUrl: input.imageUrl,
    displayOrder: input.displayOrder !== undefined ? Number(input.displayOrder) : store.categories.length + 1,
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
  const trimmed = id.trim();
  const decoded = decodeURIComponent(trimmed);
  const cat = store.categories.find(
    (c) =>
      c.id === trimmed ||
      c.slug === trimmed ||
      c.id === decoded ||
      c.slug === decoded ||
      c.slug.toLowerCase() === decoded.toLowerCase()
  );
  if (!cat) return { error: "Kategori bulunamadı." };

  const oldSlug = cat.slug;
  const oldName = cat.name;

  if (input.name !== undefined) cat.name = input.name.trim();
  if (input.slug !== undefined) {
    const slug = generateSlug(input.slug);
    if (store.categories.some((c) => c.id !== cat.id && c.slug === slug)) {
      return { error: `"${slug}" kategori bağlantısı başka bir kategoride kullanılıyor.` };
    }
    cat.slug = slug;
  }
  if (input.description !== undefined) cat.description = input.description;
  if (input.imageUrl !== undefined) cat.imageUrl = input.imageUrl;
  if (input.displayOrder !== undefined) cat.displayOrder = Number(input.displayOrder);

  // Kategori slug veya adı değiştiyse ürünleri de otomatik eşitle
  if (oldSlug !== cat.slug || oldName !== cat.name) {
    store.products.forEach((p) => {
      if (p.categorySlug === oldSlug) {
        p.categorySlug = cat.slug;
        p.categoryName = cat.name;
      }
    });
  }

  saveStoreData(store);
  return { category: cat };
}

export function deleteStoreCategory(idOrSlug: string, reassignToSlug?: string): boolean {
  const store = getStoreData();
  const trimmed = (idOrSlug || "").trim();
  const decoded = decodeURIComponent(trimmed);
  const lower = trimmed.toLowerCase();
  const decodedLower = decoded.toLowerCase();

  const target = store.categories.find(
    (c) =>
      c.id === trimmed ||
      c.slug === trimmed ||
      c.id === decoded ||
      c.slug === decoded ||
      c.slug.toLowerCase() === lower ||
      c.slug.toLowerCase() === decodedLower ||
      c.name.toLowerCase() === lower ||
      c.name.toLowerCase() === decodedLower
  );
  if (!target) return false;

  const decodedReassign = reassignToSlug ? decodeURIComponent(reassignToSlug).trim() : undefined;
  const fallbackCat = decodedReassign
    ? store.categories.find(
        (c) =>
          (c.slug === decodedReassign ||
            c.id === decodedReassign ||
            c.slug.toLowerCase() === decodedReassign.toLowerCase()) &&
          c.id !== target.id
      )
    : store.categories.find((c) => c.id !== target.id);

  if (fallbackCat) {
    store.products.forEach((p) => {
      if (
        p.categorySlug === target.slug ||
        p.categorySlug.toLowerCase() === target.slug.toLowerCase() ||
        (p as any).categoryId === target.id
      ) {
        p.categorySlug = fallbackCat.slug;
        p.categoryName = fallbackCat.name;
        if ((p as any).categoryId) (p as any).categoryId = fallbackCat.id;
      }
    });
  }

  const initialLen = store.categories.length;
  store.categories = store.categories.filter((c) => c.id !== target.id && c.slug !== target.slug);
  if (store.categories.length !== initialLen) {
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
  const trimmed = id.trim();
  const decoded = decodeURIComponent(trimmed);
  const col = store.collections.find(
    (c) =>
      c.id === trimmed ||
      c.slug === trimmed ||
      c.id === decoded ||
      c.slug === decoded ||
      c.slug.toLowerCase() === decoded.toLowerCase()
  );
  if (!col) return { error: "Koleksiyon bulunamadı." };

  const oldSlug = col.slug;

  if (input.name !== undefined) col.name = input.name.trim();
  if (input.slug !== undefined) {
    const slug = generateSlug(input.slug);
    if (store.collections.some((c) => c.id !== col.id && c.slug === slug)) {
      return { error: `"${slug}" koleksiyon bağlantısı başka bir koleksiyonda kullanılıyor.` };
    }
    col.slug = slug;
  }
  if (input.description !== undefined) col.description = input.description;
  if (input.displayOrder !== undefined) col.displayOrder = Number(input.displayOrder);

  // Koleksiyon slug'ı değiştiyse ürünlerdeki koleksiyon referanslarını da güncelle
  if (oldSlug !== col.slug) {
    store.products.forEach((p) => {
      if (p.collectionSlugs && p.collectionSlugs.includes(oldSlug)) {
        p.collectionSlugs = p.collectionSlugs.map((s) => (s === oldSlug ? col.slug : s));
      }
    });
  }

  saveStoreData(store);
  return { collection: col };
}

export function deleteStoreCollection(idOrSlug: string): boolean {
  const store = getStoreData();
  const trimmed = idOrSlug.trim();
  const decoded = decodeURIComponent(trimmed);
  const target = store.collections.find(
    (c) =>
      c.id === trimmed ||
      c.slug === trimmed ||
      c.id === decoded ||
      c.slug === decoded ||
      c.slug.toLowerCase() === decoded.toLowerCase()
  );
  if (!target) return false;

  const initialLen = store.collections.length;
  store.collections = store.collections.filter((c) => c.id !== target.id && c.slug !== target.slug);
  if (store.collections.length !== initialLen) {
    // Ürünlerde bu koleksiyon varsa temizle
    store.products.forEach((p) => {
      if (p.collectionSlugs) {
        p.collectionSlugs = p.collectionSlugs.filter((s) => s !== target.slug && s !== target.id);
      }
    });
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
  const cleanEmail = (email || "").toLowerCase().trim();
  const cleanPass = (pass || "").trim();

  if (!cleanEmail || !cleanPass) {
    return { error: "Lütfen e-posta adresi ve şifrenizi giriniz." };
  }

  // 1. Acil durum / Vercel Environment Variables / Varsayılan yönetici yetkisi
  const envEmail = (process.env.ADMIN_INITIAL_EMAIL || "").toLowerCase().trim();
  const validAdminEmails = new Set(
    [
      envEmail,
      "humramoda@eyup.com",
      "admin@humrabutik.com",
      "admin@humramoda.com",
      "admin@humramoda.local",
      "destek@humrabutik.com",
    ].filter(Boolean)
  );

  const validPasswords = [
    process.env.ADMIN_PASSWORD,
    process.env.ADMIN_INITIAL_PASSWORD,
    "Eyup.Humra2026",
    "Humra2026!",
  ].filter((p): p is string => Boolean(p && p.length >= 6));

  if (validAdminEmails.has(cleanEmail)) {
    for (const validPass of validPasswords) {
      const a = Buffer.from(cleanPass);
      const b = Buffer.from(validPass);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return {
          user: {
            id: "admin-master",
            email: cleanEmail,
            fullName: "Hümra Butik & Moda Yöneticisi",
            role: "ADMIN",
            isActive: true,
            createdAt: new Date().toISOString(),
          },
        };
      }
    }
  }

  // 2. Veri deposundaki (store.json) yöneticiler ile scrypt doğrulaması
  const store = getStoreData();
  const admin = store.adminUsers.find(
    (u) => u.email.toLowerCase().trim() === cleanEmail && u.isActive
  );

  if (admin && verifyPassword(cleanPass, admin.passwordHash)) {
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

  return { error: "Geçersiz e-posta adresi veya şifre." };
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

