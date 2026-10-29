"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface OrderItem {
  id: string;
  productName: string;
  colorName: string;
  sizeName: string;
  quantity: number;
  sku?: string;
}

interface CargoOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  updatedAt?: string;
  customerFullName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: {
    city: string;
    district: string;
    fullAddress: string;
  };
  customerNotes?: string;
  operationalStatus: string;
  paymentStatus: string;
  shippingStatus: "AWAITING_SHIPMENT" | "SHIPPED" | "IN_TRANSIT" | "DELIVERED" | string;
  carrier?: string;
  carrierName?: string;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  items: OrderItem[];
}

export default function CargoDashboardPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<CargoOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("kargo@kargo.com");
  const [filterTab, setFilterTab] = useState<"ALL" | "AWAITING" | "SHIPPED" | "DELIVERED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Doğrudan Kargo Giriş Formu Durumları (Eğer oturum yoksa)
  const [isLoggedOut, setIsLoggedOut] = useState(false);
  const [loginEmail, setLoginEmail] = useState("kargo@kargo.com");
  const [loginPass, setLoginPass] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kargo/orders");
      if (res.status === 401 || res.status === 403) {
        setIsLoggedOut(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Siparişler yüklenemedi.");
      }
      setOrders(data.orders || []);
      if (data.user?.email) {
        setUserEmail(data.user.email);
      }
      setIsLoggedOut(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleQuickLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Giriş yapılamadı. Bilgilerinizi kontrol ediniz.");
        return;
      }

      setIsLoggedOut(false);
      await fetchOrders();
    } catch {
      setLoginError("Bağlantı hatası. Lütfen tekrar deneyiniz.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, action: "SHIP" | "DELIVER") => {
    setUpdatingId(orderId);
    setSuccessMsg(null);
    setError(null);

    try {
      const res = await fetch(`/api/kargo/orders/${encodeURIComponent(orderId)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Durum güncellenemedi.");
      }

      setSuccessMsg(data.message || "Sipariş durumu güncellendi.");
      setTimeout(() => setSuccessMsg(null), 4000);

      // Listeyi yerel olarak ve sunucudan tazele
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id === orderId || o.orderNumber === orderId) {
            return {
              ...o,
              shippingStatus: action === "SHIP" ? "SHIPPED" : "DELIVERED",
              shippedAt: action === "SHIP" ? new Date().toISOString() : o.shippedAt,
              deliveredAt: action === "DELIVER" ? new Date().toISOString() : o.deliveredAt,
              trackingNumber: data.order?.trackingNumber || o.trackingNumber,
            };
          }
          return o;
        })
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "İşlem sırasında hata oluştu.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // devam et
    }
    setIsLoggedOut(true);
    router.push("/admin/login");
  };

  // Filtreleme
  const filteredOrders = orders.filter((o) => {
    // Sekme Filtresi
    if (filterTab === "AWAITING") {
      if (o.shippingStatus === "SHIPPED" || o.shippingStatus === "DELIVERED" || o.shippingStatus === "IN_TRANSIT") {
        return false;
      }
    } else if (filterTab === "SHIPPED") {
      if (o.shippingStatus !== "SHIPPED" && o.shippingStatus !== "IN_TRANSIT") {
        return false;
      }
    } else if (filterTab === "DELIVERED") {
      if (o.shippingStatus !== "DELIVERED") {
        return false;
      }
    }

    // Arama Filtresi
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchOrder = o.orderNumber?.toLowerCase().includes(q);
      const matchName = o.customerFullName?.toLowerCase().includes(q);
      const matchPhone = o.customerPhone?.includes(q);
      const matchCity = o.shippingAddress?.city?.toLowerCase().includes(q);
      const matchDistrict = o.shippingAddress?.district?.toLowerCase().includes(q);
      return matchOrder || matchName || matchPhone || matchCity || matchDistrict;
    }

    return true;
  });

  // Oturum Açma Ekranı (Eğer kargo personeli henüz giriş yapmadıysa)
  if (isLoggedOut) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", fontFamily: "sans-serif" }}>
        <div style={{ width: "100%", maxWidth: "420px", backgroundColor: "#FFFFFF", borderRadius: "12px", padding: "2.5rem 2rem", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }}>🚚</span>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#0F172A", margin: 0 }}>
              Hümra Moda Kargo Paneli
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "#64748B", marginTop: "0.5rem" }}>
              Kargo dağıtım görevlisi girişi
            </p>
          </div>

          {loginError && (
            <div style={{ backgroundColor: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", padding: "0.75rem", borderRadius: "6px", fontSize: "0.8125rem", marginBottom: "1.25rem" }}>
              ⚠️ {loginError}
            </div>
          )}

          <form onSubmit={handleQuickLogin}>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#334155", marginBottom: "0.35rem" }}>
                E-Posta Adresi
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                style={{ width: "100%", padding: "0.75rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.9375rem", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#334155", marginBottom: "0.35rem" }}>
                Şifre
              </label>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="kargoadmin123!"
                required
                style={{ width: "100%", padding: "0.75rem", border: "1px solid #CBD5E1", borderRadius: "6px", fontSize: "0.9375rem", boxSizing: "border-box" }}
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              style={{ width: "100%", padding: "0.875rem", backgroundColor: "#0284C7", color: "#FFFFFF", border: "none", borderRadius: "8px", fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer" }}
            >
              {loginLoading ? "Giriş Yapılıyor..." : "Kargo Paneline Giriş Yap →"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
            <Link href="/admin/login" style={{ fontSize: "0.8125rem", color: "#64748B", textDecoration: "none" }}>
              ← Ana Yönetici Girişine Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", fontFamily: "sans-serif", color: "#0F172A" }}>
      {/* Üst Bar / Header */}
      <header style={{ backgroundColor: "#0F172A", color: "#FFFFFF", padding: "1rem 1.5rem", borderBottom: "1px solid #1E293B", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.5rem" }}>🚚</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1.125rem", letterSpacing: "0.02em" }}>
                HÜMRA MODA <span style={{ color: "#38BDF8", fontWeight: 400 }}>| Kargo Dağıtım</span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
                Yetkili: <strong style={{ color: "#E2E8F0" }}>{userEmail}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button
              onClick={fetchOrders}
              disabled={loading}
              style={{ padding: "0.45rem 0.85rem", backgroundColor: "#1E293B", border: "1px solid #334155", borderRadius: "6px", color: "#E2E8F0", fontSize: "0.8125rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem" }}
            >
              🔄 Yenile
            </button>

            <button
              onClick={handleLogout}
              style={{ padding: "0.45rem 0.85rem", backgroundColor: "#EF4444", border: "none", borderRadius: "6px", color: "#FFFFFF", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </header>

      {/* Ana İçerik */}
      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem 1rem 4rem 1rem" }}>
        {/* Bildirim Mesajı */}
        {successMsg && (
          <div style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534", padding: "0.875rem 1.25rem", borderRadius: "8px", fontSize: "0.875rem", fontWeight: 600, marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>✅</span> {successMsg}
          </div>
        )}

        {/* Hata Mesajı */}
        {error && (
          <div style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", padding: "0.875rem 1.25rem", borderRadius: "8px", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
            ⚠️ {error}
          </div>
        )}

        {/* İstatistik & Filtre Sekmeleri */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
          <button
            onClick={() => setFilterTab("ALL")}
            style={{
              padding: "1rem",
              backgroundColor: filterTab === "ALL" ? "#0284C7" : "#FFFFFF",
              color: filterTab === "ALL" ? "#FFFFFF" : "#0F172A",
              border: "1px solid #E2E8F0",
              borderRadius: "10px",
              textAlign: "left",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", opacity: 0.8 }}>Tüm Siparişler</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>{orders.length}</div>
          </button>

          <button
            onClick={() => setFilterTab("AWAITING")}
            style={{
              padding: "1rem",
              backgroundColor: filterTab === "AWAITING" ? "#F59E0B" : "#FFFFFF",
              color: filterTab === "AWAITING" ? "#FFFFFF" : "#0F172A",
              border: "1px solid #E2E8F0",
              borderRadius: "10px",
              textAlign: "left",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", opacity: 0.8 }}>⏳ Kargolanacaklar (Bekleyen)</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
              {orders.filter((o) => o.shippingStatus !== "SHIPPED" && o.shippingStatus !== "DELIVERED" && o.shippingStatus !== "IN_TRANSIT").length}
            </div>
          </button>

          <button
            onClick={() => setFilterTab("SHIPPED")}
            style={{
              padding: "1rem",
              backgroundColor: filterTab === "SHIPPED" ? "#3B82F6" : "#FFFFFF",
              color: filterTab === "SHIPPED" ? "#FFFFFF" : "#0F172A",
              border: "1px solid #E2E8F0",
              borderRadius: "10px",
              textAlign: "left",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", opacity: 0.8 }}>🚚 Kargoya Verildi (Yolda)</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
              {orders.filter((o) => o.shippingStatus === "SHIPPED" || o.shippingStatus === "IN_TRANSIT").length}
            </div>
          </button>

          <button
            onClick={() => setFilterTab("DELIVERED")}
            style={{
              padding: "1rem",
              backgroundColor: filterTab === "DELIVERED" ? "#10B981" : "#FFFFFF",
              color: filterTab === "DELIVERED" ? "#FFFFFF" : "#0F172A",
              border: "1px solid #E2E8F0",
              borderRadius: "10px",
              textAlign: "left",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", opacity: 0.8 }}>✅ Teslim Edildi</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
              {orders.filter((o) => o.shippingStatus === "DELIVERED").length}
            </div>
          </button>
        </div>

        {/* Arama Barı */}
        <div style={{ backgroundColor: "#FFFFFF", padding: "1rem", borderRadius: "10px", border: "1px solid #E2E8F0", marginBottom: "1.5rem" }}>
          <input
            type="text"
            placeholder="🔍 Sipariş no, müşteri adı, telefon veya il/ilçe ile ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", padding: "0.75rem 1rem", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "0.9375rem", boxSizing: "border-box" }}
          />
        </div>

        {/* Sipariş Listesi */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "#64748B" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⏳</div>
            <div>Siparişler yükleniyor...</div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ backgroundColor: "#FFFFFF", padding: "3rem", borderRadius: "10px", textAlign: "center", border: "1px solid #E2E8F0", color: "#64748B" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📦</div>
            <div style={{ fontWeight: 600, fontSize: "1rem", color: "#334155" }}>Bu kritere uygun sipariş bulunamadı</div>
            <div style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }}>Filtreleri veya arama teriminizi değiştirip tekrar deneyebilirsiniz.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {filteredOrders.map((order) => {
              const isShipped = order.shippingStatus === "SHIPPED" || order.shippingStatus === "IN_TRANSIT";
              const isDelivered = order.shippingStatus === "DELIVERED";
              const isAwaiting = !isShipped && !isDelivered;
              const isUpdating = updatingId === order.id;

              const cleanPhone = (order.customerPhone || "").replace(/[^0-9]/g, "");
              const waPhone = cleanPhone.startsWith("0") ? `9${cleanPhone}` : cleanPhone.startsWith("90") ? cleanPhone : `90${cleanPhone}`;

              return (
                <div
                  key={order.id}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "10px",
                    border: isDelivered ? "1px solid #A7F3D0" : isShipped ? "1px solid #BAE6FD" : "1px solid #FDE68A",
                    padding: "1.25rem",
                    boxShadow: "0 2px 5px rgba(0,0,0,0.03)",
                  }}
                >
                  {/* Kart Başlığı */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", borderBottom: "1px solid #F1F5F9", paddingBottom: "0.875rem", marginBottom: "1rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.125rem", color: "#0F172A" }}>
                          {order.orderNumber}
                        </span>
                        {/* Durum Rozeti */}
                        {isDelivered ? (
                          <span style={{ backgroundColor: "#D1FAE5", color: "#065F46", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700 }}>
                            ✅ Teslim Edildi
                          </span>
                        ) : isShipped ? (
                          <span style={{ backgroundColor: "#DBEAFE", color: "#1E40AF", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700 }}>
                            🚚 Kargoya Verildi (Yolda)
                          </span>
                        ) : (
                          <span style={{ backgroundColor: "#FEF3C7", color: "#92400E", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700 }}>
                            ⏳ Kargolanacak (Bekliyor)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748B", marginTop: "0.25rem" }}>
                        Sipariş Tarihi: {new Date(order.createdAt).toLocaleString("tr-TR")}
                        {order.trackingNumber && ` • Takip No: ${order.trackingNumber}`}
                      </div>
                    </div>

                    {/* Hızlı Eylem Butonları */}
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {!isShipped && !isDelivered && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, "SHIP")}
                          disabled={isUpdating}
                          style={{
                            backgroundColor: "#0284C7",
                            color: "#FFFFFF",
                            border: "none",
                            padding: "0.6rem 1rem",
                            borderRadius: "6px",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {isUpdating ? "Güncelleniyor..." : "🚚 Kargoya Verildi"}
                        </button>
                      )}

                      {!isDelivered && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, "DELIVER")}
                          disabled={isUpdating}
                          style={{
                            backgroundColor: "#10B981",
                            color: "#FFFFFF",
                            border: "none",
                            padding: "0.6rem 1rem",
                            borderRadius: "6px",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {isUpdating ? "Güncelleniyor..." : "✅ Teslim Edildi"}
                        </button>
                      )}

                      {isDelivered && (
                        <span style={{ fontSize: "0.8125rem", color: "#059669", fontWeight: 600, padding: "0.5rem" }}>
                          ✓ Teslimat Tamamlandı ({order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString("tr-TR") : "Bugün"})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Detay Bilgileri: Müşteri & Adres & Paket */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                    {/* Alıcı ve İletişim */}
                    <div style={{ backgroundColor: "#F8FAFC", padding: "0.875rem", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748B", fontWeight: 700, marginBottom: "0.35rem" }}>
                        Alıcı Bilgileri
                      </div>
                      <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#0F172A" }}>
                        {order.customerFullName}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "#334155", marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span>📞 {order.customerPhone}</span>
                        {waPhone && (
                          <a
                            href={`https://wa.me/${waPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "0.75rem", color: "#16A34A", textDecoration: "none", fontWeight: 600 }}
                          >
                            [WhatsApp ↗]
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748B", marginTop: "0.2rem" }}>
                        ✉️ {order.customerEmail}
                      </div>
                    </div>

                    {/* Teslimat Adresi */}
                    <div style={{ backgroundColor: "#F8FAFC", padding: "0.875rem", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748B", fontWeight: 700, marginBottom: "0.35rem" }}>
                        Teslimat Adresi
                      </div>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "#0F172A" }}>
                        {order.shippingAddress?.district || "-"} / {order.shippingAddress?.city || "-"}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "#334155", marginTop: "0.25rem", lineHeight: 1.4 }}>
                        {order.shippingAddress?.fullAddress}
                      </div>
                      {order.customerNotes && (
                        <div style={{ fontSize: "0.75rem", color: "#B45309", marginTop: "0.35rem", backgroundColor: "#FEF3C7", padding: "0.25rem 0.5rem", borderRadius: "4px" }}>
                          📝 Not: {order.customerNotes}
                        </div>
                      )}
                    </div>

                    {/* Paket / Ürün İçeriği */}
                    <div style={{ backgroundColor: "#F8FAFC", padding: "0.875rem", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748B", fontWeight: 700, marginBottom: "0.35rem" }}>
                        Paket İçeriği ({order.items?.length || 0} Kalem)
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                        {order.items?.map((it, idx) => (
                          <div key={it.id || idx} style={{ fontSize: "0.8125rem", color: "#1E293B" }}>
                            • <strong>{it.productName}</strong>
                            <span style={{ color: "#64748B", marginLeft: "0.35rem", fontSize: "0.75rem" }}>
                              ({it.colorName || "-"} / {it.sizeName || "-"}) × {it.quantity} Adet
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

