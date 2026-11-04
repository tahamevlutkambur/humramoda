import { NextResponse } from "next/server";
import { requireAdminRole, verifySameOrigin } from "@/lib/server/session-guard";
import { getStoreHomepageContent, updateStoreHomepageContent, getStoreData } from "@/lib/server/store";
import { logAdminAudit } from "@/lib/server/logger";
import { revalidatePath } from "next/cache";
import { getPersistentStoreData, savePersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireAdminRole(req, ["ADMIN", "STAFF"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  await getPersistentStoreData().catch(() => {});
  const content = getStoreHomepageContent();
  return NextResponse.json({ content });
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

  const session = auth.session;

  try {
    await getPersistentStoreData().catch(() => {});
    const body = await req.json();
    const updated = updateStoreHomepageContent(body);
    await savePersistentStoreData(getStoreData()).catch(() => {});

    logAdminAudit({
      adminId: session.userId,
      adminEmail: session.email,
      action: "STORE_SETTINGS_UPDATED",
      targetType: "SETTINGS",
      targetId: "showcase",
      result: "SUCCESS",
    });

    try {
      revalidatePath("/");
      revalidatePath("/admin/vitrin");
    } catch {
      // Revalidation is best effort
    }

    return NextResponse.json({ success: true, content: updated });
  } catch (err) {
    console.error("Update homepage content error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
