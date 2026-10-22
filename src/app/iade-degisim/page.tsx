"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/formatters";

interface EligibleItem {
  id: string;
  productId: string;
  productName: string;
  colorName: string;
  sizeName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  availableQuantity: number;
}

interface OrderSummary {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  createdAt: string;
  totalAmount: number;
  paymentStatus: string;
  operationalStatus: string;
  shippingStatus: string;
  carrierName?: string;
  trackingNumber?: string | null;
}

interface EligibleActions {
  canCancel: boolean;
  cancelReasonMessage?: string;
  canReturn: boolean;
  returnReasonMessage?: string;
  canExchange: boolean;
  exchangeReasonMessage?: string;
}

interface ExistingRequest {
  id: string;
  requestType?: string;
  status: string;
  requestedAmount: number;
  createdAt: string;
  items: {
    productName: string;
    colorName?: string;
    sizeName?: string;
    quantity: number;
  }[];
}

type RequestType = "RETURN" | "CANCEL" | "EXCHANGE";

export default function ReturnAndExchangePage() {
  // 1. Doğrulama Formu Durumları
  const [orderNumber, setOrderNumber] = useState("");
  const [identifierValue, setIdentifierValue] = useState(""); // Email veya Telefon
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  // 2. Doğrulanmış Sipariş Bilgileri
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [eligibleActions, setEligibleActions] = useState<EligibleActions | null>(null);
  const [items, setItems] = useState<EligibleItem[]>([]);
  const [existingRequests, setExistingRequests] = useState<ExistingRequest[]>([]);

  // 3. Talep Formu Durumları
  const [requestType, setRequestType] = useState<RequestType>("RETURN");
  const [selectedItems, setSelectedItems] = useState<{ [itemId: string]: number }>({});
  const [reason, setReason] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [requestedSize, setRequestedSize] = useState("");
  const [requestedColor, setRequestedColor] = useState("");
  const [exchangeNotes, setExchangeNotes] = useState("");

  // 4. Gönderim & Sonuç Durumları
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [createdSuccessMsg, setCreatedSuccessMsg] = useState("");

  // Sipariş Doğrulama (Adım 1 & 2)
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError("");
    setSubmitError("");
    setCreatedRequestId(null);

    const cleanOrder = orderNumber.trim();
    const cleanIdent = identifierValue.trim();

    if (!cleanOrder || !cleanIdent) {
      setLookupError("Lütfen sipariş numaranızı ve e-posta adresinizi veya telefon numaranızı giriniz.");
      return;
    }

    setLookupLoading(true);
    try {
      const isEmail = cleanIdent.includes("@");
      const res = await fetch("/api/returns/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: cleanOrder,
          email: isEmail ? cleanIdent : undefined,
          phone: !isEmail ? cleanIdent : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLookupError(data.error || "Sipariş bulunamadı veya doğrulama başarısız.");
        setOrderSummary(null);
        return;
      }

      setOrderSummary(data.orderSummary);
      setEligibleActions(data.eligibleActions);
      setItems(data.items || []);
      setExistingRequests(data.existingRequests || []);

      // İlk talep türünü uygunluğa göre seç
      if (data.eligibleActions?.canReturn) {
        setRequestType("RETURN");
      } else if (data.eligibleActions?.canExchange) {
        setRequestType("EXCHANGE");
      } else if (data.eligibleActions?.canCancel) {
        setRequestType("CANCEL");
      }

      // Seçili ürünleri sıfırla
      setSelectedItems({});
    } catch {
      setLookupError("Sunucuyla bağlantı kurulamadı. Lütfen internet bağlantınızı kontrol ediniz.");
    } finally {
      setLookupLoading(false);
    }
  };

  // Kalem Adedi Değiştirme
  const handleQuantityChange = (itemId: string, maxQty: number, qty: number) => {
    const validQty = Math.max(0, Math.min(maxQty, qty));
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (validQty > 0) {
        next[itemId] = validQty;
      } else {
        delete next[itemId];
      }
      return next;
    });
  };

  // Talep Gönderimi (Adım 7 & 8)
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderSummary) return;

    setSubmitError("");

    // İptal durumunda tüm uygun kalemler otomatik seçilebilir veya müşteri seçebilir
    const itemEntries = Object.entries(selectedItems).filter(([, qty]) => qty > 0);

    if (itemEntries.length === 0) {
      setSubmitError("Lütfen talepte bulunmak istediğiniz en az bir ürün ve adet seçiniz.");
      return;
    }

    if (!reason.trim()) {
      setSubmitError("Lütfen talebinize ilişkin bir gerekçe seçiniz veya açıklama giriniz.");
      return;
    }

    if (requestType === "EXCHANGE" && !requestedSize.trim() && !requestedColor.trim()) {
      setSubmitError("Değişim talebinde lütfen tercih ettiğiniz yeni beden veya rengi belirtiniz.");
      return;
    }

    setSubmitting(true);
    try {
      const isEmail = identifierValue.includes("@");
      const res = await fetch("/api/returns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: orderSummary.orderNumber,
          customerEmail: isEmail ? identifierValue.trim() : undefined,
          customerPhone: !isEmail ? identifierValue.trim() : undefined,
          requestType,
          exchangeDetails:
            requestType === "EXCHANGE"
              ? {
                  requestedSize: requestedSize.trim() || undefined,
                  requestedColor: requestedColor.trim() || undefined,
                  notes: exchangeNotes.trim() || undefined,
                }
              : undefined,
          reason: reason.trim(),
          customerNotes: customerNotes.trim() || undefined,
          items: itemEntries.map(([orderItemId, quantity]) => ({
            orderItemId,
            quantity,
            reason: reason.trim(),
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Talebiniz kaydedilirken bir hata oluştu.");
        return;
      }

      setCreatedRequestId(data.returnRequest?.id || "RET-OK");
      setCreatedSuccessMsg(
        data.message || "Talebiniz başarıyla alınmıştır. Müşteri temsilcilerimiz incelemeye başlayacaktır."
      );
    } catch {
      setSubmitError("Sunucu hatası oluştu. Lütfen tekrar deneyiniz.");
    } finally {
      setSubmitting(false);
    }
  };

  // Hesaplanan tahmini iade tutarı
  const calculatedEstimatedTotal = Object.entries(selectedItems).reduce((sum, [itemId, qty]) => {
    const it = items.find((i) => i.id === itemId);
    return sum + (it ? it.unitPrice * qty : 0);
  }, 0);

  return (
    <div style={{ backgroundColor: "var(--hm-color-surface)", minHeight: "80vh", padding: "var(--hm-space-12) 0 var(--hm-space-20)" }}>
      <Container>
        {/* Başlık ve Bilgilendirme */}
        <div style={{ maxWidth: "780px", margin: "0 auto var(--hm-space-10)", textAlign: "center" }}>
          <span
            style={{
              fontSize: "var(--hm-text-2xs)",
              letterSpacing: "var(--hm-tracking-wider)",
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
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: "var(--hm-font-regular)",
              letterSpacing: "var(--hm-tracking-tight)",
              color: "var(--hm-color-text-main)",
              marginBottom: "var(--hm-space-3)",
            }}
          >
            İptal, İade ve Değişim Talebi
          </h1>
          <p
            style={{
              fontSize: "var(--hm-text-sm)",
              lineHeight: 1.7,
              color: "var(--hm-color-text-muted)",
            }}
          >
            Sipariş numaranız ve siparişinize ait e-posta veya telefon bilginiz ile siparişinizi sorgulayabilir;
            yasal haklarınız doğrultusunda iptal, iade veya beden/renk değişimi talebinde bulunabilirsiniz.
          </p>
        </div>

        {/* Adım 1 & 2: Sipariş Doğrulama Kartı */}
        <div
          style={{
            maxWidth: "680px",
            margin: "0 auto var(--hm-space-8)",
            backgroundColor: "#FFFFFF",
            border: "1px solid var(--hm-color-border-subtle)",
            borderRadius: "8px",
            padding: "var(--hm-space-6)",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
          }}
        >
          <h2
            style={{
              fontSize: "var(--hm-text-base)",
              fontWeight: 600,
              color: "var(--hm-color-text-main)",
              marginBottom: "var(--hm-space-4)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                backgroundColor: "var(--hm-color-text-main)",
                color: "#FFFFFF",
                fontSize: "12px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              1
            </span>
            Sipariş Doğrulama
          </h2>

          <form onSubmit={handleLookup}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--hm-space-4)", marginBottom: "var(--hm-space-4)" }}>
              <div>
                <label
                  htmlFor="orderNumberInput"
                  style={{
                    display: "block",
                    fontSize: "var(--hm-text-xs)",
                    fontWeight: 500,
                    marginBottom: "0.35rem",
                    color: "var(--hm-color-text-muted)",
                  }}
                >
                  Sipariş Numarası *
                </label>
                <input
                  id="orderNumberInput"
                  type="text"
                  placeholder="Örn: HM-20261021-0001"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  disabled={lookupLoading || Boolean(orderSummary)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "var(--hm-text-sm)",
                    border: "1px solid var(--hm-color-border)",
                    borderRadius: "4px",
                    outline: "none",
                    fontFamily: "inherit",
                    backgroundColor: orderSummary ? "#F8FAFC" : "#FFFFFF",
                  }}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="identifierInput"
                  style={{
                    display: "block",
                    fontSize: "var(--hm-text-xs)",
                    fontWeight: 500,
                    marginBottom: "0.35rem",
                    color: "var(--hm-color-text-muted)",
                  }}
                >
                  E-Posta veya Telefon Numarası *
                </label>
                <input
                  id="identifierInput"
                  type="text"
                  placeholder="E-posta veya telefon numaranız"
                  value={identifierValue}
                  onChange={(e) => setIdentifierValue(e.target.value)}
                  disabled={lookupLoading || Boolean(orderSummary)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "var(--hm-text-sm)",
                    border: "1px solid var(--hm-color-border)",
                    borderRadius: "4px",
                    outline: "none",
                    fontFamily: "inherit",
                    backgroundColor: orderSummary ? "#F8FAFC" : "#FFFFFF",
                  }}
                  required
                />
              </div>
            </div>

            {lookupError && (
              <div
                style={{
                  padding: "0.75rem",
                  backgroundColor: "#FEE2E2",
                  color: "#991B1B",
                  fontSize: "var(--hm-text-xs)",
                  borderRadius: "4px",
                  marginBottom: "var(--hm-space-4)",
                  lineHeight: 1.5,
                }}
              >
                {lookupError}
              </div>
            )}

            {!orderSummary ? (
              <Button type="submit" disabled={lookupLoading} style={{ width: "100%" }}>
                {lookupLoading ? "Sipariş Doğrulanıyor..." : "Siparişi Sorgula ve Doğrula"}
              </Button>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.5rem" }}>
                <span style={{ fontSize: "var(--hm-text-xs)", color: "#166534", fontWeight: 600 }}>
                  ✓ Sipariş doğrulandı ({orderSummary.customerName})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOrderSummary(null);
                    setCreatedRequestId(null);
                    setSelectedItems({});
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--hm-color-text-muted)",
                    fontSize: "var(--hm-text-xs)",
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  Farklı Sipariş Sorgula
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Başarılı Talep Ekranı (Adım 8) */}
        {createdRequestId && (
          <div
            style={{
              maxWidth: "680px",
              margin: "0 auto var(--hm-space-8)",
              backgroundColor: "#F0FDF4",
              border: "1px solid #86EFAC",
              borderRadius: "8px",
              padding: "var(--hm-space-8)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "#22C55E",
                color: "#FFFFFF",
                fontSize: "24px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1rem",
              }}
            >
              ✓
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#15803D", marginBottom: "0.5rem" }}>
              Talebiniz Alındı
            </h3>
            <p style={{ fontSize: "var(--hm-text-sm)", color: "#166534", marginBottom: "1rem", lineHeight: 1.6 }}>
              {createdSuccessMsg}
            </p>
            <div
              style={{
                display: "inline-block",
                padding: "0.75rem 1.5rem",
                backgroundColor: "#FFFFFF",
                border: "1px dashed #86EFAC",
                borderRadius: "6px",
                marginBottom: "1.5rem",
              }}
            >
              <span style={{ fontSize: "var(--hm-text-xs)", color: "var(--hm-color-text-muted)", display: "block" }}>
                Talep Takip Numaranız
              </span>
              <strong style={{ fontSize: "1.125rem", color: "var(--hm-color-text-main)", letterSpacing: "0.05em" }}>
                {createdRequestId}
              </strong>
            </div>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/siparis-takip">
                <Button variant="outline" style={{ fontSize: "0.8125rem" }}>
                  Sipariş Durumunu Takip Et
                </Button>
              </Link>
              <Button
                variant="primary"
                onClick={() => {
                  setCreatedRequestId(null);
                  setSelectedItems({});
                  setOrderSummary(null);
                  setOrderNumber("");
                  setIdentifierValue("");
                }}
                style={{ fontSize: "0.8125rem" }}
              >
                Yeni Talep Aç
              </Button>
            </div>
          </div>
        )}

        {/* Adım 3-7: Sipariş Kalemleri ve Talep Formu */}
        {orderSummary && !createdRequestId && (
          <form onSubmit={handleSubmitRequest} style={{ maxWidth: "680px", margin: "0 auto" }}>
            {/* Mevcut Açık Talepler Bilgisi */}
            {existingRequests.length > 0 && (
              <div
                style={{
                  backgroundColor: "#FFFBEB",
                  border: "1px solid #FDE68A",
                  borderRadius: "8px",
                  padding: "1rem",
                  marginBottom: "var(--hm-space-6)",
                  fontSize: "var(--hm-text-xs)",
                  color: "#92400E",
                }}
              >
                <strong>Dikkat:</strong> Bu siparişe ait daha önce oluşturulmuş{" "}
                <strong>{existingRequests.length} adet talep</strong> bulunmaktadır. İncelenmekte olan taleplere ait ürünler için mükerrer talep açılamaz.
              </div>
            )}

            {/* Adım 4: Talep Türü Seçimi */}
            <div
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid var(--hm-color-border-subtle)",
                borderRadius: "8px",
                padding: "var(--hm-space-6)",
                marginBottom: "var(--hm-space-6)",
              }}
            >
              <h2
                style={{
                  fontSize: "var(--hm-text-base)",
                  fontWeight: 600,
                  color: "var(--hm-color-text-main)",
                  marginBottom: "var(--hm-space-4)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    backgroundColor: "var(--hm-color-text-main)",
                    color: "#FFFFFF",
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  2
                </span>
                Talep Türünü Belirleyin
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                {/* İptal Seçeneği */}
                <label
                  style={{
                    display: "block",
                    padding: "0.875rem",
                    borderRadius: "6px",
                    border: `1.5px solid ${requestType === "CANCEL" ? "var(--hm-color-primary)" : "var(--hm-color-border)"}`,
                    backgroundColor: requestType === "CANCEL" ? "rgba(180, 83, 9, 0.04)" : "#FFFFFF",
                    cursor: eligibleActions?.canCancel ? "pointer" : "not-allowed",
                    opacity: eligibleActions?.canCancel ? 1 : 0.6,
                  }}
                >
                  <input
                    type="radio"
                    name="requestType"
                    value="CANCEL"
                    checked={requestType === "CANCEL"}
                    disabled={!eligibleActions?.canCancel}
                    onChange={() => setRequestType("CANCEL")}
                    style={{ marginRight: "0.5rem" }}
                  />
                  <strong style={{ display: "block", fontSize: "var(--hm-text-sm)", color: "var(--hm-color-text-main)" }}>
                    Sipariş İptali
                  </strong>
                  <span style={{ fontSize: "var(--hm-text-2xs)", color: "var(--hm-color-text-muted)" }}>
                    Kargoya verilmemiş sipariş için
                  </span>
                </label>

                {/* İade Seçeneği */}
                <label
                  style={{
                    display: "block",
                    padding: "0.875rem",
                    borderRadius: "6px",
                    border: `1.5px solid ${requestType === "RETURN" ? "var(--hm-color-primary)" : "var(--hm-color-border)"}`,
                    backgroundColor: requestType === "RETURN" ? "rgba(79, 70, 229, 0.04)" : "#FFFFFF",
                    cursor: eligibleActions?.canReturn ? "pointer" : "not-allowed",
                    opacity: eligibleActions?.canReturn ? 1 : 0.6,
                  }}
                >
                  <input
                    type="radio"
                    name="requestType"
                    value="RETURN"
                    checked={requestType === "RETURN"}
                    disabled={!eligibleActions?.canReturn}
                    onChange={() => setRequestType("RETURN")}
                    style={{ marginRight: "0.5rem" }}
                  />
                  <strong style={{ display: "block", fontSize: "var(--hm-text-sm)", color: "var(--hm-color-text-main)" }}>
                    Ürün İadesi
                  </strong>
                  <span style={{ fontSize: "var(--hm-text-2xs)", color: "var(--hm-color-text-muted)" }}>
                    Teslim alınan ürünün ücret iadesi
                  </span>
                </label>

                {/* Değişim Seçeneği */}
                <label
                  style={{
                    display: "block",
                    padding: "0.875rem",
                    borderRadius: "6px",
                    border: `1.5px solid ${requestType === "EXCHANGE" ? "var(--hm-color-primary)" : "var(--hm-color-border)"}`,
                    backgroundColor: requestType === "EXCHANGE" ? "rgba(16, 185, 129, 0.04)" : "#FFFFFF",
                    cursor: eligibleActions?.canExchange ? "pointer" : "not-allowed",
                    opacity: eligibleActions?.canExchange ? 1 : 0.6,
                  }}
                >
                  <input
                    type="radio"
                    name="requestType"
                    value="EXCHANGE"
                    checked={requestType === "EXCHANGE"}
                    disabled={!eligibleActions?.canExchange}
                    onChange={() => setRequestType("EXCHANGE")}
                    style={{ marginRight: "0.5rem" }}
                  />
                  <strong style={{ display: "block", fontSize: "var(--hm-text-sm)", color: "var(--hm-color-text-main)" }}>
                    Beden / Renk Değişimi
                  </strong>
                  <span style={{ fontSize: "var(--hm-text-2xs)", color: "var(--hm-color-text-muted)" }}>
                    Aynı ürünün farklı varyantı
                  </span>
                </label>
              </div>

              {requestType === "CANCEL" && !eligibleActions?.canCancel && (
                <div style={{ marginTop: "0.5rem", fontSize: "var(--hm-text-2xs)", color: "#DC2626" }}>
                  {eligibleActions?.cancelReasonMessage}
                </div>
              )}
            </div>

            {/* Adım 5: Ürün ve Miktar Seçimi */}
            <div
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid var(--hm-color-border-subtle)",
                borderRadius: "8px",
                padding: "var(--hm-space-6)",
                marginBottom: "var(--hm-space-6)",
              }}
            >
              <h2
                style={{
                  fontSize: "var(--hm-text-base)",
                  fontWeight: 600,
                  color: "var(--hm-color-text-main)",
                  marginBottom: "var(--hm-space-4)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    backgroundColor: "var(--hm-color-text-main)",
                    color: "#FFFFFF",
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  3
                </span>
                Talebe Konu Ürünleri Seçin
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {items.map((item) => {
                  const isAvailable = item.availableQuantity > 0;
                  const currentSelectedQty = selectedItems[item.id] || 0;

                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: "1rem",
                        borderRadius: "6px",
                        border: "1px solid var(--hm-color-border-subtle)",
                        backgroundColor: isAvailable ? "#FAFAFA" : "#F3F4F6",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "1rem",
                        flexWrap: "wrap",
                        opacity: isAvailable ? 1 : 0.6,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: "220px" }}>
                        <div style={{ fontWeight: 600, fontSize: "var(--hm-text-sm)", color: "var(--hm-color-text-main)" }}>
                          {item.productName}
                        </div>
                        <div style={{ fontSize: "var(--hm-text-2xs)", color: "var(--hm-color-text-muted)", marginTop: "2px" }}>
                          Renk: {item.colorName} | Beden: {item.sizeName} | SKU: {item.sku}
                        </div>
                        <div style={{ fontSize: "var(--hm-text-xs)", fontWeight: 600, marginTop: "4px" }}>
                          {formatCurrency(item.unitPrice)}
                        </div>
                      </div>

                      {isAvailable ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <label htmlFor={`qty-${item.id}`} style={{ fontSize: "var(--hm-text-2xs)", color: "var(--hm-color-text-muted)" }}>
                            Talep Adedi:
                          </label>
                          <select
                            id={`qty-${item.id}`}
                            value={currentSelectedQty}
                            onChange={(e) => handleQuantityChange(item.id, item.availableQuantity, Number(e.target.value))}
                            style={{
                              padding: "0.4rem 0.6rem",
                              fontSize: "var(--hm-text-xs)",
                              borderRadius: "4px",
                              border: "1px solid var(--hm-color-border)",
                              backgroundColor: "#FFFFFF",
                            }}
                          >
                            <option value={0}>Seçilmedi</option>
                            {Array.from({ length: item.availableQuantity }, (_, i) => i + 1).map((q) => (
                              <option key={q} value={q}>
                                {q} Adet
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span style={{ fontSize: "var(--hm-text-2xs)", color: "#DC2626", fontWeight: 500 }}>
                          Bu ürüne ait tüm adetler için talep açılmıştır.
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Adım 6: Gerekçe & Değişim Detayları */}
            <div
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid var(--hm-color-border-subtle)",
                borderRadius: "8px",
                padding: "var(--hm-space-6)",
                marginBottom: "var(--hm-space-6)",
              }}
            >
              <h2
                style={{
                  fontSize: "var(--hm-text-base)",
                  fontWeight: 600,
                  color: "var(--hm-color-text-main)",
                  marginBottom: "var(--hm-space-4)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    backgroundColor: "var(--hm-color-text-main)",
                    color: "#FFFFFF",
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  4
                </span>
                Gerekçe ve Tercihler
              </h2>

              <div style={{ marginBottom: "var(--hm-space-4)" }}>
                <label
                  htmlFor="reasonSelect"
                  style={{ display: "block", fontSize: "var(--hm-text-xs)", fontWeight: 500, marginBottom: "0.35rem" }}
                >
                  Talep Gerekçesi *
                </label>
                <select
                  id="reasonSelect"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "var(--hm-text-sm)",
                    borderRadius: "4px",
                    border: "1px solid var(--hm-color-border)",
                    backgroundColor: "#FFFFFF",
                  }}
                  required
                >
                  <option value="">Lütfen bir gerekçe seçiniz...</option>
                  <option value="Beden uymadı (küçük veya büyük geldi)">Beden uymadı (küçük veya büyük geldi)</option>
                  <option value="Ürün kalıbı veya rengi beklentimi karşılamadı">Ürün kalıbı veya rengi beklentimi karşılamadı</option>
                  <option value="Farklı bir model veya parça ile değiştirmek istiyorum">Farklı bir model veya parça ile değiştirmek istiyorum</option>
                  <option value="Kusurlu, defolu veya hasarlı ürün teslimatı">Kusurlu, defolu veya hasarlı ürün teslimatı</option>
                  <option value="Yanlış ürün veya yanlış beden gönderimi">Yanlış ürün veya yanlış beden gönderimi</option>
                  <option value="Vazgeçtim / Siparişten cayma hakkı kullanımı">Vazgeçtim / Siparişten cayma hakkı kullanımı</option>
                  <option value="Diğer">Diğer (Aşağıdaki alanda açıklayınız)</option>
                </select>
              </div>

              {/* Değişim Özel Alanları */}
              {requestType === "EXCHANGE" && (
                <div
                  style={{
                    padding: "1rem",
                    backgroundColor: "rgba(16, 185, 129, 0.05)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    borderRadius: "6px",
                    marginBottom: "var(--hm-space-4)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "var(--hm-text-xs)", color: "#065F46", marginBottom: "0.75rem" }}>
                    Tercih Ettiğiniz Yeni Varyant Bilgileri:
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <div>
                      <label htmlFor="reqSize" style={{ display: "block", fontSize: "var(--hm-text-2xs)", color: "var(--hm-color-text-muted)", marginBottom: "0.25rem" }}>
                        İstenen Yeni Beden *
                      </label>
                      <input
                        id="reqSize"
                        type="text"
                        placeholder="Örn: 2 Beden (40-42)"
                        value={requestedSize}
                        onChange={(e) => setRequestedSize(e.target.value)}
                        style={{ width: "100%", padding: "0.6rem", fontSize: "var(--hm-text-xs)", border: "1px solid var(--hm-color-border)", borderRadius: "4px" }}
                      />
                    </div>
                    <div>
                      <label htmlFor="reqColor" style={{ display: "block", fontSize: "var(--hm-text-2xs)", color: "var(--hm-color-text-muted)", marginBottom: "0.25rem" }}>
                        İstenen Yeni Renk
                      </label>
                      <input
                        id="reqColor"
                        type="text"
                        placeholder="Örn: Siyah"
                        value={requestedColor}
                        onChange={(e) => setRequestedColor(e.target.value)}
                        style={{ width: "100%", padding: "0.6rem", fontSize: "var(--hm-text-xs)", border: "1px solid var(--hm-color-border)", borderRadius: "4px" }}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="reqExchangeNotes" style={{ display: "block", fontSize: "var(--hm-text-2xs)", color: "var(--hm-color-text-muted)", marginBottom: "0.25rem" }}>
                      Değişim Notu (Opsiyonel)
                    </label>
                    <input
                      id="reqExchangeNotes"
                      type="text"
                      placeholder="Özel değişim notunuz"
                      value={exchangeNotes}
                      onChange={(e) => setExchangeNotes(e.target.value)}
                      style={{ width: "100%", padding: "0.6rem", fontSize: "var(--hm-text-xs)", border: "1px solid var(--hm-color-border)", borderRadius: "4px" }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="customerNotesInput"
                  style={{ display: "block", fontSize: "var(--hm-text-xs)", fontWeight: 500, marginBottom: "0.35rem" }}
                >
                  Ek Açıklamanız (Opsiyonel)
                </label>
                <textarea
                  id="customerNotesInput"
                  rows={3}
                  placeholder="Eklemek istediğiniz ayrıntıları buraya yazabilirsiniz..."
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "var(--hm-text-sm)",
                    borderRadius: "4px",
                    border: "1px solid var(--hm-color-border)",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            {/* Adım 7: Talep Özeti & Onay Kartı */}
            <div
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid var(--hm-color-border-subtle)",
                borderRadius: "8px",
                padding: "var(--hm-space-6)",
                marginBottom: "var(--hm-space-6)",
              }}
            >
              <h2
                style={{
                  fontSize: "var(--hm-text-base)",
                  fontWeight: 600,
                  color: "var(--hm-color-text-main)",
                  marginBottom: "var(--hm-space-3)",
                }}
              >
                Talep Özeti ve Onay
              </h2>

              <div
                style={{
                  backgroundColor: "#F8FAFC",
                  padding: "1rem",
                  borderRadius: "6px",
                  fontSize: "var(--hm-text-xs)",
                  color: "var(--hm-color-text-muted)",
                  lineHeight: 1.6,
                  marginBottom: "var(--hm-space-4)",
                }}
              >
                <div>
                  Talep Türü:{" "}
                  <strong style={{ color: "var(--hm-color-text-main)" }}>
                    {requestType === "CANCEL"
                      ? "Sipariş İptali"
                      : requestType === "EXCHANGE"
                      ? "Beden / Renk Değişimi"
                      : "Ürün İadesi & Ücret İadesi"}
                  </strong>
                </div>
                <div>
                  Seçilen Kalem Adedi:{" "}
                  <strong style={{ color: "var(--hm-color-text-main)" }}>
                    {Object.values(selectedItems).reduce((a, b) => a + b, 0)} Adet
                  </strong>
                </div>
                {requestType !== "EXCHANGE" && (
                  <div>
                    Tahmini İade Tutarı:{" "}
                    <strong style={{ color: "var(--hm-color-text-main)" }}>
                      {formatCurrency(calculatedEstimatedTotal)}
                    </strong>
                  </div>
                )}
                <div style={{ marginTop: "0.5rem", fontSize: "0.6875rem", color: "#64748B" }}>
                  * İade ve değişim işlemleri ürün depomuza ulaştıktan ve fiziksel kalite kontrolünden geçtikten sonra tamamlanır.
                  6502 sayılı yasa uyarınca kullanılmamış, etiketi koparılmamış ürünler kabul edilmektedir.
                </div>
              </div>

              {submitError && (
                <div
                  style={{
                    padding: "0.75rem",
                    backgroundColor: "#FEE2E2",
                    color: "#991B1B",
                    fontSize: "var(--hm-text-xs)",
                    borderRadius: "4px",
                    marginBottom: "var(--hm-space-4)",
                  }}
                >
                  {submitError}
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting || Object.keys(selectedItems).length === 0}
                style={{ width: "100%", padding: "0.875rem" }}
              >
                {submitting ? "Talebiniz Kaydediliyor..." : "Talebi Onayla ve Gönder"}
              </Button>
            </div>
          </form>
        )}
      </Container>
    </div>
  );
}
