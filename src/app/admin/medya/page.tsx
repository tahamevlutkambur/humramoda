import React from "react";
import fs from "fs";
import path from "path";
import { MediaLibrary, MediaFileItem } from "./MediaLibrary";

export const metadata = {
  title: "Medya Kütüphanesi | Hümra Moda Yönetim Paneli",
};

export default function AdminMediaPage() {
  const publicDir = path.join(process.cwd(), "public");
  const productsDir = path.join(publicDir, "uploads", "products");
  const videosDir = path.join(publicDir, "uploads", "videos");

  const files: MediaFileItem[] = [];

  // 1. Ürün görsellerini tara
  if (fs.existsSync(productsDir)) {
    const list = fs.readdirSync(productsDir);
    for (const f of list) {
      if (f.endsWith("-card.webp") || (!f.includes("-") && f.endsWith(".webp"))) {
        const full = path.join(productsDir, f);
        const stat = fs.statSync(full);
        files.push({
          name: f,
          url: `/uploads/products/${f}`,
          type: "IMAGE",
          sizeBytes: stat.size,
        });
      }
    }
  }

  // 2. Videoları tara
  if (fs.existsSync(videosDir)) {
    const list = fs.readdirSync(videosDir);
    for (const f of list) {
      if (f.endsWith(".mp4")) {
        const full = path.join(videosDir, f);
        const stat = fs.statSync(full);
        files.push({
          name: f,
          url: `/uploads/videos/${f}`,
          type: "VIDEO",
          sizeBytes: stat.size,
        });
      }
    }
  }

  return <MediaLibrary initialFiles={files} />;
}
