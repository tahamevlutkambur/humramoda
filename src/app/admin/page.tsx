import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStoreData } from "@/lib/server/store";
import { formatCurrency } from "@/lib/formatters";
import { getAuthenticatedAdmin } from "@/lib/server/session-guard";
import { getPersistentStoreData } from "@/lib/server/persistent-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminDashboardPage() {
  const session = await getAuthenticatedAdmin();
  if (!session) {
    redirect("/admin/login?from=/admin");
  }

  await getPersistentStoreData().catch(() => {});
  const store = getStoreData();
  const visitors = (store.siteActivityLogs || []).filter((entry: any) => entry.eventType === "PAGE_VIEW");
  const visitorKey = (entry: any) => entry.sessionId ? `session:${entry.sessionId}` : `ip:${entry.ipAddress || "unknown"}`;
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayVisitors = new Set(visitors.filter((entry: any) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(entry.timestamp)) === todayKey).map(visitorKey)).size;
  const totalVisitors = new Set(visitors.map(visitorKey)).size;
  const products = store.products;
  const categories = store.categories;
  const collections = store.collections;

  // Kritik stoklu (stok <= 3 olan) varyantları tespit et
  const lowStockVariants: Array<{
    productId: string;
    productTitle: string;
    productSlug: string;
    colorName: string;
    sizeName: string;
    sku: string;
    stockQuantity: number;
  }> = [];

  products.forEach((p) => {
    p.variants.forEach((v) => {
      if (v.stockQuantity <= 3) {
        const color = p.colors.find((c) => c.id === v.colorId);
        const size = p.sizes.find((s) => s.id === v.sizeId);
        lowStockVariants.push({
          productId: p.id,
          productTitle: p.title,
          productSlug: p.slug,
          colorName: color?.name || "Belirtilmemiş",
          sizeName: size?.name || "Belirtilmemiş",
          sku: v.sku,
          stockQuantity: v.stockQuantity,
        });
      }
    });
  });

  const totalVariants = products.reduce((acc, p) => acc + p.variants.length, 0);
  const outOfStockCount = lowStockVariants.filter((v) => v.stockQuantity === 0).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Üst Karşılama ve Hızlı Eylem */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1A202C" }}>
            Mağaza Genel Bakış
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "#718096", marginTop: "2px" }}>
            Hümra Moda vitrin ve envanter durumunun gerçek zamanlı özeti.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/admin/urunler/yeni" className="hm-admin-btn hm-admin-btn-primary">
            <span>+ Yeni Ürün Ekle</span>
          </Link>
          <Link href="/admin/vitrin" className="hm-admin-btn hm-admin-btn-outline">
            <span>Vitrin İçeriği</span>
          </Link>
        </div>
      </div>

      {/* KPI Kartları Izgarası */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Toplam Ürün */}
        <div className="hm-admin-card" style={{ padding: "1.25rem" }}>
          <span className="hm-admin-label">Katalogdaki Ürünler</span>
          <div style={{ fontSize: "1.875rem", fontWeight: 700, color: "#1A202C", marginTop: "0.25rem" }}>
            {products.length}
          </div>
          <span style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.5rem", display: "block" }}>
            {totalVariants} aktif stok varyantı
          </span>
        </div>

        {/* Kategoriler */}
        <div className="hm-admin-card" style={{ padding: "1.25rem" }}>
          <span className="hm-admin-label">Kategoriler</span>
          <div style={{ fontSize: "1.875rem", fontWeight: 700, color: "#1A202C", marginTop: "0.25rem" }}>
            {categories.length}
          </div>
          <span style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.5rem", display: "block" }}>
            Tüm vitrinde aktif
          </span>
        </div>

        {/* Koleksiyonlar */}
        <div className="hm-admin-card" style={{ padding: "1.25rem" }}>
          <span className="hm-admin-label">Koleksiyonlar</span>
          <div style={{ fontSize: "1.875rem", fontWeight: 700, color: "#1A202C", marginTop: "0.25rem" }}>
            {collections.length}
          </div>
          <span style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.5rem", display: "block" }}>
            Yeni Sezon, Çok Satanlar
          </span>
        </div>

        {/* Kritik Stok & Tükenenler */}
        <div className="hm-admin-card" style={{ padding: "1.25rem" }}>
          <span className="hm-admin-label">Tükenen Varyantlar</span>
          <div
            style={{
              fontSize: "1.875rem",
              fontWeight: 700,
              color: outOfStockCount > 0 ? "#E53E3E" : "#2E7D32",
              marginTop: "0.25rem",
            }}
          >
            {outOfStockCount}
          </div>
          <span style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.5rem", display: "block" }}>
            {lowStockVariants.length} varyantta kritik stok (≤3)
          </span>
        </div>

        <div className="hm-admin-card" style={{ padding: "1.25rem" }}>
          <span className="hm-admin-label">Bugünkü Ziyaretçi</span>
          <div style={{ fontSize: "1.875rem", fontWeight: 700, color: "#1A202C", marginTop: "0.25rem" }}>{todayVisitors}</div>
          <span style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.5rem", display: "block" }}>Tekil oturum veya IP</span>
        </div>
        <div className="hm-admin-card" style={{ padding: "1.25rem" }}>
          <span className="hm-admin-label">Toplam Ziyaretçi</span>
          <div style={{ fontSize: "1.875rem", fontWeight: 700, color: "#1A202C", marginTop: "0.25rem" }}>{totalVisitors}</div>
          <span style={{ fontSize: "0.75rem", color: "#718096", marginTop: "0.5rem", display: "block" }}>Tekil oturum veya IP</span>
        </div>

        {/* Ücretsiz Kargo Baremi */}
        <div className="hm-admin-card" style={{ padding: "1.25rem" }}>
          <span className="hm-admin-label">Ücretsiz Kargo Baremi</span>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1A202C", marginTop: "0.25rem" }}>
            {formatCurrency(store.settings.freeShippingThreshold)}
          </div>
          <Link
            href="/admin/ayarlar"
            style={{ fontSize: "0.75rem", color: "#8B2635", textDecoration: "underline", marginTop: "0.5rem", display: "block" }}
          >
            Ayarlardan Düzenle →
          </Link>
        </div>
      </div>

      {/* Kritik Stok Uyarı Tablosu */}
      <div className="hm-admin-card">
        <div
          style={{
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--hm-admin-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1A202C" }}>
              Kritik ve Tükenen Stok Uyarıları
            </span>
            <span className="hm-admin-badge hm-admin-badge-warning">
              {lowStockVariants.length} Kalem
            </span>
          </div>

          <Link
            href="/admin/urunler"
            style={{ fontSize: "0.75rem", color: "#718096", textDecoration: "none" }}
          >
            Tüm Ürünleri Gör →
          </Link>
        </div>

        {lowStockVariants.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#718096", fontSize: "0.8125rem" }}>
            Harika! Tüm ürün varyantlarının stok seviyesi yeterli düzeyde.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="hm-admin-table">
              <thead>
                <tr>
                  <th>Ürün Adı</th>
                  <th>Renk</th>
                  <th>Beden</th>
                  <th>SKU</th>
                  <th>Mevcut Stok</th>
                  <th>Durum</th>
                  <th style={{ textAlign: "right" }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {lowStockVariants.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600, color: "#1A202C" }}>{item.productTitle}</td>
                    <td>{item.colorName}</td>
                    <td>{item.sizeName}</td>
                    <td>
                      <code style={{ fontSize: "0.75rem", backgroundColor: "#EDF2F7", padding: "0.15rem 0.4rem", borderRadius: "3px" }}>
                        {item.sku}
                      </code>
                    </td>
                    <td>
                      <span className="tabular-nums" style={{ fontWeight: 700 }}>
                        {item.stockQuantity} Adet
                      </span>
                    </td>
                    <td>
                      {item.stockQuantity === 0 ? (
                        <span className="hm-admin-badge hm-admin-badge-danger">Tükendi</span>
                      ) : (
                        <span className="hm-admin-badge hm-admin-badge-warning">Kritik Stok</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/admin/urunler/${encodeURIComponent(item.productId)}`}
                        className="hm-admin-btn hm-admin-btn-outline"
                        style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                      >
                        Stok Güncelle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sipariş & Ödeme Bilgilendirme Kartı */}
      <div
        className="hm-admin-card"
        style={{
          padding: "1.25rem",
          backgroundColor: "#F7FAFC",
          borderLeft: "4px solid #8B2635",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
          <div style={{ color: "#8B2635", marginTop: "2px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <h4 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1A202C" }}>
              Faz 4 Durumu: Envanter, İçerik &amp; Katalog Yönetimi Aktif
            </h4>
            <p style={{ fontSize: "0.8125rem", color: "#4A5568", marginTop: "4px", lineHeight: 1.5 }}>
              Yönetici paneliniz ürün ekleme, fiyat değiştirme, renge özel galeri yönetimi ve vitrin içeriklerini güncellemeye tam hazırdır. Gerçek PayTR ödeme altyapısı ve canlı müşteri sipariş akışı Faz 5 kapsamında entegre edilecektir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
