import { NextResponse } from "next/server";
import { requireAdminRole, verifySameOrigin } from "@/lib/server/session-guard";
import { listBackups, createBackup } from "@/lib/server/backup";
import { getClientIp } from "@/lib/server/auth";

export async function GET(req: Request) {
  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const backups = listBackups();
  return NextResponse.json({ backups });
}

export async function POST(req: Request) {
  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const session = auth.session;

  try {
    const body = await req.json().catch(() => ({}));
    const description = body.description || undefined;
    const clientIp = getClientIp(req);

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
