import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import {
  getStoreData,
  getStoreProductById,
  updateStoreProduct,
  deleteStoreProduct,
} from "@/lib/server/store";
import { ProductItem } from "@/lib/catalog";
import { logAdminAudit } from "@/lib/server/logger";
import { revalidatePath } from "next/cache";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
  await getPersistentStoreData();
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams.id;
  const decoded = decodeURIComponent(id || "").trim();
  const product =
    getStoreProductById(decoded) ||
    getStoreProductById(id) ||
    getStoreData().products.find(
      (p: ProductItem) =>
        p.id === id ||
        p.slug === id ||
        p.id === decoded ||
        p.slug === decoded ||
        p.id.toLowerCase() === decoded.toLowerCase() ||
        p.slug.toLowerCase() === decoded.toLowerCase()
    );

  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ product });
  } catch (err) {
    console.error("Load product error:", err);
    return NextResponse.json({ error: "Ürün veritabanından yüklenemedi." }, { status: 503 });
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    await getPersistentStoreData();
    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;
    const body = await req.json();

    const { product, error } = updateStoreProduct(id, body);
    if (error || !product) {
      return NextResponse.json({ error: error || "Ürün güncellenemedi." }, { status: 400 });
    }
    await savePersistentStoreData(getStoreData());

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "PRODUCT_UPDATED",
      targetType: "PRODUCT",
      targetId: product.id,
      result: "SUCCESS",
      details: { title: product.title, slug: product.slug },
    });

    try {
      revalidatePath("/admin/urunler");
      revalidatePath(`/admin/urunler/${encodeURIComponent(id)}`);
      revalidatePath(`/admin/urunler/${encodeURIComponent(product.id)}`);
      revalidatePath(`/urun/${encodeURIComponent(product.slug)}`);
      revalidatePath("/urunler");
      revalidatePath("/");
    } catch {
      // Revalidation is best effort
    }

    return NextResponse.json({ success: true, product });
  } catch (err) {
    console.error("Update product API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
  await getPersistentStoreData();
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams.id;
  const deleted = deleteStoreProduct(id);
  if (!deleted) {
    return NextResponse.json({ error: "Silinecek ürün bulunamadı." }, { status: 404 });
  }
  await savePersistentStoreData(getStoreData());

  logAdminAudit({
    adminId: session.userId,
    adminEmail: session.email,
    action: "PRODUCT_DELETED",
    targetType: "PRODUCT",
    targetId: id,
    result: "SUCCESS",
    details: { id },
  });

  try {
    revalidatePath("/admin/urunler");
    revalidatePath("/urunler");
    revalidatePath("/");
  } catch {
    // Revalidation is best effort
  }

  return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete product error:", err);
    return NextResponse.json({ error: "Ürün silinirken veritabanı hatası oluştu." }, { status: 503 });
  }
}
