import {
  ProductItem,
  CategoryItem,
  CollectionItem,
  ProductVariantItem,
  VideoLookItem,
} from "../../catalog";
import { CampaignItem, StoreSettings } from "../store";

export type DataStoreDriver = "json" | "postgres";

export interface IStoreDAO {
  readonly driverName: DataStoreDriver;

  // 1. Ürün Sorguları
  getAllProducts(): Promise<ProductItem[]>;
  getProductById(idOrSlug: string): Promise<ProductItem | null>;
  getProductBySlug(slug: string): Promise<ProductItem | null>;
  getFeaturedProducts(limit?: number): Promise<ProductItem[]>;
  getCategoryProducts(categorySlug: string): Promise<ProductItem[]>;

  // 2. Kategori Sorguları
  getAllCategories(): Promise<CategoryItem[]>;
  getCategoryBySlug(slug: string): Promise<CategoryItem | null>;

  // 3. Koleksiyon Sorguları
  getAllCollections(): Promise<CollectionItem[]>;
  getCollectionBySlug(slug: string): Promise<CollectionItem | null>;

  // 4. Varyant Sorguları
  getVariantById(id: string): Promise<ProductVariantItem | null>;
  getVariantBySku(sku: string): Promise<ProductVariantItem | null>;
  getVariantsByProductId(productId: string): Promise<ProductVariantItem[]>;

  // 5. Vitrin ve Ayar Sorguları
  getFeaturedVideos(): Promise<VideoLookItem[]>;
  getStoreSettings(): Promise<StoreSettings>;
  getDiscountCampaigns(): Promise<CampaignItem[]>;
}

export interface DAOFactoryOptions {
  driver?: DataStoreDriver;
  databaseUrl?: string;
  skipIdentityCheck?: boolean; // Yalnızca mock test senaryoları için
}

export interface FieldDifference {
  entityType: string;
  entityId: string;
  field: string;
  jsonValue: any;
  postgresValue: any;
}

export interface DAOParityResult {
  timestamp: string;
  isParityPerfect: boolean;
  totalChecks: number;
  differences: FieldDifference[];
  counts: {
    products: { json: number; postgres: number; match: boolean };
    categories: { json: number; postgres: number; match: boolean };
    collections: { json: number; postgres: number; match: boolean };
    variants: { json: number; postgres: number; match: boolean };
    videos: { json: number; postgres: number; match: boolean };
    campaigns: { json: number; postgres: number; match: boolean };
    settingsKeys: { json: number; postgres: number; match: boolean };
  };
  betulTrenckotCheck: {
    productId: string;
    variantCountMatch: boolean;
    stockMatch: boolean;
    skuMatch: boolean;
    duplicateCombosPreserved: boolean;
    jsonTotalStock: number;
    postgresTotalStock: number;
  };
}

// -------------------------------------------------------------
// FAZ 8.6: POSTGRESQL YAZMA DAO TİPLERİ VE MODELLERİ
// -------------------------------------------------------------

export interface StockDeductItem {
  variantId: string;
  quantity: number;
}

export interface StockDeductResult {
  success: boolean;
  items: Array<{
    variantId: string;
    sku: string;
    deductedQuantity: number;
    remainingStock: number;
  }>;
}

export interface StockRestoreResult {
  success: boolean;
  items: Array<{
    variantId: string;
    sku: string;
    restoredQuantity: number;
    newStock: number;
  }>;
}

export interface CreateOrderCustomerData {
  userId?: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  district: string;
  fullAddress: string;
  postalCode?: string;
  customerNotes?: string;
}

export interface CreateOrderItemData {
  productId: string;
  variantId?: string;
  sku?: string;
  colorName?: string;
  sizeName?: string;
  quantity: number;
}

export interface OrderWriteInput {
  customer: CreateOrderCustomerData;
  items: CreateOrderItemData[];
  campaignCode?: string;
  idempotencyKey?: string;
}

export interface OrderWriteResult {
  success: boolean;
  order?: any;
  error?: string;
  idempotent?: boolean;
}

export interface CancelOrderResult {
  success: boolean;
  order?: any;
  error?: string;
  idempotent?: boolean;
  stockRestored?: boolean;
}

export interface PaymentRecordInput {
  orderId: string;
  merchantOid: string;
  paymentProvider?: string;
  amountKurus: number;
  testMode?: boolean;
  clientIp?: string;
  paytrToken?: string;
  paytrHash?: string;
  callbackPayload?: any;
}

export interface PaymentProcessResult {
  ok: boolean;
  idempotent?: boolean;
  order?: any;
  payment?: any;
  error?: string;
}

// -------------------------------------------------------------
// FAZ 8.7: KALICI İDEMPOTENCY VE İADE / DEĞİŞİM MODELLERİ
// -------------------------------------------------------------

export interface IdempotencyCheckResult {
  exists: boolean;
  status?: string;
  responsePayload?: any;
  orderId?: string;
  requestHash: string;
}

export interface CreateReturnDAOInput {
  orderNumber: string;
  customerEmail?: string;
  customerPhone?: string;
  requestType?: "RETURN" | "CANCEL" | "EXCHANGE";
  exchangeDetails?: any;
  reason: string;
  customerNotes?: string;
  items: Array<{
    orderItemId: string;
    quantity: number;
    reason?: string;
    condition?: string;
  }>;
}

export interface ReturnProcessDecisionInput {
  returnId: string;
  decision: "APPROVED" | "REJECTED";
  restockDecision: "RESTOCKED" | "DAMAGED_NOT_RESTOCKED" | "REJECTED";
  adminNotes?: string;
}

export interface ExchangeProcessDecisionInput {
  returnId: string;
  targetVariantId: string;
  targetQuantity: number;
  decision: "APPROVED" | "REJECTED";
  adminNotes?: string;
}

export interface RefundVerificationInput {
  returnId: string;
  actualRefundVerified: boolean;
  refundTransactionRef: string;
  refundedAmount?: number;
}

export interface ReturnProcessResult {
  success: boolean;
  returnRequest?: any;
  error?: string;
  idempotent?: boolean;
  stockRestored?: boolean;
}



