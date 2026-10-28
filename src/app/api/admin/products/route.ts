import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getAllStoreProducts, createStoreProduct, getStoreData } from "@/lib/server/store";

import { logAdminAudit } from "@/lib/server/logger";
import { revalidatePath } from "next/cache";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

export async function GET(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    await getPersistentStoreData().catch(() => {});
    const products = getAllStoreProducts();
    return NextResponse.json({ products });
  } catch (err) {
    console.error("Load products error:", err);
    return NextResponse.json({ products: getAllStoreProducts() });
  }
}

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const { product, error } = createStoreProduct(body);

    if (error || !product) {
      return NextResponse.json({ error: error || "Ürün oluşturulamadı." }, { status: 400 });
    }
    await savePersistentStoreData(getStoreData()).catch(() => {});

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "PRODUCT_CREATED",
      targetType: "PRODUCT",
      targetId: product.id,
      result: "SUCCESS",
      details: { title: product.title, slug: product.slug },
    });

    try {
      revalidatePath("/admin/urunler");
      revalidatePath(`/admin/urunler/${encodeURIComponent(product.id)}`);
      revalidatePath(`/urun/${encodeURIComponent(product.slug)}`);
      revalidatePath("/urunler");
      revalidatePath("/");
    } catch {
      // Revalidation is best effort
    }

    return NextResponse.json({ success: true, product }, { status: 201 });
  } catch (err) {
    console.error("Create product API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
