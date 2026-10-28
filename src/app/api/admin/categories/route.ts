import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getAllStoreCategories, createStoreCategory, getStoreData } from "@/lib/server/store";
import { logAdminAudit } from "@/lib/server/logger";
import { revalidatePath } from "next/cache";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    await getPersistentStoreData();
    const categories = getAllStoreCategories();
    return NextResponse.json({ categories });
  } catch (err) {
    console.error("Load categories error:", err);
    return NextResponse.json({ error: "Kategoriler veritabanından yüklenemedi." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    await getPersistentStoreData();
    const body = await req.json();
    const { category, error } = createStoreCategory(body);

    if (error || !category) {
      return NextResponse.json({ error: error || "Kategori oluşturulamadı." }, { status: 400 });
    }

    await savePersistentStoreData(getStoreData());

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "CATEGORY_CREATED",
      targetType: "CATEGORY",
      targetId: category.id,
      result: "SUCCESS",
      details: { name: category.name, slug: category.slug },
    });

    try {
      revalidatePath("/admin/kategoriler");
      revalidatePath("/");
      revalidatePath("/urunler");
    } catch {
      // Revalidation is best effort
    }

    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (err) {
    console.error("Create category error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
