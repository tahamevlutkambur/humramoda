"use client";

import React from "react";
import { usePathname } from "next/navigation";

interface AnnouncementBarProps {
  text?: string;
  isActive?: boolean;
}

export function AnnouncementBar({
  text = "Tüm Türkiye'ye Hızlı Teslimat · Sabit 150 ₺ Kargo",
  isActive = true,
}: AnnouncementBarProps) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  if (!isActive) return null;

  return (
    <div
      style={{
        backgroundColor: "var(--hm-color-surface-dark)",
        color: "var(--hm-color-text-light)",
        textAlign: "center",
        padding: "0.5rem 1rem",
        fontSize: "var(--hm-text-2xs)",
        letterSpacing: "var(--hm-tracking-wider)",
        textTransform: "uppercase",
        fontWeight: "var(--hm-font-regular)",
      }}
    >
      <span>{text}</span>
    </div>
  );
}

export default AnnouncementBar;
