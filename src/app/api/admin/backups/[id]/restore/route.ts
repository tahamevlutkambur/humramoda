import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { restoreBackupById, dryRunRestore } from "@/lib/server/backup";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const preserveNewerOrders = body.preserveNewerOrders !== false;
    const isDryRun = Boolean(body.dryRun);
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

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
