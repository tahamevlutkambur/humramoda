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
  partial: Partial<ClientStoreSnapshot> & { bumpVersion?: boolean }
): ClientStoreSnapshot {
  const existing = getClientStoreSnapshot();
  const nextUpdatedAt =
    partial.bumpVersion
      ? Math.max(Date.now(), (existing?.updatedAt || 0) + 1)
      : typeof partial.updatedAt === "number" && partial.updatedAt > 0
      ? partial.updatedAt
      : Math.max(Date.now(), (existing?.updatedAt || 0) + 1);

  const nextSnapshot: ClientStoreSnapshot = {
    updatedAt: nextUpdatedAt,
    products: Array.isArray(partial.products)
      ? partial.products
      : existing?.products || PRODUCTS,
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
        fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            _entity: "sync_snapshot",
            updatedAt: localSnap.updatedAt,
            products: localSnap.products,
            categories: localSnap.categories,
            collections: localSnap.collections,
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

