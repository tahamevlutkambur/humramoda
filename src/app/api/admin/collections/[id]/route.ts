import { NextResponse } from "next/server";
import { requireAdminRole, verifySameOrigin } from "@/lib/server/session-guard";
import { updateStoreCollection, deleteStoreCollection, getStoreData } from "@/lib/server/store";
import { logAdminAudit } from "@/lib/server/logger";
import { revalidatePath } from "next/cache";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function PUT(req: Request, { params }: RouteParams) {
  const auth = await requireAdminRole(req, ["ADMIN", "STAFF"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const session = auth.session;

  try {
    await getPersistentStoreData().catch(() => {});
    const { id } = await params;
    const body = await req.json();

    const { collection, error } = updateStoreCollection(id, body);
    if (error || !collection) {
      return NextResponse.json({ error: error || "Koleksiyon güncellenemedi." }, { status: 400 });
    }

    await savePersistentStoreData(getStoreData()).catch(() => {});

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "COLLECTION_UPDATED",
      targetType: "COLLECTION",
      targetId: collection.id,
      result: "SUCCESS",
      details: { name: collection.name, slug: collection.slug },
    });

    try {
      revalidatePath("/admin/koleksiyonlar");
      revalidatePath(`/koleksiyon/${encodeURIComponent(collection.slug)}`);
      revalidatePath("/");
      revalidatePath("/urunler");
    } catch {
      // Revalidation is best effort
    }

    return NextResponse.json({ success: true, collection });
  } catch (err) {
    console.error("Update collection error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const session = auth.session;

  try {
    await getPersistentStoreData().catch(() => {});
    const { id } = await params;
    const deleted = deleteStoreCollection(id);
    if (!deleted) {
      return NextResponse.json({ error: "Koleksiyon bulunamadı." }, { status: 404 });
    }

    await savePersistentStoreData(getStoreData()).catch(() => {});

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "COLLECTION_UPDATED",
      targetType: "COLLECTION",
      targetId: id,
      result: "SUCCESS",
      details: { id, action: "DELETED" },
    });

    try {
      revalidatePath("/admin/koleksiyonlar");
      revalidatePath("/");
      revalidatePath("/urunler");
    } catch {
      // Revalidation is best effort
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete collection error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
