import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
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
