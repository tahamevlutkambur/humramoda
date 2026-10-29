import { NextResponse } from "next/server";
import { requireAdminRole, verifySameOrigin } from "@/lib/server/session-guard";
import { updateStoreCampaign, deleteStoreCampaign, getStoreData } from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function PUT(req: Request, { params }: RouteParams) {
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
    const { id } = await params;
    const body = await req.json();

    const { campaign, error } = updateStoreCampaign(id, body);
    if (error || !campaign) {
      return NextResponse.json({ error: error || "Kampanya güncellenemedi." }, { status: 400 });
    }

    await savePersistentStoreData(getStoreData()).catch(() => {});

    return NextResponse.json({ success: true, campaign });
  } catch (err) {
    console.error("Update campaign error:", err);
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

  try {
    await getPersistentStoreData().catch(() => {});
    const { id } = await params;
    const deleted = deleteStoreCampaign(id);
    if (!deleted) {
      return NextResponse.json({ error: "Kampanya bulunamadı." }, { status: 404 });
    }

    await savePersistentStoreData(getStoreData()).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete campaign error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
