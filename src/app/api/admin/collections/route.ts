import { NextResponse } from "next/server";
import { requireAdminRole, verifySameOrigin } from "@/lib/server/session-guard";
import { getAllStoreCollections, createStoreCollection, getStoreData } from "@/lib/server/store";
import { logAdminAudit } from "@/lib/server/logger";
import { revalidatePath } from "next/cache";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

export async function GET(req?: Request) {
  const auth = await requireAdminRole(req, ["ADMIN", "STAFF"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  await getPersistentStoreData().catch(() => {});
  const collections = getAllStoreCollections();
  return NextResponse.json({ collections });
}

export async function POST(req: Request) {
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
    const body = await req.json();
    const { collection, error } = createStoreCollection(body);

    if (error || !collection) {
      return NextResponse.json({ error: error || "Koleksiyon oluşturulamadı." }, { status: 400 });
    }

    await savePersistentStoreData(getStoreData()).catch(() => {});

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "COLLECTION_UPDATED",
      targetType: "COLLECTION",
      targetId: collection.id,
      result: "SUCCESS",
      details: { name: collection.name, slug: collection.slug, action: "CREATED" },
    });

    try {
      revalidatePath("/admin/koleksiyonlar");
      revalidatePath(`/koleksiyon/${encodeURIComponent(collection.slug)}`);
      revalidatePath("/");
      revalidatePath("/urunler");
    } catch {
      // Revalidation is best effort
    }

    return NextResponse.json({ success: true, collection }, { status: 201 });
  } catch (err) {
    console.error("Create collection error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
