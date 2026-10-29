"use client";

import React, { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/formatters";

interface ReturnItem {
  id: string;
  orderItemId: string;
  productId: string;
  productName: string;
  variantSku: string;
  colorName?: string;
  sizeName?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  reason: string;
  condition?: string;
}

interface ReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerPhone: string;
  requestType?: string;
  exchangeDetails?: {
    requestedSize?: string;
    requestedColor?: string;
    notes?: string;
  };
  items: ReturnItem[];
  requestedAmount: number;
  refundedAmount: number;
  status: string;
  reason: string;
  customerNotes?: string;
  adminNotes?: string;
  restockDecision: string;
  isRestocked: boolean;
  actualRefundVerified: boolean;
  refundTransactionRef?: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReturn, setSelectedReturn] = useState<ReturnRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Düzenleme Alanları
  const [newStatus, setNewStatus] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [restockDecision, setRestockDecision] = useState("PENDING");
  const [actualRefundVerified, setActualRefundVerified] = useState(false);
  const [refundTransactionRef, setRefundTransactionRef] = useState("");

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/returns");
      const data = await res.json();
      if (res.ok && data.returns) {
        setReturns(data.returns);
      } else {
        setErrorMsg(data.error || "İade talepleri yüklenemedi.");
      }
    } catch {
      setErrorMsg("İade talepleri sunucudan çekilemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  useEffect(() => {
    if (selectedReturn) {
      setNewStatus(selectedReturn.status);
      setAdminNotes(selectedReturn.adminNotes || "");
      setRestockDecision(selectedReturn.restockDecision || "PENDING");
      setActualRefundVerified(selectedReturn.actualRefundVerified || false);
      setRefundTransactionRef(selectedReturn.refundTransactionRef || "");
    }
  }, [selectedReturn]);

  const handleSaveReturnStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturn) return;

    if (newStatus === "REFUND_COMPLETED" && !actualRefundVerified) {
      alert(
        "DİKKAT: Gerçek para iadesi banka dekontu veya ödeme sağlayıcısından teyit edilmeden durum 'Para İadesi Doğrulandı (REFUND_COMPLETED)' olarak seçilemez!"
      );
      return;
    }

    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/admin/returns/${selectedReturn.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          adminNotes: adminNotes.trim(),
          restockDecision,
          actualRefundVerified,
          refundTransactionRef: refundTransactionRef.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "İade talebi güncellenemedi.");
      }

      setSuccessMsg(data.message);
      setReturns((prev) => prev.map((r) => (r.id === selectedReturn.id ? data.returnRequest : r)));
      setSelectedReturn(data.returnRequest);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Güncelleme hatası.");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredReturns = returns.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchNo = r.orderNumber.toLowerCase().includes(q);
      const matchEmail = r.customerEmail.toLowerCase().includes(q);
      const matchReason = r.reason.toLowerCase().includes(q);
      if (!matchNo && !matchEmail && !matchReason) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Başlık */}
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
            İptal ve İade Talepleri
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Müşteriler tarafından açılan ürün iade taleplerini inceleyin, onaylayın, stok iadesi ve para iadesi süreçlerini yönetin.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchReturns}
          className="hm-admin-btn hm-admin-btn-outline"
          style={{ fontSize: "0.875rem" }}
        >
          Yenile
        </button>
      </div>

      {/* Mesaj Bildirimleri */}
      {errorMsg && (
        <div className="hm-admin-alert hm-admin-alert-danger" style={{ marginBottom: "1rem" }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="hm-admin-alert hm-admin-alert-success" style={{ marginBottom: "1rem" }}>
          {successMsg}
        </div>
      )}

      {/* Filtre ve Arama */}
      <div
        className="hm-admin-card"
        style={{
          padding: "1rem",
          marginBottom: "1.5rem",
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ flex: 1, minWidth: "220px" }}>
          <input
            type="text"
            placeholder="Sipariş no, e-posta veya iade nedeni ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="hm-admin-input"
            style={{ width: "100%", fontSize: "0.875rem" }}
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="hm-admin-select"
            style={{ fontSize: "0.875rem" }}
          >
            <option value="ALL">Tüm İade Durumları</option>
            <option value="REQUESTED">Yeni Talep (İncelenmedi)</option>
            <option value="UNDER_REVIEW">İnceleniyor</option>
            <option value="APPROVED">Kabul Edildi</option>
            <option value="REJECTED">Reddedildi</option>
            <option value="AWAITING_PACKAGE">Ürün Kargosu Bekleniyor</option>
            <option value="PACKAGE_RECEIVED">Ürün Depoya Ulaştı</option>
            <option value="REFUND_PENDING">Para İadesi Bekliyor</option>
            <option value="REFUND_COMPLETED">Para İadesi Tamamlandı</option>
          </select>
        </div>
      </div>

      {/* İade Listesi Tablosu */}
      <div className="hm-admin-table-container">
        <table className="hm-admin-table">
          <thead>
            <tr>
              <th>Talep No &amp; Sipariş</th>
              <th>Müşteri</th>
              <th>İade Tutarı</th>
              <th>İade Gerekçesi</th>
              <th>Durum</th>
              <th>Stok Durumu</th>
              <th>Para İadesi</th>
              <th>Tarih</th>
              <th style={{ textAlign: "right" }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "2rem" }}>
                  Talepler yükleniyor...
                </td>
              </tr>
            ) : filteredReturns.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "2rem", color: "#718096" }}>
                  Kriterlere uygun iade talebi bulunamadı.
                </td>
              </tr>
            ) : (
              filteredReturns.map((ret) => (
                <tr key={ret.id} style={ret.requestType === "CANCEL" ? { backgroundColor: "#fff1f1", borderLeft: "4px solid #c5221f" } : undefined}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontWeight: 600 }}>{ret.id}</span>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          padding: "0.15rem 0.4rem",
                          borderRadius: "4px",
                          fontWeight: 600,
                          backgroundColor:
                            ret.requestType === "CANCEL"
                              ? "#FFF3E0"
                              : ret.requestType === "EXCHANGE"
                              ? "#E8F5E9"
                              : "#EDE7F6",
                          color:
                            ret.requestType === "CANCEL"
                              ? "#E65100"
                              : ret.requestType === "EXCHANGE"
                              ? "#2E7D32"
                              : "#512DA8",
                        }}
                      >
                        {ret.requestType === "CANCEL"
                          ? "İptal"
                          : ret.requestType === "EXCHANGE"
                          ? "Değişim"
                          : "İade"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#718096" }}>Sipariş: {ret.orderNumber}</div>
                  </td>
                  <td>
                    <div>{ret.customerEmail}</div>
                    <div style={{ fontSize: "0.75rem", color: "#718096" }}>{ret.customerPhone}</div>
                  </td>
                  <td style={{ fontWeight: 700 }} className="tabular-nums">
                    {formatCurrency(ret.requestedAmount)}
                  </td>
                  <td>
                    <div style={{ fontSize: "0.8125rem", maxWidth: "200px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ret.reason}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`hm-admin-badge ${
                        ret.status === "APPROVED" || ret.status === "REFUND_COMPLETED"
                          ? "hm-admin-badge-success"
                          : ret.status === "REJECTED"
                          ? "hm-admin-badge-danger"
                          : ret.status === "PACKAGE_RECEIVED"
                          ? "hm-admin-badge-info"
                          : "hm-admin-badge-warning"
                      }`}
                    >
                      {ret.status}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: "0.75rem", color: ret.isRestocked ? "#2E7D32" : "#718096" }}>
                      {ret.isRestocked ? "✓ Stoka Eklendi" : ret.restockDecision}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: ret.actualRefundVerified ? "#2E7D32" : "#E65100" }}>
                      {ret.actualRefundVerified ? "✓ Doğrulandı" : "Beklemede"}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "#718096" }}>
                    {new Date(ret.createdAt).toLocaleDateString("tr-TR")}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {(ret.requestType === "CANCEL" || ret.status === "REQUESTED") && <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.4rem" }}>
                      <button type="button" className="hm-admin-btn hm-admin-btn-outline" style={{ color: "#9b1c1c", borderColor: "#ef9a9a", fontSize: "0.7rem" }} onClick={async () => { const response = await fetch(`/api/admin/returns/${ret.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "REFUND_PENDING", decision: "REFUND", adminNotes: "Para iadesi yapılacak" }) }); const result = await response.json(); if (!response.ok) setErrorMsg(result.error || "İşlem başarısız."); else { setReturns((prev) => prev.map((item) => item.id === ret.id ? result.returnRequest : item)); setSuccessMsg("Para iadesi süreci işaretlendi."); } }}>💳 Para İadesi Yapılacak</button>
                      <button type="button" className="hm-admin-btn hm-admin-btn-outline" style={{ color: "#1d4ed8", borderColor: "#93c5fd", fontSize: "0.7rem" }} onClick={async () => { const response = await fetch(`/api/admin/returns/${ret.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "APPROVED", decision: "EXCHANGE", adminNotes: "Ürün değişimi yapılacak" }) }); const result = await response.json(); if (!response.ok) setErrorMsg(result.error || "İşlem başarısız."); else { setReturns((prev) => prev.map((item) => item.id === ret.id ? { ...result.returnRequest, requestType: "EXCHANGE" } : item)); setSuccessMsg("Ürün değişimi süreci işaretlendi."); } }}>🔄 Ürün Değişimi Yapılacak</button>
                    </div>}
                    <button
                      type="button"
                      onClick={() => setSelectedReturn(ret)}
                      className="hm-admin-btn hm-admin-btn-outline"
                      style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                    >
                      İncele &amp; Yönet
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* İade İnceleme ve Karar Modalı */}
      {selectedReturn && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="hm-admin-card"
            style={{
              width: "100%",
              maxWidth: "760px",
              maxHeight: "92vh",
              overflowY: "auto",
              padding: "1.75rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--hm-admin-border)",
                paddingBottom: "1rem",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
                  İade Talebi İnceleme: {selectedReturn.id}
                </h2>
                <div style={{ fontSize: "0.8125rem", color: "#718096" }}>
                  Sipariş No: <strong>{selectedReturn.orderNumber}</strong> | Tarih:{" "}
                  {new Date(selectedReturn.createdAt).toLocaleString("tr-TR")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReturn(null)}
                style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Müşteri ve Gerekçe Özeti */}
            <div
              style={{
                backgroundColor: "#F8FAFC",
                padding: "1rem",
                borderRadius: "6px",
                marginBottom: "1.25rem",
                fontSize: "0.8125rem",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>Müşteri İletişim:</div>
                <div>{selectedReturn.customerEmail}</div>
                <div style={{ color: "#718096" }}>{selectedReturn.customerPhone}</div>
                <div style={{ marginTop: "0.5rem" }}>
                  <span style={{ fontWeight: 600 }}>Talep Türü: </span>
                  <span style={{ fontWeight: 700, color: "#1E293B" }}>
                    {selectedReturn.requestType === "CANCEL"
                      ? "Sipariş İptal Talebi"
                      : selectedReturn.requestType === "EXCHANGE"
                      ? "Ürün Beden / Renk Değişimi"
                      : "Ürün İadesi & Ücret İadesi"}
                  </span>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>Talep Gerekçesi:</div>
                <div>{selectedReturn.reason}</div>
                {selectedReturn.customerNotes && (
                  <div style={{ color: "#718096", marginTop: "2px" }}>
                    &ldquo;{selectedReturn.customerNotes}&rdquo;
                  </div>
                )}
                {selectedReturn.exchangeDetails && (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.5rem",
                      backgroundColor: "#EFF6FF",
                      borderRadius: "4px",
                      border: "1px solid #BFDBFE",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#1E40AF" }}>Değişim Tercihi:</div>
                    {selectedReturn.exchangeDetails.requestedSize && (
                      <div>İstenen Beden: <strong>{selectedReturn.exchangeDetails.requestedSize}</strong></div>
                    )}
                    {selectedReturn.exchangeDetails.requestedColor && (
                      <div>İstenen Renk: <strong>{selectedReturn.exchangeDetails.requestedColor}</strong></div>
                    )}
                    {selectedReturn.exchangeDetails.notes && (
                      <div>Not: {selectedReturn.exchangeDetails.notes}</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* İade Kalemleri */}
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              İade Edilmek İstenen Ürünler
            </h3>
            <table className="hm-admin-table" style={{ fontSize: "0.8125rem", marginBottom: "1.25rem" }}>
              <thead>
                <tr>
                  <th>Ürün &amp; SKU</th>
                  <th>Renk / Beden</th>
                  <th>Birim Fiyat</th>
                  <th>İade Adedi</th>
                  <th style={{ textAlign: "right" }}>Tutar</th>
                </tr>
              </thead>
              <tbody>
                {selectedReturn.items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{it.productName}</div>
                      <div style={{ fontSize: "0.7rem", color: "#718096" }}>SKU: {it.variantSku}</div>
                    </td>
                    <td>
                      {it.colorName || "-"} / {it.sizeName || "-"}
                    </td>
                    <td>{formatCurrency(it.unitPrice)}</td>
                    <td>{it.quantity} Adet</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatCurrency(it.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Karar ve İşlem Formu */}
            <form onSubmit={handleSaveReturnStatus} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div
                style={{
                  backgroundColor: "#F0F4F8",
                  padding: "1.25rem",
                  borderRadius: "6px",
                  border: "1px solid #D9E2EC",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.75rem" }}>
                  ⚖️ Yönetici Kararı ve Durum Güncellemesi
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                      İade Süreç Durumu
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="hm-admin-select"
                      style={{ width: "100%", fontSize: "0.8125rem" }}
                    >
                      <option value="REQUESTED">REQUESTED (Talep Oluşturuldu)</option>
                      <option value="UNDER_REVIEW">UNDER_REVIEW (İnceleniyor)</option>
                      <option value="APPROVED">APPROVED (Kabul Edildi)</option>
                      <option value="REJECTED">REJECTED (Reddedildi)</option>
                      <option value="AWAITING_PACKAGE">AWAITING_PACKAGE (Kargo Bekleniyor)</option>
                      <option value="PACKAGE_RECEIVED">PACKAGE_RECEIVED (Ürün Teslim Alındı)</option>
                      <option value="REFUND_PENDING">REFUND_PENDING (Para İadesi Bekliyor)</option>
                      <option value="REFUND_COMPLETED">REFUND_COMPLETED (Para İadesi Doğrulandı)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                      Stok İade Kararı (Restock)
                    </label>
                    <select
                      value={restockDecision}
                      onChange={(e) => setRestockDecision(e.target.value)}
                      disabled={selectedReturn.isRestocked}
                      className="hm-admin-select"
                      style={{ width: "100%", fontSize: "0.8125rem" }}
                    >
                      <option value="PENDING">PENDING (Henüz incelenmedi - stoka eklenmez)</option>
                      <option value="RESTOCKED">RESTOCKED (Hasarsız, yeniden satılabilir → Stoka Ekle)</option>
                      <option value="DAMAGED_NOT_RESTOCKED">DAMAGED (Hasarlı / Kullanılmış → Stoka Ekleme)</option>
                      <option value="REJECTED">REJECTED (İade reddedildi)</option>
                    </select>
                    {selectedReturn.isRestocked && (
                      <span style={{ fontSize: "0.7rem", color: "#2E7D32", marginTop: "2px", display: "block" }}>
                        ✓ Ürünler daha önce stoka güvenle eklendi. Mükerrer ekleme engellenir.
                      </span>
                    )}
                  </div>
                </div>

                {/* Para İadesi Doğrulama Alanı */}
                <div
                  style={{
                    backgroundColor: "#FFFFFF",
                    padding: "0.875rem",
                    borderRadius: "4px",
                    border: "1px solid #CBD5E1",
                    marginBottom: "1rem",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={actualRefundVerified}
                      onChange={(e) => setActualRefundVerified(e.target.checked)}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                      Gerçek para iadesi banka / ödeme sağlayıcısından teyit edildi
                    </span>
                  </label>

                  {actualRefundVerified && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <input
                        type="text"
                        placeholder="Ödeme sağlayıcı dekont / referans kodu (Örn: PAYTR_REF_12345)"
                        value={refundTransactionRef}
                        onChange={(e) => setRefundTransactionRef(e.target.value)}
                        className="hm-admin-input"
                        style={{ width: "100%", fontSize: "0.75rem" }}
                      />
                    </div>
                  )}

                  <span style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "4px", display: "block" }}>
                    * Doğrulama yapılmadan &ldquo;REFUND_COMPLETED&rdquo; durumuna geçişe izin verilmez.
                  </span>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    Yönetici Notu &amp; Müşteri Bilgilendirme
                  </label>
                  <textarea
                    rows={2}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Müşteriye e-posta ile iletilecek açıklama..."
                    className="hm-admin-input"
                    style={{ width: "100%", fontSize: "0.8125rem" }}
                  />
                </div>
              </div>

              {/* Aksiyon Butonları */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setSelectedReturn(null)}
                  className="hm-admin-btn hm-admin-btn-outline"
                >
                  Kapat
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="hm-admin-btn hm-admin-btn-primary"
                >
                  {actionLoading ? "Kaydediliyor..." : "Kararı Kaydet & Bildir"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
