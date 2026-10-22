import React from "react";
import { getStoreSettings, getAllStoreCampaigns } from "@/lib/server/store";
import { SettingsManager } from "./SettingsManager";

export const metadata = {
  title: "Mağaza Ayarları ve Kampanyalar | Hümra Moda Yönetim Paneli",
};

export default function AdminSettingsPage() {
  const settings = getStoreSettings();
  const campaigns = getAllStoreCampaigns();

  return (
    <SettingsManager
      initialSettings={settings}
      initialCampaigns={campaigns}
    />
  );
}
