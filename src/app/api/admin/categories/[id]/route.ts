import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getStoreData, updateStoreCategory, deleteStoreCategory } from "@/lib/server/store";
import { logAdminAudit } from "@/lib/server/logger";
import { revalidatePath } from "next/cache";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
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

    const { category, error } = updateStoreCategory(id, body);
    if (error || !category) {
      return NextResponse.json({ error: error || "Kategori güncellenemedi." }, { status: 400 });
    }
    await savePersistentStoreData(getStoreData());

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "CATEGORY_UPDATED",
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

    return NextResponse.json({ success: true, category });
  } catch (err) {
    console.error("Update category error:", err);
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
    let reassignTo: string | undefined;

    try {
      const url = new URL(req.url);
      reassignTo = url.searchParams.get("reassignTo") || undefined;
      if (!reassignTo && req.headers.get("content-type")?.includes("application/json")) {
        const body = await req.json().catch(() => null);
        if (body?.reassignTo) reassignTo = body.reassignTo;
      }
    } catch {
      // Optional parameter extraction
    }

    const deleted = deleteStoreCategory(id, reassignTo);
    if (!deleted) {
      return NextResponse.json({ error: "Kategori bulunamadı veya silinemedi." }, { status: 404 });
    }
    await savePersistentStoreData(getStoreData());

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "CATEGORY_DELETED",
      targetType: "CATEGORY",
      targetId: id,
      result: "SUCCESS",
      details: { id, reassignTo },
    });

    try {
      revalidatePath("/admin/kategoriler");
      revalidatePath("/");
      revalidatePath("/urunler");
    } catch {
      // Revalidation is best effort
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete category error:", err);
    return NextResponse.json({ error: "Kategori silinirken sunucu hatası oluştu." }, { status: 500 });
  }
}
