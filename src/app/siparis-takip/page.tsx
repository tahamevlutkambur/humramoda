"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

interface TrackingEvent {
  id: string;
  timestamp: string;
  status: string;
  description: string;
  location?: string;
}

interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  colorName: string;
  sizeName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface TrackingData {
  orderNumber: string;
  trackingToken: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  operationalStatus: string;
  paymentStatus: string;
  paymentProvider?: string;
  shippingStatus: string;
  carrier?: string;
  carrierName: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  city: string;
  district: string;
  items: OrderItem[];
  trackingEvents: TrackingEvent[];
}

interface ReturnRequestItem {
  id: string;
  status: string;
  requestedAmount: number;
  refundedAmount: number;
  reason: string;
  createdAt: string;
}

export default function OrderTrackingPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrackingData | null>(null);
  const [returnRequests, setReturnRequests] = useState<ReturnRequestItem[]>([]);

  // İade Talebi Modal Durumu
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnSuccessMsg, setReturnSuccessMsg] = useState<string | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNumber.trim()) {
      setError("Lütfen sipariş numaranızı giriniz.");
      return;
    }

    setLoading(true);
    setError(null);


    try {
      const res = await fetch("/api/tracking/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          phone: phone.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Sipariş bulunamadı veya doğrulama başarısız.");
        setData(null);
      } else {
        setData(json.tracking);
        setReturnRequests(json.returnRequests || []);
      }
    } catch {
      setError("Bağlantı hatası oluştu. Lütfen tekrar deneyiniz.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    if (!returnReason.trim()) {
      alert("Lütfen bir iade gerekçesi belirtiniz.");
      return;
    }

    setSubmittingReturn(true);
    try {
      const res = await fetch("/api/returns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: data.orderNumber,
          customerEmail: "",
          trackingToken: data.trackingToken,
          reason: returnReason.trim(),
          customerNotes: returnNotes.trim(),
          items: data.items.map((it) => ({
            orderItemId: it.id,
            quantity: it.quantity,
            reason: returnReason.trim(),
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "İade talebi oluşturulamadı.");
      } else {
        setReturnSuccessMsg("İade talebiniz başarıyla alındı ve inceleme sürecine girdi.");
        setShowReturnModal(false);
        // Listeyi yenile
        setReturnRequests((prev) => [
          {
            id: json.returnRequest.id,
            status: json.returnRequest.status,
            requestedAmount: json.returnRequest.requestedAmount,
            refundedAmount: 0,
            reason: json.returnRequest.reason,
            createdAt: json.returnRequest.createdAt,
          },
          ...prev,
        ]);
      }
    } catch {
      alert("İade talebi gönderilirken bağlantı hatası oluştu.");
    } finally {
      setSubmittingReturn(false);
    }
  }

  const refreshOrderNumber = data?.orderNumber;
  const refreshTrackingToken = data?.trackingToken;
  React.useEffect(() => {
    if (!refreshOrderNumber || !refreshTrackingToken || typeof document === "undefined") return;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/tracking/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        body: JSON.stringify({ orderNumber: refreshOrderNumber, trackingToken: refreshTrackingToken }),
        });
        const result = await response.json();
        if (response.ok && result.tracking) setData(result.tracking);
      } catch { /* next refresh will retry */ }
    };
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refreshOrderNumber, refreshTrackingToken]);

  // 3 Net İlerleme Aşaması
  const isShipped =
    data?.shippingStatus === "SHIPPED" ||
    data?.shippingStatus === "IN_TRANSIT" ||
    data?.shippingStatus === "OUT_FOR_DELIVERY" ||
    data?.shippingStatus === "DELIVERED";
  const isDelivered = data?.shippingStatus === "DELIVERED";

  const steps = [
    {
      key: "RECEIVED",
      label: "1. Siparişiniz Tarafımıza Ulaşmıştır",
      done: true,
      desc: data?.paymentProvider === "CASH_ON_DELIVERY"
        ? "Kapıda ödemeli siparişiniz onaylandı ve atölyemizde hazırlanıyor."
        : "Siparişiniz alındı ve ödemeniz onaylandı.",
    },
    {
      key: "SHIPPED",
      label: "2. Ürün Kargoya Verildi",
      done: Boolean(isShipped),
      desc: isShipped ? "Ürününüz kargo firmasına teslim edildi ve yola çıktı." : "Kargo dağıtım görevlisi paketi hazırlıyor.",
    },
    {
      key: "DELIVERED",
      label: "3. Ürün Teslim Edildi",
      done: Boolean(isDelivered),
      desc: isDelivered ? "Siparişiniz alıcıya teslim edilmiştir." : "Teslimat henüz gerçekleşmedi.",
    },
  ];

  return (
    <div style={{ backgroundColor: "#FBFBFB", minHeight: "85vh", padding: "3rem 0 5rem" }}>
      <Container>
        {/* Başlık */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <span
            style={{
              fontSize: "11px",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "var(--hm-color-text-muted)",
              display: "block",
              marginBottom: "0.5rem",
            }}
          >
            Hümra Moda Müşteri Hizmetleri
          </span>
          <h1
            style={{
              fontFamily: "var(--hm-font-display)",
              fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
              fontWeight: 400,
              color: "var(--hm-color-text-main)",
              letterSpacing: "var(--hm-tracking-tight)",
            }}
          >
            Sipariş ve Kargo Takibi
          </h1>
          <p style={{ color: "#666", fontSize: "0.9375rem", maxWidth: "520px", margin: "0.5rem auto 0" }}>
            Siparişinizin durumunu, kargo hareketlerini ve teslimat aşamasını anlık olarak takip edin.
          </p>
        </div>

        {/* Sorgulama Formu */}
        <div
          style={{
            maxWidth: "620px",
            margin: "0 auto 3rem",
            backgroundColor: "#FFFFFF",
            padding: "2rem",
            borderRadius: "4px",
            border: "1px solid #EAEAEA",
            boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
          }}
        >
          <form onSubmit={handleLookup} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "0.35rem",
                  color: "#333",
                }}
              >
                Sipariş Numarası
              </label>
              <input
                type="text"
                placeholder="Örn: HM-20261021-0001"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  border: "1px solid #CCC",
                  borderRadius: "3px",
                  fontSize: "14px",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="tracking-phone"
                style={{ display: "block", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem", color: "#333" }}
              >
                Siparişte Kayıtlı Telefon
              </label>
              <input
                id="tracking-phone"
                type="tel"
                autoComplete="tel"
                placeholder="05XX XXX XX XX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ width: "100%", padding: "0.75rem 1rem", border: "1px solid #CCC", borderRadius: "3px", fontSize: "14px", outline: "none" }}
              />
            </div>

            {error && (
              <div
                style={{
                  backgroundColor: "#FFF2F2",
                  color: "#D32F2F",
                  padding: "0.75rem 1rem",
                  borderRadius: "3px",
                  fontSize: "13px",
                  border: "1px solid #FFCDD2",
                }}
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={loading}
              style={{
                backgroundColor: "#141414",
                color: "#FFFFFF",
                width: "100%",
                padding: "0.875rem",
                fontSize: "14px",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {loading ? "Sorgulanıyor..." : "Siparişi Sorgula"}
            </Button>
          </form>
        </div>

        {/* Sonuç Alanı */}
        {data && (
          <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "2rem" }}>
            {returnSuccessMsg && (
              <div
                style={{
                  backgroundColor: "#E8F5E9",
                  color: "#2E7D32",
                  padding: "1rem",
                  borderRadius: "4px",
                  border: "1px solid #C8E6C9",
                  fontSize: "14px",
                }}
              >
                {returnSuccessMsg}
              </div>
            )}

            {/* Sipariş Özet Kartı */}
            <div
              style={{
                backgroundColor: "#FFFFFF",
                padding: "2rem",
                borderRadius: "4px",
                border: "1px solid #EAEAEA",
                boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  borderBottom: "1px solid #EEE",
                  paddingBottom: "1.25rem",
                  marginBottom: "1.5rem",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <span style={{ fontSize: "12px", color: "#888", textTransform: "uppercase" }}>Sipariş No</span>
                  <h2 style={{ margin: "2px 0 6px", fontSize: "20px", fontWeight: 600 }}>{data.orderNumber}</h2>
                  <span style={{ fontSize: "12px", color: "#666" }}>
                    Alıcı: <strong>{data.customerName}</strong> | Tarih: {new Date(data.createdAt).toLocaleDateString("tr-TR")} | Teslimat: {data.district} / {data.city}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 600,
                      backgroundColor: data.paymentStatus === "PAID" ? "#E8F5E9" : "#FFF3E0",
                      color: data.paymentStatus === "PAID" ? "#2E7D32" : "#E65100",
                    }}
                  >
                    Ödeme: {data.paymentStatus === "PAID" ? "Onaylandı" : (data.paymentProvider === "CASH_ON_DELIVERY" ? "Kapıda Ödeme (Bekliyor)" : "Bekliyor")}
                  </span>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 600,
                      backgroundColor:
                        data.shippingStatus === "DELIVERED"
                          ? "#E8F5E9"
                          : data.shippingStatus === "SHIPPED" || data.shippingStatus === "IN_TRANSIT"
                          ? "#E3F2FD"
                          : "#F5F5F5",
                      color:
                        data.shippingStatus === "DELIVERED"
                          ? "#2E7D32"
                          : data.shippingStatus === "SHIPPED" || data.shippingStatus === "IN_TRANSIT"
                          ? "#1565C0"
                          : "#616161",
                    }}
                  >
                    Kargo: {data.shippingStatus}
                  </span>
                </div>
              </div>

              {/* Görsel İlerleme Çubuğu */}
              <div style={{ margin: "2rem 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      top: "16px",
                      left: "15%",
                      right: "15%",
                      height: "4px",
                      backgroundColor: "#E2E8F0",
                      zIndex: 1,
                    }}
                  />
                  {steps.map((st, i) => (
                    <div
                      key={st.key}
                      style={{
                        position: "relative",
                        zIndex: 2,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        width: "30%",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          backgroundColor: st.done ? "#059669" : "#FFFFFF",
                          border: st.done ? "2px solid #059669" : "2px solid #CBD5E1",
                          color: st.done ? "#FFFFFF" : "#64748B",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "14px",
                          fontWeight: 700,
                          marginBottom: "8px",
                          boxShadow: st.done ? "0 2px 8px rgba(5, 150, 105, 0.3)" : "none",
                        }}
                      >
                        {st.done ? "✓" : i + 1}
                      </div>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: st.done ? 700 : 500,
                          color: st.done ? "#0F172A" : "#64748B",
                          marginBottom: "4px",
                        }}
                      >
                        {st.label}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#94A3B8",
                          maxWidth: "180px",
                          lineHeight: 1.3,
                        }}
                      >
                        {st.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kargo Takip Bilgileri */}
              <div
                style={{
                  backgroundColor: "#F9F9F9",
                  padding: "1.25rem",
                  borderRadius: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", color: "#666" }}>Kargo Taşıyıcısı</div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "#141414" }}>{data.carrierName}</div>
                  {data.trackingNumber ? (
                    <div style={{ fontSize: "13px", color: "#444", marginTop: "2px" }}>
                      Takip No: <strong>{data.trackingNumber}</strong>
                    </div>
                  ) : (
                    <div style={{ fontSize: "13px", color: "#888", fontStyle: "italic", marginTop: "2px" }}>
                      Kargo takip numarası hazırlanıyor.
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  {data.trackingUrl && (
                    <a
                      href={data.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        backgroundColor: "#141414",
                        color: "#FFFFFF",
                        padding: "0.5rem 1rem",
                        borderRadius: "3px",
                        fontSize: "13px",
                        textDecoration: "none",
                        fontWeight: 500,
                      }}
                    >
                      Kargo Firmasında Sorgula ↗
                    </a>
                  )}

                  {data.paymentStatus === "PAID" && data.operationalStatus !== "CANCELLED" && (
                    <Link href={`/iade-degisim?orderNumber=${encodeURIComponent(data.orderNumber)}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        style={{ fontSize: "13px" }}
                      >
                        İptal / İade / Değişim Talebi →
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Kargo Hareket Geçmişi */}
            {data.trackingEvents && data.trackingEvents.length > 0 && (
              <div
                style={{
                  backgroundColor: "#FFFFFF",
                  padding: "1.75rem",
                  borderRadius: "4px",
                  border: "1px solid #EAEAEA",
                }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "1rem" }}>Kargo Hareketleri</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {data.trackingEvents.map((evt) => (
                    <div
                      key={evt.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "1rem",
                        borderLeft: "2px solid #141414",
                        paddingLeft: "1rem",
                      }}
                    >
                      <div style={{ minWidth: "120px", fontSize: "12px", color: "#777" }}>
                        {new Date(evt.timestamp).toLocaleString("tr-TR")}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#141414" }}>{evt.description}</div>
                        {evt.location && <div style={{ fontSize: "12px", color: "#666" }}>{evt.location}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sipariş Kalemleri */}
            <div
              style={{
                backgroundColor: "#FFFFFF",
                padding: "1.75rem",
                borderRadius: "4px",
                border: "1px solid #EAEAEA",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "1rem" }}>Sipariş Edilen Ürünler</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {data.items.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingBottom: "0.75rem",
                      borderBottom: "1px solid #F0F0F0",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>{it.productName}</div>
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        Renk: {it.colorName} | Beden: {it.sizeName} | Adet: {it.quantity}
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 600 }}>{it.totalPrice.toFixed(2)} ₺</div>
                  </div>
                ))}
              </div>
            </div>

            {/* İade Talepleri Bilgisi */}
            {returnRequests.length > 0 && (
              <div
                style={{
                  backgroundColor: "#FFFFFF",
                  padding: "1.75rem",
                  borderRadius: "4px",
                  border: "1px solid #EAEAEA",
                }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "1rem" }}>Açık İade Talepleri</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {returnRequests.map((ret) => (
                    <div
                      key={ret.id}
                      style={{
                        padding: "1rem",
                        backgroundColor: "#FAFAFA",
                        borderRadius: "4px",
                        border: "1px solid #EEE",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600 }}>Talep No: {ret.id}</div>
                        <div style={{ fontSize: "12px", color: "#666" }}>Gerekçe: {ret.reason}</div>
                        <div style={{ fontSize: "11px", color: "#888" }}>
                          Tarih: {new Date(ret.createdAt).toLocaleDateString("tr-TR")}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "10px",
                            fontSize: "11px",
                            fontWeight: 600,
                            backgroundColor:
                              ret.status === "APPROVED" || ret.status === "REFUND_COMPLETED"
                                ? "#E8F5E9"
                                : ret.status === "REJECTED"
                                ? "#FFEBEE"
                                : "#FFF3E0",
                            color:
                              ret.status === "APPROVED" || ret.status === "REFUND_COMPLETED"
                                ? "#2E7D32"
                                : ret.status === "REJECTED"
                                ? "#C62828"
                                : "#EF6C00",
                          }}
                        >
                          {ret.status}
                        </span>
                        <div style={{ fontSize: "13px", fontWeight: 600, marginTop: "4px" }}>
                          {ret.requestedAmount.toFixed(2)} ₺
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* İade Modal Formu */}
        {showReturnModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 999,
              padding: "1rem",
            }}
          >
            <div
              style={{
                backgroundColor: "#FFFFFF",
                padding: "2rem",
                borderRadius: "4px",
                maxWidth: "500px",
                width: "100%",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              }}
            >
              <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "1rem" }}>
                İade Talebi Oluştur - {data?.orderNumber}
              </h3>
              <form onSubmit={handleCreateReturn} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "0.25rem" }}>
                    İade Nedeni
                  </label>
                  <select
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem",
                      border: "1px solid #CCC",
                      borderRadius: "3px",
                      fontSize: "13px",
                    }}
                  >
                    <option value="">Lütfen seçiniz</option>
                    <option value="Beden Uymadı / Değişim">Beden Uymadı / Değişim Talebi</option>
                    <option value="Kalıp / Kesim Beklentiye Uymadı">Kalıp / Kesim Beklentiye Uymadı</option>
                    <option value="Kumaş Dokusu Beklentisi">Kumaş Dokusu Farklı</option>
                    <option value="Vazgeçtim / Cayma Hakkı (14 Gün)">Vazgeçtim / Mesafeli Satış Cayma Hakkı</option>
                    <option value="Hasarlı / Kusurlu Ürün">Hasarlı / Kusurlu Ürün</option>
                    <option value="Diğer">Diğer</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "0.25rem" }}>
                    Açıklama / Müşteri Notu
                  </label>
                  <textarea
                    rows={3}
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder="İade etmek istediğiniz detayları belirtiniz..."
                    style={{
                      width: "100%",
                      padding: "0.6rem",
                      border: "1px solid #CCC",
                      borderRadius: "3px",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div style={{ fontSize: "11px", color: "#666", lineHeight: 1.5 }}>
                  * Tüketici Kanunu gereği giyilmemiş, etiketleri sökülmemiş ve orijinalliği bozulmamış ürünler teslimat tarihinden itibaren 14 gün içinde iade edilebilir.
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowReturnModal(false)}
                    disabled={submittingReturn}
                  >
                    Vazgeç
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={submittingReturn}
                    style={{ backgroundColor: "#141414", color: "#FFF" }}
                  >
                    {submittingReturn ? "Gönderiliyor..." : "Talebi Gönder"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
