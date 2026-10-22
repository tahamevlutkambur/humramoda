import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getAllStoreCampaigns, createStoreCampaign } from "@/lib/server/store";

export async function GET() {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const campaigns = getAllStoreCampaigns();
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { campaign, error } = createStoreCampaign(body);

    if (error || !campaign) {
      return NextResponse.json({ error: error || "Kampanya oluşturulamadı." }, { status: 400 });
    }

    return NextResponse.json({ success: true, campaign }, { status: 201 });
  } catch (err) {
    console.error("Create campaign error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
