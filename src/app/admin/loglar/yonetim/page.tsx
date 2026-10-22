"use client";

import React, { useState, useEffect } from "react";
import { AdminAuditLogEntry } from "@/lib/server/logger";

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AdminAuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filtreler
  const [actionFilter, setActionFilter] = useState("ALL");
  const [resultFilter, setResultFilter] = useState("ALL");
  const [searchAdmin, setSearchAdmin] = useState("");
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogEntry | null>(null);

  const fetchLogs = async (currentPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "25");
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (resultFilter !== "ALL") params.set("result", resultFilter);
      if (searchAdmin.trim()) params.set("adminEmail", searchAdmin.trim());

      const res = await fetch(`/api/admin/logs/audit?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setPage(data.page || 1);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Audit logs fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, resultFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

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
            Yönetim Paneli Denetim Logları
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Yöneticilerin oturum açma, ürün, stok, kategori ve yedekleme gibi kritik tüm eylemlerini izleyin.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchLogs(page)}
          disabled={loading}
          className="hm-admin-btn hm-admin-btn-outline"
        >
          {loading ? "Yenileniyor..." : "↻ Yenile"}
        </button>
      </div>

      {/* Filtreleme Çubuğu */}
      <div
        className="hm-admin-card"
        style={{
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "0.5rem", flex: 1, minWidth: "240px" }}>
          <input
            type="text"
            placeholder="Yönetici e-posta ile ara..."
            value={searchAdmin}
            onChange={(e) => setSearchAdmin(e.target.value)}
            className="hm-admin-input"
          />
          <button type="submit" className="hm-admin-btn hm-admin-btn-primary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.8125rem" }}>
            Ara
          </button>
        </form>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="hm-admin-select"
            style={{ width: "210px" }}
          >
            <option value="ALL">Tüm Eylemler</option>
            <option value="AUTH_LOGIN_SUCCESS">Başarılı Giriş</option>
            <option value="AUTH_LOGIN_FAILED">Başarısız Giriş Denemesi</option>
            <option value="AUTH_LOGOUT">Çıkış Yapma</option>
            <option value="RATE_LIMIT_TRIGGERED">Rate Limit Olayı</option>
            <option value="PRODUCT_CREATED">Ürün Oluşturma</option>
            <option value="PRODUCT_UPDATED">Ürün Güncelleme</option>
            <option value="PRODUCT_DELETED">Ürün Silme</option>
            <option value="CATEGORY_CREATED">Kategori Ekleme</option>
            <option value="CATEGORY_UPDATED">Kategori Güncelleme</option>
            <option value="CATEGORY_DELETED">Kategori Silme</option>
            <option value="ORDER_CONFIRMED">Sipariş Onaylandı</option>
            <option value="ORDER_CANCELLED">Sipariş İptal Edildi</option>
            <option value="BACKUP_CREATED">Yedek Alındı</option>
            <option value="BACKUP_RESTORED">Yedekten Geri Yüklendi</option>
            <option value="BACKUP_RESTORE_FAILED">Geri Yükleme Hatası</option>
            <option value="UNAUTHORIZED_ACCESS_ATTEMPT">Yetkisiz Erişim</option>
          </select>

          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="hm-admin-select"
            style={{ width: "140px" }}
          >
            <option value="ALL">Tüm Sonuçlar</option>
            <option value="SUCCESS">Başarılı</option>
            <option value="FAILED">Hatalı / Başarısız</option>
          </select>
        </div>
      </div>

      {/* Log Tablosu */}
      <div className="hm-admin-card" style={{ overflow: "hidden" }}>
        <table className="hm-admin-table" style={{ fontSize: "0.8125rem" }}>
          <thead>
            <tr>
              <th>Zaman (UTC / Yerel)</th>
              <th>Yönetici</th>
              <th>Eylem Türü</th>
              <th>Hedef</th>
              <th>Kaynak IP</th>
              <th>Sonuç</th>
              <th style={{ textAlign: "right" }}>Ayrıntı</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#718096" }}>
                  Loglar yükleniyor...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#718096" }}>
                  Filtreye uygun denetim logu bulunamadı.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ color: "#718096", whiteSpace: "nowrap" }}>
                    {new Date(log.timestamp).toLocaleString("tr-TR")}
                  </td>
                  <td style={{ fontWeight: 600 }}>{log.adminEmail}</td>
                  <td>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "3px",
                        backgroundColor: "#F1F5F9",
                        color: "#334155",
                        fontFamily: "monospace",
                        fontSize: "0.6875rem",
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: "#475569" }}>
                      {log.targetType} {log.targetId ? `(${log.targetId})` : ""}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#64748B" }}>
                    {log.ipAddress || "-"}
                  </td>
                  <td>
                    <span
                      className={`hm-admin-badge ${
                        log.result === "SUCCESS" ? "hm-admin-badge-success" : "hm-admin-badge-danger"
                      }`}
                      style={{ fontSize: "0.6875rem" }}
                    >
                      {log.result === "SUCCESS" ? "BAŞARILI" : "BAŞARISIZ"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="hm-admin-btn hm-admin-btn-outline"
                      style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                    >
                      Detay
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Sayfalama */}
        {totalPages > 1 && (
          <div
            style={{
              padding: "0.75rem 1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid var(--hm-admin-border)",
              fontSize: "0.8125rem",
            }}
          >
            <div style={{ color: "#718096" }}>
              Toplam {total} kayıt — Sayfa {page} / {totalPages}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => fetchLogs(page - 1)}
                className="hm-admin-btn hm-admin-btn-outline"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
              >
                ← Önceki
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => fetchLogs(page + 1)}
                className="hm-admin-btn hm-admin-btn-outline"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
              >
                Sonraki →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log Detay Modalı */}
      {selectedLog && (
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
              maxWidth: "600px",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--hm-admin-border)",
                paddingBottom: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
                Denetim Kaydı Detayı
              </h3>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.8125rem" }}>
              <div>
                <strong>Kayıt ID:</strong> <code>{selectedLog.id}</code>
              </div>
              <div>
                <strong>Tarih / Saat (UTC):</strong> {selectedLog.timestamp}
              </div>
              <div>
                <strong>Yönetici:</strong> {selectedLog.adminEmail} ({selectedLog.adminId})
              </div>
              <div>
                <strong>Eylem:</strong> <code>{selectedLog.action}</code>
              </div>
              <div>
                <strong>Hedef:</strong> {selectedLog.targetType} {selectedLog.targetId || ""}
              </div>
              <div>
                <strong>Sonuç:</strong> {selectedLog.result}
              </div>
              <div>
                <strong>Kaynak IP:</strong> {selectedLog.ipAddress || "-"}
              </div>
              {selectedLog.userAgent && (
                <div>
                  <strong>User Agent:</strong> {selectedLog.userAgent}
                </div>
              )}

              <div>
                <strong style={{ display: "block", marginBottom: "0.35rem" }}>
                  Ayrıntılı Değişiklik / Parametreler (Maskelenmiş):
                </strong>
                <pre
                  style={{
                    backgroundColor: "#F8FAFC",
                    border: "1px solid #E2E8F0",
                    borderRadius: "4px",
                    padding: "0.75rem",
                    fontSize: "0.75rem",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(selectedLog.details || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.25rem" }}>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="hm-admin-btn hm-admin-btn-primary"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
