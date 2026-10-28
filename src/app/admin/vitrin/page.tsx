import React from "react";
import { getStoreHomepageContent } from "@/lib/server/store";
import { ContentEditor } from "./ContentEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Vitrin & İçerik Yönetimi | Hümra Moda Yönetim Paneli",
};

export default function AdminContentPage() {
  const content = getStoreHomepageContent();

  return <ContentEditor initialContent={content} />;
}
