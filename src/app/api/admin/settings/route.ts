import { NextResponse } from "next/server";
import { requireAdminRole, verifySameOrigin } from "@/lib/server/session-guard";
import {
  getStoreData,
  getStoreSettings,
  updateStoreSettings,
  sanitizeStoreSettingsForClient,
} from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

export async function GET(req: Request) {
  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  await getPersistentStoreData().catch(() => {});
  const settings = sanitizeStoreSettingsForClient(getStoreSettings());
  return NextResponse.json({ settings });
}

export async function PUT(req: Request) {
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
    const updated = updateStoreSettings(body);
    await savePersistentStoreData(getStoreData()).catch(() => {});
    return NextResponse.json({
      success: true,
      settings: sanitizeStoreSettingsForClient(updated),
    });
  } catch (err) {
    console.error("Update store settings error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
