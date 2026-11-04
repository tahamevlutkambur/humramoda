import { NextResponse } from "next/server";
import { requireAdminRole, verifySameOrigin } from "@/lib/server/session-guard";
import { getAllStoreCampaigns, createStoreCampaign, getStoreData } from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

export async function GET(req: Request) {
  const auth = await requireAdminRole(req, ["ADMIN", "STAFF"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  await getPersistentStoreData().catch(() => {});
  const campaigns = getAllStoreCampaigns();
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const { campaign, error } = createStoreCampaign(body);

    if (error || !campaign) {
      return NextResponse.json({ error: error || "Kampanya oluşturulamadı." }, { status: 400 });
    }

    await savePersistentStoreData(getStoreData()).catch(() => {});

    return NextResponse.json({ success: true, campaign }, { status: 201 });
  } catch (err) {
    console.error("Create campaign error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
