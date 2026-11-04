"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCustomerAuth, CustomerAddress } from "@/context/CustomerAuthContext";
import { Container } from "@/components/ui/Container";
import { formatCurrency } from "@/lib/formatters";

interface CustomerOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  totalAmount: number;
  subtotal?: number;
  discountAmount?: number;
  shippingAmount?: number;
  operationalStatus: string;
  paymentStatus: string;
  paymentProvider?: string;
  shippingStatus?: string;
  carrierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  itemsCount: number;
  items: Array<{
    productName: string;
    colorName: string;
    sizeName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  shippingAddress: {
    city: string;
    district: string;
    fullAddress: string;
    postalCode?: string;
  };
}

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";

  const { customer, loading: authLoading, logout, refreshCustomer } = useCustomerAuth();

  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "addresses" | "profile" | "password">(
    initialTab as any
  );

  // Siparişler durumu
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);

  // Adresler durumu
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [addressFormData, setAddressFormData] = useState({
    title: "",
    recipient: "",
    phone: "",
    city: "İstanbul",
    district: "",
    neighborhood: "",
    fullAddress: "",
    postalCode: "",
    isDefaultDelivery: false,
    isDefaultBilling: false,
  });
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState("");

  // Profil formu
  const [profileData, setProfileData] = useState({
    fullName: "",
    phone: "",
    marketingConsent: false,
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");

  // Şifre değiştirme formu
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    newPasswordRepeat: "",
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Oturum kontrolü
  useEffect(() => {
    if (!authLoading && !customer) {
      router.push("/giris?redirect=/hesabim");
    }
  }, [authLoading, customer, router]);

  // Profil verisi senkronizasyonu
  useEffect(() => {
    if (customer) {
      setProfileData({
        fullName: customer.fullName || "",
        phone: customer.phone || "",
        marketingConsent: Boolean(customer.marketingConsent),
      });
      setAddresses(customer.addresses || []);
    }
  }, [customer]);

  // Siparişleri çek
  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch("/api/customer/orders", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch {
      // Hata durumunda boş liste
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (customer && (activeTab === "orders" || activeTab === "overview")) {
      loadOrders();
    }
  }, [customer, activeTab]);

  if (authLoading || !customer) {
    return (
      <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--hm-color-text-muted)", fontSize: "0.9375rem" }}>
          Hesabınız yükleniyor...
        </div>
      </div>
    );
  }

  // Adres Formu Aç
  const handleOpenAddressModal = (addr?: CustomerAddress) => {
    setAddressError("");
    if (addr) {
      setEditingAddress(addr);
      setAddressFormData({
        title: addr.title,
        recipient: addr.recipient,
        phone: addr.phone,
        city: addr.city,
        district: addr.district,
        neighborhood: addr.neighborhood || "",
        fullAddress: addr.fullAddress,
        postalCode: addr.postalCode || "",
        isDefaultDelivery: Boolean(addr.isDefaultDelivery),
        isDefaultBilling: Boolean(addr.isDefaultBilling),
      });
    } else {
      setEditingAddress(null);
      setAddressFormData({
        title: "Ev",
        recipient: customer.fullName,
        phone: customer.phone || "",
        city: "İstanbul",
        district: "",
        neighborhood: "",
        fullAddress: "",
        postalCode: "",
        isDefaultDelivery: addresses.length === 0,
        isDefaultBilling: addresses.length === 0,
      });
    }
    setAddressModalOpen(true);
  };

  // Adres Kaydet
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressError("");

    if (!addressFormData.title.trim()) {
      setAddressError("Adres başlığı zorunludur.");
      return;
    }
    if (!addressFormData.recipient.trim()) {
      setAddressError("Teslim alacak kişi adı zorunludur.");
      return;
    }
    if (!addressFormData.phone.trim() || addressFormData.phone.length < 10) {
      setAddressError("Geçerli bir telefon numarası giriniz.");
      return;
    }
    if (!addressFormData.city.trim() || !addressFormData.district.trim() || !addressFormData.fullAddress.trim()) {
      setAddressError("Lütfen il, ilçe ve açık adres alanlarını eksiksiz doldurunuz.");
      return;
    }

    setAddressSaving(true);
    try {
      const url = editingAddress
        ? `/api/customer/addresses/${editingAddress.id}`
        : "/api/customer/addresses";
      const method = editingAddress ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addressFormData),
      });

      const data = await res.json();
      if (!res.ok) {
        setAddressError(data.error || "Adres kaydedilemedi.");
      } else {
        await refreshCustomer();
        setAddressModalOpen(false);
      }
    } catch {
      setAddressError("Bağlantı hatası oluştu.");
    } finally {
      setAddressSaving(false);
    }
  };

  // Adres Sil
  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm("Bu adresi silmek istediğinize emin misiniz?")) return;

    try {
      const res = await fetch(`/api/customer/addresses/${addressId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await refreshCustomer();
      } else {
        const data = await res.json();
        alert(data.error || "Adres silinemedi.");
      }
    } catch {
      alert("Bağlantı hatası oluştu.");
    }
  };

  // Profil Güncelle
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (!profileData.fullName.trim()) {
      setProfileError("Ad ve soyad boş bırakılamaz.");
      return;
    }

    setProfileSaving(true);
    try {
      const res = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData),
      });

      const data = await res.json();
      if (!res.ok) {
        setProfileError(data.error || "Profil güncellenemedi.");
      } else {
        setProfileSuccess("Profil bilgileriniz başarıyla güncellendi.");
        await refreshCustomer();
      }
    } catch {
      setProfileError("Bağlantı hatası oluştu.");
    } finally {
      setProfileSaving(false);
    }
  };

  // Şifre Değiştir
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!passwordData.currentPassword) {
      setPasswordError("Mevcut şifrenizi giriniz.");
      return;
    }
    if (!passwordData.newPassword || passwordData.newPassword.length < 6) {
      setPasswordError("Yeni şifreniz en az 6 karakter olmalıdır.");
      return;
    }
    if (passwordData.newPassword !== passwordData.newPasswordRepeat) {
      setPasswordError("Yeni şifreler birbiriyle eşleşmiyor.");
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch("/api/customer/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordData),
      });

      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.error || "Şifre güncellenemedi.");
      } else {
        setPasswordSuccess("Şifreniz başarıyla değiştirildi.");
        setPasswordData({ currentPassword: "", newPassword: "", newPasswordRepeat: "" });
      }
    } catch {
      setPasswordError("Bağlantı hatası oluştu.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <div style={{ backgroundColor: "var(--hm-color-bg-base)", minHeight: "85vh", padding: "3rem 0 5rem" }}>
      <Container>
        {/* Üst Karşılama Başlığı */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "2.5rem",
            paddingBottom: "1.5rem",
            borderBottom: "1px solid var(--hm-color-border-subtle)",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "0.8125rem",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "var(--hm-color-text-muted)",
                fontWeight: 600,
                display: "block",
              }}
            >
              Müşteri Hesabı
            </span>
            <h1
              style={{
                fontFamily: "var(--hm-font-display)",
                fontSize: "clamp(1.5rem, 3vw, 2rem)",
                fontWeight: 500,
                color: "var(--hm-color-text-main)",
                marginTop: "0.25rem",
              }}
            >
              Merhaba, {customer.fullName}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: "0.625rem 1.25rem",
              backgroundColor: "transparent",
              color: "var(--hm-color-text-secondary)",
              border: "1px solid var(--hm-color-border-subtle)",
              borderRadius: "var(--hm-radius-sm)",
              fontSize: "0.8125rem",
              fontWeight: 500,
              letterSpacing: "0.06em",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Çıkış Yap
          </button>
        </div>

        {/* Ana Izgara: Sol Menü / Sağ İçerik */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "2rem" }}>
          {/* Sol Navigasyon Menüsü */}
          <div style={{ maxWidth: "280px", width: "100%" }}>
            <div
              style={{
                backgroundColor: "var(--hm-color-surface)",
                border: "1px solid var(--hm-color-border-subtle)",
                borderRadius: "var(--hm-radius-md)",
                overflow: "hidden",
                boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
              }}
            >
              {[
                { id: "overview", label: "Hesap Özeti", icon: "📊" },
                { id: "orders", label: `Siparişlerim (${orders.length})`, icon: "📦" },
                { id: "addresses", label: `Adreslerim (${addresses.length})`, icon: "📍" },
                { id: "profile", label: "Kişisel Bilgiler", icon: "👤" },
                { id: "password", label: "Şifre Değiştir", icon: "🔒" },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "1rem 1.25rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      fontSize: "0.875rem",
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? "var(--hm-color-text-main)" : "var(--hm-color-text-secondary)",
                      backgroundColor: isActive ? "var(--hm-color-surface-subtle)" : "transparent",
                      border: "none",
                      borderLeft: isActive ? "3px solid var(--hm-color-text-main)" : "3px solid transparent",
                      borderBottom: "1px solid var(--hm-color-border-subtle)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sağ Panel İçerikleri */}
          <div style={{ flex: 1, minWidth: "0" }}>
            {/* 1. HESAP ÖZETİ */}
            {activeTab === "overview" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* Hızlı Kartlar */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                  <div
                    style={{
                      backgroundColor: "var(--hm-color-surface)",
                      border: "1px solid var(--hm-color-border-subtle)",
                      borderRadius: "var(--hm-radius-md)",
                      padding: "1.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--hm-color-text-muted)" }}>
                      Toplam Sipariş
                    </span>
                    <div style={{ fontFamily: "var(--hm-font-display)", fontSize: "1.75rem", fontWeight: 600, color: "var(--hm-color-text-main)", marginTop: "0.25rem" }}>
                      {orders.length} Adet
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: "var(--hm-color-surface)",
                      border: "1px solid var(--hm-color-border-subtle)",
                      borderRadius: "var(--hm-radius-md)",
                      padding: "1.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--hm-color-text-muted)" }}>
                      Kayıtlı Adresler
                    </span>
                    <div style={{ fontFamily: "var(--hm-font-display)", fontSize: "1.75rem", fontWeight: 600, color: "var(--hm-color-text-main)", marginTop: "0.25rem" }}>
                      {addresses.length} Adres
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: "var(--hm-color-surface)",
                      border: "1px solid var(--hm-color-border-subtle)",
                      borderRadius: "var(--hm-radius-md)",
                      padding: "1.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--hm-color-text-muted)" }}>
                      E-posta
                    </span>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 500, color: "var(--hm-color-text-main)", marginTop: "0.5rem", wordBreak: "break-all" }}>
                      {customer.email}
                    </div>
                  </div>
                </div>

                {/* Son Siparişler Snippet */}
                <div
                  style={{
                    backgroundColor: "var(--hm-color-surface)",
                    border: "1px solid var(--hm-color-border-subtle)",
                    borderRadius: "var(--hm-radius-md)",
                    padding: "1.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h3 style={{ fontFamily: "var(--hm-font-display)", fontSize: "1.125rem", fontWeight: 600, color: "var(--hm-color-text-main)" }}>
                      Son Siparişiniz
                    </h3>
                    {orders.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("orders")}
                        style={{ background: "none", border: "none", color: "var(--hm-color-text-main)", fontSize: "0.8125rem", textDecoration: "underline", cursor: "pointer" }}
                      >
                        Tümünü Gör ({orders.length}) →
                      </button>
                    )}
                  </div>

                  {ordersLoading ? (
                    <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--hm-color-text-muted)" }}>
                      Siparişler yükleniyor...
                    </div>
                  ) : orders.length === 0 ? (
                    <div style={{ padding: "2rem 0", textAlign: "center" }}>
                      <p style={{ color: "var(--hm-color-text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
                        Henüz kayıtlı bir siparişiniz bulunmamaktadır.
                      </p>
                      <Link
                        href="/urunler"
                        style={{
                          display: "inline-block",
                          padding: "0.625rem 1.25rem",
                          backgroundColor: "var(--hm-color-text-main)",
                          color: "#FFF",
                          borderRadius: "var(--hm-radius-sm)",
                          fontSize: "0.75rem",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        Alışverişe Başla
                      </Link>
                    </div>
                  ) : (
                    <div style={{ border: "1px solid var(--hm-color-border-subtle)", borderRadius: "var(--hm-radius-sm)", padding: "1rem" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.75rem" }}>
                        <div>
                          <span style={{ fontSize: "0.75rem", color: "var(--hm-color-text-muted)", display: "block" }}>Sipariş No</span>
                          <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--hm-color-text-main)" }}>{orders[0].orderNumber}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: "0.75rem", color: "var(--hm-color-text-muted)", display: "block" }}>Tarih</span>
                          <span style={{ fontSize: "0.875rem" }}>{new Date(orders[0].createdAt).toLocaleDateString("tr-TR")}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: "0.75rem", color: "var(--hm-color-text-muted)", display: "block" }}>Tutar</span>
                          <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{formatCurrency(orders[0].totalAmount)}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: "0.75rem", color: "var(--hm-color-text-muted)", display: "block" }}>Durum</span>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor: orders[0].operationalStatus === "CONFIRMED" ? "rgba(34, 197, 94, 0.12)" : "rgba(234, 179, 8, 0.12)",
                              color: orders[0].operationalStatus === "CONFIRMED" ? "#16A34A" : "#CA8A04",
                            }}
                          >
                            {orders[0].operationalStatus === "CONFIRMED" ? "Onaylandı" : "İşleniyor"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(orders[0])}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          backgroundColor: "var(--hm-color-surface-subtle)",
                          border: "1px solid var(--hm-color-border-subtle)",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Sipariş Detaylarını Gör
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. SİPARİŞLERİM */}
            {activeTab === "orders" && (
              <div
                style={{
                  backgroundColor: "var(--hm-color-surface)",
                  border: "1px solid var(--hm-color-border-subtle)",
                  borderRadius: "var(--hm-radius-md)",
                  padding: "1.5rem",
                }}
              >
                <h2 style={{ fontFamily: "var(--hm-font-display)", fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.25rem" }}>
                  Sipariş Geçmişim
                </h2>

                {ordersLoading ? (
                  <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--hm-color-text-muted)" }}>
                    Siparişleriniz yükleniyor...
                  </div>
                ) : orders.length === 0 ? (
                  <div style={{ padding: "3rem 0", textAlign: "center" }}>
                    <p style={{ color: "var(--hm-color-text-muted)", fontSize: "0.9375rem", marginBottom: "1rem" }}>
                      Henüz tamamlanmış bir siparişiniz bulunmamaktadır.
                    </p>
                    <Link
                      href="/urunler"
                      style={{
                        display: "inline-block",
                        padding: "0.75rem 1.5rem",
                        backgroundColor: "var(--hm-color-text-main)",
                        color: "#FFF",
                        borderRadius: "var(--hm-radius-sm)",
                        fontSize: "0.8125rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      Koleksiyonu Keşfet
                    </Link>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {orders.map((o) => (
                      <div
                        key={o.id}
                        style={{
                          border: "1px solid var(--hm-color-border-subtle)",
                          borderRadius: "var(--hm-radius-sm)",
                          padding: "1.25rem",
                        }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem", borderBottom: "1px solid var(--hm-color-border-subtle)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
                          <div>
                            <span style={{ fontSize: "0.75rem", color: "var(--hm-color-text-muted)", display: "block" }}>Sipariş Numarası</span>
                            <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--hm-color-text-main)" }}>{o.orderNumber}</span>
                          </div>
                          <div>
                            <span style={{ fontSize: "0.75rem", color: "var(--hm-color-text-muted)", display: "block" }}>Sipariş Tarihi</span>
                            <span style={{ fontSize: "0.875rem" }}>{new Date(o.createdAt).toLocaleDateString("tr-TR")}</span>
                          </div>
                          <div>
                            <span style={{ fontSize: "0.75rem", color: "var(--hm-color-text-muted)", display: "block" }}>Toplam Tutar</span>
                            <span style={{ fontWeight: 600, fontSize: "1rem", color: "var(--hm-color-text-main)" }}>{formatCurrency(o.totalAmount)}</span>
                          </div>
                          <div>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.25rem 0.625rem",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                backgroundColor: o.operationalStatus === "CONFIRMED" ? "rgba(34, 197, 94, 0.12)" : "rgba(234, 179, 8, 0.12)",
                                color: o.operationalStatus === "CONFIRMED" ? "#16A34A" : "#CA8A04",
                              }}
                            >
                              {o.operationalStatus === "CONFIRMED" ? "Onaylandı" : "İşleniyor"}
                            </span>
                          </div>
                        </div>

                        {/* Ürün Listesi Önizleme */}
                        <div style={{ fontSize: "0.8125rem", color: "var(--hm-color-text-secondary)", marginBottom: "0.75rem" }}>
                          {o.items.map((it, idx) => (
                            <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                              <span>
                                {it.productName} ({it.colorName} / {it.sizeName}) × {it.quantity}
                              </span>
                              <span>{formatCurrency(it.totalPrice)}</span>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                          {o.trackingNumber ? (
                            <Link
                              href={`/siparis-takip?order=${encodeURIComponent(o.orderNumber)}`}
                              style={{
                                fontSize: "0.75rem",
                                color: "#2563EB",
                                textDecoration: "underline",
                                fontWeight: 600,
                              }}
                            >
                              🚚 Kargo Takibi: {o.carrierName || "Kargo"} ({o.trackingNumber})
                            </Link>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--hm-color-text-muted)" }}>
                              Kargo hazırlık aşamasında
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedOrder(o)}
                            style={{
                              padding: "0.4rem 0.875rem",
                              backgroundColor: "var(--hm-color-surface-subtle)",
                              border: "1px solid var(--hm-color-border-subtle)",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Detayları İncele
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. ADRESLERİM */}
            {activeTab === "addresses" && (
              <div
                style={{
                  backgroundColor: "var(--hm-color-surface)",
                  border: "1px solid var(--hm-color-border-subtle)",
                  borderRadius: "var(--hm-radius-md)",
                  padding: "1.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <h2 style={{ fontFamily: "var(--hm-font-display)", fontSize: "1.25rem", fontWeight: 600 }}>
                    Kayıtlı Teslimat Adreslerim
                  </h2>
                  <button
                    type="button"
                    onClick={() => handleOpenAddressModal()}
                    style={{
                      padding: "0.5rem 1rem",
                      backgroundColor: "var(--hm-color-text-main)",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "var(--hm-radius-sm)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      cursor: "pointer",
                    }}
                  >
                    + Yeni Adres Ekle
                  </button>
                </div>

                {addresses.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--hm-color-text-muted)" }}>
                    <p style={{ marginBottom: "1rem" }}>Henüz kayıtlı bir adresiniz bulunmamaktadır.</p>
                    <button
                      type="button"
                      onClick={() => handleOpenAddressModal()}
                      style={{
                        padding: "0.625rem 1.25rem",
                        backgroundColor: "var(--hm-color-text-main)",
                        color: "#FFF",
                        border: "none",
                        borderRadius: "var(--hm-radius-sm)",
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                      }}
                    >
                      İlk Adresinizi Ekleyin
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
                    {addresses.map((addr) => (
                      <div
                        key={addr.id}
                        style={{
                          border: addr.isDefaultDelivery ? "2px solid var(--hm-color-text-main)" : "1px solid var(--hm-color-border-subtle)",
                          borderRadius: "var(--hm-radius-sm)",
                          padding: "1.25rem",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          backgroundColor: "var(--hm-color-bg-base)",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                            <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--hm-color-text-main)" }}>
                              {addr.title}
                            </span>
                            {addr.isDefaultDelivery && (
                              <span style={{ fontSize: "0.6875rem", padding: "0.15rem 0.5rem", backgroundColor: "var(--hm-color-text-main)", color: "#FFF", borderRadius: "3px", fontWeight: 600 }}>
                                Varsayılan
                              </span>
                            )}
                          </div>
                          <p style={{ fontWeight: 500, fontSize: "0.875rem", margin: "0 0 0.25rem" }}>{addr.recipient}</p>
                          <p style={{ fontSize: "0.8125rem", color: "var(--hm-color-text-secondary)", margin: "0 0 0.5rem" }}>{addr.phone}</p>
                          <p style={{ fontSize: "0.8125rem", color: "var(--hm-color-text-secondary)", margin: "0 0 0.5rem", lineHeight: 1.4 }}>
                            {addr.fullAddress}
                          </p>
                          <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--hm-color-text-main)", margin: 0 }}>
                            {addr.district} / {addr.city} {addr.postalCode ? `(${addr.postalCode})` : ""}
                          </p>
                        </div>

                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--hm-color-border-subtle)" }}>
                          <button
                            type="button"
                            onClick={() => handleOpenAddressModal(addr)}
                            style={{
                              flex: 1,
                              padding: "0.375rem",
                              backgroundColor: "transparent",
                              border: "1px solid var(--hm-color-border-subtle)",
                              borderRadius: "3px",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr.id)}
                            style={{
                              padding: "0.375rem 0.75rem",
                              backgroundColor: "transparent",
                              border: "1px solid rgba(220, 38, 38, 0.3)",
                              color: "#DC2626",
                              borderRadius: "3px",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. KİŞİSEL BİLGİLER */}
            {activeTab === "profile" && (
              <div
                style={{
                  backgroundColor: "var(--hm-color-surface)",
                  border: "1px solid var(--hm-color-border-subtle)",
                  borderRadius: "var(--hm-radius-md)",
                  padding: "1.5rem",
                  maxWidth: "500px",
                }}
              >
                <h2 style={{ fontFamily: "var(--hm-font-display)", fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.25rem" }}>
                  Kişisel Bilgilerim
                </h2>

                {profileSuccess && (
                  <div style={{ backgroundColor: "rgba(34, 197, 94, 0.08)", color: "#16A34A", padding: "0.75rem", borderRadius: "4px", fontSize: "0.8125rem", marginBottom: "1rem" }}>
                    {profileSuccess}
                  </div>
                )}
                {profileError && (
                  <div style={{ backgroundColor: "rgba(220, 38, 38, 0.08)", color: "#DC2626", padding: "0.75rem", borderRadius: "4px", fontSize: "0.8125rem", marginBottom: "1rem" }}>
                    {profileError}
                  </div>
                )}

                <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                      E-posta Adresi (Değiştirilemez)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={customer.email}
                      style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px", backgroundColor: "var(--hm-color-surface-subtle)", color: "var(--hm-color-text-muted)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                      Ad Soyad
                    </label>
                    <input
                      type="text"
                      required
                      value={profileData.fullName}
                      onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                      style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px", backgroundColor: "var(--hm-color-bg-base)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                      Telefon Numarası
                    </label>
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      placeholder="05XX XXX XX XX"
                      style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px", backgroundColor: "var(--hm-color-bg-base)" }}
                    />
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", cursor: "pointer", color: "var(--hm-color-text-secondary)" }}>
                    <input
                      type="checkbox"
                      checked={profileData.marketingConsent}
                      onChange={(e) => setProfileData({ ...profileData, marketingConsent: e.target.checked })}
                    />
                    <span>Kampanya ve indirimlerden haberdar olmak istiyorum</span>
                  </label>

                  <button
                    type="submit"
                    disabled={profileSaving}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.75rem",
                      backgroundColor: "var(--hm-color-text-main)",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      cursor: profileSaving ? "not-allowed" : "pointer",
                    }}
                  >
                    {profileSaving ? "Kaydediliyor..." : "Bilgileri Güncelle"}
                  </button>
                </form>
              </div>
            )}

            {/* 5. ŞİFRE DEĞİŞTİR */}
            {activeTab === "password" && (
              <div
                style={{
                  backgroundColor: "var(--hm-color-surface)",
                  border: "1px solid var(--hm-color-border-subtle)",
                  borderRadius: "var(--hm-radius-md)",
                  padding: "1.5rem",
                  maxWidth: "500px",
                }}
              >
                <h2 style={{ fontFamily: "var(--hm-font-display)", fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.25rem" }}>
                  Şifre Değiştirme
                </h2>

                {passwordSuccess && (
                  <div style={{ backgroundColor: "rgba(34, 197, 94, 0.08)", color: "#16A34A", padding: "0.75rem", borderRadius: "4px", fontSize: "0.8125rem", marginBottom: "1rem" }}>
                    {passwordSuccess}
                  </div>
                )}
                {passwordError && (
                  <div style={{ backgroundColor: "rgba(220, 38, 38, 0.08)", color: "#DC2626", padding: "0.75rem", borderRadius: "4px", fontSize: "0.8125rem", marginBottom: "1rem" }}>
                    {passwordError}
                  </div>
                )}

                <form onSubmit={handleUpdatePassword} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                      Mevcut Şifre
                    </label>
                    <input
                      type="password"
                      required
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px", backgroundColor: "var(--hm-color-bg-base)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                      Yeni Şifre (En az 6 karakter)
                    </label>
                    <input
                      type="password"
                      required
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px", backgroundColor: "var(--hm-color-bg-base)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
                      Yeni Şifre Tekrar
                    </label>
                    <input
                      type="password"
                      required
                      value={passwordData.newPasswordRepeat}
                      onChange={(e) => setPasswordData({ ...passwordData, newPasswordRepeat: e.target.value })}
                      style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px", backgroundColor: "var(--hm-color-bg-base)" }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={passwordSaving}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.75rem",
                      backgroundColor: "var(--hm-color-text-main)",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      cursor: passwordSaving ? "not-allowed" : "pointer",
                    }}
                  >
                    {passwordSaving ? "Güncelleniyor..." : "Şifreyi Değiştir"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* ADRES EKLE/DÜZENLE MODALI */}
        {addressModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
          >
            <div
              style={{
                backgroundColor: "var(--hm-color-surface)",
                borderRadius: "var(--hm-radius-md)",
                maxWidth: "520px",
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "2rem",
                boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <h3 style={{ fontFamily: "var(--hm-font-display)", fontSize: "1.25rem", fontWeight: 600 }}>
                  {editingAddress ? "Adresi Düzenle" : "Yeni Teslimat Adresi"}
                </h3>
                <button
                  type="button"
                  onClick={() => setAddressModalOpen(false)}
                  style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "var(--hm-color-text-muted)" }}
                >
                  ✕
                </button>
              </div>

              {addressError && (
                <div style={{ backgroundColor: "rgba(220, 38, 38, 0.08)", color: "#DC2626", padding: "0.75rem", borderRadius: "4px", fontSize: "0.8125rem", marginBottom: "1rem" }}>
                  {addressError}
                </div>
              )}

              <form onSubmit={handleSaveAddress} noValidate style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    Adres Başlığı (örn: Ev, İş) *
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    value={addressFormData.title}
                    onChange={(e) => setAddressFormData({ ...addressFormData, title: e.target.value })}
                    placeholder="Ev, İş"
                    style={{ width: "100%", padding: "0.625rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                      Teslim Alacak Kişi *
                    </label>
                    <input
                      type="text"
                      name="recipient"
                      required
                      value={addressFormData.recipient}
                      onChange={(e) => setAddressFormData({ ...addressFormData, recipient: e.target.value })}
                      placeholder="Teslim alacak kişi"
                      style={{ width: "100%", padding: "0.625rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                      Telefon Numarası *
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      required
                      value={addressFormData.phone}
                      onChange={(e) => setAddressFormData({ ...addressFormData, phone: e.target.value })}
                      placeholder="05XX XXX XX XX"
                      style={{ width: "100%", padding: "0.625rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                      İl *
                    </label>
                    <input
                      type="text"
                      name="city"
                      required
                      value={addressFormData.city}
                      onChange={(e) => setAddressFormData({ ...addressFormData, city: e.target.value })}
                      placeholder="İl"
                      style={{ width: "100%", padding: "0.625rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                      İlçe *
                    </label>
                    <input
                      type="text"
                      name="district"
                      required
                      value={addressFormData.district}
                      onChange={(e) => setAddressFormData({ ...addressFormData, district: e.target.value })}
                      placeholder="İlçe"
                      style={{ width: "100%", padding: "0.625rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    Açık Adres (Cadde, sokak, bina, kapı no) *
                  </label>
                  <textarea
                    rows={3}
                    name="fullAddress"
                    required
                    value={addressFormData.fullAddress}
                    onChange={(e) => setAddressFormData({ ...addressFormData, fullAddress: e.target.value })}
                    placeholder="Cadde, sokak, bina, kapı no"
                    style={{ width: "100%", padding: "0.625rem", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px", resize: "vertical" }}
                  />
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={addressFormData.isDefaultDelivery}
                      onChange={(e) => setAddressFormData({ ...addressFormData, isDefaultDelivery: e.target.checked })}
                    />
                    <span>Varsayılan Teslimat Adresim Olarak Ayarla</span>
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => setAddressModalOpen(false)}
                    style={{ padding: "0.625rem 1rem", backgroundColor: "transparent", border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px", fontSize: "0.8125rem", cursor: "pointer" }}
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={addressSaving}
                    style={{ padding: "0.625rem 1.25rem", backgroundColor: "var(--hm-color-text-main)", color: "#FFF", border: "none", borderRadius: "4px", fontSize: "0.8125rem", fontWeight: 600, cursor: addressSaving ? "not-allowed" : "pointer" }}
                  >
                    {addressSaving ? "Kaydediliyor..." : "Adresi Kaydet"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SİPARİŞ DETAY MODALI */}
        {selectedOrder && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
          >
            <div
              style={{
                backgroundColor: "var(--hm-color-surface)",
                borderRadius: "var(--hm-radius-md)",
                maxWidth: "600px",
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "2rem",
                boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", borderBottom: "1px solid var(--hm-color-border-subtle)", paddingBottom: "1rem" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--hm-color-text-muted)", display: "block" }}>Sipariş Detayı</span>
                  <h3 style={{ fontFamily: "var(--hm-font-display)", fontSize: "1.25rem", fontWeight: 600 }}>
                    {selectedOrder.orderNumber}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "var(--hm-color-text-muted)" }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.8125rem", backgroundColor: "var(--hm-color-bg-base)", padding: "1rem", borderRadius: "4px" }}>
                  <div>
                    <span style={{ color: "var(--hm-color-text-muted)", display: "block" }}>Tarih:</span>
                    <span>{new Date(selectedOrder.createdAt).toLocaleString("tr-TR")}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--hm-color-text-muted)", display: "block" }}>Ödeme Yöntemi:</span>
                    <span>{selectedOrder.paymentProvider === "CASH_ON_DELIVERY" ? "Kapıda Ödeme" : "Kredi Kartı (PayTR)"}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--hm-color-text-muted)", display: "block" }}>Ödeme Durumu:</span>
                    <span>{selectedOrder.paymentStatus}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--hm-color-text-muted)", display: "block" }}>Kargo:</span>
                    <span>{selectedOrder.carrierName ? `${selectedOrder.carrierName} (${selectedOrder.trackingNumber})` : "Hazırlanıyor"}</span>
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>Teslimat Adresi</h4>
                  <p style={{ fontSize: "0.8125rem", color: "var(--hm-color-text-secondary)", margin: 0, lineHeight: 1.4 }}>
                    {selectedOrder.shippingAddress.fullAddress}, {selectedOrder.shippingAddress.district} / {selectedOrder.shippingAddress.city}
                  </p>
                </div>

                <div>
                  <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>Sipariş Edilen Ürünler</h4>
                  <div style={{ border: "1px solid var(--hm-color-border-subtle)", borderRadius: "4px", overflow: "hidden" }}>
                    {selectedOrder.items.map((it, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.75rem 1rem",
                          borderBottom: idx < selectedOrder.items.length - 1 ? "1px solid var(--hm-color-border-subtle)" : "none",
                          fontSize: "0.8125rem",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{it.productName}</div>
                          <div style={{ color: "var(--hm-color-text-muted)", fontSize: "0.75rem" }}>
                            {it.colorName} / {it.sizeName} × {it.quantity}
                          </div>
                        </div>
                        <div style={{ fontWeight: 600 }}>{formatCurrency(it.totalPrice)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.75rem", borderTop: "1px solid var(--hm-color-border-subtle)" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Genel Toplam</span>
                  <span style={{ fontWeight: 700, fontSize: "1.25rem", color: "var(--hm-color-text-main)" }}>
                    {formatCurrency(selectedOrder.totalAmount)}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                  <Link
                    href={`/siparis-takip?order=${encodeURIComponent(selectedOrder.orderNumber)}`}
                    style={{
                      display: "inline-block",
                      padding: "0.625rem 1.25rem",
                      backgroundColor: "var(--hm-color-text-main)",
                      color: "#FFF",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      textDecoration: "none",
                    }}
                  >
                    Detaylı Kargo Takibi →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}

