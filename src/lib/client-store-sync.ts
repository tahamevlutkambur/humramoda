"use client";

import {
  ProductItem,
  CategoryItem,
  CollectionItem,
  PRODUCTS,
  CATEGORIES,
  COLLECTIONS,
} from "@/lib/catalog";

export interface ClientStoreSnapshot {
  updatedAt: number;
  products: ProductItem[];
  categories: CategoryItem[];
  collections: CollectionItem[];
}

const STORAGE_KEY = "humra_store_snapshot_v3";
const IDB_NAME = "humra_store_db";
const IDB_STORE = "snapshots";

let memorySnapshot: ClientStoreSnapshot | null = null;
let idbCachedSnapshot: ClientStoreSnapshot | null = null;
let inFlightPromise: Promise<ClientStoreSnapshot> | null = null;
let lastNetworkFetchTime = 0;
const listeners = new Set<(snapshot: ClientStoreSnapshot) => void>();

function notifyListeners(snapshot: ClientStoreSnapshot) {
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // ignore listener errors
    }
  });
}

function mergeTwoProductLists(
  primaryList: ProductItem[],
  secondaryList: ProductItem[],
  options?: {
    editedProductId?: string;
    deletedProductId?: string;
    explicitEmptyMediaProductId?: string;
  }
): ProductItem[] {
  const secondaryById = new Map<string, ProductItem>();
  const secondaryBySlug = new Map<string, ProductItem>();
  for (const sp of secondaryList || []) {
    if (sp.id) secondaryById.set(sp.id, sp);
    if (sp.slug) secondaryBySlug.set(sp.slug.toLowerCase(), sp);
  }

  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();

  const merged: ProductItem[] = (primaryList || []).map((p) => {
    if (p.id) seenIds.add(p.id);
    if (p.slug) seenSlugs.add(p.slug.toLowerCase());

    const prev =
      secondaryById.get(p.id) ||
      (p.slug ? secondaryBySlug.get(p.slug.toLowerCase()) : undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isTruncated = Boolean((p as any)._mediaTruncated);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanP: ProductItem = { ...p };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (cleanP as any)._mediaTruncated;

    const isExplicitlyCleared =
      options?.explicitEmptyMediaProductId &&
      (p.id === options.explicitEmptyMediaProductId ||
        p.slug === options.explicitEmptyMediaProductId);

    if (!isExplicitlyCleared && prev && prev.media && prev.media.length > 0) {
      const currentMediaLen = cleanP.media?.length || 0;
      // Preserve secondary media if primary has 0 media, or was truncated, or wasn't the edited product and had fewer media
      if (
        currentMediaLen === 0 ||
        isTruncated ||
        (p.id !== options?.editedProductId &&
          p.slug !== options?.editedProductId &&
          prev.media.length > currentMediaLen)
      ) {
        return { ...cleanP, media: prev.media };
      }
    }

    return cleanP;
  });

  for (const leftover of secondaryList || []) {
    const isDeleted =
      options?.deletedProductId &&
      (leftover.id === options.deletedProductId ||
        leftover.slug === options.deletedProductId);
    if (isDeleted) continue;

    const alreadyHas =
      (leftover.id && seenIds.has(leftover.id)) ||
      (leftover.slug && seenSlugs.has(leftover.slug.toLowerCase()));
    if (!alreadyHas) {
      merged.push(leftover);
      if (leftover.id) seenIds.add(leftover.id);
      if (leftover.slug) seenSlugs.add(leftover.slug.toLowerCase());
    }
  }

  return merged;
}

function mergeTwoCategoryLists(
  primaryList: CategoryItem[],
  secondaryList: CategoryItem[]
): CategoryItem[] {
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const merged: CategoryItem[] = [];

  for (const c of primaryList || []) {
    if (c.id) seenIds.add(c.id);
    if (c.slug) seenSlugs.add(c.slug.toLowerCase());
    merged.push(c);
  }

  for (const c of secondaryList || []) {
    const hasId = c.id && seenIds.has(c.id);
    const hasSlug = c.slug && seenSlugs.has(c.slug.toLowerCase());
    if (!hasId && !hasSlug) {
      merged.push(c);
      if (c.id) seenIds.add(c.id);
      if (c.slug) seenSlugs.add(c.slug.toLowerCase());
    }
  }

  return merged;
}

// IndexedDB helper for large catalogs (base64 images > 5MB)
export function saveToIndexedDB(snapshot: ClientStoreSnapshot): Promise<void> {
  idbCachedSnapshot = snapshot;
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).put(snapshot, "main");
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function loadFromIndexedDB(): Promise<ClientStoreSnapshot | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, "readonly");
          const getReq = tx.objectStore(IDB_STORE).get("main");
          getReq.onsuccess = () => {
            const res = (getReq.result as ClientStoreSnapshot) || null;
            if (res) idbCachedSnapshot = res;
            resolve(res);
          };
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeSnapshotToLocalStorageSafe(snapshot: ClientStoreSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return;
  } catch {
    // QuotaExceededError (localStorage UTF-16 ~2.5M chars limit):
    // Store a fitted version in localStorage that keeps at least 1 cover image per product
    // and marks overflow products with _mediaTruncated: true so IndexedDB restores full galleries.
  }

  try {
    const MAX_LS_CHARS = 1_900_000;
    let usedChars = 30_000;
    const fittedProducts: ProductItem[] = [];

    for (const prod of snapshot.products || []) {
      // Lightweight URLs (/uploads/... or remote) are preserved 100% without truncation
      const hasLargeBase64 = prod.media?.some((m) => (m.url && m.url.startsWith("data:") && m.url.length > 5000));
      const fullStr = JSON.stringify(prod);

      if (!hasLargeBase64 && (usedChars + fullStr.length <= MAX_LS_CHARS)) {
        fittedProducts.push(prod);
        usedChars += fullStr.length;
      } else if (!hasLargeBase64) {
        // Preserves all /uploads/ references without wiping
        fittedProducts.push(prod);
      } else {
        const coverOnly = prod.media?.[0] ? [prod.media[0]] : [];
        const singleProd = {
          ...prod,
          media: coverOnly,
          ...(prod.media && prod.media.length > coverOnly.length
            ? { _mediaTruncated: true }
            : {}),
        } as ProductItem;
        fittedProducts.push(singleProd);
      }
    }

    const lsSnap: ClientStoreSnapshot = {
      updatedAt: snapshot.updatedAt,
      categories: snapshot.categories,
      collections: snapshot.collections,
      products: fittedProducts,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lsSnap));
  } catch {
    // ignore if localStorage is completely disabled
  }
}

export function getClientStoreSnapshot(): ClientStoreSnapshot | null {
  if (memorySnapshot) {
    return memorySnapshot;
  }
  if (idbCachedSnapshot) {
    memorySnapshot = idbCachedSnapshot;
    return memorySnapshot;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ClientStoreSnapshot>;
    if (parsed && typeof parsed === "object") {
      memorySnapshot = {
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
        products: Array.isArray(parsed.products) ? parsed.products : PRODUCTS,
        categories:
          Array.isArray(parsed.categories) && parsed.categories.length > 0
            ? parsed.categories
            : CATEGORIES,
        collections:
          Array.isArray(parsed.collections) && parsed.collections.length > 0
            ? parsed.collections
            : COLLECTIONS,
      };
      return memorySnapshot;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export function saveClientStoreSnapshot(
  partial: Partial<ClientStoreSnapshot> & {
    bumpVersion?: boolean;
    editedProductId?: string;
    deletedProductId?: string;
    explicitEmptyMediaProductId?: string;
  }
): ClientStoreSnapshot {
  const lsSnap = getClientStoreSnapshot();
  const baseExisting =
    idbCachedSnapshot && lsSnap
      ? {
          updatedAt: Math.max(idbCachedSnapshot.updatedAt || 0, lsSnap.updatedAt || 0),
          products: mergeTwoProductLists(idbCachedSnapshot.products, lsSnap.products),
          categories:
            idbCachedSnapshot.categories?.length > 0
              ? idbCachedSnapshot.categories
              : lsSnap.categories,
          collections:
            idbCachedSnapshot.collections?.length > 0
              ? idbCachedSnapshot.collections
              : lsSnap.collections,
        }
      : idbCachedSnapshot || lsSnap;

  const nextUpdatedAt =
    typeof partial.updatedAt === "number" && partial.updatedAt > 0
      ? Math.max(partial.updatedAt, baseExisting?.updatedAt || 0)
      : partial.bumpVersion
      ? Math.max(Date.now(), (baseExisting?.updatedAt || 0) + 1)
      : Math.max(Date.now(), (baseExisting?.updatedAt || 0) + 1);

  let finalProducts: ProductItem[] = baseExisting?.products || PRODUCTS;
  if (Array.isArray(partial.products)) {
    finalProducts = mergeTwoProductLists(
      partial.products,
      baseExisting?.products || [],
      {
        editedProductId: partial.editedProductId,
        deletedProductId: partial.deletedProductId,
        explicitEmptyMediaProductId: partial.explicitEmptyMediaProductId,
      }
    );
  }

  const nextSnapshot: ClientStoreSnapshot = {
    updatedAt: nextUpdatedAt,
    products: finalProducts,
    categories:
      Array.isArray(partial.categories) && partial.categories.length > 0
        ? partial.categories
        : baseExisting?.categories || CATEGORIES,
    collections:
      Array.isArray(partial.collections) && partial.collections.length > 0
        ? partial.collections
        : baseExisting?.collections || COLLECTIONS,
  };

  memorySnapshot = nextSnapshot;
  idbCachedSnapshot = nextSnapshot;

  if (typeof window !== "undefined") {
    writeSnapshotToLocalStorageSafe(nextSnapshot);
    void saveToIndexedDB(nextSnapshot);
  }

  notifyListeners(nextSnapshot);
  return nextSnapshot;
}

export function subscribeStoreChanges(
  listener: (snapshot: ClientStoreSnapshot) => void
): () => void {
  listeners.add(listener);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue) as ClientStoreSnapshot;
        if (parsed && (!memorySnapshot || parsed.updatedAt >= memorySnapshot.updatedAt)) {
          memorySnapshot = parsed;
          listener(parsed);
        }
      } catch {
        // ignore
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

/**
 * Pushes a full client snapshot to the server safely below Vercel's 4.5MB limit.
 * If any product's media was truncated in the initial compact snapshot, sends follow-up
 * per-product media sync requests so the server has 100% of all product photos.
 */
export async function syncSnapshotToServerInChunks(
  snapshot: ClientStoreSnapshot
): Promise<void> {
  try {
    const compactSync = getCompactSnapshotForRequest(snapshot);
    await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _entity: "sync_snapshot",
        ...compactSync,
      }),
    });

    // Send full media for any product whose media was truncated in the initial chunk
    for (const compactProd of compactSync.products) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((compactProd as any)._mediaTruncated) {
        const fullProd = snapshot.products.find(
          (p) => p.id === compactProd.id || p.slug === compactProd.slug
        );
        if (fullProd && fullProd.media && fullProd.media.length > 0) {
          const cleanMedia = fullProd.media.map((m) => ({
            ...m,
            thumbnailUrl: m.url?.startsWith("data:") ? "" : m.thumbnailUrl || m.url,
          }));
          await fetch("/api/admin/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              _entity: "sync_product_media",
              id: fullProd.id,
              slug: fullProd.slug,
              updatedAt: snapshot.updatedAt,
              media: cleanMedia,
            }),
          }).catch(() => {});
        }
      }
    }
  } catch {
    // ignore background sync errors
  }
}

/**
 * Single-flight deduplicated store fetcher.
 * Prevents multiple components on the same page from firing concurrent requests
 * that would spawn separate cold serverless Lambda containers on Vercel.
 */
export async function fetchSharedStore(force = false): Promise<ClientStoreSnapshot> {
  // Bellek içi önbellek: Son 5 saniye içinde çekildiyse aynı render döngüsünde mükerrer çağrıyı önle
  if (!force && memorySnapshot && Date.now() - lastNetworkFetchTime < 5_000) {
    return memorySnapshot;
  }

  if (inFlightPromise && !force) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    let localSnap = getClientStoreSnapshot();
    const idbSnap = await loadFromIndexedDB();
    if (idbSnap) {
      if (!localSnap) {
        localSnap = idbSnap;
      } else {
        const primary =
          (idbSnap.updatedAt || 0) >= (localSnap.updatedAt || 0) ? idbSnap : localSnap;
        const secondary = primary === idbSnap ? localSnap : idbSnap;
        localSnap = {
          updatedAt: Math.max(idbSnap.updatedAt || 0, localSnap.updatedAt || 0),
          products: mergeTwoProductLists(primary.products, secondary.products),
          categories:
            primary.categories?.length > 0 ? primary.categories : secondary.categories,
          collections:
            primary.collections?.length > 0 ? primary.collections : secondary.collections,
        };
      }
      memorySnapshot = localSnap;
      notifyListeners(localSnap);
    }

    try {
      let res = await fetch("/api/catalog");

      if (!res.ok) {
        res = await fetch("/api/admin/products?public=1");
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      lastNetworkFetchTime = Date.now();
      const data = await res.json();
      const serverTime = typeof data.updatedAt === "number" ? data.updatedAt : Date.now();
      const serverProducts: ProductItem[] = Array.isArray(data.products) ? data.products : [];

      let finalProducts: ProductItem[];
      if (serverProducts.length > 0) {
        // Sunucu güncel ürün listesini başarıyla döndürdü - sunucu ana kaynaktır!
        // Eğer yerel bellekte görseller varsa görselleri koruyarak birleştir
        finalProducts = localSnap?.products?.length
          ? mergeTwoProductLists(serverProducts, localSnap.products)
          : serverProducts;
      } else {
        finalProducts = localSnap?.products || PRODUCTS;
      }

      let finalCategories: CategoryItem[];
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        finalCategories = localSnap?.categories?.length
          ? mergeTwoCategoryLists(data.categories, localSnap.categories)
          : data.categories;
      } else {
        finalCategories = localSnap?.categories || CATEGORIES;
      }

      const nextSnapshot: ClientStoreSnapshot = {
        updatedAt: serverTime,
        products: finalProducts,
        categories: finalCategories,
        collections:
          Array.isArray(data.collections) && data.collections.length > 0
            ? data.collections
            : localSnap?.collections || COLLECTIONS,
      };

      memorySnapshot = nextSnapshot;
      idbCachedSnapshot = nextSnapshot;
      writeSnapshotToLocalStorageSafe(nextSnapshot);
      void saveToIndexedDB(nextSnapshot);
      notifyListeners(nextSnapshot);
      return nextSnapshot;
    } catch {
      if (localSnap) {
        notifyListeners(localSnap);
        return localSnap;
      }
      const fallback: ClientStoreSnapshot = {
        updatedAt: 0,
        products: PRODUCTS,
        categories: CATEGORIES,
        collections: COLLECTIONS,
      };
      memorySnapshot = fallback;
      notifyListeners(fallback);
      writeSnapshotToLocalStorageSafe(fallback);
      return fallback;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

/**
 * Ensures any `_snapshot` sent in POST/PUT/DELETE stays well below Vercel's 4.5MB Serverless body limit
 * while NEVER dropping any product from the catalog list.
 */
export function getCompactSnapshotForRequest(
  snap?: ClientStoreSnapshot | null,
  excludeMediaForProductId?: string
): ClientStoreSnapshot {
  const source = snap ||
    getClientStoreSnapshot() || {
      updatedAt: Date.now(),
      products: [],
      categories: CATEGORIES,
      collections: COLLECTIONS,
    };

  const MAX_SNAPSHOT_CHARS = 2_600_000; // ~2.6 MB safe ceiling for _snapshot (holds ~45+ WebP photos)
  const keptProducts: ProductItem[] = [];
  let runningChars = 40_000;

  for (const prod of source.products || []) {
    const isTargetBeingEdited =
      excludeMediaForProductId &&
      (prod.id === excludeMediaForProductId ||
        prod.slug === excludeMediaForProductId ||
        prod.id.toLowerCase() === excludeMediaForProductId.toLowerCase() ||
        prod.slug.toLowerCase() === excludeMediaForProductId.toLowerCase());

    if (isTargetBeingEdited) {
      // The product being edited already sends its full `media` in `payload.media`
      const stubProd = {
        ...prod,
        media: [],
        _mediaTruncated: true,
      } as ProductItem;
      keptProducts.push(stubProd);
      runningChars += JSON.stringify(stubProd).length;
      continue;
    }

    const dedupedProd: ProductItem = {
      ...prod,
      media: (prod.media || []).map((m) => ({
        ...m,
        thumbnailUrl: m.url?.startsWith("data:") ? "" : m.thumbnailUrl || m.url,
      })),
    };

    const fullLen = JSON.stringify(dedupedProd).length;
    if (runningChars + fullLen <= MAX_SNAPSHOT_CHARS) {
      keptProducts.push(dedupedProd);
      runningChars += fullLen;
    } else {
      const firstMedia = dedupedProd.media?.[0] ? [dedupedProd.media[0]] : [];
      const singleImgProd = {
        ...dedupedProd,
        media: firstMedia,
        ...(dedupedProd.media.length > firstMedia.length ? { _mediaTruncated: true } : {}),
      } as ProductItem;
      const singleLen = JSON.stringify(singleImgProd).length;
      if (runningChars + singleLen <= MAX_SNAPSHOT_CHARS) {
        keptProducts.push(singleImgProd);
        runningChars += singleLen;
      } else {
        // Always keep the product record (never drop any product!)
        const metadataOnlyProd = {
          ...dedupedProd,
          media: [],
          ...(dedupedProd.media.length > 0 ? { _mediaTruncated: true } : {}),
        } as ProductItem;
        keptProducts.push(metadataOnlyProd);
        runningChars += JSON.stringify(metadataOnlyProd).length;
      }
    }
  }

  return {
    updatedAt: source.updatedAt || Date.now(),
    categories: source.categories || CATEGORIES,
    collections: source.collections || COLLECTIONS,
    products: keptProducts,
  };
}

/**
 * Recompresses existing large `data:image/...` strings in a product's media array
 * so products with many colors/photos never exceed Vercel's 4.5MB limit when saving.
 */
export async function optimizeDataUrlIfLarge(url: string): Promise<string> {
  if (typeof window === "undefined") return url;
  if (!url || !url.startsWith("data:image/") || url.length < 115_000) {
    return url;
  }

  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      try {
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 1066;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(url);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/webp", 0.76);
        resolve(compressed && compressed.length < url.length ? compressed : url);
      } catch {
        resolve(url);
      }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

/**
 * Safely parses JSON from a fetch Response without throwing "Unexpected token 'R', Request En..."
 * if a serverless gateway returns plain-text 413 / 502 / 504.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeParseJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 413 || text.includes("Request Entity Too Large")) {
      return {
        error:
          "Yüklenen görsel veya veri boyutu sunucu sınırını (4.5 MB) aştı. Görseller otomatik optimize edildi, lütfen tekrar deneyin.",
      };
    }
    return {
      error: `Sunucu yanıtı okunamadı (HTTP ${res.status}). Lütfen tekrar deneyin.`,
    };
  }
}

/**
 * Client-side image compressor using HTML5 Canvas.
 * Converts large phone/camera photos (5MB-15MB) into crisp ~100KB WebP images BEFORE uploading,
 * completely preventing Vercel's 4.5MB "Request Entity Too Large" (HTTP 413) error.
 */
export async function compressImageBeforeUpload(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  return new Promise((resolve) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const MAX_WIDTH = 960;
        const MAX_HEIGHT = 1280;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, "");
            const compressedFile = new File([blob], `${baseName}.webp`, {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/webp",
          0.82
        );
      } catch {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

