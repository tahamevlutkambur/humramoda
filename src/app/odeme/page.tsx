"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/context/CartContext";
import { formatCurrency } from "@/lib/formatters";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

interface CustomerFormData {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  district: string;
  fullAddress: string;
  postalCode: string;
  customerNotes: string;
}

export default function CheckoutPage() {
  const { items, subtotal, freeShippingThreshold } = useCart();
  const [formData, setFormData] = useState<CustomerFormData>({
    fullName: "",
    email: "",
    phone: "",
    city: "İstanbul",
    district: "",
    fullAddress: "",
    postalCode: "",
    customerNotes: "",
  });

  const [campaignCode, setCampaignCode] = useState("");
  const [appliedCampaign, setAppliedCampaign] = useState<{
    code: string;
    discountAmount: number;
    description: string;
  } | null>(null);

  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignError, setCampaignError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // PayTR iFrame durumları
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [isSimulation, setIsSimulation] = useState(false);

  // Kargo ve Toplam Hesaplama
  const discount = appliedCampaign ? appliedCampaign.discountAmount : 0;
  const eligibleAmount = Math.max(0, subtotal - discount);
  const shippingFee = eligibleAmount >= freeShippingThreshold ? 0 : 0; // Hümra Moda kargo politikası
  const totalAmount = Math.max(0, eligibleAmount + shippingFee);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignCode.trim()) return;

    setCampaignLoading(true);
    setCampaignError("");

    try {
      // Kupon kontrolü (sunucu taraflı hesaplama simülasyonu)
      const cleanCode = campaignCode.trim().toUpperCase();
      if (cleanCode === "MERHABA10" || cleanCode.startsWith("TEST")) {
        const disc = Math.round(subtotal * 0.1 * 100) / 100;
        setAppliedCampaign({
          code: cleanCode,
          discountAmount: disc,
          description: "%10 Hoş Geldiniz İndirimi",
        });
      } else {
        setCampaignError("Geçersiz veya süresi dolmuş kupon kodu.");
      }
    } catch {
      setCampaignError("Kupon kontrol edilirken hata oluştu.");
    } finally {
      setCampaignLoading(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!formData.fullName.trim()) {
      setErrorMsg("Lütfen ad ve soyadınızı giriniz.");
      return;
    }
    if (!formData.email.trim() || !formData.email.includes("@")) {
      setErrorMsg("Lütfen geçerli bir e-posta adresi giriniz.");
      return;
    }
    if (!formData.phone.trim() || formData.phone.length < 10) {
      setErrorMsg("Lütfen geçerli bir telefon numarası giriniz.");
      return;
    }
    if (!formData.city.trim() || !formData.district.trim() || !formData.fullAddress.trim()) {
      setErrorMsg("Lütfen teslimat adresi alanlarını eksiksiz doldurunuz.");
      return;
    }

    if (items.length === 0) {
      setErrorMsg("Sepetinizde ürün bulunamadı. Lütfen alışverişe devam ediniz.");
      return;
    }

    setSubmitting(true);

    try {
      const cartProductsMetadata = items.map((it) => ({
        ...it.product,
        media: [],
        _mediaTruncated: true,
      }));

      const orderPayload = {
        _snapshot: {
          updatedAt: Date.now(),
          products: cartProductsMetadata,
        },
        customer: formData,
        items: items.map((it) => {
          const variant =
            it.product.variants.find(
              (v) => v.colorId === it.color.id && v.sizeId === it.size.id
            ) || it.product.variants[0];

          return {
            productId: it.product.id,
            variantId: variant?.id,
            sku: variant?.sku,
            colorName: it.color.name,
            sizeName: it.size.name,
            quantity: it.quantity,
          };
        }),
        campaignCode: appliedCampaign?.code,
      };

      const res = await fetch("/api/payments/paytr/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Ödeme başlatılamadı.");
      }

      setOrderNumber(data.orderNumber);
      setIsSimulation(Boolean(data.isSimulation));
      setIframeUrl(data.iframeUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Ödeme formu yüklenemedi.");
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0 && !iframeUrl) {
    return (
      <div style={{ padding: "var(--hm-space-20) 0", minHeight: "60vh" }}>
        <Container>
          <div
            style={{
              maxWidth: "520px",
              margin: "0 auto",
              textAlign: "center",
              backgroundColor: "var(--hm-color-surface)",
              padding: "var(--hm-space-12) var(--hm-space-6)",
              borderRadius: "var(--hm-radius-md)",
              border: "1px solid var(--hm-color-border-subtle)",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🛍️</div>
            <h1
              style={{
                fontFamily: "var(--hm-font-display)",
                fontSize: "1.75rem",
                color: "var(--hm-color-text-main)",
                marginBottom: "0.75rem",
              }}
            >
              Sepetiniz Boş
            </h1>
            <p style={{ color: "var(--hm-color-text-secondary)", fontSize: "0.875rem", marginBottom: "2rem" }}>
              Ödeme işlemine devam edebilmek için lütfen koleksiyonlarımızdan ürün ekleyiniz.
            </p>
            <Link href="/urunler">
              <Button variant="primary" size="md">
                Koleksiyonu Keşfet
              </Button>
            </Link>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#FAF9F6", minHeight: "90vh", padding: "2.5rem 0 5rem 0" }}>
      <Container>
        {/* Güvenli Alışveriş Başlığı */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              backgroundColor: "rgba(139, 38, 53, 0.08)",
              color: "var(--hm-color-accent-merat)",
              padding: "0.35rem 0.85rem",
              borderRadius: "999px",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "0.75rem",
            }}
          >
            🔒 PayTR 256-Bit SSL Güvenli Ödeme
          </div>
          <h1
            style={{
              fontFamily: "var(--hm-font-display)",
              fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
              color: "var(--hm-color-text-main)",
              letterSpacing: "0.02em",
            }}
          >
            Siparişi Tamamla
          </h1>
        </div>

        {/* Hata Mesajı */}
        {errorMsg && (
          <div
            style={{
              maxWidth: "800px",
              margin: "0 auto 1.5rem auto",
              backgroundColor: "#FFF5F5",
              color: "#C53030",
              border: "1px solid #FEB2B2",
              padding: "1rem 1.25rem",
              borderRadius: "8px",
              fontSize: "0.875rem",
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        {/* PayTR iFrame Açıldıysa */}
        {iframeUrl ? (
          <div
            style={{
              maxWidth: "820px",
              margin: "0 auto",
              backgroundColor: "#FFF",
              padding: "2rem",
              borderRadius: "12px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
              border: "1px solid #E2E8F0",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingBottom: "1rem",
                borderBottom: "1px solid #EDF2F7",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#718096" }}>
                  Sipariş No
                </div>
                <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.125rem", color: "#1A202C" }}>
                  {orderNumber}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#718096" }}>
                  Ödenecek Tutar
                </div>
                <div style={{ fontWeight: 700, fontSize: "1.25rem", color: "var(--hm-color-accent-merat)" }}>
                  {formatCurrency(totalAmount)}
                </div>
              </div>
            </div>

            {isSimulation && (
              <div
                style={{
                  backgroundColor: "#EBF8FF",
                  border: "1px solid #BEE3F8",
                  color: "#2B6CB0",
                  padding: "0.75rem 1rem",
                  borderRadius: "6px",
                  fontSize: "0.8125rem",
                  marginBottom: "1.25rem",
                }}
              >
                ℹ️ <strong>PayTR Test Simülasyon Modu:</strong> Geliştirme ortamındasınız. Aşağıdaki güvenli
                simülasyon ekranından ödeme onayını veya reddini canlı olarak test edebilirsiniz.
              </div>
            )}

            <div
              style={{
                minHeight: "520px",
                position: "relative",
                backgroundColor: "#F7FAFC",
                borderRadius: "8px",
                overflow: "hidden",
                border: "1px solid #E2E8F0",
              }}
            >
              <iframe
                src={iframeUrl}
                title="PayTR Güvenli Ödeme Formu"
                style={{
                  width: "100%",
                  height: "560px",
                  border: "none",
                }}
              />
            </div>

            <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick={() => setIframeUrl(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#718096",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                ← Bilgileri Düzenlemeye Geri Dön
              </button>
            </div>
          </div>
        ) : (
          /* Sipariş Bilgi Formu ve Sepet Özeti */
          <div className="hm-checkout-layout flex flex-col lg:grid lg:grid-cols-12 gap-6 w-full max-w-6xl mx-auto">
            {/* Sol Taraf: Teslimat Bilgileri Formu */}
            <div className="hm-checkout-card w-full lg:col-span-7">
              <h2
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "#1A202C",
                  marginBottom: "1.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span>1.</span> Teslimat ve İletişim Bilgileri
              </h2>

              <form onSubmit={handleSubmitOrder}>
                <div style={{ display: "grid", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#4A5568", marginBottom: "0.25rem" }}>
                      Ad Soyad *
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      placeholder="Örn: Zeynep Kaya"
                      required
                      className="hm-checkout-input"
                    />
                  </div>

                  <div className="hm-checkout-grid-2">
                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#4A5568", marginBottom: "0.25rem" }}>
                        E-Posta Adresi *
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="zeynep@example.com"
                        required
                        className="hm-checkout-input"
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#4A5568", marginBottom: "0.25rem" }}>
                        Telefon Numarası *
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="0532 111 22 33"
                        required
                        className="hm-checkout-input"
                      />
                    </div>
                  </div>

                  <div className="hm-checkout-grid-2">
                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#4A5568", marginBottom: "0.25rem" }}>
                        İl *
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        placeholder="İstanbul"
                        required
                        className="hm-checkout-input"
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#4A5568", marginBottom: "0.25rem" }}>
                        İlçe *
                      </label>
                      <input
                        type="text"
                        name="district"
                        value={formData.district}
                        onChange={handleInputChange}
                        placeholder="Kadıköy"
                        required
                        className="hm-checkout-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#4A5568", marginBottom: "0.25rem" }}>
                      Açık Teslimat Adresi *
                    </label>
                    <textarea
                      name="fullAddress"
                      value={formData.fullAddress}
                      onChange={handleInputChange}
                      placeholder="Mahalle, cadde, sokak, bina ve daire no..."
                      rows={3}
                      required
                      className="hm-checkout-input"
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#4A5568", marginBottom: "0.25rem" }}>
                      Sipariş Notu (Opsiyonel)
                    </label>
                    <input
                      type="text"
                      name="customerNotes"
                      value={formData.customerNotes}
                      onChange={handleInputChange}
                      placeholder="Varsa kargo veya teslimat notunuz..."
                      className="hm-checkout-input"
                    />
                  </div>

                  <div style={{ marginTop: "1rem" }}>
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      fullWidth
                      disabled={submitting}
                    >
                      {submitting ? "Ödeme Formu Hazırlanıyor..." : "🔒 Güvenli Ödemeye Geç"}
                    </Button>
                  </div>
                </div>
              </form>
            </div>

            {/* Sağ Taraf: Sipariş Özeti ve Ürünler */}
            <div className="w-full lg:col-span-5">
              <div className="hm-checkout-card">
                <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#1A202C", marginBottom: "1.25rem" }}>
                  Sipariş Özeti ({items.length} Kalem)
                </h2>

                {/* Ürün Listesi */}
                <div style={{ maxHeight: "320px", overflowY: "auto", marginBottom: "1.5rem" }}>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        padding: "0.75rem 0",
                        borderBottom: "1px solid #F1F5F9",
                      }}
                    >
                      <div
                        style={{
                          width: "56px",
                          height: "72px",
                          position: "relative",
                          borderRadius: "4px",
                          overflow: "hidden",
                          flexShrink: 0,
                          backgroundColor: "#F8FAFC",
                        }}
                      >
                        <Image
                          src={
                            item.product.media?.find((m) => m.colorId === item.color.id)?.thumbnailUrl ||
                            item.product.media?.[0]?.thumbnailUrl ||
                            item.product.media?.[0]?.url ||
                            "/uploads/products/IMG_2190-thumb.webp"
                          }
                          alt={item.product.title}
                          fill
                          sizes="56px"
                          style={{ objectFit: "cover" }}
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "0.8125rem",
                            color: "#1A202C",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.product.title}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#718096", marginTop: "2px" }}>
                          {item.color.name} • {item.size.name} • {item.quantity} Adet
                        </div>
                        <div style={{ fontWeight: 600, fontSize: "0.8125rem", color: "#2D3748", marginTop: "4px" }}>
                          {formatCurrency((item.product.discountPrice ?? item.product.basePrice) * item.quantity)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* İndirim Kuponu Girişi */}
                <form onSubmit={handleApplyCoupon} style={{ marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      type="text"
                      placeholder="İndirim Kuponu"
                      value={campaignCode}
                      onChange={(e) => setCampaignCode(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "0.5rem 0.75rem",
                        border: "1px solid #CBD5E0",
                        borderRadius: "6px",
                        fontSize: "0.8125rem",
                        textTransform: "uppercase",
                      }}
                    />
                    <button
                      type="submit"
                      disabled={campaignLoading}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "#1A202C",
                        color: "#FFF",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Uygula
                    </button>
                  </div>
                  {campaignError && (
                    <div style={{ fontSize: "0.75rem", color: "#E53E3E", marginTop: "0.35rem" }}>
                      {campaignError}
                    </div>
                  )}
                  {appliedCampaign && (
                    <div style={{ fontSize: "0.75rem", color: "#38A169", marginTop: "0.35rem", fontWeight: 600 }}>
                      ✓ {appliedCampaign.description} uygulandı (-{formatCurrency(appliedCampaign.discountAmount)})
                    </div>
                  )}
                </form>

                {/* Finansal Döküm */}
                <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "#4A5568", marginBottom: "0.5rem" }}>
                    <span>Ara Toplam</span>
                    <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "#38A169", marginBottom: "0.5rem" }}>
                      <span>İndirim Tutarı</span>
                      <span className="tabular-nums">-{formatCurrency(discount)}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "#4A5568", marginBottom: "0.75rem" }}>
                    <span>Kargo Ücreti</span>
                    <span style={{ color: "#38A169", fontWeight: 600 }}>Ücretsiz Kargo</span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "1.125rem",
                      fontWeight: 700,
                      color: "#1A202C",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid #EDF2F7",
                    }}
                  >
                    <span>Toplam Tutar</span>
                    <span style={{ color: "var(--hm-color-accent-merat)" }} className="tabular-nums">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "1.25rem",
                    padding: "0.75rem",
                    backgroundColor: "#F8FAFC",
                    borderRadius: "6px",
                    fontSize: "0.6875rem",
                    color: "#718096",
                    textAlign: "center",
                    lineHeight: 1.5,
                  }}
                >
                  🔒 Ödemeleriniz PayTR altyapısıyla 256-bit SSL şifreleme ve 3D Secure güvencesiyle alınır.
                  Kart bilgileriniz sistemimizde saklanmaz.
                </div>
              </div>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
