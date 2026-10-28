import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getAllStoreCollections, createStoreCollection } from "@/lib/server/store";

import { logAdminAudit } from "@/lib/server/logger";
import { revalidatePath } from "next/cache";

export async function GET() {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const collections = getAllStoreCollections();
  return NextResponse.json({ collections });
}

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { collection, error } = createStoreCollection(body);

    if (error || !collection) {
      return NextResponse.json({ error: error || "Koleksiyon oluşturulamadı." }, { status: 400 });
    }

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
