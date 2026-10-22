"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CollectionItem, ProductItem } from "@/lib/catalog";

interface CollectionManagerProps {
  initialCollections: CollectionItem[];
  initialProducts: ProductItem[];
}

export function CollectionManager({
  initialCollections,
  initialProducts,
}: CollectionManagerProps) {
  const [collections, setCollections] = useState<CollectionItem[]>(initialCollections);
  const [products, setProducts] = useState<ProductItem[]>(initialProducts);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedColForProducts, setSelectedColForProducts] = useState<CollectionItem | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDisplayOrder, setFormDisplayOrder] = useState<number>(collections.length + 1);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const resetForm = () => {
    setFormName("");
    setFormSlug("");
    setFormDescription("");
    setFormDisplayOrder(collections.length + 1);
    setEditingId(null);
    setShowAddForm(false);
    setErrorMsg("");
  };

  const startEdit = (col: CollectionItem) => {
    setEditingId(col.id);
    setFormName(col.name);
    setFormSlug(col.slug);
    setFormDescription(col.description || "");
    setFormDisplayOrder(col.displayOrder || 1);
    setShowAddForm(true);
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const payload = {
        name: formName,
        slug: formSlug || undefined,
        description: formDescription,
        displayOrder: Number(formDisplayOrder) || 1,
      };

      if (editingId) {
        const res = await fetch(`/api/admin/collections/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Güncelleme başarısız.");
        }
        setCollections((prev) =>
          prev.map((c) => (c.id === editingId ? data.collection : c))
        );
        setSuccessMsg(`"${data.collection.name}" koleksiyonu başarıyla güncellendi.`);
      } else {
        const res = await fetch("/api/admin/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Koleksiyon oluşturulamadı.");
        }
        setCollections((prev) => [...prev, data.collection]);
        setSuccessMsg(`"${data.collection.name}" koleksiyonu başarıyla eklendi.`);
      }

      resetForm();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("İşlem sırasında beklenmeyen bir hata oluştu.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (col: CollectionItem) => {
    if (!confirm(`"${col.name}" koleksiyonunu silmek istediğinizden emin misiniz?`)) {
      return;
    }

    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/admin/collections/${col.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Silme işlemi başarısız.");
      }

      setCollections((prev) => prev.filter((c) => c.id !== col.id));
      if (selectedColForProducts?.id === col.id) {
        setSelectedColForProducts(null);
      }
      setSuccessMsg(`"${col.name}" koleksiyonu başarıyla silindi.`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Silme sırasında bir hata oluştu.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Koleksiyona ürün ekle / çıkar fonksiyonu
  const toggleProductCollection = async (product: ProductItem, colSlug: string) => {
    const currentSlugs = product.collectionSlugs || [];
    const isIn = currentSlugs.includes(colSlug);
    const newSlugs = isIn
      ? currentSlugs.filter((s) => s !== colSlug)
      : [...currentSlugs, colSlug];

    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionSlugs: newSlugs,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ürün koleksiyonu güncellenemedi.");
      }

      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? data.product : p))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ürün güncellenemedi.");
    }
  };

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
            Koleksiyon Yönetimi
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Yeni Sezon, Çok Satanlar gibi özel seçkileri yönetin ve koleksiyonlara ürün ekleyin.
          </p>
        </div>
        {!showAddForm && (
          <button
            type="button"
            className="hm-admin-btn hm-admin-btn-primary"
            onClick={() => {
              resetForm();
              setShowAddForm(true);
            }}
          >
            + Yeni Koleksiyon Ekle
          </button>
        )}
      </div>

      {successMsg && (
        <div
          style={{
            padding: "0.875rem 1rem",
            backgroundColor: "#E6F4EA",
            color: "#137333",
            borderRadius: "4px",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg("")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#137333" }}
          >
            ✕
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: "0.875rem 1rem",
            backgroundColor: "#FCE8E6",
            color: "#C5221F",
            borderRadius: "4px",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg("")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#C5221F" }}
          >
            ✕
          </button>
        </div>
      )}

      {showAddForm && (
        <div className="hm-admin-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 1rem 0" }}>
            {editingId ? "Koleksiyonu Düzenle" : "Yeni Koleksiyon Ekle"}
          </h2>
          <form onSubmit={handleSave}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div>
                <label className="hm-admin-label">Koleksiyon Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Yeni Sezon 2026"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="hm-admin-input"
                />
              </div>

              <div>
                <label className="hm-admin-label">Bağlantı Adresi (Slug)</label>
                <input
                  type="text"
                  placeholder="Boş bırakılırsa addan üretilir"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  className="hm-admin-input"
                />
              </div>

              <div>
                <label className="hm-admin-label">Sıra Numarası</label>
                <input
                  type="number"
                  min="1"
                  value={formDisplayOrder}
                  onChange={(e) => setFormDisplayOrder(Number(e.target.value))}
                  className="hm-admin-input"
                />
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label className="hm-admin-label">Açıklama</label>
              <textarea
                rows={2}
                placeholder="Koleksiyon hakkında kısa açıklama..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="hm-admin-textarea"
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="hm-admin-btn hm-admin-btn-outline"
                onClick={resetForm}
                disabled={loading}
              >
                İptal
              </button>
              <button
                type="submit"
                className="hm-admin-btn hm-admin-btn-primary"
                disabled={loading}
              >
                {loading ? "Kaydediliyor..." : editingId ? "Değişiklikleri Kaydet" : "Koleksiyonu Ekle"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Koleksiyon Tablosu */}
      <div className="hm-admin-card" style={{ overflow: "hidden", marginBottom: "2rem" }}>
        <table className="hm-admin-table">
          <thead>
            <tr>
              <th>Koleksiyon Adı</th>
              <th>Slug (URL)</th>
              <th>Sıra</th>
              <th>İçerdiği Ürünler</th>
              <th>Açıklama</th>
              <th style={{ textAlign: "right" }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {collections.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}>
                  Henüz kayıtlı koleksiyon bulunmamaktadır.
                </td>
              </tr>
            ) : (
              collections
                .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                .map((col) => {
                  const productCount = products.filter((p) =>
                    (p.collectionSlugs || []).includes(col.slug)
                  ).length;
                  const isSelected = selectedColForProducts?.id === col.id;

                  return (
                    <tr
                      key={col.id}
                      style={{
                        backgroundColor: isSelected ? "#F0F4F8" : undefined,
                      }}
                    >
                      <td style={{ fontWeight: 600 }}>{col.name}</td>
                      <td>
                        <code style={{ fontSize: "0.75rem", color: "#4A5568" }}>/{col.slug}</code>
                      </td>
                      <td>{col.displayOrder || 1}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setSelectedColForProducts(isSelected ? null : col)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                          }}
                        >
                          <span
                            className={`hm-admin-badge ${
                              productCount > 0 ? "hm-admin-badge-success" : "hm-admin-badge-neutral"
                            }`}
                          >
                            {productCount} Ürün {isSelected ? "▼" : "▶"}
                          </span>
                        </button>
                      </td>
                      <td
                        style={{
                          maxWidth: "240px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "var(--hm-admin-text-muted)",
                        }}
                      >
                        {col.description || "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="hm-admin-btn hm-admin-btn-outline"
                            style={{
                              padding: "0.35rem 0.65rem",
                              fontSize: "0.75rem",
                              backgroundColor: isSelected ? "#141414" : undefined,
                              color: isSelected ? "#FFFFFF" : undefined,
                            }}
                            onClick={() => setSelectedColForProducts(isSelected ? null : col)}
                          >
                            {isSelected ? "Ürünleri Kapat" : "Ürünleri Yönet"}
                          </button>
                          <Link
                            href={`/koleksiyon/${col.slug}`}
                            target="_blank"
                            className="hm-admin-btn hm-admin-btn-outline"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                            title="Vitrinde Görüntüle"
                          >
                            ↗ Vitrin
                          </Link>
                          <button
                            type="button"
                            className="hm-admin-btn hm-admin-btn-outline"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                            onClick={() => startEdit(col)}
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            className="hm-admin-btn hm-admin-btn-danger"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                            onClick={() => handleDelete(col)}
                          >
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
      </div>

      {/* Koleksiyona Ürün Ekleme / Çıkarma Paneli */}
      {selectedColForProducts && (
        <div className="hm-admin-card" style={{ padding: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              borderBottom: "1px solid var(--hm-admin-border)",
              paddingBottom: "0.75rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>
                &ldquo;{selectedColForProducts.name}&rdquo; Koleksiyonundaki Ürünler
              </h2>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--hm-admin-text-muted)" }}>
                Koleksiyonda yer almasını istediğiniz ürünleri seçin veya çıkarın.
              </p>
            </div>
            <button
              type="button"
              className="hm-admin-btn hm-admin-btn-outline"
              style={{ fontSize: "0.75rem" }}
              onClick={() => setSelectedColForProducts(null)}
            >
              Paneli Kapat ✕
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {products.map((prod) => {
              const inCollection = (prod.collectionSlugs || []).includes(
                selectedColForProducts.slug
              );
              return (
                <div
                  key={prod.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem",
                    border: inCollection
                      ? "1.5px solid var(--hm-admin-primary)"
                      : "1px solid var(--hm-admin-border)",
                    borderRadius: "4px",
                    backgroundColor: inCollection ? "#FFFBFB" : "#FFFFFF",
                  }}
                >
                  <div style={{ minWidth: 0, paddingRight: "0.5rem" }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {prod.title}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--hm-admin-text-muted)" }}>
                      {prod.categoryName} • {prod.basePrice.toLocaleString("tr-TR")} ₺
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      toggleProductCollection(prod, selectedColForProducts.slug)
                    }
                    className={`hm-admin-btn ${
                      inCollection ? "hm-admin-btn-primary" : "hm-admin-btn-outline"
                    }`}
                    style={{
                      padding: "0.35rem 0.65rem",
                      fontSize: "0.75rem",
                      flexShrink: 0,
                    }}
                  >
                    {inCollection ? "✓ Koleksiyonda" : "+ Ekle"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
