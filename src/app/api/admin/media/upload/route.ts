import { NextResponse } from "next/server";
import { getAuthenticatedAdmin, verifySameOrigin } from "@/lib/server/session-guard";
import { processAndSaveUpload } from "@/lib/server/media";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getAuthenticatedAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const csrf = verifySameOrigin(req);
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const filesArray = formData.getAll("files") as File[];
    const singleFile = (formData.get("file") || formData.get("image") || formData.get("media")) as File | null;

    let candidateFiles: File[] = [];
    if (filesArray && filesArray.length > 0) {
      candidateFiles = filesArray.filter((f) => f && typeof f.size === "number" && f.size > 0);
    }
    if (candidateFiles.length === 0 && singleFile && typeof singleFile.size === "number" && singleFile.size > 0) {
      candidateFiles = [singleFile];
    }

    if (candidateFiles.length === 0) {
      return NextResponse.json({ error: "Yüklenecek dosya seçilmedi." }, { status: 400 });
    }

    const uploadedMediaList = [];
    const errors: string[] = [];

    for (const file of candidateFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { result, error } = await processAndSaveUpload(
          buffer,
          file.name,
          file.type || "application/octet-stream"
        );

        if (error || !result) {
          errors.push(`${file.name}: ${error || "Dosya yüklenemedi."}`);
        } else {
          uploadedMediaList.push(result);
        }
      } catch (fErr) {
        errors.push(`${file.name}: ${fErr instanceof Error ? fErr.message : "Yükleme sırasında hata oluştu."}`);
      }
    }

    if (uploadedMediaList.length === 0) {
      return NextResponse.json(
        { error: errors.join(" | ") || "Hiçbir dosya yüklenemedi." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      media: uploadedMediaList[0],
      mediaList: uploadedMediaList,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Media upload error:", err);
    return NextResponse.json({ error: "Yükleme sırasında sunucu hatası oluştu." }, { status: 500 });
  }
}
