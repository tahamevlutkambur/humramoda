import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getAllStoreCollections, createStoreCollection } from "@/lib/server/store";

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

    return NextResponse.json({ success: true, collection }, { status: 201 });
  } catch (err) {
    console.error("Create collection error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
