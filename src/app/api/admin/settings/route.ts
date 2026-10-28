import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getStoreData, getStoreSettings, updateStoreSettings } from "@/lib/server/store";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

export async function GET(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  await getPersistentStoreData().catch(() => {});
  const settings = getStoreSettings();
  return NextResponse.json({ settings });
}

export async function PUT(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const updated = updateStoreSettings(body);
    await savePersistentStoreData(getStoreData()).catch(() => {});
    return NextResponse.json({ success: true, settings: updated });
  } catch (err) {
    console.error("Update store settings error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
