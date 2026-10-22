import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getAllStoreProducts, createStoreProduct } from "@/lib/server/store";

export async function GET() {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const products = getAllStoreProducts();
  return NextResponse.json({ products });
}

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { product, error } = createStoreProduct(body);

    if (error || !product) {
      return NextResponse.json({ error: error || "Ürün oluşturulamadı." }, { status: 400 });
    }

    return NextResponse.json({ success: true, product }, { status: 201 });
  } catch (err) {
    console.error("Create product API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
