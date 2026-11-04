"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function SimulationContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("orderNumber") || "";
  const accessToken = searchParams.get("accessToken") || "";
  const amount = searchParams.get("amount") || "0";

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleAction = async (action: "success" | "failed") => {
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/payments/paytr/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber,
          action,
          failedReasonMsg:
            action === "failed" ? "Simülasyon: Kullanıcı tarafından işlem iptal edildi." : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Simülasyon işlemi başarısız.");
      }

      // Ana pencereyi başarı veya başarısızlık sayfasına yönlendir
      const targetUrl =
        action === "success"
          ? `/odeme/basarili?orderNumber=${encodeURIComponent(orderNumber)}&accessToken=${encodeURIComponent(accessToken)}`
          : `/odeme/basarisiz?orderNumber=${encodeURIComponent(orderNumber)}`;

      if (window.top) {
        window.top.location.href = targetUrl;
      } else {
        window.location.href = targetUrl;
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Simülasyon hatası oluştu.");
      setLoading(false);
    }
  };

  const formattedAmount = (Number(amount) / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        backgroundColor: "#F7FAFC",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          backgroundColor: "#FFF",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          border: "1px solid #E2E8F0",
          overflow: "hidden",
        }}
      >
        {/* Başlık Bandı */}
        <div
          style={{
            backgroundColor: "#1A202C",
            color: "#FFF",
            padding: "1rem 1.25rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.25rem" }}>💳</span>
            <span style={{ fontWeight: 700, letterSpacing: "0.05em", fontSize: "0.9375rem" }}>
              PayTR Güvenli Ödeme Simülatörü
            </span>
          </div>
          <span
            style={{
              backgroundColor: "#2B6CB0",
              fontSize: "0.6875rem",
              padding: "0.2rem 0.5rem",
              borderRadius: "4px",
              fontWeight: 600,
            }}
          >
            TEST MODU
          </span>
        </div>

        <div style={{ padding: "1.5rem" }}>
          {errorMsg && (
            <div
              style={{
                backgroundColor: "#FFF5F5",
                color: "#C53030",
                padding: "0.75rem",
                borderRadius: "6px",
                fontSize: "0.8125rem",
                marginBottom: "1rem",
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Tutar ve Sipariş Özeti */}
          <div
            style={{
              backgroundColor: "#F8FAFC",
              padding: "1rem",
              borderRadius: "8px",
              border: "1px solid #EDF2F7",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.8125rem", color: "#718096" }}>
              <span>İşyeri / Mağaza</span>
              <strong style={{ color: "#1A202C" }}>Hümra Moda Butik</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.8125rem", color: "#718096" }}>
              <span>Sipariş No</span>
              <strong style={{ fontFamily: "monospace", color: "#1A202C" }}>{orderNumber}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem", borderTop: "1px solid #E2E8F0" }}>
              <span style={{ fontWeight: 600, color: "#1A202C" }}>Çekilecek Tutar</span>
              <strong style={{ color: "#8B2635", fontSize: "1.125rem" }}>
                {formattedAmount} ₺
              </strong>
            </div>
          </div>

          {/* Sahte Kart Görseli */}
          <div
            style={{
              background: "linear-gradient(135deg, #2D3748 0%, #1A202C 100%)",
              color: "#FFF",
              padding: "1.25rem",
              borderRadius: "8px",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem", fontSize: "0.75rem", color: "#A0AEC0" }}>
              <span>TEST KREDİ KARTI</span>
              <span>3D SECURE</span>
            </div>
            <div style={{ fontFamily: "monospace", fontSize: "1.125rem", letterSpacing: "0.15em", marginBottom: "1rem" }}>
              5400 •••• •••• 0001
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#CBD5E0" }}>
              <span>HÜMRA TEST KULLANICISI</span>
              <span>12/28</span>
            </div>
          </div>

          <p style={{ fontSize: "0.75rem", color: "#718096", lineHeight: 1.5, marginBottom: "1.5rem", textAlign: "center" }}>
            Bu ekran PayTR iFrame test modunu taklit eder. Gerçek banka işlemi yapılmaz.
            Aşağıdaki butonlarla sunucu tarafı callback doğrulaması ve stok hareketlerini test edebilirsiniz.
          </p>

          {/* Test Aksiyon Butonları */}
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={() => handleAction("success")}
              disabled={loading}
              style={{
                width: "100%",
                padding: "0.85rem",
                backgroundColor: "#2E7D32",
                color: "#FFF",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              {loading ? "İşleniyor..." : "✓ 3D Secure ile Ödemeyi Onayla (Başarılı)"}
            </button>

            <button
              type="button"
              onClick={() => handleAction("failed")}
              disabled={loading}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: "#FFF",
                color: "#D32F2F",
                border: "1px solid #D32F2F",
                borderRadius: "6px",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              ✕ Ödemeyi Reddet / İptal Et (Başarısız)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SimulationPage() {
  return (
    <Suspense fallback={<div>Yükleniyor...</div>}>
      <SimulationContent />
    </Suspense>
  );
}
