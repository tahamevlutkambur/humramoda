import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { listBackups, createBackup } from "@/lib/server/backup";

export async function GET() {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const backups = listBackups();
  return NextResponse.json({ backups });
}

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const description = body.description || undefined;
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

    const { manifest, error } = createBackup("MANUAL", description, {
      adminId: session.userId,
      adminEmail: session.email,
      ip: clientIp,
    });

    if (error || !manifest) {
      return NextResponse.json({ error: error || "Yedek oluşturulamadı." }, { status: 400 });
    }

    return NextResponse.json({ success: true, manifest }, { status: 201 });
  } catch (err) {
    console.error("Create backup API error:", err);
    return NextResponse.json({ error: "Sunucu hatası oluştu." }, { status: 500 });
  }
}
