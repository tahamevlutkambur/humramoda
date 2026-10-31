"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatCurrency } from "@/lib/formatters";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { event as trackMetaEvent } from "@/lib/meta-pixel";

interface OrderPublicData {
  orderNumber: string;
  customerName: string;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "CANCELLED";
  operationalStatus: "CONFIRMED" | "CANCELLED" | "PENDING";
  paymentProvider: string;
  totalAmount: number;
  totalKurus: number;
  city: string;
  district: string;
  itemCount: number;
  items: Array<{
    productName: string;
    colorName: string;
    sizeName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  createdAt: string;
  paidAt?: string;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("orderNumber");
  const { clearCart } = useCart();

  const [order, setOrder] = useState<OrderPublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollCount, setPollCount] = useState(0);
  const hasTrackedPurchase = useRef(false);

  const fetchStatus = React.useCallback(async () => {
    if (!orderNumber) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/payments/order-status?orderNumber=${encodeURIComponent(orderNumber)}`);
      const data = await res.json();
      if (res.ok && data.order) {
        setOrder(data.order);
        if (data.order.paymentStatus === "PAID") {
          clearCart();
          if (!hasTrackedPurchase.current) {
            hasTrackedPurchase.current = true;
            trackMetaEvent("Purchase", {
              value: data.order.totalAmount,
              currency: "TRY",
              content_name: data.order.orderNumber,
              num_items: data.order.itemCount,
            });
          }
        }
      }
    } catch (err) {
      console.error("Order status check error:", err);
    } finally {
      setLoading(false);
    }
  }, [orderNumber, clearCart]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Callback biraz gecikirse birkaç kez polling yap
  useEffect(() => {
    if (order && order.paymentStatus === "PENDING" && pollCount < 5) {
      const timer = setTimeout(() => {
        setPollCount((prev) => prev + 1);
        fetchStatus();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [order, pollCount, fetchStatus]);

  if (loading) {
    return (
      <div style={{ padding: "5rem 0", textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
        <p style={{ color: "var(--hm-color-text-secondary)" }}>Sipariş durumu sorgulanıyor...</p>
      </div>
    );
  }

  if (!orderNumber || !order) {
    return (
      <div style={{ padding: "5rem 0", textAlign: "center" }}>
        <Container>
          <div
            style={{
              maxWidth: "520px",
              margin: "0 auto",
              backgroundColor: "#FFF",
              padding: "3rem 2rem",
              borderRadius: "12px",
              border: "1px solid #E2E8F0",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>❓</div>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Sipariş Bilgisi Bulunamadı</h1>
            <p style={{ color: "#718096", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
              Belirtilen referans numarasıyla eşleşen bir sipariş kaydı tespit edilemedi.
            </p>
            <Link href="/urunler">
              <Button variant="primary" size="md">
                Koleksiyonlara Dön
              </Button>
            </Link>
          </div>
        </Container>
      </div>
    );
  }

  const isPending = order.paymentStatus === "PENDING";
  const isFailed = order.paymentStatus === "FAILED";

  return (
    <div style={{ backgroundColor: "#FAF9F6", minHeight: "85vh", padding: "3rem 0 6rem 0" }}>
      <Container>
        <div
          style={{
            maxWidth: "680px",
            margin: "0 auto",
            backgroundColor: "#FFF",
            borderRadius: "16px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
            border: "1px solid #EDF2F7",
            padding: "2.5rem",
            textAlign: "center",
          }}
        >
          {isPending ? (
            /* Beklemede (Callback henüz ulaşmadıysa) */
            <>
              <div
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "50%",
                  backgroundColor: "#FEFCBF",
                  color: "#B7791F",
                  fontSize: "2rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1.5rem auto",
                }}
              >
                ⏳
              </div>
              <h1
                style={{
                  fontFamily: "var(--hm-font-display)",
                  fontSize: "1.75rem",
                  color: "#1A202C",
                  marginBottom: "0.5rem",
                }}
              >
                Ödemeniz Doğrulanıyor...
              </h1>
              <p style={{ color: "#718096", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "2rem" }}>
                PayTR ve bankanızdan ödeme onayı bekleniyor. Lütfen bu sayfayı kapatmayınız; siparişiniz
                birkaç saniye içerisinde otomatik olarak teyit edilecektir.
              </p>
            </>
          ) : isFailed ? (
            /* Başarısız */
            <>
              <div
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "50%",
                  backgroundColor: "#FED7D7",
                  color: "#C53030",
                  fontSize: "2rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1.5rem auto",
                }}
              >
                ✕
              </div>
              <h1
                style={{
                  fontFamily: "var(--hm-font-display)",
                  fontSize: "1.75rem",
                  color: "#C53030",
                  marginBottom: "0.5rem",
                }}
              >
                Ödeme Onaylanamadı
              </h1>
              <p style={{ color: "#718096", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "2rem" }}>
                Ödeme işlemi bankanız tarafından onaylanmadı. Kart limitinizi veya 3D Secure şifrenizi kontrol ederek
                tekrar deneyebilirsiniz.
              </p>
              <Link href="/odeme">
                <Button variant="primary" size="md">
                  Ödemeyi Tekrar Dene
                </Button>
              </Link>
            </>
          ) : (
            /* Kesinleşmiş Başarılı Ödeme */
            <>
              <div
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(56, 161, 105, 0.12)",
                  color: "#38A169",
                  fontSize: "2.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1.5rem auto",
                }}
              >
                ✓
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#38A169",
                  fontWeight: 700,
                  display: "block",
                  marginBottom: "0.5rem",
                }}
              >
                Ödeme ve Sipariş Onaylandı
              </span>
              <h1
                style={{
                  fontFamily: "var(--hm-font-display)",
                  fontSize: "clamp(1.5rem, 3vw, 2rem)",
                  color: "#1A202C",
                  marginBottom: "0.75rem",
                }}
              >
                Teşekkür Ederiz, Siparişiniz Alındı!
              </h1>
              <p style={{ color: "#718096", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "2rem" }}>
                Sayın <strong>{order.customerName}</strong>, siparişiniz başarıyla oluşturuldu ve atölyemize iletildi.
                Kargonuz yola çıktığında bilgilendirme yapılacaktır.
              </p>

              {/* Sipariş Özet Kartı */}
              <div
                style={{
                  backgroundColor: "#F8FAFC",
                  borderRadius: "10px",
                  padding: "1.5rem",
                  textAlign: "left",
                  marginBottom: "2rem",
                  border: "1px solid #EDF2F7",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingBottom: "0.75rem",
                    borderBottom: "1px solid #E2E8F0",
                    marginBottom: "0.75rem",
                  }}
                >
                  <span style={{ fontSize: "0.8125rem", color: "#718096" }}>Sipariş Numarası</span>
                  <span style={{ fontWeight: 700, fontFamily: "monospace", color: "#1A202C" }}>
                    {order.orderNumber}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingBottom: "0.75rem",
                    borderBottom: "1px solid #E2E8F0",
                    marginBottom: "0.75rem",
                  }}
                >
                  <span style={{ fontSize: "0.8125rem", color: "#718096" }}>Ödeme Yöntemi</span>
                  <span style={{ fontWeight: 600, color: "#1A202C" }}>PayTR (3D Secure)</span>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingBottom: "0.75rem",
                    borderBottom: "1px solid #E2E8F0",
                    marginBottom: "0.75rem",
                  }}
                >
                  <span style={{ fontSize: "0.8125rem", color: "#718096" }}>Teslimat Bölgesi</span>
                  <span style={{ fontWeight: 600, color: "#1A202C" }}>
                    {order.district} / {order.city}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: "0.25rem",
                  }}
                >
                  <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#1A202C" }}>
                    Ödenen Toplam Tutar
                  </span>
                  <span
                    style={{
                      fontSize: "1.125rem",
                      fontWeight: 700,
                      color: "var(--hm-color-accent-merat)",
                    }}
                    className="tabular-nums"
                  >
                    {formatCurrency(order.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Kalemler */}
              <div style={{ textAlign: "left", marginBottom: "2rem" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#4A5568", marginBottom: "0.75rem" }}>
                  Sipariş Edilen Ürünler ({order.items.length})
                </h3>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {order.items.map((it, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.8125rem",
                        padding: "0.5rem 0",
                        borderBottom: "1px solid #F1F5F9",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: "#1A202C" }}>{it.productName}</div>
                        <div style={{ fontSize: "0.75rem", color: "#718096" }}>
                          {it.colorName} • {it.sizeName} • {it.quantity} Adet
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, color: "#2D3748" }} className="tabular-nums">
                        {formatCurrency(it.totalPrice)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
                <Link href="/urunler">
                  <Button variant="primary" size="md">
                    Alışverişe Devam Et
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </Container>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<div style={{ padding: "5rem", textAlign: "center" }}>Yükleniyor...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
