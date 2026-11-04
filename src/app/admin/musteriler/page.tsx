import React from "react";
import { getStoreData } from "@/lib/server/store";

export const metadata = {
  title: "Müşteri ve Kullanıcı Yönetimi | Hümra Moda Yönetim Paneli",
};

export default function AdminCustomersPage() {
  const store = getStoreData();
  const adminUsers = store.adminUsers || [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
            Müşteri ve Yönetici Hesapları
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Yetkili mağaza personellerini ve kayıtlı müşteri hesaplarını görüntüleyin.
          </p>
        </div>
      </div>

      {/* Yönetici ve Personel Listesi */}
      <div className="hm-admin-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 1rem 0" }}>
          Yetkili Panel Yöneticileri ({adminUsers.length})
        </h2>

        <table className="hm-admin-table">
          <thead>
            <tr>
              <th>Ad Soyad</th>
              <th>E-Posta Adresi</th>
              <th>Yetki Rolü</th>
              <th>Durum</th>
              <th>Kayıt Tarihi</th>
            </tr>
          </thead>
          <tbody>
            {adminUsers.map((user) => (
              <tr key={user.id}>
                <td style={{ fontWeight: 600 }}>{user.fullName}</td>
                <td>{user.email}</td>
                <td>
                  <span
                    className={`hm-admin-badge ${
                      user.role === "ADMIN" ? "hm-admin-badge-warning" : "hm-admin-badge-neutral"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td>
                  {user.isActive ? (
                    <span className="hm-admin-badge hm-admin-badge-success">Aktif</span>
                  ) : (
                    <span className="hm-admin-badge hm-admin-badge-danger">Pasif</span>
                  )}
                </td>
                <td style={{ color: "var(--hm-admin-text-muted)", fontSize: "0.75rem" }}>
                  {new Date(user.createdAt).toLocaleDateString("tr-TR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Müşteri Hesapları Durumu */}
      <div className="hm-admin-card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Kayıtlı Vitrin Müşterileri ({store.customers?.length || 0})
          </h2>
          <span className="hm-admin-badge hm-admin-badge-neutral">
            {store.customers?.length || 0} Kayıtlı Müşteri
          </span>
        </div>

        {store.customers && store.customers.length > 0 ? (
          <table className="hm-admin-table">
            <thead>
              <tr>
                <th>Müşteri Ad Soyad</th>
                <th>E-Posta Adresi</th>
                <th>Telefon</th>
                <th>Kayıtlı Adresler</th>
                <th>Durum</th>
                <th>Kayıt Tarihi</th>
              </tr>
            </thead>
            <tbody>
              {store.customers.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.fullName}</td>
                  <td>{c.email}</td>
                  <td>{c.phone || "—"}</td>
                  <td>
                    <span className="hm-admin-badge hm-admin-badge-neutral">
                      {(c.addresses || []).length} Adres
                    </span>
                  </td>
                  <td>
                    {c.isActive ? (
                      <span className="hm-admin-badge hm-admin-badge-success">Aktif</span>
                    ) : (
                      <span className="hm-admin-badge hm-admin-badge-danger">Pasif</span>
                    )}
                  </td>
                  <td style={{ color: "var(--hm-admin-text-muted)", fontSize: "0.75rem" }}>
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString("tr-TR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <p
              style={{
                maxWidth: "520px",
                margin: "0 auto",
                color: "var(--hm-admin-text-muted)",
                fontSize: "0.875rem",
                lineHeight: 1.6,
              }}
            >
              Henüz sistemde kayıtlı vitrin müşterisi bulunmamaktadır. Yeni müşteriler `/kayit` sayfası üzerinden üye olduklarında burada listelenir.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
