import { NextResponse } from "next/server";
import { requireAdminRole, verifySameOrigin } from "@/lib/server/session-guard";
import { restoreBackupById, dryRunRestore } from "@/lib/server/backup";
import { getClientIp } from "@/lib/server/auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const session = auth.session;
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const preserveNewerOrders = body.preserveNewerOrders !== false;
    const isDryRun = Boolean(body.dryRun);
    const clientIp = getClientIp(req);

    if (isDryRun) {
      const dryResult = dryRunRestore(id, preserveNewerOrders);
      if (!dryResult.success) {
        return NextResponse.json({ error: dryResult.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        dryRun: true,
        manifest: dryResult.manifest,
        preview: dryResult.preview,
        message: "Yedek bütünlüğü doğrulandı ve prova başarıyla tamamlandı. Hiçbir veri değiştirilmedi.",
      });
    }

    const result = restoreBackupById(
      id,
      {
        adminId: session.userId,
        adminEmail: session.email,
        ip: clientIp,
      },
      preserveNewerOrders
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Geri yükleme başarısız oldu." }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `"${id}" yedeği başarıyla geri yüklendi.`,
      safetyBackupId: result.safetyBackupId,
    });
  } catch (err) {
    console.error("Restore backup API error:", err);
    return NextResponse.json({ error: "Geri yükleme sırasında sunucu hatası oluştu." }, { status: 500 });
  }
}
