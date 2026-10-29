import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

export type AuditActionType =
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILED"
  | "AUTH_LOGOUT"
  | "ADMIN_PASSWORD_CHANGED"
  | "RATE_LIMIT_TRIGGERED"
  | "PRODUCT_CREATED"
  | "PRODUCT_UPDATED"
  | "PRODUCT_DELETED"
  | "CATEGORY_CREATED"
  | "CATEGORY_UPDATED"
  | "CATEGORY_DELETED"
  | "COLLECTION_UPDATED"
  | "STORE_SETTINGS_UPDATED"
  | "ORDER_CONFIRMED"
  | "ORDER_CANCELLED"
  | "BACKUP_CREATED"
  | "BACKUP_RESTORED"
  | "BACKUP_RESTORE_FAILED"
  | "UNAUTHORIZED_ACCESS_ATTEMPT"
  | "PAYMENT_INITIATED"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "PAYMENT_CALLBACK_INVALID_HASH"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_IDEMPOTENT_DUPLICATE"
  | "PAYMENT_ORDER_NOT_FOUND"
  | "SHIPPING_SHIPMENT_CREATED"
  | "SHIPPING_TRACKING_UPDATED"
  | "SHIPPING_WEBHOOK_RECEIVED"
  | "SHIPPING_WEBHOOK_INVALID"
  | "SHIPPING_STATUS_CHANGED"
  | "RETURN_REQUEST_CREATED"
  | "RETURN_STATUS_UPDATED"
  | "RETURN_RESTOCK_PROCESSED"
  | "RETURN_REFUND_VERIFIED"
  | "NOTIFICATION_SENT"
  | "NOTIFICATION_FAILED";

export type AuditTargetType =
  | "AUTH"
  | "PRODUCT"
  | "CATEGORY"
  | "COLLECTION"
  | "ORDER"
  | "SETTINGS"
  | "BACKUP"
  | "SECURITY"
  | "PAYMENT"
  | "SHIPPING"
  | "RETURN"
  | "NOTIFICATION";

export interface AdminAuditLogEntry {
  id: string;
  timestamp: string; // UTC ISO 8601
  adminId: string;
  adminEmail: string;
  action: AuditActionType;
  targetType: AuditTargetType;
  targetId?: string;
  result: "SUCCESS" | "FAILED";
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export type SiteActivityType =
  | "PAGE_VIEW"
  | "SEARCH_QUERY"
  | "CATEGORY_FILTER"
  | "PRODUCT_VIEW"
  | "COLOR_SELECT"
  | "SIZE_SELECT"
  | "ADD_TO_CART"
  | "CHECKOUT_VIEW"
  | "PAYMENT_START"
  | "PAYMENT_CALLBACK"
  | "PAYMENT_RESULT"
  | "CART_ERROR"
  | "AUTH_FAILED"
  | "RATE_LIMIT_EVENT"
  | "API_ERROR";

export interface SiteActivityLogEntry {
  id: string;
  timestamp: string; // UTC ISO 8601
  sessionId?: string;
  userId?: string;
  eventType: SiteActivityType;
  path: string;
  query?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

const LOGS_DIR = path.join(process.cwd(), "data", "logs");
const ADMIN_AUDIT_FILE = path.join(LOGS_DIR, "admin-audit.json");
const SITE_ACTIVITY_FILE = path.join(LOGS_DIR, "site-activity.json");

const TMP_LOGS_DIR = path.join(os.tmpdir(), "humramoda_logs");
const TMP_ADMIN_AUDIT_FILE = path.join(TMP_LOGS_DIR, "admin-audit.json");
const TMP_SITE_ACTIVITY_FILE = path.join(TMP_LOGS_DIR, "site-activity.json");

// Bellek içi log deposu
const inMemoryAuditLogs: AdminAuditLogEntry[] = [
  {
    id: "audit-init-1",
    timestamp: new Date().toISOString(),
    adminId: "admin-master",
    adminEmail: "humramoda@eyup.com",
    action: "AUTH_LOGIN_SUCCESS",
    targetType: "AUTH",
    result: "SUCCESS",
    ipAddress: "127.0.0.1",
    details: { message: "Hümra Butik yönetim oturumu başlatıldı." },
  },
  {
    id: "audit-init-2",
    timestamp: new Date(Date.now() - 60000).toISOString(),
    adminId: "admin-master",
    adminEmail: "humramoda@eyup.com",
    action: "STORE_SETTINGS_UPDATED",
    targetType: "SETTINGS",
    result: "SUCCESS",
    ipAddress: "127.0.0.1",
    details: { storeName: "Hümra Butik & Moda", domain: "humrabutik.com" },
  },
];

const inMemorySiteLogs: SiteActivityLogEntry[] = [
  {
    id: "act-init-1",
    timestamp: new Date().toISOString(),
    eventType: "PAGE_VIEW",
    path: "/",
    ipAddress: "127.0.0.1",
    details: { referrer: "direct" },
  },
  {
    id: "act-init-2",
    timestamp: new Date(Date.now() - 30000).toISOString(),
    eventType: "PAGE_VIEW",
    path: "/urunler",
    ipAddress: "127.0.0.1",
    details: { category: "all" },
  },
  {
    id: "act-init-3",
    timestamp: new Date(Date.now() - 15000).toISOString(),
    eventType: "PRODUCT_VIEW",
    path: "/urun/qapitone-garnili-scuba-ikili-takim",
    ipAddress: "127.0.0.1",
    details: { productId: "prod-1" },
  },
];

function ensureLogsDir() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  } catch {
    // Vercel serverless salt-okunur dosya sistemi
  }

  try {
    if (!fs.existsSync(TMP_LOGS_DIR)) {
      fs.mkdirSync(TMP_LOGS_DIR, { recursive: true });
    }
  } catch {
    // ignore
  }
}

/**
 * Hassas verileri (parolalar, tokenlar, kart verileri, sırlar) temizler (redaction).
 */
export function sanitizeLogData<T>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;

  const sensitiveKeys = new Set([
    "password",
    "passwordhash",
    "token",
    "sessiontoken",
    "authsecret",
    "secret",
    "cookie",
    "authorization",
    "cardnumber",
    "cvv",
    "paytrtoken",
    "paytrhash",
    "apikey",
    "shippingapikey",
    "carriersecret",
    "webhooksecret",
    "merchantkey",
    "merchantsalt",
  ]);

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeLogData(item)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      sanitized[key] = "[GİZLENDİ / REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      sanitized[key] = sanitizeLogData(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized as T;
}

/**
 * Yönetim paneli denetim kaydı oluşturur.
 */
export function logAdminAudit(entry: Omit<AdminAuditLogEntry, "id" | "timestamp">): AdminAuditLogEntry {
  ensureLogsDir();

  const sanitizedDetails = entry.details ? sanitizeLogData(entry.details) : undefined;

  const record: AdminAuditLogEntry = {
    id: `audit-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    timestamp: new Date().toISOString(),
    adminId: entry.adminId,
    adminEmail: entry.adminEmail,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    result: entry.result,
    ipAddress: entry.ipAddress || "127.0.0.1",
    userAgent: entry.userAgent ? entry.userAgent.slice(0, 200) : undefined,
    correlationId: entry.correlationId || crypto.randomBytes(6).toString("hex"),
    details: sanitizedDetails,
  };

  // 1. Bellek içi listeye ekle
  inMemoryAuditLogs.unshift(record);
  if (inMemoryAuditLogs.length > 5000) {
    inMemoryAuditLogs.pop();
  }

  // 2. Global mağaza deposuna ekle (Vercel sunucusuz / PostgreSQL snapshot kalıcılığı)
  try {
    const state = (globalThis as unknown as { __humraStoreState?: { inMemoryStore?: { auditLogs?: AdminAuditLogEntry[] } } }).__humraStoreState;
    if (state?.inMemoryStore) {
      state.inMemoryStore.auditLogs = state.inMemoryStore.auditLogs || [];
      state.inMemoryStore.auditLogs.unshift(record);
      if (state.inMemoryStore.auditLogs.length > 500) {
        state.inMemoryStore.auditLogs = state.inMemoryStore.auditLogs.slice(0, 500);
      }
    }
  } catch {}

  // 3. Diske / /tmp dizinine yazmayı dene
  try {
    let list: AdminAuditLogEntry[] = [];
    if (fs.existsSync(ADMIN_AUDIT_FILE)) {
      const raw = fs.readFileSync(ADMIN_AUDIT_FILE, "utf-8");
      list = JSON.parse(raw);
    }
    list.unshift(record);
    if (list.length > 5000) list = list.slice(0, 5000);
    fs.writeFileSync(ADMIN_AUDIT_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch {
    // Vercel serverless ortamında /tmp dizinine yaz
    try {
      let list: AdminAuditLogEntry[] = [];
      if (fs.existsSync(TMP_ADMIN_AUDIT_FILE)) {
        const raw = fs.readFileSync(TMP_ADMIN_AUDIT_FILE, "utf-8");
        list = JSON.parse(raw);
      }
      list.unshift(record);
      if (list.length > 5000) list = list.slice(0, 5000);
      fs.writeFileSync(TMP_ADMIN_AUDIT_FILE, JSON.stringify(list, null, 2), "utf-8");
    } catch {}
  }

  return record;
}

/**
 * Müşteri vitrini / site aktivite kaydı oluşturur.
 */
export function logSiteActivity(entry: Omit<SiteActivityLogEntry, "id" | "timestamp">): SiteActivityLogEntry {
  ensureLogsDir();

  const sanitizedDetails = entry.details ? sanitizeLogData(entry.details) : undefined;
  const sanitizedQuery = entry.query ? entry.query.slice(0, 150) : undefined;

  const record: SiteActivityLogEntry = {
    id: `act-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    timestamp: new Date().toISOString(),
    sessionId: entry.sessionId,
    userId: entry.userId,
    eventType: entry.eventType,
    path: entry.path,
    query: sanitizedQuery,
    details: sanitizedDetails,
    ipAddress: entry.ipAddress || "127.0.0.1",
    userAgent: entry.userAgent ? entry.userAgent.slice(0, 200) : undefined,
  };

  // 1. Bellek içi listeye ekle
  inMemorySiteLogs.unshift(record);
  if (inMemorySiteLogs.length > 10000) {
    inMemorySiteLogs.pop();
  }

  // 2. Diske / /tmp dizinine yazmayı dene
  try {
    let list: SiteActivityLogEntry[] = [];
    if (fs.existsSync(SITE_ACTIVITY_FILE)) {
      const raw = fs.readFileSync(SITE_ACTIVITY_FILE, "utf-8");
      list = JSON.parse(raw);
    }
    list.unshift(record);
    if (list.length > 10000) list = list.slice(0, 10000);
    fs.writeFileSync(SITE_ACTIVITY_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch {
    try {
      let list: SiteActivityLogEntry[] = [];
      if (fs.existsSync(TMP_SITE_ACTIVITY_FILE)) {
        const raw = fs.readFileSync(TMP_SITE_ACTIVITY_FILE, "utf-8");
        list = JSON.parse(raw);
      }
      list.unshift(record);
      if (list.length > 10000) list = list.slice(0, 10000);
      fs.writeFileSync(TMP_SITE_ACTIVITY_FILE, JSON.stringify(list, null, 2), "utf-8");
    } catch {}
  }

  return record;
}

/**
 * Yönetici denetim loglarını filtreler ve sayfalar.
 */
export function getAdminAuditLogs(filters?: {
  action?: string;
  adminEmail?: string;
  ipAddress?: string;
  result?: "SUCCESS" | "FAILED";
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}): { logs: AdminAuditLogEntry[]; total: number; page: number; totalPages: number } {
  ensureLogsDir();
  const map = new Map<string, AdminAuditLogEntry>();

  // 1. Dosyadan oku (varsa)
  try {
    if (fs.existsSync(ADMIN_AUDIT_FILE)) {
      const raw = fs.readFileSync(ADMIN_AUDIT_FILE, "utf-8");
      const list: AdminAuditLogEntry[] = JSON.parse(raw);
      list.forEach((l) => map.set(l.id, l));
    }
  } catch {}

  // 2. /tmp dizininden oku (varsa)
  try {
    if (fs.existsSync(TMP_ADMIN_AUDIT_FILE)) {
      const raw = fs.readFileSync(TMP_ADMIN_AUDIT_FILE, "utf-8");
      const list: AdminAuditLogEntry[] = JSON.parse(raw);
      list.forEach((l) => map.set(l.id, l));
    }
  } catch {}

  // 3. Bellek içi logları ekle
  inMemoryAuditLogs.forEach((l) => {
    if (!map.has(l.id)) map.set(l.id, l);
  });

  // 4. Global mağaza deposundan (kalıcı snapshot) logları ekle
  try {
    const state = (globalThis as unknown as { __humraStoreState?: { inMemoryStore?: { auditLogs?: AdminAuditLogEntry[] } } }).__humraStoreState;
    const storeLogs = state?.inMemoryStore?.auditLogs || [];
    storeLogs.forEach((l) => {
      if (!map.has(l.id)) map.set(l.id, l);
    });
  } catch {}

  let list = Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (filters) {
    if (filters.action && filters.action !== "ALL") {
      list = list.filter((l) => l.action === filters.action);
    }
    if (filters.adminEmail) {
      const q = filters.adminEmail.toLowerCase();
      list = list.filter((l) => (l.adminEmail || "").toLowerCase().includes(q));
    }
    if (filters.ipAddress) {
      list = list.filter((l) => l.ipAddress?.includes(filters.ipAddress!));
    }
    if (filters.result && filters.result !== ("ALL" as unknown)) {
      list = list.filter((l) => l.result === filters.result);
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      list = list.filter((l) => new Date(l.timestamp).getTime() >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      list = list.filter((l) => new Date(l.timestamp).getTime() <= end);
    }
  }

  const page = Math.max(1, filters?.page || 1);
  const limit = Math.min(100, Math.max(10, filters?.limit || 25));
  const total = list.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIdx = (page - 1) * limit;
  const paged = list.slice(startIdx, startIdx + limit);

  return { logs: paged, total, page, totalPages };
}

/**
 * Vitrin / site aktivitelerini filtreler ve sayfalar.
 */
export function getSiteActivityLogs(filters?: {
  eventType?: string;
  path?: string;
  ipAddress?: string;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}): { logs: SiteActivityLogEntry[]; total: number; page: number; totalPages: number } {
  ensureLogsDir();
  const map = new Map<string, SiteActivityLogEntry>();

  // 1. Dosyadan oku (varsa)
  try {
    if (fs.existsSync(SITE_ACTIVITY_FILE)) {
      const raw = fs.readFileSync(SITE_ACTIVITY_FILE, "utf-8");
      const list: SiteActivityLogEntry[] = JSON.parse(raw);
      list.forEach((l) => map.set(l.id, l));
    }
  } catch {}

  // 2. /tmp dizininden oku (varsa)
  try {
    if (fs.existsSync(TMP_SITE_ACTIVITY_FILE)) {
      const raw = fs.readFileSync(TMP_SITE_ACTIVITY_FILE, "utf-8");
      const list: SiteActivityLogEntry[] = JSON.parse(raw);
      list.forEach((l) => map.set(l.id, l));
    }
  } catch {}

  // 3. Bellek içi logları ekle
  inMemorySiteLogs.forEach((l) => {
    if (!map.has(l.id)) map.set(l.id, l);
  });

  let list = Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (filters) {
    if (filters.eventType && filters.eventType !== "ALL") {
      list = list.filter((l) => l.eventType === filters.eventType);
    }
    if (filters.path) {
      const p = filters.path.toLowerCase();
      list = list.filter((l) => l.path.toLowerCase().includes(p));
    }
    if (filters.ipAddress) {
      list = list.filter((l) => l.ipAddress?.includes(filters.ipAddress!));
    }
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      list = list.filter(
        (l) =>
          (l.query && l.query.toLowerCase().includes(q)) ||
          (l.path && l.path.toLowerCase().includes(q))
      );
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      list = list.filter((l) => new Date(l.timestamp).getTime() >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      list = list.filter((l) => new Date(l.timestamp).getTime() <= end);
    }
  }

  const page = Math.max(1, filters?.page || 1);
  const limit = Math.min(100, Math.max(10, filters?.limit || 25));
  const total = list.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIdx = (page - 1) * limit;
  const paged = list.slice(startIdx, startIdx + limit);

  return { logs: paged, total, page, totalPages };
}
