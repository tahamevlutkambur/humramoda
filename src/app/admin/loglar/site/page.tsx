"use client";

import React, { useState, useEffect } from "react";
import { SiteActivityLogEntry } from "@/lib/server/logger";

export default function SiteActivityLogsPage() {
  const [logs, setLogs] = useState<SiteActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filtreler
  const [eventTypeFilter, setEventTypeFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState<SiteActivityLogEntry | null>(null);

  const fetchLogs = async (currentPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "25");
      if (eventTypeFilter !== "ALL") params.set("eventType", eventTypeFilter);
      if (searchQuery.trim()) params.set("searchQuery", searchQuery.trim());
      if (ipFilter.trim()) params.set("ipAddress", ipFilter.trim());

      const res = await fetch(`/api/admin/logs/site?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setPage(data.page || 1);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Site activity logs fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTypeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case "PAGE_VIEW":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#f3f4f6", color: "#374151" }}>Sayfa Görüntüleme</span>;
      case "SEARCH_QUERY":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}>Arama Sorgusu</span>;
      case "CATEGORY_FILTER":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>Kategori Filtresi</span>;
      case "PRODUCT_VIEW":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#e0f2fe", color: "#0369a1" }}>Ürün İnceleme</span>;
      case "COLOR_SELECT":
      case "SIZE_SELECT":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#ede9fe", color: "#5b21b6" }}>Varyant Seçimi</span>;
      case "ADD_TO_CART":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#dcfce7", color: "#166534" }}>Sepete Ekleme</span>;
      case "CART_ERROR":
      case "AUTH_FAILED":
      case "API_ERROR":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>Hata / Başarısız</span>;
      case "RATE_LIMIT_EVENT":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#ffedd5", color: "#9a3412" }}>Rate Limit</span>;
      default:
        return <span className="hm-admin-badge">{type}</span>;
    }
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
            Müşteri Vitrini &amp; Site Logları
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Ziyaretçilerin sayfa ziyaretleri, arama sorguları, kategori filtreleri, ürün incelemeleri ve sepet etkileşimleri.
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
            placeholder="Arama sorgusu veya sayfa yolu ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="hm-admin-input"
          />
          <button type="submit" className="hm-admin-btn hm-admin-btn-primary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.8125rem" }}>
            Ara
          </button>
        </form>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="hm-admin-select"
            style={{ width: "210px" }}
          >
            <option value="ALL">Tüm Olay Türleri</option>
            <option value="PAGE_VIEW">Sayfa Görüntüleme</option>
            <option value="SEARCH_QUERY">Arama Sorgusu</option>
            <option value="CATEGORY_FILTER">Kategori Filtresi</option>
            <option value="PRODUCT_VIEW">Ürün İnceleme</option>
            <option value="COLOR_SELECT">Renk Seçimi</option>
            <option value="SIZE_SELECT">Beden Seçimi</option>
            <option value="ADD_TO_CART">Sepete Ekleme</option>
            <option value="CART_ERROR">Sepet Hatası</option>
            <option value="AUTH_FAILED">Giriş / Doğrulama Hatası</option>
            <option value="RATE_LIMIT_EVENT">Rate Limit Olayı</option>
            <option value="API_ERROR">API Hatası</option>
          </select>

          <input
            type="text"
            placeholder="IP Filtresi..."
            value={ipFilter}
            onChange={(e) => setIpFilter(e.target.value)}
            onBlur={() => fetchLogs(1)}
            className="hm-admin-input"
            style={{ width: "140px" }}
          />
        </div>
      </div>

      {/* Log Tablosu */}
      <div className="hm-admin-card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="hm-admin-table">
            <thead>
              <tr>
                <th style={{ width: "170px" }}>Tarih / Saat</th>
                <th style={{ width: "180px" }}>Olay Türü</th>
                <th>Sayfa Yolu</th>
                <th>Arama / Sorgu Detayı</th>
                <th style={{ width: "120px" }}>IP Adresi</th>
                <th style={{ width: "80px", textAlign: "right" }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "2.5rem" }}>
                    Loglar yükleniyor...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "var(--hm-admin-text-muted)" }}>
                    Kayıtlı site aktivite logu bulunamadı.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                      {new Date(log.timestamp).toLocaleString("tr-TR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td>{getEventBadge(log.eventType)}</td>
                    <td style={{ fontSize: "0.875rem", fontFamily: "monospace", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.path}
                    </td>
                    <td style={{ fontSize: "0.875rem", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.query ? (
                        <span style={{ fontWeight: 600, color: "var(--hm-color-primary, #9333ea)" }}>
                          &ldquo;{log.query}&rdquo;
                        </span>
                      ) : (
                        <span style={{ color: "var(--hm-admin-text-muted)", fontSize: "0.8125rem" }}>-</span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.8125rem", fontFamily: "monospace" }}>
                      {log.ipAddress || "127.0.0.1"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="hm-admin-btn hm-admin-btn-outline"
                        style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                      >
                        Detay
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Sayfalama */}
        <div
          style={{
            padding: "1rem 1.25rem",
            borderTop: "1px solid var(--hm-admin-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div style={{ fontSize: "0.8125rem", color: "var(--hm-admin-text-muted)" }}>
            Toplam <strong>{total}</strong> kayıt | Sayfa <strong>{page}</strong> / <strong>{totalPages}</strong>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => fetchLogs(page - 1)}
              disabled={page <= 1 || loading}
              className="hm-admin-btn hm-admin-btn-outline"
              style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
            >
              ← Önceki
            </button>
            <button
              type="button"
              onClick={() => fetchLogs(page + 1)}
              disabled={page >= totalPages || loading}
              className="hm-admin-btn hm-admin-btn-outline"
              style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
            >
              Sonraki →
            </button>
          </div>
        </div>
      </div>

      {/* Detay Modalı */}
      {selectedLog && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="hm-admin-card"
            style={{
              width: "100%",
              maxWidth: "600px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "1.5rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
                Site Aktivite Kaydı Detayı
              </h3>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.25rem",
                  cursor: "pointer",
                  color: "var(--hm-admin-text-muted)",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem", fontSize: "0.875rem" }}>
              <div>
                <span style={{ color: "var(--hm-admin-text-muted)", display: "block", fontSize: "0.75rem" }}>Kayıt ID</span>
                <span style={{ fontFamily: "monospace" }}>{selectedLog.id}</span>
              </div>
              <div>
                <span style={{ color: "var(--hm-admin-text-muted)", display: "block", fontSize: "0.75rem" }}>Tarih (UTC)</span>
                <span>{selectedLog.timestamp}</span>
              </div>
              <div>
                <span style={{ color: "var(--hm-admin-text-muted)", display: "block", fontSize: "0.75rem" }}>Olay Türü</span>
                <span>{getEventBadge(selectedLog.eventType)}</span>
              </div>
              <div>
                <span style={{ color: "var(--hm-admin-text-muted)", display: "block", fontSize: "0.75rem" }}>IP Adresi</span>
                <span style={{ fontFamily: "monospace" }}>{selectedLog.ipAddress || "Bilinmiyor"}</span>
              </div>
              <div>
                <span style={{ color: "var(--hm-admin-text-muted)", display: "block", fontSize: "0.75rem" }}>Oturum (Session) ID</span>
                <span style={{ fontFamily: "monospace" }}>{selectedLog.sessionId || "Anonim"}</span>
              </div>
              <div>
                <span style={{ color: "var(--hm-admin-text-muted)", display: "block", fontSize: "0.75rem" }}>Kullanıcı ID</span>
                <span>{selectedLog.userId || "Giriş yapılmamış"}</span>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <span style={{ color: "var(--hm-admin-text-muted)", display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Sayfa Yolu</span>
              <div style={{ padding: "0.5rem", background: "var(--hm-admin-bg)", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.8125rem" }}>
                {selectedLog.path}
              </div>
            </div>

            {selectedLog.query && (
              <div style={{ marginBottom: "1rem" }}>
                <span style={{ color: "var(--hm-admin-text-muted)", display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Arama Sorgusu</span>
                <div style={{ padding: "0.5rem", background: "var(--hm-admin-bg)", borderRadius: "4px", fontSize: "0.875rem", fontWeight: 600 }}>
                  {selectedLog.query}
                </div>
              </div>
            )}

            {selectedLog.userAgent && (
              <div style={{ marginBottom: "1rem" }}>
                <span style={{ color: "var(--hm-admin-text-muted)", display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>User-Agent</span>
                <div style={{ padding: "0.5rem", background: "var(--hm-admin-bg)", borderRadius: "4px", fontSize: "0.75rem", wordBreak: "break-all" }}>
                  {selectedLog.userAgent}
                </div>
              </div>
            )}

            <div>
              <span style={{ color: "var(--hm-admin-text-muted)", display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Ek Detaylar &amp; Parametreler</span>
              <pre
                style={{
                  margin: 0,
                  padding: "0.75rem",
                  background: "var(--hm-admin-bg)",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  overflowX: "auto",
                  maxHeight: "200px",
                }}
              >
                {selectedLog.details ? JSON.stringify(selectedLog.details, null, 2) : "Detay verisi yok."}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
