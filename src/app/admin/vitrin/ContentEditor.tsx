"use client";

import React, { useState } from "react";
import Link from "next/link";
import { HomepageContent } from "@/lib/server/store";

interface ContentEditorProps {
  initialContent: HomepageContent;
}

export function ContentEditor({ initialContent }: ContentEditorProps) {
  const [content, setContent] = useState<HomepageContent>(initialContent);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "İçerik güncellenemedi.");
      }

      setContent(data.content);
      setSuccessMsg("Ana sayfa ve vitrin içerikleri başarıyla kaydedildi! Vitrinde canlı olarak güncellendi.");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Kayıt sırasında bir hata oluştu.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
            Vitrin & İçerik Yönetimi
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Ana sayfa hero alanı, duyuru bandı, öne çıkan afiş ve marka değerlerini kod düzenlemeden yönetin.
          </p>
        </div>
        <Link
          href="/"
          target="_blank"
          className="hm-admin-btn hm-admin-btn-outline"
        >
          ↗ Canlı Vitrini Gör
        </Link>
      </div>

      {successMsg && (
        <div
          style={{
            padding: "0.875rem 1rem",
            backgroundColor: "#E6F4EA",
            color: "#137333",
            borderRadius: "4px",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
          }}
        >
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: "0.875rem 1rem",
            backgroundColor: "#FCE8E6",
            color: "#C5221F",
            borderRadius: "4px",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
          }}
        >
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 1. DUYURU BANDI */}
        <div className="hm-admin-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
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
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
                1. Üst Duyuru Bandı (Announcement Bar)
              </h2>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", color: "var(--hm-admin-text-muted)" }}>
                Sitenin en üstünde yer alan duyuru ve kargo bilgilendirme şeridi.
              </p>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={content.announcement.isActive}
                onChange={(e) =>
                  setContent({
                    ...content,
                    announcement: { ...content.announcement, isActive: e.target.checked },
                  })
                }
              />
              <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Duyuru Bandı Aktif</span>
            </label>
          </div>

          <div>
            <label className="hm-admin-label">Duyuru Metni</label>
            <input
              type="text"
              value={content.announcement.text}
              onChange={(e) =>
                setContent({
                  ...content,
                  announcement: { ...content.announcement, text: e.target.value },
                })
              }
              className="hm-admin-input"
              placeholder="Örn: Tüm Türkiye'ye 3.500 ₺ Üzeri Ücretsiz Kargo & Hızlı Teslimat"
            />
          </div>
        </div>

        {/* 2. HERO ALANI */}
        <div className="hm-admin-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              margin: "0 0 0.25rem 0",
              borderBottom: "1px solid var(--hm-admin-border-subtle)",
              paddingBottom: "0.75rem",
            }}
          >
            2. Ana Sayfa Karşılama (Hero) Alanı
          </h2>
          <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.8125rem", color: "var(--hm-admin-text-muted)" }}>
            Ziyaretçiyi ilk karşılayan büyük afiş, başlık ve yönlendirme butonları.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <label className="hm-admin-label">Rozet (Badge) Metni</label>
              <input
                type="text"
                value={content.hero.badge}
                onChange={(e) =>
                  setContent({
                    ...content,
                    hero: { ...content.hero, badge: e.target.value },
                  })
                }
                className="hm-admin-input"
                placeholder="Örn: 2026 İlkbahar / Yaz Koleksiyonu"
              />
            </div>

            <div>
              <label className="hm-admin-label">Hero Kapak Görseli URL</label>
              <input
                type="text"
                value={content.hero.imageUrl}
                onChange={(e) =>
                  setContent({
                    ...content,
                    hero: { ...content.hero, imageUrl: e.target.value },
                  })
                }
                className="hm-admin-input"
                placeholder="Örn: /uploads/products/IMG_2237-detail.webp"
              />
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="hm-admin-label">Ana Başlık (Title)</label>
            <input
              type="text"
              value={content.hero.title}
              onChange={(e) =>
                setContent({
                  ...content,
                  hero: { ...content.hero, title: e.target.value },
                })
              }
              className="hm-admin-input"
              placeholder="Örn: Zamansız Kalıplar, Kusursuz Siluetler."
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="hm-admin-label">Alt Açıklama (Subtitle)</label>
            <textarea
              rows={2}
              value={content.hero.subtitle}
              onChange={(e) =>
                setContent({
                  ...content,
                  hero: { ...content.hero, subtitle: e.target.value },
                })
              }
              className="hm-admin-textarea"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1rem",
            }}
          >
            <div>
              <label className="hm-admin-label">Birincil Buton Metni</label>
              <input
                type="text"
                value={content.hero.primaryCtaText}
                onChange={(e) =>
                  setContent({
                    ...content,
                    hero: { ...content.hero, primaryCtaText: e.target.value },
                  })
                }
                className="hm-admin-input"
              />
            </div>

            <div>
              <label className="hm-admin-label">Birincil Buton Bağlantısı</label>
              <input
                type="text"
                value={content.hero.primaryCtaLink}
                onChange={(e) =>
                  setContent({
                    ...content,
                    hero: { ...content.hero, primaryCtaLink: e.target.value },
                  })
                }
                className="hm-admin-input"
              />
            </div>

            <div>
              <label className="hm-admin-label">İkincil Buton Metni</label>
              <input
                type="text"
                value={content.hero.secondaryCtaText}
                onChange={(e) =>
                  setContent({
                    ...content,
                    hero: { ...content.hero, secondaryCtaText: e.target.value },
                  })
                }
                className="hm-admin-input"
              />
            </div>

            <div>
              <label className="hm-admin-label">İkincil Buton Bağlantısı</label>
              <input
                type="text"
                value={content.hero.secondaryCtaLink}
                onChange={(e) =>
                  setContent({
                    ...content,
                    hero: { ...content.hero, secondaryCtaLink: e.target.value },
                  })
                }
                className="hm-admin-input"
              />
            </div>
          </div>
        </div>

        {/* 3. ÖNE ÇIKAN SPOTLIGHT ALANI */}
        <div className="hm-admin-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              margin: "0 0 0.25rem 0",
              borderBottom: "1px solid var(--hm-admin-border-subtle)",
              paddingBottom: "0.75rem",
            }}
          >
            3. Özel Seçki Afişi (Spotlight Banner)
          </h2>
          <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.8125rem", color: "var(--hm-admin-text-muted)" }}>
            Ana sayfada orta bölümde yer alan geniş koleksiyon afişi ve tanıtımı.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <label className="hm-admin-label">Etiket (Tag)</label>
              <input
                type="text"
                value={content.spotlight.tag}
                onChange={(e) =>
                  setContent({
                    ...content,
                    spotlight: { ...content.spotlight, tag: e.target.value },
                  })
                }
                className="hm-admin-input"
                placeholder="Örn: Hümra Moda Terzilik Sanatı"
              />
            </div>

            <div>
              <label className="hm-admin-label">Afiş Başlığı</label>
              <input
                type="text"
                value={content.spotlight.title}
                onChange={(e) =>
                  setContent({
                    ...content,
                    spotlight: { ...content.spotlight, title: e.target.value },
                  })
                }
                className="hm-admin-input"
              />
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="hm-admin-label">Açıklama</label>
            <textarea
              rows={2}
              value={content.spotlight.description}
              onChange={(e) =>
                setContent({
                  ...content,
                  spotlight: { ...content.spotlight, description: e.target.value },
                })
              }
              className="hm-admin-textarea"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1rem",
            }}
          >
            <div>
              <label className="hm-admin-label">Buton Metni</label>
              <input
                type="text"
                value={content.spotlight.ctaText}
                onChange={(e) =>
                  setContent({
                    ...content,
                    spotlight: { ...content.spotlight, ctaText: e.target.value },
                  })
                }
                className="hm-admin-input"
              />
            </div>

            <div>
              <label className="hm-admin-label">Buton Bağlantısı</label>
              <input
                type="text"
                value={content.spotlight.ctaLink}
                onChange={(e) =>
                  setContent({
                    ...content,
                    spotlight: { ...content.spotlight, ctaLink: e.target.value },
                  })
                }
                className="hm-admin-input"
              />
            </div>
          </div>
        </div>

        {/* 4. MARKA DEĞERLERİ & AVANTAJLAR */}
        <div className="hm-admin-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              margin: "0 0 0.25rem 0",
              borderBottom: "1px solid var(--hm-admin-border-subtle)",
              paddingBottom: "0.75rem",
            }}
          >
            4. Marka Değerleri & Müşteri Güvenliği Kartları
          </h2>
          <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.8125rem", color: "var(--hm-admin-text-muted)" }}>
            Ana sayfada ve ürün detay sayfalarında gösterilen 4 temel güven ve hizmet vaadi.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1rem",
            }}
          >
            {content.brandValues.map((bv, idx) => (
              <div
                key={idx}
                style={{
                  padding: "1rem",
                  border: "1px solid var(--hm-admin-border)",
                  borderRadius: "4px",
                  backgroundColor: "#FAFAFA",
                }}
              >
                <div style={{ marginBottom: "0.75rem" }}>
                  <label className="hm-admin-label">Kart {idx + 1} Başlığı</label>
                  <input
                    type="text"
                    value={bv.title}
                    onChange={(e) => {
                      const updated = [...content.brandValues];
                      updated[idx].title = e.target.value;
                      setContent({ ...content, brandValues: updated });
                    }}
                    className="hm-admin-input"
                  />
                </div>

                <div>
                  <label className="hm-admin-label">Kart {idx + 1} Açıklaması</label>
                  <textarea
                    rows={2}
                    value={bv.description}
                    onChange={(e) => {
                      const updated = [...content.brandValues];
                      updated[idx].description = e.target.value;
                      setContent({ ...content, brandValues: updated });
                    }}
                    className="hm-admin-textarea"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
          <button
            type="submit"
            className="hm-admin-btn hm-admin-btn-primary"
            style={{ padding: "0.75rem 2rem", fontSize: "0.875rem" }}
            disabled={loading}
          >
            {loading ? "Kaydediliyor..." : "Tüm Değişiklikleri Vitrine Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}
