"use client";

import React, { useState } from "react";
import { StoreSettings, CampaignItem } from "@/lib/server/store";

interface SettingsManagerProps {
  initialSettings: StoreSettings;
  initialCampaigns: CampaignItem[];
}

export function SettingsManager({
  initialSettings,
  initialCampaigns,
}: SettingsManagerProps) {
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>(initialCampaigns);

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [settingsError, setSettingsError] = useState("");

  // Campaign Form State
  const [editingCampId, setEditingCampId] = useState<string | null>(null);
  const [showCampForm, setShowCampForm] = useState(false);
  const [campCode, setCampCode] = useState("");
  const [campName, setCampName] = useState("");
  const [campDiscount, setCampDiscount] = useState<number | "">("");
  const [campMinBasket, setCampMinBasket] = useState<number | "">("");
  const [campStartDate, setCampStartDate] = useState("");
  const [campEndDate, setCampEndDate] = useState("");
  const [campIsActive, setCampIsActive] = useState(true);
  const [campDescription, setCampDescription] = useState("");

  const [campLoading, setCampLoading] = useState(false);
  const [campSuccess, setCampSuccess] = useState("");
  const [campError, setCampError] = useState("");

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsSuccess("");
    setSettingsError("");

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ayarlar kaydedilemedi.");
      }

      setSettings(data.settings);
      setSettingsSuccess("Mağaza ayarları ve ücretsiz kargo eşiği başarıyla güncellendi!");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSettingsError(err.message);
      } else {
        setSettingsError("Ayarlar kaydedilirken bir hata oluştu.");
      }
    } finally {
      setSettingsLoading(false);
    }
  };

  const resetCampForm = () => {
    setEditingCampId(null);
    setShowCampForm(false);
    setCampCode("");
    setCampName("");
    setCampDiscount("");
    setCampMinBasket("");
    setCampStartDate("");
    setCampEndDate("");
    setCampIsActive(true);
    setCampDescription("");
    setCampError("");
  };

  const startEditCampaign = (camp: CampaignItem) => {
    setEditingCampId(camp.id);
    setCampCode(camp.code);
    setCampName(camp.name);
    setCampDiscount(camp.discountPercentage || "");
    setCampMinBasket(camp.minBasketAmount || "");
    setCampStartDate(camp.startDate);
    setCampEndDate(camp.endDate);
    setCampIsActive(camp.isActive);
    setCampDescription(camp.description || "");
    setShowCampForm(true);
    setCampError("");
    setCampSuccess("");
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setCampLoading(true);
    setCampSuccess("");
    setCampError("");

    try {
      const payload = {
        code: campCode.trim().toUpperCase(),
        name: campName.trim(),
        discountPercentage: campDiscount ? Number(campDiscount) : undefined,
        minBasketAmount: campMinBasket ? Number(campMinBasket) : undefined,
        startDate: campStartDate,
        endDate: campEndDate,
        isActive: campIsActive,
        description: campDescription.trim() || undefined,
      };

      if (editingCampId) {
        const res = await fetch(`/api/admin/campaigns/${editingCampId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Kampanya güncellenemedi.");
        }
        setCampaigns((prev) =>
          prev.map((c) => (c.id === editingCampId ? data.campaign : c))
        );
        setCampSuccess(`"${data.campaign.code}" kampanyası güncellendi.`);
      } else {
        const res = await fetch("/api/admin/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Kampanya oluşturulamadı.");
        }
        setCampaigns((prev) => [...prev, data.campaign]);
        setCampSuccess(`"${data.campaign.code}" kampanyası başarıyla eklendi.`);
      }

      resetCampForm();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setCampError(err.message);
      } else {
        setCampError("İşlem sırasında beklenmeyen bir hata oluştu.");
      }
    } finally {
      setCampLoading(false);
    }
  };

  const handleDeleteCampaign = async (camp: CampaignItem) => {
    if (!confirm(`"${camp.code}" kodlu kampanyayı silmek istediğinizden emin misiniz?`)) {
      return;
    }

    setCampLoading(true);
    setCampError("");
    try {
      const res = await fetch(`/api/admin/campaigns/${camp.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Silme başarısız.");
      }
      setCampaigns((prev) => prev.filter((c) => c.id !== camp.id));
      setCampSuccess(`"${camp.code}" kampanyası silindi.`);
    } catch (err: unknown) {
      setCampError(err instanceof Error ? err.message : "Silme sırasında hata oluştu.");
    } finally {
      setCampLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
          Mağaza Ayarları ve Kampanyalar
        </h1>
        <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
          Ücretsiz kargo eşiğini, iletişim kanallarını, SEO metaverilerini ve indirim kurallarını yönetin.
        </p>
      </div>

      {/* 1. MAĞAZA VE KARGO AYARLARI */}
      <div className="hm-admin-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
        <h2
          style={{
            fontSize: "1.125rem",
            fontWeight: 600,
            margin: "0 0 0.5rem 0",
            borderBottom: "1px solid var(--hm-admin-border-subtle)",
            paddingBottom: "0.75rem",
          }}
        >
          1. Genel Mağaza ve Lojistik Ayarları
        </h2>

        {settingsSuccess && (
          <div
            style={{
              padding: "0.875rem 1rem",
              backgroundColor: "#E6F4EA",
              color: "#137333",
              borderRadius: "4px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            {settingsSuccess}
          </div>
        )}

        {settingsError && (
          <div
            style={{
              padding: "0.875rem 1rem",
              backgroundColor: "#FCE8E6",
              color: "#C5221F",
              borderRadius: "4px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            {settingsError}
          </div>
        )}

        <form onSubmit={handleSaveSettings}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <label className="hm-admin-label">Mağaza Adı</label>
              <input
                type="text"
                required
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                className="hm-admin-input"
              />
            </div>

            <div>
              <label className="hm-admin-label">Para Birimi</label>
              <select
                value={settings.currency || "TRY"}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="hm-admin-select"
              >
                <option value="TRY">TRY — Türk Lirası (₺)</option>
                <option value="USD">USD — Amerikan Doları ($)</option>
                <option value="EUR">EUR — Euro (€)</option>
              </select>
            </div>

            <div style={{ backgroundColor: "#F9FAFB", padding: "0.75rem", borderRadius: "4px", border: "1px solid #E5E7EB" }}>
              <label className="hm-admin-label" style={{ color: "var(--hm-admin-primary)", fontWeight: 700 }}>
                Ücretsiz Kargo Eşiği (₺) *
              </label>
              <input
                type="number"
                required
                min="0"
                step="50"
                value={settings.freeShippingThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, freeShippingThreshold: Number(e.target.value) })
                }
                className="hm-admin-input"
                style={{ fontWeight: 700, fontSize: "1rem" }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--hm-admin-text-muted)", display: "block", marginTop: "0.25rem" }}>
                Vitrindeki sepet baremi ve duyuru bandı bu tutara göre dinamik güncellenir.
              </span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <label className="hm-admin-label">Müşteri Destek Telefonu</label>
              <input
                type="text"
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                className="hm-admin-input"
              />
            </div>

            <div>
              <label className="hm-admin-label">WhatsApp Sipariş & Danışma Hattı</label>
              <input
                type="text"
                value={settings.whatsapp}
                onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                className="hm-admin-input"
                placeholder="+90 555 000 00 00"
              />
            </div>

            <div>
              <label className="hm-admin-label">İletişim E-Posta Adresi</label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                className="hm-admin-input"
              />
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="hm-admin-label">Mağaza Açık Adresi</label>
            <input
              type="text"
              value={settings.address}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              className="hm-admin-input"
            />
          </div>

          {/* SEO ve Sosyal */}
          <h3
            style={{
              fontSize: "0.9375rem",
              fontWeight: 600,
              margin: "1.5rem 0 0.75rem 0",
              color: "#2D3748",
            }}
          >
            Arama Motoru (SEO) ve Sosyal Medya Varsayılanları
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <label className="hm-admin-label">Varsayılan SEO Başlığı (Title)</label>
              <input
                type="text"
                value={settings.defaultSeoTitle}
                onChange={(e) => setSettings({ ...settings, defaultSeoTitle: e.target.value })}
                className="hm-admin-input"
              />
            </div>

            <div>
              <label className="hm-admin-label">Sosyal Paylaşım Görseli URL</label>
              <input
                type="text"
                value={settings.defaultSocialShareImage || ""}
                onChange={(e) =>
                  setSettings({ ...settings, defaultSocialShareImage: e.target.value })
                }
                className="hm-admin-input"
                placeholder="/uploads/products/IMG_2237-card.webp"
              />
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="hm-admin-label">Varsayılan SEO Meta Açıklaması</label>
            <textarea
              rows={2}
              value={settings.defaultSeoDescription}
              onChange={(e) =>
                setSettings({ ...settings, defaultSeoDescription: e.target.value })
              }
              className="hm-admin-textarea"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <div>
              <label className="hm-admin-label">Instagram Bağlantısı</label>
              <input
                type="text"
                value={settings.instagramUrl}
                onChange={(e) => setSettings({ ...settings, instagramUrl: e.target.value })}
                className="hm-admin-input"
              />
            </div>

            <div>
              <label className="hm-admin-label">TikTok Bağlantısı</label>
              <input
                type="text"
                value={settings.tiktokUrl}
                onChange={(e) => setSettings({ ...settings, tiktokUrl: e.target.value })}
                className="hm-admin-input"
              />
            </div>
          </div>

          {/* PayTR Sanal POS Ayarları */}
          <div
            style={{
              marginTop: "2rem",
              marginBottom: "1.5rem",
              padding: "1.25rem",
              backgroundColor: "#F8FAFC",
              borderRadius: "8px",
              border: "1px solid #E2E8F0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1rem",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "#1E293B" }}>
                  💳 PayTR Sanal POS Entegrasyonu
                </h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "0.8125rem", color: "#64748B" }}>
                  PayTR başvurunuz onaylandığında mağaza panelinizden aldığınız API anahtarlarını buraya giriniz.
                </p>
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  padding: "0.25rem 0.6rem",
                  borderRadius: "999px",
                  backgroundColor: settings.paytr?.merchantId ? "#DCFCE7" : "#FEF3C7",
                  color: settings.paytr?.merchantId ? "#166534" : "#92400E",
                }}
              >
                {settings.paytr?.merchantId ? "✓ Anahtarlar Tanımlı" : "⏳ Onay / Anahtar Bekleniyor"}
              </span>
            </div>

            <div
              style={{
                backgroundColor: "#EFF6FF",
                border: "1px solid #BFDBFE",
                borderRadius: "6px",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                fontSize: "0.8125rem",
                color: "#1E40AF",
              }}
            >
              <strong>📌 PayTR Bildirim URL (Callback URL):</strong>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                  marginTop: "4px",
                  backgroundColor: "#DBEAFE",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  wordBreak: "break-all",
                }}
              >
                https://humrabutik.com/api/payments/paytr/callback
              </div>
              <span style={{ fontSize: "0.75rem", marginTop: "4px", display: "block" }}>
                * PayTR Mağaza Panelinde <em>Ayarlar &gt; Bildirim URL Ayarları</em> kısmına bu adresi ekleyiniz.
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "1rem",
                marginBottom: "0.5rem",
              }}
            >
              <div>
                <label className="hm-admin-label">PayTR Mağaza No (Merchant ID)</label>
                <input
                  type="text"
                  placeholder="Örn: 123456"
                  value={settings.paytr?.merchantId || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      paytr: { ...(settings.paytr || {}), merchantId: e.target.value.trim() },
                    })
                  }
                  className="hm-admin-input"
                />
              </div>

              <div>
                <label className="hm-admin-label">PayTR Mağaza Parolası (Merchant Key)</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••"
                  value={settings.paytr?.merchantKey || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      paytr: { ...(settings.paytr || {}), merchantKey: e.target.value.trim() },
                    })
                  }
                  className="hm-admin-input"
                />
              </div>

              <div>
                <label className="hm-admin-label">PayTR Gizli Anahtar (Merchant Salt)</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••"
                  value={settings.paytr?.merchantSalt || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      paytr: { ...(settings.paytr || {}), merchantSalt: e.target.value.trim() },
                    })
                  }
                  className="hm-admin-input"
                />
              </div>

              <div>
                <label className="hm-admin-label">Çalışma Modu</label>
                <select
                  value={settings.paytr?.testMode || "1"}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      paytr: { ...(settings.paytr || {}), testMode: e.target.value as "0" | "1" },
                    })
                  }
                  className="hm-admin-select"
                >
                  <option value="1">🧪 Test Modu (Sanal Ödeme Denemesi)</option>
                  <option value="0">🚀 Canlı Üretim Modu (Gerçek Kart Çekimi)</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              className="hm-admin-btn hm-admin-btn-primary"
              disabled={settingsLoading}
            >
              {settingsLoading ? "Kaydediliyor..." : "Tüm Ayarları Kaydet"}
            </button>
          </div>
        </form>
      </div>

      {/* 2. KAMPANYALAR & KUPON YÖNETİMİ */}
      <div className="hm-admin-card" style={{ padding: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
            borderBottom: "1px solid var(--hm-admin-border-subtle)",
            paddingBottom: "0.75rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.25rem 0" }}>
              2. Kampanyalar ve İndirim Kuponları
            </h2>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--hm-admin-text-muted)" }}>
              Kupon kodları, yüzde indirim kuralları ve kampanya geçerlilik tarihlerini belirleyin.
            </p>
          </div>
          {!showCampForm && (
            <button
              type="button"
              className="hm-admin-btn hm-admin-btn-primary"
              onClick={() => {
                resetCampForm();
                setShowCampForm(true);
              }}
            >
              + Yeni Kampanya Ekle
            </button>
          )}
        </div>

        {campSuccess && (
          <div
            style={{
              padding: "0.875rem 1rem",
              backgroundColor: "#E6F4EA",
              color: "#137333",
              borderRadius: "4px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            {campSuccess}
          </div>
        )}

        {campError && (
          <div
            style={{
              padding: "0.875rem 1rem",
              backgroundColor: "#FCE8E6",
              color: "#C5221F",
              borderRadius: "4px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            {campError}
          </div>
        )}

        {showCampForm && (
          <form
            onSubmit={handleSaveCampaign}
            style={{
              backgroundColor: "#F8F9FA",
              padding: "1.25rem",
              borderRadius: "6px",
              marginBottom: "1.5rem",
              border: "1px solid var(--hm-admin-border)",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 1rem 0" }}>
              {editingCampId ? "Kampanyayı Düzenle" : "Yeni Kampanya Oluştur"}
            </h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div>
                <label className="hm-admin-label">Kupon / Kampanya Kodu *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: BAHAR15"
                  value={campCode}
                  onChange={(e) => setCampCode(e.target.value.toUpperCase())}
                  className="hm-admin-input"
                  style={{ textTransform: "uppercase", fontWeight: 600 }}
                />
              </div>

              <div>
                <label className="hm-admin-label">Kampanya Başlığı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Bahara Özel %15 İndirim"
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  className="hm-admin-input"
                />
              </div>

              <div>
                <label className="hm-admin-label">İndirim Oranı (%)</label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  placeholder="Örn: 15"
                  value={campDiscount}
                  onChange={(e) =>
                    setCampDiscount(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="hm-admin-input"
                />
              </div>

              <div>
                <label className="hm-admin-label">Min. Sepet Tutarı (₺)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Örn: 1500"
                  value={campMinBasket}
                  onChange={(e) =>
                    setCampMinBasket(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="hm-admin-input"
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div>
                <label className="hm-admin-label">Başlangıç Tarihi *</label>
                <input
                  type="date"
                  required
                  value={campStartDate}
                  onChange={(e) => setCampStartDate(e.target.value)}
                  className="hm-admin-input"
                />
              </div>

              <div>
                <label className="hm-admin-label">Bitiş Tarihi *</label>
                <input
                  type="date"
                  required
                  value={campEndDate}
                  onChange={(e) => setCampEndDate(e.target.value)}
                  className="hm-admin-input"
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", paddingTop: "1.25rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={campIsActive}
                    onChange={(e) => setCampIsActive(e.target.checked)}
                  />
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Kampanya Aktif</span>
                </label>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label className="hm-admin-label">Açıklama / Şartlar</label>
              <textarea
                rows={2}
                placeholder="Kampanya şartları ve sepet bilgilendirme açıklaması..."
                value={campDescription}
                onChange={(e) => setCampDescription(e.target.value)}
                className="hm-admin-textarea"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                className="hm-admin-btn hm-admin-btn-outline"
                onClick={resetCampForm}
                disabled={campLoading}
              >
                İptal
              </button>
              <button
                type="submit"
                className="hm-admin-btn hm-admin-btn-primary"
                disabled={campLoading}
              >
                {campLoading ? "Kaydediliyor..." : editingCampId ? "Güncelle" : "Kampanyayı Kaydet"}
              </button>
            </div>
          </form>
        )}

        {/* Kampanya Tablosu */}
        <table className="hm-admin-table">
          <thead>
            <tr>
              <th>Kupon Kodu</th>
              <th>Kampanya Adı</th>
              <th>İndirim</th>
              <th>Min. Sepet</th>
              <th>Geçerlilik Tarihleri</th>
              <th>Durum</th>
              <th style={{ textAlign: "right" }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "2rem" }}>
                  Henüz tanımlı kampanya bulunmamaktadır.
                </td>
              </tr>
            ) : (
              campaigns.map((camp) => (
                <tr key={camp.id}>
                  <td>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontWeight: 700,
                        backgroundColor: "#E2E8F0",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {camp.code}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{camp.name}</td>
                  <td>
                    {camp.discountPercentage ? (
                      <span className="hm-admin-badge hm-admin-badge-success">
                        %{camp.discountPercentage} İndirim
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {camp.minBasketAmount
                      ? `${camp.minBasketAmount.toLocaleString("tr-TR")} ₺`
                      : "Alt Limitsiz"}
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--hm-admin-text-muted)" }}>
                    {camp.startDate} / {camp.endDate}
                  </td>
                  <td>
                    {camp.isActive ? (
                      <span className="hm-admin-badge hm-admin-badge-success">Aktif</span>
                    ) : (
                      <span className="hm-admin-badge hm-admin-badge-neutral">Pasif</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="hm-admin-btn hm-admin-btn-outline"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                        onClick={() => startEditCampaign(camp)}
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="hm-admin-btn hm-admin-btn-danger"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                        onClick={() => handleDeleteCampaign(camp)}
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
