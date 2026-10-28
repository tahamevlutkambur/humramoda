import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getStoreHomepageContent, updateStoreHomepageContent } from "@/lib/server/store";
import { logAdminAudit } from "@/lib/server/logger";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

