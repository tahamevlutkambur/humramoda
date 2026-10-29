import React from "react";
import { redirect } from "next/navigation";
import {
  getStoreSettings,
  getAllStoreCampaigns,
  sanitizeStoreSettingsForClient,
} from "@/lib/server/store";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { SettingsManager } from "./SettingsManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Mağaza Ayarları ve Kampanyalar | Hümra Moda Yönetim Paneli",
};

export default async function AdminSettingsPage() {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    redirect("/admin/login?from=/admin/ayarlar");
  }

  if (session.role !== "ADMIN") {
    redirect("/admin");
  }

  const settings = sanitizeStoreSettingsForClient(getStoreSettings());
  const campaigns = getAllStoreCampaigns();

  return (
    <SettingsManager
      initialSettings={settings}
      initialCampaigns={campaigns}
    />
  );
}
