"use client";

import React, { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/formatters";
import { FinancialReport } from "@/lib/server/store";

export default function AdminFinancialReportPage() {
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"ALL" | "TODAY" | "7DAYS" | "THIS_MONTH">("ALL");

  const fetchReport = async (range: "ALL" | "TODAY" | "7DAYS" | "THIS_MONTH") => {
    setLoading(true);
    let startDate: string | undefined = undefined;
    const now = new Date();

    if (range === "TODAY") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startDate = today.toISOString();
    } else if (range === "7DAYS") {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate = sevenDaysAgo.toISOString();
    } else if (range === "THIS_MONTH") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = firstDay.toISOString();
    }

    try {
      const url = startDate ? `/api/admin/finans?startDate=${encodeURIComponent(startDate)}` : "/api/admin/finans";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setReport(data);
      }
    } catch (err) {
      console.error("Finans raporu getirme hatası:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(dateRange);
  }, [dateRange]);

  return (
    <div>
      {/* Üst Başlık & Filtreler */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
            Satış ve Gerçek Kâr Takibi
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Satış geliri kâr değildir. Ürün maliyetlerini (COGS), komisyonları ve operasyonel giderleri netleştirin.
          </p>
        </div>

        {/* Tarih Aralığı Filtresi */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[
            { id: "ALL", label: "Tüm Zamanlar" },
            { id: "THIS_MONTH", label: "Bu Ay" },
            { id: "7DAYS", label: "Son 7 Gün" },
            { id: "TODAY", label: "Bugün" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDateRange(tab.id as typeof dateRange)}
              className={`hm-admin-btn ${dateRange === tab.id ? "hm-admin-btn-primary" : "hm-admin-btn-outline"}`}
              style={{ fontSize: "0.8125rem", padding: "0.4rem 0.8rem" }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Eksik Maliyet Uyarısı */}
      {report?.hasMissingCosts && (
        <div
          style={{
            padding: "0.875rem 1.25rem",
            backgroundColor: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: "6px",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            color: "#92400E",
            fontSize: "0.8125rem",
          }}
        >
          <span style={{ fontSize: "1.25rem" }}>⚠️</span>
          <div>
            <strong>Dikkat: Bazı varyantlarda birim maliyet (alış fiyatı) girilmemiştir.</strong>
            <p style={{ margin: "0.2rem 0 0 0" }}>
              Bilinmeyen maliyetler sıfır (0 ₺) kabul edilerek gerçekte olmayan yapay kâr hesaplanmamıştır.
              Eksik kalemler aşağıdaki tabloda &quot;Maliyet Bilinmiyor&quot; olarak açıkça etiketlenmiştir.
            </p>
          </div>
        </div>
      )}

      {/* Finansal Metrik Kartları */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.75rem",
        }}
      >
        {/* 1. Brüt Satış */}
        <div className="hm-admin-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#718096", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>
            1. Brüt Satış Geliri
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1A202C" }} className="tabular-nums">
            {loading ? "..." : formatCurrency(report?.grossSalesRevenue || 0)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.35rem" }}>
            {report?.confirmedCount || 0} onaylı, {report?.pendingCount || 0} işlem bekleyen
          </div>
        </div>

        {/* 2. İptaller */}
        <div className="hm-admin-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#718096", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>
            2. İptal / İade Tutarı
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#C5221F" }} className="tabular-nums">
            {loading ? "..." : formatCurrency(report?.cancelledAmount || 0)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.35rem" }}>
            {report?.cancelledCount || 0} adet iptal edilen sipariş
          </div>
        </div>

        {/* 3. COGS (Ürün Maliyeti) */}
        <div className="hm-admin-card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#718096", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>
            3. Satılan Mal Maliyeti (COGS)
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#D97706" }} className="tabular-nums">
            {loading ? "..." : formatCurrency(report?.totalCogs || 0)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.35rem" }}>
            Sipariş anındaki maliyet snapshot&apos;ı
          </div>
        </div>

        {/* 4. Tahmini Brüt Kâr */}
        <div className="hm-admin-card" style={{ padding: "1.25rem", borderLeft: "4px solid #137333" }}>
          <div style={{ fontSize: "0.75rem", color: "#137333", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "0.35rem" }}>
            4. Tahmini Brüt Kâr
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#137333" }} className="tabular-nums">
            {loading ? "..." : formatCurrency(report?.estimatedGrossProfit || 0)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.35rem" }}>
            Net Satış − Ürün Maliyetleri
          </div>
        </div>

        {/* 5. Tahmini Net Kâr */}
        <div className="hm-admin-card" style={{ padding: "1.25rem", borderLeft: "4px solid #8B2635" }}>
          <div style={{ fontSize: "0.75rem", color: "#8B2635", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "0.35rem" }}>
            5. Tahmini Net Kâr
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#8B2635" }} className="tabular-nums">
            {loading ? "..." : formatCurrency(report?.estimatedNetProfit || 0)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.35rem" }}>
            Brüt Kâr − Kargo ({formatCurrency(report?.estimatedShippingExpenses || 0)}) − Komisyon ({formatCurrency(report?.estimatedPaymentCommissions || 0)})
          </div>
        </div>
      </div>

      {/* Sipariş Bazında Kâr Dökümü Tablosu */}
      <div className="hm-admin-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--hm-admin-border)" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
            Sipariş Bazında Kâr ve Maliyet Analizi
          </h2>
        </div>

        <table className="hm-admin-table">
          <thead>
            <tr>
              <th>Sipariş No</th>
              <th>Müşteri</th>
              <th>Durum</th>
              <th>Satış Tutarı</th>
              <th>Ürün Maliyeti (COGS)</th>
              <th>Brüt Kâr</th>
              <th>Kâr Marjı (%)</th>
              <th>Maliyet Güvenilirliği</th>
            </tr>
          </thead>
          <tbody>
            {!report || report.orders.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#718096" }}>
                  Bu tarih aralığında sipariş kaydı bulunmamaktadır.
                </td>
              </tr>
            ) : (
              report.orders.map((o) => {
                const marginPercent =
                  o.grossProfit !== undefined && o.totalAmount > 0
                    ? Math.round((o.grossProfit / o.totalAmount) * 100)
                    : null;

                const isCancelled = o.operationalStatus === "CANCELLED";

                return (
                  <tr key={o.orderId}>
                    <td style={{ fontWeight: 600 }}>{o.orderNumber}</td>
                    <td>{o.customerFullName}</td>
                    <td>
                      <span
                        className={`hm-admin-badge ${
                          o.operationalStatus === "CONFIRMED"
                            ? "hm-admin-badge-success"
                            : o.operationalStatus === "CANCELLED"
                            ? "hm-admin-badge-danger"
                            : "hm-admin-badge-warning"
                        }`}
                      >
                        {o.operationalStatus === "CONFIRMED"
                          ? "ONAYLANDI"
                          : o.operationalStatus === "CANCELLED"
                          ? "İPTAL"
                          : "BEKLEMEDE"}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }} className="tabular-nums">
                      {isCancelled ? <del style={{ color: "#A0AEC0" }}>{formatCurrency(o.totalAmount)}</del> : formatCurrency(o.totalAmount)}
                    </td>
                    <td className="tabular-nums">
                      {isCancelled ? (
                        <span style={{ color: "#A0AEC0" }}>0 ₺ (İptal)</span>
                      ) : o.cogs !== undefined ? (
                        formatCurrency(o.cogs)
                      ) : (
                        <span style={{ color: "#D97706" }}>Eksik Veri</span>
                      )}
                    </td>
                    <td className="tabular-nums" style={{ fontWeight: 600 }}>
                      {isCancelled ? (
                        <span style={{ color: "#A0AEC0" }}>0 ₺</span>
                      ) : o.grossProfit !== undefined ? (
                        <span style={{ color: o.grossProfit >= 0 ? "#137333" : "#C5221F" }}>
                          {formatCurrency(o.grossProfit)}
                        </span>
                      ) : (
                        <span style={{ color: "#D97706" }}>Hesaplanamadı</span>
                      )}
                    </td>
                    <td>
                      {isCancelled ? (
                        "-"
                      ) : marginPercent !== null ? (
                        <span style={{ fontWeight: 600, color: marginPercent >= 40 ? "#137333" : "#D97706" }}>
                          %{marginPercent}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {o.isCostMissing ? (
                        <span
                          className="hm-admin-badge hm-admin-badge-warning"
                          style={{ fontSize: "0.6875rem" }}
                        >
                          Tahmini (Eksik Maliyet)
                        </span>
                      ) : (
                        <span
                          className="hm-admin-badge hm-admin-badge-success"
                          style={{ fontSize: "0.6875rem" }}
                        >
                          Doğrulanmış Snapshot
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
