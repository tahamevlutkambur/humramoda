"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CategoryItem, ProductItem } from "@/lib/catalog";

interface CategoryManagerProps {
  initialCategories: CategoryItem[];
  products: ProductItem[];
}

export function CategoryManager({
  initialCategories,
  products: initialProducts,
}: CategoryManagerProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryItem[]>(initialCategories);
  const [products, setProducts] = useState<ProductItem[]>(initialProducts);

  const fetchLatestStoreCategories = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/products?public=1", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
      if (Array.isArray(data.products)) {
        setProducts(data.products);
      }
    } catch (err) {
      console.error("Categories sync error:", err);
    }
  }, []);

  React.useEffect(() => {
    fetchLatestStoreCategories();
  }, [fetchLatestStoreCategories]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formDisplayOrder, setFormDisplayOrder] = useState<number>(categories.length + 1);

  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const categoryFileInputRef = useRef<HTMLInputElement>(null);

  const handleCategoryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/media/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.media) {
        throw new Error(data.error || "Görsel yüklenemedi.");
      }

      // Kalıcı sunucu URL'i atanır (kesinlikle geçici blob: URL kaydedilmez)
      setFormImageUrl(data.media.url);
      setSuccessMsg("Kategori görseli başarıyla yüklendi.");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Dosya yüklenirken bir hata oluştu.");
    } finally {
      setUploadingImage(false);
      if (categoryFileInputRef.current) categoryFileInputRef.current.value = "";
    }
  };

  const resetForm = (nextCount?: number | React.MouseEvent) => {
    const count = typeof nextCount === "number" ? nextCount : categories.length;
    setFormName("");
    setFormSlug("");
    setFormDescription("");
    setFormImageUrl("");
    setFormDisplayOrder(count + 1);
    setEditingId(null);
    setShowAddForm(false);
    setErrorMsg("");
  };

  const startEdit = (cat: CategoryItem) => {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormSlug(cat.slug);
    setFormDescription(cat.description || "");
    setFormImageUrl(cat.imageUrl || "");
    setFormDisplayOrder(cat.displayOrder || 1);
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
        _entity: "category",
        name: formName,
        slug: formSlug || undefined,
        description: formDescription,
        imageUrl: formImageUrl || undefined,
        displayOrder: Number(formDisplayOrder) || 1,
      };

      if (editingId) {
        // Update via unified store endpoint
        const res = await fetch("/api/admin/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: editingId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Güncelleme başarısız.");
        }
        // Best-effort sync to secondary categories endpoint
        fetch(`/api/admin/categories/${encodeURIComponent(editingId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => {});

        if (Array.isArray(data.categories)) {
          setCategories(data.categories);
          resetForm(data.categories.length);
        } else {
          setCategories((prev) =>
            prev.map((c) => (c.id === editingId ? data.category : c))
          );
          resetForm();
        }
        setSuccessMsg(`"${data.category.name}" kategorisi başarıyla güncellendi.`);
      } else {
        // Create via unified store endpoint
        const res = await fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Kategori oluşturulamadı.");
        }
        // Best-effort sync to secondary categories endpoint
        fetch("/api/admin/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => {});

        if (Array.isArray(data.categories)) {
          setCategories(data.categories);
          resetForm(data.categories.length);
        } else {
          setCategories((prev) => [...prev, data.category]);
          resetForm(categories.length + 1);
        }
        setSuccessMsg(`"${data.category.name}" kategorisi başarıyla eklendi.`);
      }

      router.refresh();
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

  const handleDelete = async (cat: CategoryItem) => {
    const attachedCount = products.filter(
      (p) => p.categorySlug === cat.slug || (p as { categoryId?: string }).categoryId === cat.id
    ).length;
    let reassignTo: string | undefined;

    if (attachedCount > 0) {
      const otherCategories = categories.filter((c) => c.id !== cat.id && c.slug !== cat.slug);
      if (otherCategories.length === 0) {
        alert(
          `"${cat.name}" kategorisine bağlı ${attachedCount} adet ürün bulunmaktadır ve başka kategori mevcut olmadığı için silinemez.\n\nLütfen önce ürünleri silin veya başka bir kategori oluşturun.`
        );
        return;
      }
      const targetCategoryName = otherCategories[0]?.name || "Diğer";
      const confirmMove = confirm(
        `"${cat.name}" kategorisine bağlı ${attachedCount} adet ürün bulunmaktadır.\n\n` +
        `Kategoriyi sildiğinizde, bu ${attachedCount} ürün otomatik olarak "${targetCategoryName}" kategorisine aktarılacaktır.\n\n` +
        `Kategoriyi silmek istiyor musunuz?`
      );
      if (!confirmMove) return;
      reassignTo = otherCategories[0]?.slug;
    } else {
      if (!confirm(`"${cat.name}" kategorisini silmek istediğinizden emin misiniz?`)) {
        return;
      }
    }

    setLoading(true);
    setErrorMsg("");
    try {
      const targetId = cat.id || cat.slug;
      const reassignQuery = reassignTo ? `&reassignTo=${encodeURIComponent(reassignTo)}` : "";
      const res = await fetch(
        `/api/admin/products?entity=category&id=${encodeURIComponent(targetId)}${reassignQuery}`,
        {
          method: "DELETE",
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Silme işlemi başarısız.");
      }
      // Best-effort sync to secondary categories endpoint
      const legacyQuery = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : "";
      fetch(`/api/admin/categories/${encodeURIComponent(targetId)}${legacyQuery}`, {
        method: "DELETE",
      }).catch(() => {});

      if (Array.isArray(data.categories)) {
        setCategories(data.categories);
      } else {
        setCategories((prev) => prev.filter((c) => c.id !== cat.id && c.slug !== cat.slug));
      }
      if (reassignTo) {
        setProducts((prev) =>
          prev.map((p) =>
            p.categorySlug === cat.slug || (p as { categoryId?: string }).categoryId === cat.id
              ? { ...p, categorySlug: reassignTo! }
              : p
          )
        );
      }
      setSuccessMsg(`"${cat.name}" kategorisi başarıyla silindi.`);
      router.refresh();
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
            Kategori Yönetimi
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Mağazada vitrinde yer alan ana kategorileri, açıklamaları ve sıralamaları düzenleyin.
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
            + Yeni Kategori Ekle
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
            {editingId ? "Kategoriyi Düzenle" : "Yeni Kategori Ekle"}
          </h2>
          <form onSubmit={handleSave} encType="multipart/form-data">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div>
                <label className="hm-admin-label">Kategori Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Elbise"
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

              <div style={{ gridColumn: "1 / -1" }}>
                <label className="hm-admin-label">Kategori Görseli</label>
                <input
                  type="file"
                  ref={categoryFileInputRef}
                  onChange={handleCategoryFileUpload}
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                />

                {formImageUrl ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1.25rem",
                      padding: "1rem",
                      backgroundColor: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                      borderRadius: "6px",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: "80px",
                        height: "100px",
                        borderRadius: "4px",
                        overflow: "hidden",
                        backgroundColor: "#E2E8F0",
                        flexShrink: 0,
                      }}
                    >
                      <Image
                        src={formImageUrl}
                        alt="Kategori görsel önizleme"
                        fill
                        sizes="80px"
                        style={{ objectFit: "cover" }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <div style={{ fontSize: "0.8125rem", color: "#4A5568", wordBreak: "break-all" }}>
                        <strong>Kayıtlı Yol:</strong> <code>{formImageUrl}</code>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          onClick={() => categoryFileInputRef.current?.click()}
                          disabled={uploadingImage}
                          className="hm-admin-btn hm-admin-btn-outline"
                          style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
                        >
                          {uploadingImage ? "Yükleniyor..." : "Görseli Değiştir"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormImageUrl("")}
                          disabled={uploadingImage}
                          className="hm-admin-btn hm-admin-btn-outline"
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.3rem 0.65rem",
                            color: "#C5221F",
                            borderColor: "#FCE8E6",
                          }}
                        >
                          Görseli Kaldır
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      border: "2px dashed #CBD5E0",
                      borderRadius: "6px",
                      padding: "1.5rem",
                      textAlign: "center",
                      backgroundColor: "#F8FAFC",
                    }}
                  >
                    <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.8125rem", color: "#718096" }}>
                      Bu kategori için görsel seçilmedi. Vitrinde temiz bir yer tutucu gösterilecektir.
                    </p>
                    <button
                      type="button"
                      onClick={() => categoryFileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="hm-admin-btn hm-admin-btn-outline"
                      style={{ fontSize: "0.8125rem" }}
                    >
                      {uploadingImage ? "Yükleniyor..." : "📁 Bilgisayardan Görsel Seç"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label className="hm-admin-label">Açıklama</label>
              <textarea
                rows={2}
                placeholder="Kategori hakkında kısa tanıtım metni..."
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
                {loading ? "Kaydediliyor..." : editingId ? "Değişiklikleri Kaydet" : "Kategoriyi Ekle"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Kategori Tablosu */}
      <div className="hm-admin-card" style={{ overflow: "hidden" }}>
        <table className="hm-admin-table">
          <thead>
            <tr>
              <th style={{ width: "60px" }}>Görsel</th>
              <th>Kategori Adı</th>
              <th>Slug (URL)</th>
              <th>Sıra</th>
              <th>Ürün Sayısı</th>
              <th>Açıklama</th>
              <th style={{ textAlign: "right" }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "2rem" }}>
                  Henüz kayıtlı kategori bulunmamaktadır.
                </td>
              </tr>
            ) : (
              categories
                .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                .map((cat) => {
                  const productCount = products.filter((p) => p.categorySlug === cat.slug).length;
                  return (
                    <tr key={cat.id}>
                      <td>
                        {cat.imageUrl ? (
                          <div
                            style={{
                              width: "40px",
                              height: "50px",
                              position: "relative",
                              backgroundColor: "#f0f0f0",
                              borderRadius: "3px",
                              overflow: "hidden",
                            }}
                          >
                            <Image
                              src={cat.imageUrl}
                              alt={cat.name}
                              fill
                              style={{ objectFit: "cover" }}
                              sizes="40px"
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: "40px",
                              height: "50px",
                              backgroundColor: "#e2e8f0",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#718096",
                              fontSize: "0.625rem",
                              borderRadius: "3px",
                            }}
                          >
                            Yok
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{cat.name}</td>
                      <td>
                        <code style={{ fontSize: "0.75rem", color: "#4A5568" }}>/{cat.slug}</code>
                      </td>
                      <td>{cat.displayOrder || 1}</td>
                      <td>
                        <span className="hm-admin-badge hm-admin-badge-neutral">
                          {productCount} Ürün
                        </span>
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
                        {cat.description || "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                          <Link
                            href={`/kategori/${cat.slug}`}
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
                            onClick={() => startEdit(cat)}
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            className="hm-admin-btn hm-admin-btn-danger"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                            onClick={() => handleDelete(cat)}
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
    </div>
  );
}
