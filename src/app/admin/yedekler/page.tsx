"use client";

import React, { useState, useEffect } from "react";
import { BackupManifest } from "@/lib/server/backup";

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Yeni Yedek Modalı
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [backupDescription, setBackupDescription] = useState("");

  // Geri Yükleme Onay Modalı
  const [restoreTarget, setRestoreTarget] = useState<BackupManifest | null>(null);
  const [preserveOrders, setPreserveOrders] = useState(true);
  const [confirmText, setConfirmText] = useState("");

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backups");
      const data = await res.json();
      if (res.ok) {
        setBackups(data.backups || []);
      }
    } catch (err) {
      console.error("Backups fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setNotification(null);
    try {
      const res = await fetch("/api/admin/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: backupDescription }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotification({ type: "success", message: "Yedekleme başarıyla oluşturuldu." });
        setIsCreateModalOpen(false);
        setBackupDescription("");
        fetchBackups();
      } else {
        setNotification({ type: "error", message: data.error || "Yedek oluşturulamadı." });
      }
    } catch {
      setNotification({ type: "error", message: "Sunucu hatası oluştu." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyBackup = async (id: string) => {
    setActionLoading(true);
    setNotification(null);
    try {
      const res = await fetch(`/api/admin/backups/${id}/verify`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.valid) {
        setNotification({
          type: "success",
          message: `Yedek bütünlüğü doğrulandı (SHA-256: ${data.calculatedChecksum.slice(0, 16)}...). Dosya sağlam.`,
        });
        fetchBackups();
      } else {
        setNotification({
          type: "error",
          message: `Yedek dosyası bozuk veya değiştirilmiş: ${data.error || "Sağlama uyuşmazlığı"}`,
        });
      }
    } catch {
      setNotification({ type: "error", message: "Bütünlük doğrulanırken hata oluştu." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreTarget) return;
    if (confirmText.trim().toUpperCase() !== "GERİ YÜKLE") {
      alert("Lütfen onaylamak için kutuya 'GERİ YÜKLE' yazın.");
      return;
    }

    setActionLoading(true);
    setNotification(null);
    try {
      const res = await fetch(`/api/admin/backups/${restoreTarget.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preserveNewerOrders: preserveOrders }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotification({
          type: "success",
          message: `Sistem başarıyla geri yüklendi. ${data.message} (Öncesinde güvenlik yedeği alındı: ${data.safetyBackupId})`,
        });
        setRestoreTarget(null);
        setConfirmText("");
        fetchBackups();
      } else {
        setNotification({
          type: "error",
          message: data.error || "Geri yükleme işlemi başarısız oldu.",
        });
      }
    } catch {
      setNotification({ type: "error", message: "Geri yükleme sırasında kritik hata oluştu." });
    } finally {
      setActionLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "MANUAL":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}>Manuel</span>;
      case "SAFETY":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>Güvenlik Yedeği</span>;
      case "AUTO":
        return <span className="hm-admin-badge" style={{ backgroundColor: "#dcfce7", color: "#166534" }}>Otomatik</span>;
      default:
        return <span className="hm-admin-badge">{type}</span>;
    }
  };

  return (
    <div>
      {/* Başlık ve Buton */}
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
            Güvenli Yedekleme &amp; Geri Yükleme
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Katalog, siparişler, ayarlar ve veritabanı durumunu güvenli şekilde yedekleyin ve geri yükleyin.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={fetchBackups}
            disabled={loading || actionLoading}
            className="hm-admin-btn hm-admin-btn-outline"
          >
            ↻ Yenile
          </button>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            disabled={actionLoading}
            className="hm-admin-btn hm-admin-btn-primary"
          >
            + Şimdi Yedek Al
          </button>
        </div>
      </div>

      {/* Bildirim Kutusu */}
      {notification && (
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "6px",
            marginBottom: "1.5rem",
            backgroundColor: notification.type === "success" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${notification.type === "success" ? "#a7f3d0" : "#fecaca"}`,
            color: notification.type === "success" ? "#065f46" : "#991b1b",
            fontSize: "0.875rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Bilgilendirme Kartı */}
      <div
        className="hm-admin-card"
        style={{
          padding: "1.25rem",
          marginBottom: "1.5rem",
          borderLeft: "4px solid var(--hm-color-primary, #9333ea)",
          backgroundColor: "rgba(147, 51, 234, 0.03)",
        }}
      >
        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9375rem", fontWeight: 600 }}>
          Güvenli Geri Yükleme &amp; Sipariş Koruma Politikası
        </h3>
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--hm-admin-text-muted)", lineHeight: 1.5 }}>
          Herhangi bir geri yükleme işlemi başlatıldığında, sistem mevcut veritabanı durumunu otomatik olarak bir{" "}
          <strong>Güvenlik Yedeği (Safety Snapshot)</strong> olarak kaydeder. Ayrıca, finansal tutarsızlık ve sipariş kaybını
          önlemek amacıyla yedek tarihinden sonra oluşan yeni siparişler varsayılan olarak korunur.
        </p>
      </div>

      {/* Yedek Listesi Tablosu */}
      <div className="hm-admin-card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="hm-admin-table">
            <thead>
              <tr>
                <th style={{ width: "170px" }}>Oluşturulma Tarihi</th>
                <th style={{ width: "110px" }}>Tür</th>
                <th>Yedek Tanımı &amp; Açıklama</th>
                <th style={{ width: "120px" }}>Dosya Boyutu</th>
                <th>İçerik Bileşenleri</th>
                <th style={{ width: "100px" }}>Bütünlük</th>
                <th style={{ width: "230px", textAlign: "right" }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "2.5rem" }}>
                    Yedekler listeleniyor...
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "var(--hm-admin-text-muted)" }}>
                    Kayıtlı yedekleme bulunamadı. &ldquo;Şimdi Yedek Al&rdquo; butonuna tıklayarak ilk yedeğinizi oluşturabilirsiniz.
                  </td>
                </tr>
              ) : (
                backups.map((b, idx) => (
                  <tr key={`${b.id}-${idx}`}>
                    <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                      {new Date(b.createdAt).toLocaleString("tr-TR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td>{getTypeBadge(b.type)}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                        {b.description || "Manuel Sistem Yedeği"}
                      </div>
                      <div style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--hm-admin-text-muted)" }}>
                        {b.id}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.8125rem", fontFamily: "monospace" }}>
                      {formatSize(b.sizeBytes)}
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {b.itemCounts ? (
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <span className="hm-admin-badge" style={{ fontSize: "0.7rem" }}>{b.itemCounts.products} Ürün</span>
                          <span className="hm-admin-badge" style={{ fontSize: "0.7rem" }}>{b.itemCounts.categories} Kategori</span>
                          <span className="hm-admin-badge" style={{ fontSize: "0.7rem" }}>{b.itemCounts.orders} Sipariş</span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {b.isValid ? (
                        <span className="hm-admin-badge" style={{ backgroundColor: "#dcfce7", color: "#166534" }}>
                          Doğrulandı
                        </span>
                      ) : (
                        <span className="hm-admin-badge" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>
                          Beklemede
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                        <button
                          type="button"
                          onClick={() => handleVerifyBackup(b.id)}
                          disabled={actionLoading}
                          className="hm-admin-btn hm-admin-btn-outline"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                          title="SHA-256 bütünlüğünü doğrula"
                        >
                          Doğrula
                        </button>
                        <a
                          href={`/api/admin/backups/${b.id}/download`}
                          download={b.fileName}
                          className="hm-admin-btn hm-admin-btn-outline"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", textDecoration: "none" }}
                          title="Yedek JSON dosyasını bilgisayara indir"
                        >
                          İndir
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setRestoreTarget(b);
                            setConfirmText("");
                            setPreserveOrders(true);
                          }}
                          disabled={actionLoading}
                          className="hm-admin-btn hm-admin-btn-danger"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        >
                          Geri Yükle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manuel Yedek Oluşturma Modalı */}
      {isCreateModalOpen && (
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
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            className="hm-admin-card"
            style={{ width: "100%", maxWidth: "480px", padding: "1.5rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", fontWeight: 700 }}>
              Yeni Sistem Yedeği Al
            </h3>
            <p style={{ fontSize: "0.875rem", color: "var(--hm-admin-text-muted)", marginBottom: "1.25rem" }}>
              Tüm ürünler, varyantlar, renk ve beden stokları, kategoriler, mağaza ayarları ve sipariş geçmişi güvenli bir JSON anlık görüntüsü olarak saklanacaktır.
            </p>

            <form onSubmit={handleCreateBackup}>
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Yedek Açıklaması (İsteğe Bağlı)
                </label>
                <input
                  type="text"
                  placeholder="Örn: Faz 4.6 lansmanı öncesi tam yedek"
                  value={backupDescription}
                  onChange={(e) => setBackupDescription(e.target.value)}
                  className="hm-admin-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={actionLoading}
                  className="hm-admin-btn hm-admin-btn-outline"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="hm-admin-btn hm-admin-btn-primary"
                >
                  {actionLoading ? "Yedek Alınıyor..." : "Yedeği Oluştur"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Geri Yükleme Onay Modalı */}
      {restoreTarget && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
          onClick={() => setRestoreTarget(null)}
        >
          <div
            className="hm-admin-card"
            style={{ width: "100%", maxWidth: "560px", padding: "1.75rem", borderTop: "4px solid var(--hm-admin-danger)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.25rem", fontWeight: 700, color: "var(--hm-admin-danger)" }}>
              DİKKAT: Veritabanı Geri Yükleme Onayı
            </h3>

            <p style={{ fontSize: "0.875rem", color: "var(--hm-admin-text-main)", marginBottom: "1rem", lineHeight: 1.5 }}>
              Aşağıdaki yedeği mevcut sistem verilerinin üzerine geri yüklemek üzeresiniz:
            </p>

            <div
              style={{
                backgroundColor: "var(--hm-admin-bg)",
                padding: "1rem",
                borderRadius: "6px",
                fontSize: "0.8125rem",
                marginBottom: "1.25rem",
              }}
            >
              <div><strong>Yedek ID:</strong> {restoreTarget.id}</div>
              <div><strong>Oluşturulma:</strong> {new Date(restoreTarget.createdAt).toLocaleString("tr-TR")}</div>
              <div><strong>Açıklama:</strong> {restoreTarget.description || "-"}</div>
              <div><strong>Kapsam:</strong> {restoreTarget.itemCounts?.products} Ürün, {restoreTarget.itemCounts?.orders} Sipariş, {restoreTarget.itemCounts?.categories} Kategori</div>
            </div>

            <div
              style={{
                padding: "0.75rem 1rem",
                backgroundColor: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "6px",
                marginBottom: "1.25rem",
                fontSize: "0.8125rem",
                color: "#92400e",
              }}
            >
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={preserveOrders}
                  onChange={(e) => setPreserveOrders(e.target.checked)}
                  style={{ marginTop: "0.2rem" }}
                />
                <div>
                  <strong>Yedekten sonraki yeni siparişleri koru (Önerilen)</strong>
                  <div style={{ fontSize: "0.75rem", color: "#b45309", marginTop: "0.2rem" }}>
                    Yedek oluşturulduktan sonra vitrinden verilen yeni siparişlerin kaybolmasını ve finansal tutarsızlıkları önler.
                  </div>
                </div>
              </label>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Onaylamak için aşağıdaki kutuya <strong>GERİ YÜKLE</strong> yazın:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="GERİ YÜKLE"
                className="hm-admin-input"
                style={{ width: "100%", textTransform: "uppercase" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setRestoreTarget(null)}
                disabled={actionLoading}
                className="hm-admin-btn hm-admin-btn-outline"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleRestoreBackup}
                disabled={actionLoading || confirmText.trim().toUpperCase() !== "GERİ YÜKLE"}
                className="hm-admin-btn hm-admin-btn-danger"
              >
                {actionLoading ? "Geri Yükleniyor..." : "Verileri Geri Yükle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
