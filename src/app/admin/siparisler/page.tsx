"use client";

import React, { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/formatters";

interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  variantId?: string;
  colorName: string;
  sizeName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  costPriceSnapshot?: number;
}

interface TrackingEvent {
  id: string;
  timestamp: string;
  status: string;
  description: string;
  location?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  customerFullName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: {
    city: string;
    district: string;
    fullAddress: string;
    postalCode?: string;
  };
  operationalStatus: "CONFIRMED" | "CANCELLED" | "PENDING";
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED" | "UNPAID" | "INITIALIZED";
  paymentProvider?: string;
  paidAt?: string;
  paymentFailedReason?: string;
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  totalAmount: number;
  items: OrderItem[];
  customerNotes?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
  stockDeducted: boolean;
  // Faz 6 Kargo Alanları
  shippingStatus?: string;
  carrier?: string;
  carrierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippedAt?: string;
  deliveredAt?: string;
  shipmentId?: string;
  shipmentMethod?: "MANUAL" | "API_INTEGRATED";
  trackingEvents?: TrackingEvent[];
  refundedAmount?: number;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CONFIRMED" | "CANCELLED" | "PENDING">("ALL");
  const [paymentFilter, setPaymentFilter] = useState<"ALL" | "PAID" | "PENDING" | "FAILED">("ALL");
  const [shippingFilter, setShippingFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Kargo Yönetimi Form Durumu
  const [selectedCarrier, setSelectedCarrier] = useState("yurtici");
  const [inputTrackingNumber, setInputTrackingNumber] = useState("");
  const [inputTrackingUrl, setInputTrackingUrl] = useState("");
  const [newMovementDesc, setNewMovementDesc] = useState("");
  const [newMovementStatus, setNewMovementStatus] = useState("IN_TRANSIT");

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/orders");
      const data = await res.json();
      if (res.ok && data.orders) {
        setOrders(data.orders);
      } else {
        setErrorMsg(data.error || "Siparişler yüklenemedi.");
      }
    } catch {
      setErrorMsg("Siparişler sunucudan çekilemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    if (selectedOrder) {
      setSelectedCarrier(selectedOrder.carrier || "yurtici");
      setInputTrackingNumber(selectedOrder.trackingNumber || "");
      setInputTrackingUrl(selectedOrder.trackingUrl || "");
      setNewMovementDesc("");
    }
  }, [selectedOrder]);

  const handleUpdateStatus = async (orderId: string, newStatus: "CONFIRMED" | "CANCELLED") => {
    if (!confirm(`Siparişi "${newStatus === "CONFIRMED" ? "ONAYLANDI" : "İPTAL EDİLDİ"}" olarak güncellemek istediğinize emin misiniz?`)) {
      return;
    }

    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Durum güncellenemedi.");
      }

      setSuccessMsg(data.message || "Sipariş durumu başarıyla güncellendi.");
      setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(data.order);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "İşlem sırasında hata oluştu.");
    } finally {
      setActionLoading(false);
    }
  };

  // Kargo Gönderisi Oluştur
  const handleCreateShipment = async () => {
    if (!selectedOrder) return;

    if (selectedOrder.paymentStatus !== "PAID") {
      alert("Ödemesi tamamlanmamış sipariş için kargo oluşturulamaz!");
      return;
    }

    if (selectedOrder.operationalStatus === "CANCELLED") {
      alert("İptal edilmiş sipariş için kargo oluşturulamaz!");
      return;
    }

    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrier: selectedCarrier,
          trackingNumber: inputTrackingNumber.trim() || undefined,
          customTrackingUrl: inputTrackingUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Kargo gönderisi oluşturulamadı.");
      }

      setSuccessMsg(data.message);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? data.order : o)));
      setSelectedOrder(data.order);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Kargo oluşturma hatası.");
    } finally {
      setActionLoading(false);
    }
  };

  // Manuel Takip Bilgisi Güncelle
  const handleSaveManualTracking = async () => {
    if (!selectedOrder) return;
    if (!inputTrackingNumber.trim()) {
      alert("Lütfen bir takip numarası giriniz.");
      return;
    }

    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/shipping`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrier: selectedCarrier,
          trackingNumber: inputTrackingNumber.trim(),
          customTrackingUrl: inputTrackingUrl.trim() || undefined,
          status: "SHIPPED",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Takip bilgileri güncellenemedi.");
      }

      setSuccessMsg(data.message);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? data.order : o)));
      setSelectedOrder(data.order);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Takip güncelleme hatası.");
    } finally {
      setActionLoading(false);
    }
  };

  // Yeni Kargo Hareketi Ekle
  const handleAddMovement = async () => {
    if (!selectedOrder) return;
    if (!newMovementDesc.trim()) {
      alert("Lütfen hareket açıklaması giriniz.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/tracking-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newMovementStatus,
          description: newMovementDesc.trim(),
          location: "Yönetici Paneli Girişi",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccessMsg("Kargo hareketi başarıyla eklendi.");
      fetchOrders();
      setNewMovementDesc("");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Hareket ekleme hatası.");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== "ALL" && o.operationalStatus !== statusFilter) return false;
    if (paymentFilter !== "ALL") {
      if (paymentFilter === "PAID" && o.paymentStatus !== "PAID") return false;
      if (
        paymentFilter === "PENDING" &&
        o.paymentStatus !== "PENDING" &&
        o.paymentStatus !== "INITIALIZED" &&
        o.paymentStatus !== "UNPAID"
      )
        return false;
      if (paymentFilter === "FAILED" && o.paymentStatus !== "FAILED" && o.paymentStatus !== "CANCELLED")
        return false;
    }
    if (shippingFilter !== "ALL") {
      if ((o.shippingStatus || "AWAITING_SHIPMENT") !== shippingFilter) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchNumber = o.orderNumber.toLowerCase().includes(q);
      const matchName = o.customerFullName.toLowerCase().includes(q);
      const matchEmail = o.customerEmail.toLowerCase().includes(q);
      const matchTracking = (o.trackingNumber || "").toLowerCase().includes(q);
      if (!matchNumber && !matchName && !matchEmail && !matchTracking) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Üst Başlık */}
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
            Sipariş ve Kargo Yönetimi
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Müşteri siparişlerini, PayTR ödemelerini, kargo gönderilerini ve teslimat süreçlerini yönetin.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={fetchOrders}
            className="hm-admin-btn hm-admin-btn-outline"
            style={{ fontSize: "0.875rem" }}
          >
            Yenile
          </button>
        </div>
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

      {/* Filtre ve Arama Alanı */}
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
            placeholder="Sipariş no, müşteri adı, e-posta veya takip no ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="hm-admin-input"
            style={{ width: "100%", fontSize: "0.875rem" }}
          />
        </div>

        {/* Operasyonel Durum Filtresi */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "CONFIRMED" | "CANCELLED" | "PENDING")}
            className="hm-admin-select"
            style={{ fontSize: "0.875rem" }}
          >
            <option value="ALL">Tüm Sipariş Durumları</option>
            <option value="CONFIRMED">Onaylandı</option>
            <option value="PENDING">İşlem Bekliyor</option>
            <option value="CANCELLED">İptal Edildi</option>
          </select>
        </div>

        {/* Ödeme Durumu Filtresi */}
        <div>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as "ALL" | "PAID" | "PENDING" | "FAILED")}
            className="hm-admin-select"
            style={{ fontSize: "0.875rem" }}
          >
            <option value="ALL">Tüm Ödemeler</option>
            <option value="PAID">Ödendi (PayTR)</option>
            <option value="PENDING">Ödeme Bekliyor</option>
            <option value="FAILED">Ödeme Başarısız</option>
          </select>
        </div>

        {/* Kargo Durumu Filtresi */}
        <div>
          <select
            value={shippingFilter}
            onChange={(e) => setShippingFilter(e.target.value)}
            className="hm-admin-select"
            style={{ fontSize: "0.875rem" }}
          >
            <option value="ALL">Tüm Kargo Durumları</option>
            <option value="AWAITING_SHIPMENT">Kargo Bekleniyor</option>
            <option value="SHIPPED">Kargoya Verildi</option>
            <option value="IN_TRANSIT">Dağıtımda / Yolda</option>
            <option value="DELIVERED">Teslim Edildi</option>
            <option value="SHIPMENT_ISSUE">Kargo Sorunu</option>
          </select>
        </div>
      </div>

      {/* Sipariş Listesi Tablosu */}
      <div className="hm-admin-table-container">
        <table className="hm-admin-table">
          <thead>
            <tr>
              <th>Sipariş No</th>
              <th>Müşteri</th>
              <th>Kalemler</th>
              <th>Tutar</th>
              <th>Ödeme Durumu</th>
              <th>Operasyonel Durum</th>
              <th>Kargo Durumu</th>
              <th>Tarih</th>
              <th style={{ textAlign: "right" }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "2rem" }}>
                  Siparişler yükleniyor...
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "2rem", color: "#718096" }}>
                  Kriterlere uygun sipariş bulunamadı.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => {
                const isConfirmed = order.operationalStatus === "CONFIRMED";
                const isCancelled = order.operationalStatus === "CANCELLED";
                const sStatus = order.shippingStatus || "AWAITING_SHIPMENT";

                return (
                  <tr key={order.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{order.orderNumber}</div>
                      {order.carrierName && (
                        <div style={{ fontSize: "0.75rem", color: "#718096" }}>
                          {order.carrierName} {order.trackingNumber ? `(${order.trackingNumber})` : ""}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{order.customerFullName}</div>
                      <div style={{ fontSize: "0.75rem", color: "#718096" }}>
                        {order.shippingAddress.district} / {order.shippingAddress.city}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.8125rem" }}>
                        {order.items.reduce((sum, i) => sum + i.quantity, 0)} Adet
                      </span>
                    </td>
                    <td style={{ fontWeight: 700 }} className="tabular-nums">
                      {formatCurrency(order.totalAmount)}
                    </td>
                    <td>
                      <span
                        className={`hm-admin-badge ${
                          order.paymentStatus === "PAID"
                            ? "hm-admin-badge-success"
                            : order.paymentStatus === "FAILED"
                            ? "hm-admin-badge-danger"
                            : "hm-admin-badge-warning"
                        }`}
                      >
                        {order.paymentStatus === "PAID"
                          ? "ÖDENDİ • PAYTR"
                          : order.paymentStatus === "FAILED"
                          ? "BAŞARISIZ"
                          : "BEKLİYOR"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`hm-admin-badge ${
                          isConfirmed
                            ? "hm-admin-badge-success"
                            : isCancelled
                            ? "hm-admin-badge-danger"
                            : "hm-admin-badge-warning"
                        }`}
                      >
                        {isConfirmed ? "ONAYLANDI" : isCancelled ? "İPTAL EDİLDİ" : "BEKLEMEDE"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`hm-admin-badge ${
                          sStatus === "DELIVERED"
                            ? "hm-admin-badge-success"
                            : sStatus === "SHIPPED" || sStatus === "IN_TRANSIT"
                            ? "hm-admin-badge-info"
                            : sStatus === "SHIPMENT_ISSUE"
                            ? "hm-admin-badge-danger"
                            : "hm-admin-badge-warning"
                        }`}
                      >
                        {sStatus === "DELIVERED"
                          ? "TESLİM EDİLDİ"
                          : sStatus === "SHIPPED"
                          ? "KARGODA"
                          : sStatus === "IN_TRANSIT"
                          ? "DAĞITIMDA"
                          : sStatus === "AWAITING_SHIPMENT"
                          ? "KARGO BEKLİYOR"
                          : sStatus}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "#718096" }}>
                      {new Date(order.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="hm-admin-btn hm-admin-btn-outline"
                        style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                      >
                        Yönet &amp; Detay
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Sipariş & Kargo Detay Modalı */}
      {selectedOrder && (
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
              maxWidth: "800px",
              maxHeight: "92vh",
              overflowY: "auto",
              padding: "1.75rem",
            }}
          >
            {/* Modal Başlık */}
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
                  Sipariş ve Kargo: {selectedOrder.orderNumber}
                </h2>
                <div style={{ fontSize: "0.8125rem", color: "#718096" }}>
                  Oluşturulma: {new Date(selectedOrder.createdAt).toLocaleString("tr-TR")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Müşteri ve Adres */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                backgroundColor: "#F8FAFC",
                padding: "1rem",
                borderRadius: "6px",
                marginBottom: "1.25rem",
                fontSize: "0.8125rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: "#1A202C", marginBottom: "0.25rem" }}>
                  Müşteri Bilgisi
                </div>
                <div>{selectedOrder.customerFullName}</div>
                <div style={{ color: "#718096" }}>{selectedOrder.customerEmail}</div>
                <div style={{ color: "#718096" }}>{selectedOrder.customerPhone}</div>
              </div>

              <div>
                <div style={{ fontWeight: 600, color: "#1A202C", marginBottom: "0.25rem" }}>
                  Teslimat Adresi
                </div>
                <div>{selectedOrder.shippingAddress.fullAddress}</div>
                <div style={{ color: "#718096" }}>
                  {selectedOrder.shippingAddress.district} / {selectedOrder.shippingAddress.city}
                </div>
              </div>
            </div>

            {/* Kargo İşlemleri ve Takip Paneli (Faz 6) */}
            <div
              style={{
                backgroundColor: "#F0F4F8",
                padding: "1.25rem",
                borderRadius: "6px",
                border: "1px solid #D9E2EC",
                marginBottom: "1.25rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>📦</span> Kargo Yönetimi ve Sevkiyat
                </div>

                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span
                    className={`hm-admin-badge ${
                      selectedOrder.shippingStatus === "DELIVERED"
                        ? "hm-admin-badge-success"
                        : selectedOrder.shippingStatus === "SHIPPED"
                        ? "hm-admin-badge-info"
                        : "hm-admin-badge-warning"
                    }`}
                  >
                    Durum: {selectedOrder.shippingStatus || "Kargo Bekleniyor"}
                  </span>

                  {selectedOrder.shipmentMethod && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: selectedOrder.shipmentMethod === "API_INTEGRATED" ? "#E3F2FD" : "#FFF3E0",
                        color: selectedOrder.shipmentMethod === "API_INTEGRATED" ? "#0D47A1" : "#E65100",
                        fontWeight: 600,
                      }}
                    >
                      {selectedOrder.shipmentMethod === "API_INTEGRATED" ? "API ENTEGRE" : "MANUEL GİRİŞ"}
                    </span>
                  )}
                </div>
              </div>

              {/* Kargo Bilgileri Formu */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    Kargo Firması
                  </label>
                  <select
                    value={selectedCarrier}
                    onChange={(e) => setSelectedCarrier(e.target.value)}
                    className="hm-admin-select"
                    style={{ width: "100%", fontSize: "0.8125rem" }}
                  >
                    <option value="yurtici">Yurtiçi Kargo</option>
                    <option value="aras">Aras Kargo</option>
                    <option value="mng">MNG Kargo</option>
                    <option value="ptt">PTT Kargo</option>
                    <option value="surat">Sürat Kargo</option>
                    <option value="hepsijet">HepsiJet</option>
                    <option value="custom">Özel / Diğer Kurye</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    Takip Numarası
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: YK123456789"
                    value={inputTrackingNumber}
                    onChange={(e) => setInputTrackingNumber(e.target.value)}
                    className="hm-admin-input"
                    style={{ width: "100%", fontSize: "0.8125rem" }}
                  />
                </div>
              </div>

              {/* Kargo Aksiyonları */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={handleCreateShipment}
                  disabled={actionLoading || selectedOrder.paymentStatus !== "PAID" || selectedOrder.operationalStatus === "CANCELLED"}
                  className="hm-admin-btn hm-admin-btn-primary"
                  style={{ fontSize: "0.8125rem" }}
                >
                  🚀 Gönderi Oluştur
                </button>

                <button
                  type="button"
                  onClick={handleSaveManualTracking}
                  disabled={actionLoading || !inputTrackingNumber.trim()}
                  className="hm-admin-btn hm-admin-btn-outline"
                  style={{ fontSize: "0.8125rem" }}
                >
                  💾 Takip No Kaydet
                </button>

                {selectedOrder.trackingUrl && (
                  <a
                    href={selectedOrder.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hm-admin-btn hm-admin-btn-outline"
                    style={{ fontSize: "0.8125rem", textDecoration: "none" }}
                  >
                    ↗️ Takip Bağlantısını Aç
                  </a>
                )}

                {selectedOrder.shipmentId && (
                  <a
                    href={`/api/shipping/labels/${selectedOrder.shipmentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hm-admin-btn hm-admin-btn-outline"
                    style={{ fontSize: "0.8125rem", textDecoration: "none" }}
                  >
                    🏷️ Kargo Etiketi Yazdır
                  </a>
                )}
              </div>

              {/* Kargo Hareketleri Geçmişi */}
              {selectedOrder.trackingEvents && selectedOrder.trackingEvents.length > 0 && (
                <div style={{ marginTop: "1rem", borderTop: "1px solid #D9E2EC", paddingTop: "0.75rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                    Kargo Hareket Geçmişi:
                  </div>
                  <div style={{ maxHeight: "120px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {selectedOrder.trackingEvents.map((evt) => (
                      <div
                        key={evt.id}
                        style={{
                          fontSize: "0.75rem",
                          backgroundColor: "#FFF",
                          padding: "0.4rem 0.6rem",
                          borderRadius: "3px",
                          border: "1px solid #E2E8F0",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>
                          <strong>{evt.description}</strong> {evt.location ? `(${evt.location})` : ""}
                        </span>
                        <span style={{ color: "#718096" }}>
                          {new Date(evt.timestamp).toLocaleString("tr-TR")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Yeni Hareket Ekleme Alanı */}
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <select
                  value={newMovementStatus}
                  onChange={(e) => setNewMovementStatus(e.target.value)}
                  className="hm-admin-select"
                  style={{ fontSize: "0.75rem", minWidth: "130px" }}
                >
                  <option value="IN_TRANSIT">Dağıtımda / Yolda</option>
                  <option value="OUT_FOR_DELIVERY">Kurye Dağıtıma Çıktı</option>
                  <option value="DELIVERED">Teslim Edildi</option>
                  <option value="SHIPMENT_ISSUE">Kargo Sorunu</option>
                </select>

                <input
                  type="text"
                  placeholder="Hareket açıklaması (Örn: Kadıköy Şubeden Dağıtıma Çıktı)"
                  value={newMovementDesc}
                  onChange={(e) => setNewMovementDesc(e.target.value)}
                  className="hm-admin-input"
                  style={{ flex: 1, fontSize: "0.75rem" }}
                />

                <button
                  type="button"
                  onClick={handleAddMovement}
                  disabled={actionLoading || !newMovementDesc.trim()}
                  className="hm-admin-btn hm-admin-btn-outline"
                  style={{ fontSize: "0.75rem" }}
                >
                  Hareket Ekle
                </button>
              </div>
            </div>

            {/* Kalemler Tablosu */}
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Sipariş Edilen Ürünler
            </h3>
            <table className="hm-admin-table" style={{ fontSize: "0.8125rem", marginBottom: "1rem" }}>
              <thead>
                <tr>
                  <th>Ürün &amp; SKU</th>
                  <th>Renk / Beden</th>
                  <th>Fiyat</th>
                  <th>Adet</th>
                  <th style={{ textAlign: "right" }}>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {selectedOrder.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.productName}</div>
                      <div style={{ fontSize: "0.7rem", color: "#718096" }}>SKU: {item.sku}</div>
                    </td>
                    <td>
                      {item.colorName} / {item.sizeName}
                    </td>
                    <td className="tabular-nums">{formatCurrency(item.unitPrice)}</td>
                    <td>{item.quantity}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }} className="tabular-nums">
                      {formatCurrency(item.totalPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Genel Toplam ve Operasyonel Durum Güncellemesi */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 0",
                borderTop: "1px solid var(--hm-admin-border)",
                marginBottom: "1rem",
              }}
            >
              <div>
                <span style={{ fontSize: "0.75rem", color: "#718096" }}>
                  Ödeme: <strong>{selectedOrder.paymentStatus}</strong> | Operasyonel:{" "}
                  <strong>{selectedOrder.operationalStatus}</strong>
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.75rem", color: "#718096" }}>Toplam Tutar: </span>
                <strong style={{ fontSize: "1.125rem" }}>{formatCurrency(selectedOrder.totalAmount)}</strong>
              </div>
            </div>

            {/* Butonlar */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="hm-admin-btn hm-admin-btn-outline"
              >
                Kapat
              </button>

              {selectedOrder.operationalStatus !== "CANCELLED" && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(selectedOrder.id, "CANCELLED")}
                  disabled={actionLoading}
                  className="hm-admin-btn hm-admin-btn-outline"
                  style={{ color: "#C5221F", borderColor: "#FCE8E6" }}
                >
                  Siparişi İptal Et
                </button>
              )}

              {selectedOrder.operationalStatus !== "CONFIRMED" && (
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(selectedOrder.id, "CONFIRMED")}
                  disabled={actionLoading}
                  className="hm-admin-btn hm-admin-btn-primary"
                >
                  Siparişi Onayla
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
