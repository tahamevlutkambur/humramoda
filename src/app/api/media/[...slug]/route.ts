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
  if (slug.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const mimeForFile = (name: string) => {
    const ext = path.extname(name).toLowerCase();
    if (ext === ".mp4") return "video/mp4";
    if (ext === ".webm") return "video/webm";
    if (ext === ".png") return "image/png";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".avif") return "image/avif";
    if (ext === ".gif") return "image/gif";
    return "image/webp";
  };

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
  const tmpBase = path.resolve(os.tmpdir(), "humramoda_uploads");
  const tmpPath = path.resolve(tmpBase, relativePath);
  if (!tmpPath.startsWith(`${tmpBase}${path.sep}`)) return new NextResponse("Not Found", { status: 404 });
  if (fs.existsSync(tmpPath)) {
    try {
      const buffer = fs.readFileSync(tmpPath);
      const mime = mimeForFile(fileName);
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
  const publicBase = path.resolve(process.cwd(), "public", "uploads");
  const publicPath = path.resolve(publicBase, relativePath);
  if (!publicPath.startsWith(`${publicBase}${path.sep}`)) return new NextResponse("Not Found", { status: 404 });
  if (fs.existsSync(publicPath)) {
    try {
      const buffer = fs.readFileSync(publicPath);
      const mime = mimeForFile(fileName);
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
