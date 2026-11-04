"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/formatters";

interface ReconcileEvent {
  id: string;
  eventType: string;
  aggregateId: string;
  idempotencyKey: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string;
  errorMessage?: string | null;
  processedAt?: string | null;
  providerReference?: string | null;
  createdAt: string;
  refundAmountKurus: number;
  refundAmountTL: string;
  order?: {
    orderNumber: string;
    customerFullName: string;
    customerEmail: string;
    totalAmount: number;
    totalKurus: number;
    refundedAmount: number;
    paymentStatus: string;
    status: string;
  } | null;
}

export default function AdminReconciliationPage() {
  const [quarantinedEvents, setQuarantinedEvents] = useState<ReconcileEvent[]>([]);
  const [historyEvents, setHistoryEvents] = useState<ReconcileEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"QUARANTINE" | "HISTORY">("QUARANTINE");

  // Karar Modalı & Formu
  const [selectedEvent, setSelectedEvent] = useState<ReconcileEvent | null>(null);
  const [decisionAction, setDecisionAction] = useState<"CONFIRMED" | "REJECTED">("CONFIRMED");
  const [providerReference, setProviderReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const fetchReconcileData = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/finance/reconcile");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Mutabakat verileri alınamadı.");
      }
      setQuarantinedEvents(data.quarantinedEvents || []);
      setHistoryEvents(data.historyEvents || []);
    } catch (err: any) {
      console.error("Mutabakat verisi getirme hatası:", err);
      setErrorMsg(err?.message || "Sunucuyla bağlantı kurulamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconcileData();
  }, []);

  const openDecisionModal = (event: ReconcileEvent) => {
    setSelectedEvent(event);
    setDecisionAction("CONFIRMED");
    setProviderReference(event.providerReference || "");
    setNotes("");
    setErrorMsg("");
    setSuccessMsg("");
  };

  const closeDecisionModal = () => {
    setSelectedEvent(null);
    setIsConfirmModalOpen(false);
    setProviderReference("");
    setNotes("");
  };

  const handleSubmitDecision = async () => {
    if (!selectedEvent) return;

    if (decisionAction === "CONFIRMED" && (!providerReference || providerReference.trim().length < 3)) {
      setErrorMsg("PayTR işlem veya referans kodu en az 3 karakter olarak zorunludur.");
      return;
    }

    if (!notes || notes.trim().length < 5) {
      setErrorMsg("Lütfen en az 5 karakterlik bir gerekçe veya kanıt açıklaması giriniz.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/admin/finance/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          action: decisionAction,
          providerReference: decisionAction === "CONFIRMED" ? providerReference.trim() : undefined,
          notes: notes.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Mutabakat işlemi tamamlanamadı.");
      }

      setSuccessMsg(data.message || "Mutabakat kararı başarıyla işlendi ve kaydedildi.");
      closeDecisionModal();
      await fetchReconcileData();
    } catch (err: any) {
      setErrorMsg(err?.message || "Mutabakat kaydedilirken bir hata oluştu.");
    } finally {
      setSubmitting(false);
      setIsConfirmModalOpen(false);
    }
  };

  // İstatistikler
  const totalQuarantinedCount = quarantinedEvents.length;
  const totalQuarantinedKurus = quarantinedEvents.reduce(
    (sum, e) => sum + (e.refundAmountKurus || 0),
    0
  );
  const totalResolvedCount = historyEvents.length;

  return (
    <div style={{ padding: "0 0 3rem 0" }}>
      {/* Üst Başlık & Navigasyon */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <Link
              href="/admin/finans"
              style={{ fontSize: "0.875rem", color: "#64748b", textDecoration: "none" }}
            >
              Finans ve Raporlar
            </Link>
            <span style={{ fontSize: "0.875rem", color: "#94a3b8" }}>/</span>
            <span style={{ fontSize: "0.875rem", color: "#0f172a", fontWeight: 600 }}>
              İade Mutabakat Merkezi
            </span>
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
            İade Mutabakat ve Karantina Masası
          </h1>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={fetchReconcileData}
            disabled={loading}
            style={{
              padding: "0.5rem 1rem",
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            🔄 Yenile
          </button>
        </div>
      </div>

      {/* Güvenlik Bildirimi Banner */}
      <div
        style={{
          padding: "1rem 1.25rem",
          backgroundColor: "#fffbeb",
          border: "1px solid #fef3c7",
          borderRadius: "0.5rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
        }}
      >
        <span style={{ fontSize: "1.25rem" }}>⚠️</span>
        <div style={{ fontSize: "0.875rem", color: "#92400e", lineHeight: 1.5 }}>
          <strong>Güvenlik Protokolü:</strong> PayTR İade API'sinde ağ zaman aşımı oluştuğunda mükerrer para
          çıkışını (çift iade) önlemek amacıyla otomatik tekrar deneme (blind retry) kapatılmıştır.
          Aşağıdaki kayıtlar karantinaya alınmış olup, lütfen <strong>PayTR Üye İşyeri Paneli</strong>'nde
          ilgili sipariş numarasını kontrol ederek işlemi onaylayınız veya reddediniz.
        </div>
      </div>

      {/* Mesaj Bildirimleri */}
      {errorMsg && (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: "0.375rem",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
          }}
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
            borderRadius: "0.375rem",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Özet Kartları */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            background: "#fff",
            padding: "1.25rem",
            borderRadius: "0.5rem",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "0.8125rem", color: "#64748b", fontWeight: 500 }}>
            Bekleyen Mutabakat Talebi
          </div>
          <div
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              color: totalQuarantinedCount > 0 ? "#dc2626" : "#16a34a",
              marginTop: "0.5rem",
            }}
          >
            {totalQuarantinedCount} Adet
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.25rem" }}>
            Müdahale bekleyen karantina kayıtları
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            padding: "1.25rem",
            borderRadius: "0.5rem",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "0.8125rem", color: "#64748b", fontWeight: 500 }}>
            Karantinadaki Toplam Tutar
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0f172a", marginTop: "0.5rem" }}>
            {formatCurrency(totalQuarantinedKurus / 100)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.25rem" }}>
            Askıda kalan iade tutarı
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            padding: "1.25rem",
            borderRadius: "0.5rem",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "0.8125rem", color: "#64748b", fontWeight: 500 }}>
            Çözümlenmiş Geçmiş İşlemler
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#2563eb", marginTop: "0.5rem" }}>
            {totalResolvedCount} Adet
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.25rem" }}>
            Kayıt altındaki mutabakat kararları
          </div>
        </div>
      </div>

      {/* Sekmeler (Tabs) */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: "1rem",
          gap: "1.5rem",
        }}
      >
        <button
          onClick={() => setActiveTab("QUARANTINE")}
          style={{
            padding: "0.75rem 0.25rem",
            background: "none",
            border: "none",
            borderBottom: activeTab === "QUARANTINE" ? "2px solid #2563eb" : "2px solid transparent",
            color: activeTab === "QUARANTINE" ? "#2563eb" : "#64748b",
            fontWeight: activeTab === "QUARANTINE" ? 600 : 500,
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Karantinadaki Olaylar ({quarantinedEvents.length})
        </button>
        <button
          onClick={() => setActiveTab("HISTORY")}
          style={{
            padding: "0.75rem 0.25rem",
            background: "none",
            border: "none",
            borderBottom: activeTab === "HISTORY" ? "2px solid #2563eb" : "2px solid transparent",
            color: activeTab === "HISTORY" ? "#2563eb" : "#64748b",
            fontWeight: activeTab === "HISTORY" ? 600 : 500,
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Geçmiş Mutabakatlar ({historyEvents.length})
        </button>
      </div>

      {/* Tablo İçeriği */}
      <div
        style={{
          background: "#fff",
          borderRadius: "0.5rem",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          overflowX: "auto",
        }}
      >
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
            Mutabakat verileri yükleniyor...
          </div>
        ) : activeTab === "QUARANTINE" ? (
          quarantinedEvents.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎉</div>
              <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: "0.25rem" }}>
                Mutabakat Bekleyen Olay Yok
              </div>
              <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                Şu anda PayTR üzerinde karantinaya alınmış bekleyen hiçbir iade işlemi bulunmuyor.
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>Olay / Idempotency ID</th>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>Sipariş No & Müşteri</th>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>İade Tutarı</th>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>Olay Tarihi</th>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>Hata / Karantina Nedeni</th>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569", textAlign: "right" }}>Eylem</th>
                </tr>
              </thead>
              <tbody>
                {quarantinedEvents.map((evt) => (
                  <tr key={evt.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#0f172a" }}>
                        {evt.id}
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "#94a3b8" }}>
                        Key: {evt.idempotencyKey.substring(0, 20)}...
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      {evt.order ? (
                        <>
                          <div style={{ fontWeight: 600, color: "#0f172a" }}>
                            {evt.order.orderNumber}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            {evt.order.customerFullName}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
                          Sipariş: {evt.aggregateId}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <div style={{ fontWeight: 700, color: "#dc2626" }}>
                        {formatCurrency(Number(evt.refundAmountTL))}
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "#64748b" }}>
                        ({evt.refundAmountKurus} kuruş)
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "#475569", fontSize: "0.75rem" }}>
                      {new Date(evt.createdAt).toLocaleString("tr-TR")}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", maxWidth: "260px" }}>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#b45309",
                          backgroundColor: "#fef3c7",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "0.25rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={evt.errorMessage || ""}
                      >
                        {evt.errorMessage || "Ağ zaman aşımı (Timeout)"}
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                      <button
                        onClick={() => openDecisionModal(evt)}
                        style={{
                          padding: "0.4rem 0.75rem",
                          background: "#0284c7",
                          color: "#fff",
                          border: "none",
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        İncele & Karar Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          historyEvents.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
              Henüz çözümlenmiş bir geçmiş mutabakat kaydı bulunmuyor.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>Olay ID</th>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>Sipariş No</th>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>İade Tutarı</th>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>Sonuç Durumu</th>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>Sağlayıcı Ref / Not</th>
                  <th style={{ padding: "0.75rem 1rem", color: "#475569" }}>İşlem Tarihi</th>
                </tr>
              </thead>
              <tbody>
                {historyEvents.map((evt) => (
                  <tr key={evt.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", fontSize: "0.75rem" }}>
                      {evt.id}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                      {evt.order?.orderNumber || evt.aggregateId}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                      {formatCurrency(Number(evt.refundAmountTL))}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "0.25rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          backgroundColor: evt.status === "COMPLETED" ? "#dcfce7" : "#fee2e2",
                          color: evt.status === "COMPLETED" ? "#166534" : "#991b1b",
                        }}
                      >
                        {evt.status === "COMPLETED" ? "ONAYLANDI (İADE YAPILDI)" : "REDDEDİLDİ (İPTAL)"}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.75rem", color: "#475569" }}>
                      <div>Ref: {evt.providerReference || "Yok"}</div>
                      <div style={{ color: "#64748b" }}>{evt.errorMessage || ""}</div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "#64748b", fontSize: "0.75rem" }}>
                      {evt.processedAt ? new Date(evt.processedAt).toLocaleString("tr-TR") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* KARAR VERME MODALI */}
      {selectedEvent && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "0.5rem",
              width: "100%",
              maxWidth: "580px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              overflow: "hidden",
            }}
          >
            {/* Modal Başlık */}
            <div
              style={{
                padding: "1.25rem",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#0f172a" }}>
                  İade Mutabakat Kararı
                </h3>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  Olay ID: {selectedEvent.id}
                </div>
              </div>
              <button
                onClick={closeDecisionModal}
                disabled={submitting}
                style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Gövdesi */}
            <div style={{ padding: "1.25rem" }}>
              {/* Detay Özeti */}
              <div
                style={{
                  background: "#f8fafc",
                  padding: "0.75rem 1rem",
                  borderRadius: "0.375rem",
                  marginBottom: "1rem",
                  fontSize: "0.8125rem",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <span style={{ color: "#64748b" }}>Sipariş No:</span>{" "}
                  <strong>{selectedEvent.order?.orderNumber || selectedEvent.aggregateId}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Talep Edilen İade:</span>{" "}
                  <strong style={{ color: "#dc2626" }}>
                    {formatCurrency(Number(selectedEvent.refundAmountTL))}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Müşteri:</span>{" "}
                  <strong>{selectedEvent.order?.customerFullName || "-"}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Sipariş Tutarı:</span>{" "}
                  <strong>
                    {selectedEvent.order ? formatCurrency(selectedEvent.order.totalAmount) : "-"}
                  </strong>
                </div>
              </div>

              {/* PayTR İnceleme İpucu */}
              <div
                style={{
                  padding: "0.75rem",
                  backgroundColor: "#eff6ff",
                  borderRadius: "0.375rem",
                  fontSize: "0.75rem",
                  color: "#1e40af",
                  marginBottom: "1rem",
                }}
              >
                ℹ️ <strong>PayTR Kontrolü:</strong> Lütfen PayTR merchant panelinde{" "}
                <code>{selectedEvent.order?.orderNumber}</code> siparişini aratın. İade işleminin panelde
                başarıyla gerçekleştiğini teyit ediniz.
              </div>

              {/* Karar Seçimi */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Mutabakat Kararı:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <button
                    type="button"
                    onClick={() => setDecisionAction("CONFIRMED")}
                    style={{
                      padding: "0.625rem",
                      borderRadius: "0.375rem",
                      border: decisionAction === "CONFIRMED" ? "2px solid #16a34a" : "1px solid #cbd5e1",
                      backgroundColor: decisionAction === "CONFIRMED" ? "#f0fdf4" : "#fff",
                      color: decisionAction === "CONFIRMED" ? "#166534" : "#475569",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                      textAlign: "center",
                    }}
                  >
                    ✔ İadeyi Onayla (PayTR'de Yansıdı)
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecisionAction("REJECTED")}
                    style={{
                      padding: "0.625rem",
                      borderRadius: "0.375rem",
                      border: decisionAction === "REJECTED" ? "2px solid #dc2626" : "1px solid #cbd5e1",
                      backgroundColor: decisionAction === "REJECTED" ? "#fef2f2" : "#fff",
                      color: decisionAction === "REJECTED" ? "#991b1b" : "#475569",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                      textAlign: "center",
                    }}
                  >
                    ✖ İadeyi Reddet (PayTR'de Yok)
                  </button>
                </div>
              </div>

              {/* CONFIRMED için Sağlayıcı Referansı */}
              {decisionAction === "CONFIRMED" && (
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}
                  >
                    PayTR İşlem / Dekont Referans No <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={providerReference}
                    onChange={(e) => setProviderReference(e.target.value)}
                    placeholder="Örn: PAYTR-REF-987654321"
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.375rem",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>
              )}

              {/* Açıklama / Notlar */}
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}
                >
                  Operatör Açıklaması ve Kanıt Notu <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    decisionAction === "CONFIRMED"
                      ? "PayTR panelinde iadenin gerçekleştiği tarih, saat ve mutabakat notu..."
                      : "İadenin PayTR panelinde bulunamadığına dair gerekçe..."
                  }
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.375rem",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Retry Uyarısı */}
              <div style={{ fontSize: "0.6875rem", color: "#64748b", marginTop: "0.5rem" }}>
                * Not: PayTR mükerrer para çıkışı riskine karşı arayüzden kör tekrar deneme kapatılmıştır.
                Yalnızca kesinleşen sonuçlar için onay veya ret verilebilir.
              </div>
            </div>

            {/* Modal Butonları */}
            <div
              style={{
                padding: "1rem 1.25rem",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                backgroundColor: "#f8fafc",
              }}
            >
              <button
                type="button"
                onClick={closeDecisionModal}
                disabled={submitting}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(true)}
                disabled={submitting}
                style={{
                  padding: "0.5rem 1.25rem",
                  background: decisionAction === "CONFIRMED" ? "#16a34a" : "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {decisionAction === "CONFIRMED" ? "Onayla ve İşle" : "Reddet ve Kapat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AÇIK ONAY DİYALOĞU (CONFIRMATION DIALOG) */}
      {isConfirmModalOpen && selectedEvent && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "0.5rem",
              maxWidth: "440px",
              padding: "1.5rem",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", color: "#0f172a" }}>
              Kararı Kesinleştiriyor Musunuz?
            </h4>
            <p style={{ fontSize: "0.875rem", color: "#475569", lineHeight: 1.5, margin: "0 0 1.25rem 0" }}>
              {decisionAction === "CONFIRMED" ? (
                <>
                  Bu işlemle <strong>{selectedEvent.order?.orderNumber}</strong> numaralı siparişe ait{" "}
                  <strong>{formatCurrency(Number(selectedEvent.refundAmountTL))}</strong> iade edilmiş
                  olarak veritabanına işlenecektir. Bu işlem <strong>geri alınamaz</strong>.
                </>
              ) : (
                <>
                  Bu işlemle <strong>{selectedEvent.order?.orderNumber}</strong> numaralı siparişin iade
                  isteği <strong>reddedilmiş</strong> olarak kapatılacak ve sipariş bakiyesine
                  dokunulmayacaktır.
                </>
              )}
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={submitting}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Geri Dön
              </button>
              <button
                type="button"
                onClick={handleSubmitDecision}
                disabled={submitting}
                style={{
                  padding: "0.5rem 1.25rem",
                  background: decisionAction === "CONFIRMED" ? "#16a34a" : "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {submitting ? "İşleniyor..." : "Evet, Onaylıyorum"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

