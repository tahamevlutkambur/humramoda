import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { processAndSaveUpload } from "@/lib/server/media";

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Yüklenecek dosya seçilmedi." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { result, error } = await processAndSaveUpload(
      buffer,
      file.name,
      file.type || "application/octet-stream"
    );

    if (error || !result) {
      return NextResponse.json({ error: error || "Dosya yüklenemedi." }, { status: 400 });
    }

    return NextResponse.json({ success: true, media: result });
  } catch (err) {
    console.error("Media upload error:", err);
    return NextResponse.json({ error: "Yükleme sırasında sunucu hatası oluştu." }, { status: 500 });
  }
}
