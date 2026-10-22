import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { verifyBackupById } from "@/lib/server/backup";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
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
