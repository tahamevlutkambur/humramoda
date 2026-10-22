import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getStoreHomepageContent, updateStoreHomepageContent } from "@/lib/server/store";

export async function GET() {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const content = getStoreHomepageContent();
  return NextResponse.json({ content });
}

export async function PUT(req: Request) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const updated = updateStoreHomepageContent(body);
    return NextResponse.json({ success: true, content: updated });
  } catch (err) {
    console.error("Update homepage content error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
