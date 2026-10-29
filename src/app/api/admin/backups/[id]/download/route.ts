import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { requireAdminRole } from "@/lib/server/session-guard";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRole(req, ["ADMIN"]);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const { id } = await params;
  const safeId = path.basename(id).replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(process.cwd(), "data", "backups", `${safeId}.json`);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Yedek dosyası bulunamadı." }, { status: 404 });
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");

  return new NextResponse(fileContent, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${safeId}.json"`,
    },
  });
}
