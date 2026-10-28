"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ProductItem } from "@/lib/catalog";
import { formatCurrency } from "@/lib/formatters";
import {
  getClientStoreSnapshot,
  saveClientStoreSnapshot,
  fetchSharedStore,
  subscribeStoreChanges,
  getCompactSnapshotForRequest,
  safeParseJsonResponse,
} from "@/lib/client-store-sync";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>(() => {
    const snap = getClientStoreSnapshot();
    return snap ? snap.products : [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const snap = getClientStoreSnapshot();
    return !snap;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeStoreChanges((snap) => {
      if (Array.isArray(snap.products)) {
        setProducts(snap.products);
        setIsLoading(false);
      }
    });

    fetchSharedStore()
      .then((snap) => {
        if (Array.isArray(snap.products)) {
          setProducts(snap.products);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });

    return unsubscribe;
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Bu ürünü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) {
      return;
    }

    setDeleteId(id);
    setIsDeleting(true);

    try {
      const rawSnapshot = getClientStoreSnapshot() || {
        updatedAt: Date.now(),
        products,
        categories: [],
        collections: [],
      };
      const currentSnapshot = getCompactSnapshotForRequest(rawSnapshot);
      const res = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _entity: "product",
          id,
          _snapshot: currentSnapshot,
        }),
      });
      if (res.ok) {
        const data = await safeParseJsonResponse(res);
        const nextProducts: ProductItem[] =
          data && Array.isArray(data.products)
            ? data.products
            : products.filter((p) => p.id !== id && p.slug !== id);
        setProducts(nextProducts);
        saveClientStoreSnapshot({
          updatedAt: data?.updatedAt,
          deletedProductId: id,
          products: nextProducts,
          categories: data?.categories,
          collections: data?.collections,
          bumpVersion: true,
        });
      } else {
        alert("Ürün silinemedi.");
      }
    } catch {
      alert("Sunucu hatası.");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          p.variants.some((v) => v.sku.toLowerCase().includes(q))
      );
    }

    if (selectedCategory !== "all") {
      list = list.filter((p) => p.categorySlug === selectedCategory);
    }

    return list;
  }, [products, searchQuery, selectedCategory]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (!map.has(p.categorySlug)) {
        map.set(p.categorySlug, p.categoryName);
      }
    });
    return Array.from(map.entries());
  }, [products]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Üst Başlık & Yeni Ürün Butonu */}
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
            Ürün Yönetimi
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "#718096", marginTop: "2px" }}>
            Katalogdaki tüm modelleri, fiyatları, stok ve renk varyantlarını yönetin.
          </p>
        </div>

        <Link href="/admin/urunler/yeni" className="hm-admin-btn hm-admin-btn-primary">
          <span>+ Yeni Ürün Ekle</span>
        </Link>
      </div>

      {/* Arama & Filtre Çubuğu */}
      <div
        className="hm-admin-card"
        style={{
          padding: "1rem",
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", flex: 1, minWidth: "260px" }}>
          <input
            type="text"
            placeholder="Ürün adı, slug veya SKU ile ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="hm-admin-input"
            style={{ maxWidth: "360px" }}
          />

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="hm-admin-select"
            style={{ maxWidth: "200px" }}
          >
            <option value="all">Tüm Kategoriler</option>
            {categories.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <span style={{ fontSize: "0.8125rem", color: "#718096" }}>
          {filteredProducts.length} Ürün Listelendi
        </span>
      </div>

      {/* Ürün Tablosu */}
      <div className="hm-admin-card" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "#718096" }}>
            Ürünler yükleniyor...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "#718096" }}>
            Kriterlere uygun ürün bulunamadı.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="hm-admin-table">
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>Görsel</th>
                  <th>Ürün Başlığı &amp; Kategori</th>
                  <th>Fiyat Bilgisi</th>
                  <th>Renkler</th>
                  <th>Toplam Stok</th>
                  <th>Rozet</th>
                  <th style={{ textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const firstImage = product.media[0];
                  const totalStock = product.variants.reduce(
                    (acc, v) => acc + v.stockQuantity,
                    0
                  );
                  const isOutOfStock = totalStock === 0;

                  return (
                    <tr key={product.id}>
                      {/* 3:4 Küçük Resim */}
                      <td>
                        <div
                          style={{
                            position: "relative",
                            width: "48px",
                            aspectRatio: "3 / 4",
                            backgroundColor: "#EDF2F7",
                            borderRadius: "4px",
                            overflow: "hidden",
                          }}
                        >
                          {firstImage && (
                            <Image
                              src={firstImage.thumbnailUrl || firstImage.url}
                              alt={product.title}
                              fill
                              unoptimized={(firstImage.thumbnailUrl || firstImage.url).startsWith("data:")}
                              sizes="48px"
                              style={{ objectFit: "cover" }}
                            />
                          )}
                        </div>
                      </td>

                      {/* Başlık & Kategori */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <Link
                            href={`/admin/urunler/${encodeURIComponent(product.id)}`}
                            style={{
                              fontWeight: 600,
                              color: "#1A202C",
                              textDecoration: "none",
                            }}
                          >
                            {product.title}
                          </Link>
                          <span style={{ fontSize: "0.75rem", color: "#718096", marginTop: "2px" }}>
                            {product.categoryName} • <code style={{ fontSize: "0.6875rem" }}>/urun/{product.slug}</code>
                          </span>
                        </div>
                      </td>

                      {/* Fiyat */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span
                            className="tabular-nums"
                            style={{
                              fontWeight: 600,
                              color: product.discountPrice ? "#8B2635" : "#1A202C",
                            }}
                          >
                            {formatCurrency(product.discountPrice || product.basePrice)}
                          </span>
                          {product.discountPrice && (
                            <span
                              className="tabular-nums"
                              style={{
                                fontSize: "0.6875rem",
                                color: "#A0AEC0",
                                textDecoration: "line-through",
                              }}
                            >
                              {formatCurrency(product.basePrice)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Renk Noktaları */}
                      <td>
                        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                          {product.colors.map((c) => (
                            <span
                              key={c.id}
                              title={c.name}
                              style={{
                                width: "12px",
                                height: "12px",
                                borderRadius: "50%",
                                backgroundColor: c.colorCode,
                                border: "1px solid rgba(0,0,0,0.15)",
                                display: "inline-block",
                              }}
                            />
                          ))}
                          <span style={{ fontSize: "0.6875rem", color: "#718096", marginLeft: "4px" }}>
                            ({product.colors.length})
                          </span>
                        </div>
                      </td>

                      {/* Toplam Stok */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span
                            className="tabular-nums"
                            style={{
                              fontWeight: 600,
                              color: isOutOfStock ? "#E53E3E" : totalStock <= 5 ? "#DD6B20" : "#2B6CB0",
                            }}
                          >
                            {totalStock} Adet
                          </span>
                          {isOutOfStock && (
                            <span className="hm-admin-badge hm-admin-badge-danger">Tükendi</span>
                          )}
                        </div>
                      </td>

                      {/* Rozet */}
                      <td>
                        {product.badge ? (
                          <span className="hm-admin-badge hm-admin-badge-neutral">
                            {product.badge}
                          </span>
                        ) : (
                          <span style={{ color: "#CBD5E0" }}>—</span>
                        )}
                      </td>

                      {/* İşlemler */}
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                          <Link
                            href={`/admin/urunler/${encodeURIComponent(product.id)}`}
                            className="hm-admin-btn hm-admin-btn-outline"
                            style={{ padding: "0.3rem 0.65rem", fontSize: "0.75rem" }}
                          >
                            Düzenle
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(product.id)}
                            disabled={isDeleting && deleteId === product.id}
                            className="hm-admin-btn hm-admin-btn-danger"
                            style={{ padding: "0.3rem 0.65rem", fontSize: "0.75rem" }}
                          >
                            {isDeleting && deleteId === product.id ? "Siliniyor..." : "Sil"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
