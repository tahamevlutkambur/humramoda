import { NextResponse } from "next/server";
import { getAuthenticatedAdmin, verifySameOrigin } from "@/lib/server/session-guard";
import {
  getAllStoreProducts,
  getAllStoreCategories,
  getStoreProductById,
  createStoreProduct,
  updateStoreProduct,
  deleteStoreProduct,
  createStoreCategory,
  updateStoreCategory,
  deleteStoreCategory,
  getStoreData,
  syncStoreSnapshot,
  syncStoreProductMedia,
} from "@/lib/server/store";
import { logAdminAudit } from "@/lib/server/logger";
import { revalidatePath } from "next/cache";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function revalidateAllStorePaths(slug?: string, id?: string) {
  try {
    revalidatePath("/");
    revalidatePath("/urunler");
    revalidatePath("/api/catalog");
    revalidatePath("/admin/urunler");
    revalidatePath("/admin/urunler/yeni");
    revalidatePath("/admin/kategoriler");
    if (id) revalidatePath(`/admin/urunler/${encodeURIComponent(id)}`);
    if (slug) {
      revalidatePath(`/urun/${encodeURIComponent(slug)}`);
      revalidatePath(`/kategori/${encodeURIComponent(slug)}`);
    }
  } catch {
    // Revalidation is best effort
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const isPublic = url.searchParams.get("public") === "1";
  const requestedId = url.searchParams.get("id");

  if (!isPublic) {
    const session = await getAuthenticatedAdmin(req);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
    }
  }

  try {
    await getPersistentStoreData().catch(() => { });
    const store = getStoreData();
    const products = getAllStoreProducts();
    const categories = getAllStoreCategories();

    let product = undefined;
    if (requestedId) {
      const decoded = decodeURIComponent(requestedId).trim();
      product = getStoreProductById(decoded) || getStoreProductById(requestedId);
    }

    return NextResponse.json(
      {
        updatedAt: store.updatedAt || 0,
        products,
        categories,
        collections: store.collections,
        featuredVideos: store.featuredVideos,
        homepageContent: store.homepageContent,
        ...(requestedId ? { product: product || null } : {}),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    console.error("Load store data error:", err);
    const store = getStoreData();
    return NextResponse.json(
      {
        updatedAt: store.updatedAt || 0,
        products: getAllStoreProducts(),
        categories: getAllStoreCategories(),
        collections: store.collections,
        featuredVideos: store.featuredVideos,
        homepageContent: store.homepageContent,
      },
      { headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403, headers: NO_STORE_HEADERS });
  }

  try {
    await getPersistentStoreData().catch(() => { });
    const body = await req.json();

    // Cold-instance snapshot rehydration (Yalnızca doğrulanmış yönetici oturumuyla izin verilir)
    if (body?._entity === "sync_snapshot") {
      const synced = syncStoreSnapshot(body, { allowCatalogMutation: true, force: true });
      await savePersistentStoreData(synced).catch(() => { });
      revalidateAllStorePaths();
      const latest = getStoreData();
      return NextResponse.json(
        {
          success: true,
          updatedAt: latest.updatedAt || 0,
          products: getAllStoreProducts(),
          categories: getAllStoreCategories(),
          collections: latest.collections,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Per-product media chunk rehydration (Yalnızca doğrulanmış yönetici oturumuyla izin verilir)
    if (body?._entity === "sync_product_media") {
      const synced = syncStoreProductMedia(body);
      await savePersistentStoreData(synced).catch(() => { });
      const latest = getStoreData();
      return NextResponse.json(
        {
          success: true,
          updatedAt: latest.updatedAt || 0,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    if (body?._snapshot && typeof body._snapshot === "object") {
      syncStoreSnapshot(body._snapshot, { allowCatalogMutation: true });
    }

    if (body?._entity === "category") {
      const { category, error } = createStoreCategory(body);
      if (error || !category) {
        return NextResponse.json({ error: error || "Kategori oluşturulamadı." }, { status: 400 });
      }
      const updatedStore = getStoreData();
      await savePersistentStoreData(updatedStore).catch(() => { });

      logAdminAudit({
        adminId: session.userId,
        adminEmail: session.email,
        action: "CATEGORY_CREATED",
        targetType: "CATEGORY",
        targetId: category.id,
        result: "SUCCESS",
        details: { name: category.name, slug: category.slug },
      });

      revalidateAllStorePaths(category.slug, category.id);
      return NextResponse.json(
        {
          success: true,
          updatedAt: updatedStore.updatedAt || Date.now(),
          category,
          categories: getAllStoreCategories(),
          products: getAllStoreProducts(),
          collections: updatedStore.collections,
        },
        { status: 201, headers: NO_STORE_HEADERS }
      );
    }

    const { product, error } = createStoreProduct(body);

    if (error || !product) {
      return NextResponse.json({ error: error || "Ürün oluşturulamadı." }, { status: 400 });
    }
    const updatedStore = getStoreData();
    await savePersistentStoreData(updatedStore).catch(() => { });

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "PRODUCT_CREATED",
      targetType: "PRODUCT",
      targetId: product.id,
      result: "SUCCESS",
      details: { title: product.title, slug: product.slug },
    });

    revalidateAllStorePaths(product.slug, product.id);

    return NextResponse.json(
      {
        success: true,
        updatedAt: updatedStore.updatedAt || Date.now(),
        product,
        products: getAllStoreProducts(),
        categories: getAllStoreCategories(),
        collections: updatedStore.collections,
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    console.error("Create API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403, headers: NO_STORE_HEADERS });
  }

  try {
    await getPersistentStoreData().catch(() => { });
    const url = new URL(req.url);
    const body = await req.json();

    if (body?._snapshot && typeof body._snapshot === "object") {
      syncStoreSnapshot(body._snapshot, { allowCatalogMutation: true });
    }

    const targetId = String(body?.id || url.searchParams.get("id") || "").trim();

    if (!targetId) {
      return NextResponse.json({ error: "Güncellenecek kayıt ID bilgisi eksik." }, { status: 400 });
    }

    if (body?._entity === "category") {
      const { category, error } = updateStoreCategory(targetId, body);
      if (error || !category) {
        return NextResponse.json({ error: error || "Kategori güncellenemedi." }, { status: 400 });
      }
      const updatedStore = getStoreData();
      await savePersistentStoreData(updatedStore).catch(() => { });

      logAdminAudit({
        adminId: session.userId,
        adminEmail: session.email,
        action: "CATEGORY_UPDATED",
        targetType: "CATEGORY",
        targetId: category.id,
        result: "SUCCESS",
        details: { name: category.name, slug: category.slug },
      });

      revalidateAllStorePaths(category.slug, category.id);
      return NextResponse.json(
        {
          success: true,
          updatedAt: updatedStore.updatedAt || Date.now(),
          category,
          categories: getAllStoreCategories(),
          products: getAllStoreProducts(),
          collections: updatedStore.collections,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const { product, error } = updateStoreProduct(targetId, body);
    if (error || !product) {
      return NextResponse.json({ error: error || "Ürün güncellenemedi." }, { status: 400 });
    }
    const updatedStore = getStoreData();
    await savePersistentStoreData(updatedStore).catch(() => { });

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "PRODUCT_UPDATED",
      targetType: "PRODUCT",
      targetId: product.id,
      result: "SUCCESS",
      details: { title: product.title, slug: product.slug },
    });

    revalidateAllStorePaths(product.slug, product.id);
    return NextResponse.json(
      {
        success: true,
        updatedAt: updatedStore.updatedAt || Date.now(),
        product,
        products: getAllStoreProducts(),
        categories: getAllStoreCategories(),
        collections: updatedStore.collections,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    console.error("Update API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403, headers: NO_STORE_HEADERS });
  }

  try {
    await getPersistentStoreData().catch(() => { });
    const url = new URL(req.url);
    let targetId = url.searchParams.get("id") || "";
    let entity = url.searchParams.get("entity") || "product";
    let reassignTo = url.searchParams.get("reassignTo") || undefined;

    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json().catch(() => null);
      if (body?._snapshot && typeof body._snapshot === "object") {
        syncStoreSnapshot(body._snapshot);
      }
      if (!targetId && body?.id) targetId = String(body.id);
      if (body?._entity) entity = String(body._entity);
      if (body?.reassignTo) reassignTo = String(body.reassignTo);
    }

    targetId = targetId.trim();
    if (!targetId) {
      return NextResponse.json({ error: "Silinecek kayıt ID bilgisi eksik." }, { status: 400 });
    }

    if (entity === "category") {
      const deleted = deleteStoreCategory(targetId, reassignTo);
      if (!deleted) {
        return NextResponse.json({ error: "Kategori bulunamadı veya silinemedi." }, { status: 404 });
      }
      const updatedStore = getStoreData();
      await savePersistentStoreData(updatedStore).catch(() => { });

      logAdminAudit({
        adminId: session.userId,
        adminEmail: session.email,
        action: "CATEGORY_DELETED",
        targetType: "CATEGORY",
        targetId: targetId,
        result: "SUCCESS",
        details: { id: targetId, reassignTo },
      });

      revalidateAllStorePaths(undefined, targetId);
      return NextResponse.json(
        {
          success: true,
          updatedAt: updatedStore.updatedAt || Date.now(),
          categories: getAllStoreCategories(),
          products: getAllStoreProducts(),
          collections: updatedStore.collections,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const deleted = deleteStoreProduct(targetId);
    if (!deleted) {
      return NextResponse.json({ error: "Silinecek ürün bulunamadı." }, { status: 404 });
    }
    const updatedStore = getStoreData();
    await savePersistentStoreData(updatedStore).catch(() => { });

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "PRODUCT_DELETED",
      targetType: "PRODUCT",
      targetId: targetId,
      result: "SUCCESS",
      details: { id: targetId },
    });

    revalidateAllStorePaths(undefined, targetId);
    return NextResponse.json(
      {
        success: true,
        updatedAt: updatedStore.updatedAt || Date.now(),
        products: getAllStoreProducts(),
        categories: getAllStoreCategories(),
        collections: updatedStore.collections,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    console.error("Delete API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
