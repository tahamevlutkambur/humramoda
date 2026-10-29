import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { requireAdminRole } from "@/lib/server/session-guard";
import { findBackupFilePath } from "@/lib/server/backup";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { id } = await params;
  const filePath = findBackupFilePath(id);

  if (!filePath || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Yedek dosyası bulunamadı." }, { status: 404 });
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const fileName = path.basename(filePath);

  return new NextResponse(fileContent, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
