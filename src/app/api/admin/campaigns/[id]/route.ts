import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { updateStoreCampaign, deleteStoreCampaign } from "@/lib/server/store";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function PUT(req: Request, { params }: RouteParams) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const { campaign, error } = updateStoreCampaign(id, body);
    if (error || !campaign) {
      return NextResponse.json({ error: error || "Kampanya güncellenemedi." }, { status: 400 });
    }

    return NextResponse.json({ success: true, campaign });
  } catch (err) {
    console.error("Update campaign error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const { id } = await params;
  const deleted = deleteStoreCampaign(id);
  if (!deleted) {
    return NextResponse.json({ error: "Kampanya bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
