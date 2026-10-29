import { NextResponse } from "next/server";
import { requireAdminRole, verifySameOrigin } from "@/lib/server/session-guard";
import { verifyBackupById } from "@/lib/server/backup";

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

  const { id } = await params;
  const result = verifyBackupById(id);

  if (!result.isValid) {
    return NextResponse.json(
      { success: false, isValid: false, error: result.error || "Bütünlük doğrulaması başarısız." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, isValid: true, manifest: result.manifest });
}
