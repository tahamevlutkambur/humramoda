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
let inFlightPromise: Promise<ClientStoreSnapshot> | null = null;
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

// IndexedDB helper for large catalogs (base64 images > 5MB)
function saveToIndexedDB(snapshot: ClientStoreSnapshot): void {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
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
      } catch {
        // ignore
      }
    };
  } catch {
    // ignore
  }
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
            resolve((getReq.result as ClientStoreSnapshot) || null);
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

export function getClientStoreSnapshot(): ClientStoreSnapshot | null {
  if (memorySnapshot) {
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
  }
): ClientStoreSnapshot {
  const existing = getClientStoreSnapshot();
  const nextUpdatedAt =
    partial.bumpVersion
      ? Math.max(Date.now(), (existing?.updatedAt || 0) + 1)
      : typeof partial.updatedAt === "number" && partial.updatedAt > 0
      ? partial.updatedAt
      : Math.max(Date.now(), (existing?.updatedAt || 0) + 1);

  let finalProducts: ProductItem[] = existing?.products || PRODUCTS;
  if (Array.isArray(partial.products)) {
    const existingById = new Map((existing?.products || []).map((p) => [p.id, p]));
    const merged: ProductItem[] = partial.products.map((p) => {
      const prev = existingById.get(p.id);
      existingById.delete(p.id);
      // If this wasn't the product being edited and the local copy had more media, preserve the local media
      if (
        prev &&
        p.id !== partial.editedProductId &&
        prev.media &&
        prev.media.length > (p.media?.length || 0)
      ) {
        return { ...p, media: prev.media };
      }
      return p;
    });
    // Keep any local products that weren't in a cold server's response (unless explicitly deleted)
    for (const [id, leftover] of existingById.entries()) {
      if (id !== partial.deletedProductId && leftover.slug !== partial.deletedProductId) {
        merged.push(leftover);
      }
    }
    finalProducts = merged;
  }

  const nextSnapshot: ClientStoreSnapshot = {
    updatedAt: nextUpdatedAt,
    products: finalProducts,
    categories:
      Array.isArray(partial.categories) && partial.categories.length > 0
        ? partial.categories
        : existing?.categories || CATEGORIES,
    collections:
      Array.isArray(partial.collections) && partial.collections.length > 0
        ? partial.collections
        : existing?.collections || COLLECTIONS,
  };

  memorySnapshot = nextSnapshot;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSnapshot));
    } catch {
      // If localStorage quota is exceeded due to many base64 images, IndexedDB still persists it
    }
    saveToIndexedDB(nextSnapshot);
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
 * Single-flight deduplicated store fetcher.
 * Prevents multiple components on the same page from firing concurrent requests
 * that would spawn separate cold serverless Lambda containers on Vercel.
 */
export async function fetchSharedStore(force = false): Promise<ClientStoreSnapshot> {
  if (inFlightPromise && !force) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    let localSnap = getClientStoreSnapshot();
    const idbSnap = await loadFromIndexedDB();
    if (idbSnap && (!localSnap || idbSnap.updatedAt > localSnap.updatedAt)) {
      localSnap = idbSnap;
      memorySnapshot = idbSnap;
    }

    try {
      const res = await fetch("/api/admin/products?public=1", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const serverTime = typeof data.updatedAt === "number" ? data.updatedAt : 0;
      const localTime = localSnap?.updatedAt || 0;

      // If local snapshot is strictly newer than the server response (e.g. hit a cold Lambda instance),
      // keep the local snapshot so the UI NEVER flickers or loses data, and push the snapshot to warm up the server!
      if (localSnap && localTime > serverTime) {
        notifyListeners(localSnap);
        const compactSync = getCompactSnapshotForRequest(localSnap);
        fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            _entity: "sync_snapshot",
            ...compactSync,
          }),
        }).catch(() => {});
        return localSnap;
      }

      const nextSnapshot: ClientStoreSnapshot = {
        updatedAt: serverTime,
        products: Array.isArray(data.products) ? data.products : localSnap?.products || PRODUCTS,
        categories:
          Array.isArray(data.categories) && data.categories.length > 0
            ? data.categories
            : localSnap?.categories || CATEGORIES,
        collections:
          Array.isArray(data.collections) && data.collections.length > 0
            ? data.collections
            : localSnap?.collections || COLLECTIONS,
      };

      if (serverTime > 0) {
        saveClientStoreSnapshot(nextSnapshot);
      } else {
        memorySnapshot = nextSnapshot;
        notifyListeners(nextSnapshot);
      }

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

  const MAX_SNAPSHOT_CHARS = 950_000; // ~950 KB safe ceiling for _snapshot
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
      const stubProd: ProductItem = { ...prod, media: [] };
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
      const singleImgProd: ProductItem = { ...dedupedProd, media: firstMedia };
      const singleLen = JSON.stringify(singleImgProd).length;
      if (runningChars + singleLen <= MAX_SNAPSHOT_CHARS) {
        keptProducts.push(singleImgProd);
        runningChars += singleLen;
      } else {
        // Always keep the product record (never drop any product!)
        const metadataOnlyProd: ProductItem = { ...dedupedProd, media: [] };
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

