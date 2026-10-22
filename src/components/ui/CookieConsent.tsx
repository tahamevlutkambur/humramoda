"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export function CookieConsent() {
  const [hasDecided, setHasDecided] = useState(true); // SSR başlangıçta gizli
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [allowOptional, setAllowOptional] = useState(false);

  useEffect(() => {
    // Tarayıcı ortamında tercihi oku
    const savedConsent = localStorage.getItem("cookie_consent");
    if (!savedConsent) {
      setHasDecided(false);
    } else {
      setAllowOptional(savedConsent === "all");
    }

    // Global erişim fonksiyonu ekle (Politika sayfasındaki buton tetikleyebilsin)
    (window as unknown as { __openCookiePreferences: () => void }).__openCookiePreferences = () => {
      setShowPreferencesModal(true);
    };

    return () => {
      delete (window as unknown as { __openCookiePreferences?: () => void }).__openCookiePreferences;
    };
  }, []);

  const saveConsent = (choice: "necessary" | "all") => {
    localStorage.setItem("cookie_consent", choice);
    document.cookie = `cookie_consent=${choice}; path=/; max-age=31536000; SameSite=Lax`;
    setHasDecided(true);
    setShowPreferencesModal(false);
    setAllowOptional(choice === "all");
  };

  const handleSaveCustomPreferences = () => {
    saveConsent(allowOptional ? "all" : "necessary");
  };

  return (
    <>
      {/* 1. Alt Kayan Çerez Bildirim Çubuğu */}
      {!hasDecided && !showPreferencesModal && (
        <aside
          aria-label="Çerez İzin Bildirimi"
          style={{
            position: "fixed",
            bottom: "1.25rem",
            left: "1.25rem",
            right: "1.25rem",
            maxWidth: "680px",
            margin: "0 auto",
            backgroundColor: "rgba(20, 20, 20, 0.96)",
            color: "#FFFFFF",
            padding: "1.25rem",
            borderRadius: "8px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
            backdropFilter: "blur(10px)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        >
          <div>
            <strong style={{ fontSize: "14px", display: "block", marginBottom: "0.25rem", letterSpacing: "0.02em" }}>
              Çerez (Cookie) Tercihleriniz
            </strong>
            <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.85)" }}>
              Sitemizin düzgün çalışabilmesi ve güvenliğiniz için zorunlu teknik çerezler kullanılmaktadır.
              Ayrıntılı bilgi için{" "}
              <Link
                href="/gizlilik-ve-cerez-politikasi"
                style={{ color: "#E0A96D", textDecoration: "underline" }}
              >
                Gizlilik ve Çerez Politikamızı
              </Link>{" "}
              inceleyebilirsiniz.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setShowPreferencesModal(true)}
              style={{
                backgroundColor: "transparent",
                color: "#FFFFFF",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                padding: "0.45rem 0.9rem",
                borderRadius: "4px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Tercihleri Özelleştir
            </button>
            <button
              type="button"
              onClick={() => saveConsent("necessary")}
              style={{
                backgroundColor: "transparent",
                color: "#FFFFFF",
                border: "1px solid rgba(255, 255, 255, 0.6)",
                padding: "0.45rem 0.9rem",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Yalnızca Zorunluları Kabul Et
            </button>
            <button
              type="button"
              onClick={() => saveConsent("all")}
              style={{
                backgroundColor: "#FFFFFF",
                color: "#141414",
                border: "none",
                padding: "0.45rem 1rem",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Tümünü Kabul Et
            </button>
          </div>
        </aside>
      )}

      {/* 2. Çerez Tercihleri Yönetim Modalı */}
      {showPreferencesModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookieModalTitle"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              color: "#1E293B",
              borderRadius: "8px",
              padding: "1.75rem",
              width: "100%",
              maxWidth: "540px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 id="cookieModalTitle" style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
                Çerez Tercihlerini Yönet
              </h2>
              <button
                type="button"
                onClick={() => setShowPreferencesModal(false)}
                aria-label="Kapat"
                style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "#64748B" }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "#64748B", margin: 0, lineHeight: 1.6 }}>
              Hümra Moda&apos;da gizliliğinize önem veriyoruz. Hangi çerezlerin çalışmasına izin vermek istediğinizi aşağıdan
              belirleyebilirsiniz.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {/* Zorunlu Çerezler */}
              <div
                style={{
                  padding: "0.875rem",
                  backgroundColor: "#F8FAFC",
                  borderRadius: "6px",
                  border: "1px solid #E2E8F0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "13px", display: "block", color: "#0F172A" }}>
                    Zorunlu Teknik Çerezler
                  </strong>
                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                    Oturum güvenliği, sepet ve ödeme işlemleri için gereklidir. Kapatılamaz.
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    backgroundColor: "#E2E8F0",
                    color: "#475569",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "4px",
                  }}
                >
                  Her Zaman Aktif
                </span>
              </div>

              {/* İsteğe Bağlı Çerezler */}
              <div
                style={{
                  padding: "0.875rem",
                  backgroundColor: "#F8FAFC",
                  borderRadius: "6px",
                  border: "1px solid #E2E8F0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "13px", display: "block", color: "#0F172A" }}>
                    Fonksiyonel ve Deneyim Çerezleri
                  </strong>
                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                    Tercihlerinizin hatırlanması ve sayfa hızının optimize edilmesi için kullanılır.
                  </span>
                </div>
                <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={allowOptional}
                    onChange={(e) => setAllowOptional(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                </label>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={() => saveConsent("all")}
                style={{
                  backgroundColor: "transparent",
                  color: "#0F172A",
                  border: "1px solid #CBD5E1",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Tümünü Kabul Et
              </button>
              <button
                type="button"
                onClick={handleSaveCustomPreferences}
                style={{
                  backgroundColor: "#0F172A",
                  color: "#FFFFFF",
                  border: "none",
                  padding: "0.5rem 1.25rem",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Tercihlerimi Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
