import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getAllStoreCategories, createStoreCategory } from "@/lib/server/store";

export async function GET() {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const categories = getAllStoreCategories();
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { category, error } = createStoreCategory(body);

    if (error || !category) {
      return NextResponse.json({ error: error || "Kategori oluşturulamadı." }, { status: 400 });
    }

    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (err) {
    console.error("Create category error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
