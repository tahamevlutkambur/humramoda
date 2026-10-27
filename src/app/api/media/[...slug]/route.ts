import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { mediaMemoryCache } from "@/lib/server/media";

interface RouteParams {
  params: Promise<{
    slug: string[];
  }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { slug } = await params;
  if (!slug || slug.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const relativePath = slug.join("/");
  const fileName = slug[slug.length - 1];

  // 1. In-memory cache kontrolü
  const inMemory = mediaMemoryCache.get(fileName);
  if (inMemory) {
    return new Response(inMemory.buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": inMemory.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // 2. /tmp/uploads kontrolü
  const tmpPath = path.join(os.tmpdir(), "humramoda_uploads", relativePath);
  if (fs.existsSync(tmpPath)) {
    try {
      const buffer = fs.readFileSync(tmpPath);
      const isVideo = fileName.endsWith(".mp4") || fileName.endsWith(".webm");
      const mime = isVideo ? "video/mp4" : "image/webp";
      return new Response(buffer as unknown as BodyInit, {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      // ignore
    }
  }

  // 3. public/uploads kontrolü
  const publicPath = path.join(process.cwd(), "public", "uploads", relativePath);
  if (fs.existsSync(publicPath)) {
    try {
      const buffer = fs.readFileSync(publicPath);
      const isVideo = fileName.endsWith(".mp4") || fileName.endsWith(".webm");
      const isPng = fileName.endsWith(".png");
      const isJpg = fileName.endsWith(".jpg") || fileName.endsWith(".jpeg");
      const mime = isVideo ? "video/mp4" : isPng ? "image/png" : isJpg ? "image/jpeg" : "image/webp";
      return new Response(buffer as unknown as BodyInit, {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      // ignore
    }
  }

  return new NextResponse("Not Found", { status: 404 });
}
