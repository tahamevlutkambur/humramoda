"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ProductItem, CategoryItem, CollectionItem } from "@/lib/catalog";
import {
  getClientStoreSnapshot,
  saveClientStoreSnapshot,
  fetchSharedStore,
  subscribeStoreChanges,
} from "@/lib/client-store-sync";

interface ProductEditorProps {
  productId?: string;
  initialProduct?: ProductItem;
  categories: CategoryItem[];
  collections: CollectionItem[];
  isNew?: boolean;
}

interface EditableColor {
  id?: string;
  name: string;
  slug?: string;
  colorCode: string;
}

interface EditableVariant {
  id?: string;
  colorName: string;
  sizeName: string;
  sku: string;
  stockQuantity: number;
  costPrice?: number;
}

interface EditableMedia {
  id?: string;
  colorName?: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  thumbnailUrl: string;
  altText: string;
  isThumbnail: boolean;
  displayOrder: number;
}

export function ProductEditor({
  productId,
  initialProduct: propInitialProduct,
  categories: initialCategories,
  collections: initialCollections,
  isNew = false,
}: ProductEditorProps) {
  const router = useRouter();
  const initialSnap = getClientStoreSnapshot();
  const initialProduct = React.useMemo(() => {
    if (propInitialProduct) return propInitialProduct;
    if (isNew || !initialSnap) return undefined;
    const lookup = (productId || "").trim().toLowerCase();
    if (!lookup) return undefined;
    return initialSnap.products.find(
      (p) =>
        p.id === productId ||
        p.slug === productId ||
        p.id.toLowerCase() === lookup ||
        p.slug.toLowerCase() === lookup
    );
  }, [propInitialProduct, isNew, initialSnap, productId]);

  const [categories, setCategories] = useState<CategoryItem[]>(() =>
    initialSnap && initialSnap.categories.length > 0
      ? initialSnap.categories
      : initialCategories
  );
  const [collections, setCollections] = useState<CollectionItem[]>(() =>
    initialSnap && initialSnap.collections.length > 0
      ? initialSnap.collections
      : initialCollections
  );
  const [resolvedId, setResolvedId] = useState<string>(initialProduct?.id || productId || "");
  const [isFetchingProduct, setIsFetchingProduct] = useState<boolean>(!isNew && !initialProduct);

  // 1. Temel Bilgiler
  const [title, setTitle] = useState(initialProduct?.title || "");
  const [slug, setSlug] = useState(initialProduct?.slug || "");
  const [categorySlug, setCategorySlug] = useState(
    initialProduct?.categorySlug || initialCategories[0]?.slug || "takim"
  );
  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    initialProduct?.collectionSlugs && initialProduct.collectionSlugs.length > 0
      ? initialProduct.collectionSlugs
      : ["yeni-sezon", "cok-satanlar"]
  );
  const [basePrice, setBasePrice] = useState<string>(
    initialProduct ? String(initialProduct.basePrice) : ""
  );
  const [discountPrice, setDiscountPrice] = useState<string>(
    initialProduct?.discountPrice ? String(initialProduct.discountPrice) : ""
  );
  const [badge, setBadge] = useState(initialProduct?.badge || "");
  const [description, setDescription] = useState(initialProduct?.description || "");
  const [fabricDetails, setFabricDetails] = useState(initialProduct?.fabricDetails || "");
  const [modelDimensions, setModelDimensions] = useState(initialProduct?.modelDimensions || "");

  // 2. Renkler ve Bedenler
  const [colors, setColors] = useState<EditableColor[]>(
    initialProduct?.colors?.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      colorCode: c.colorCode,
    })) || [{ name: "Siyah", slug: "siyah", colorCode: "#141414" }]
  );

  // 3. Varyant Matrisi
  const [variants, setVariants] = useState<EditableVariant[]>(() => {
    if (initialProduct?.variants && Array.isArray(initialProduct.variants) && initialProduct.variants.length > 0) {
      const defaultColorName = initialProduct.colors?.[0]?.name || "Siyah";
      const defaultSizeName = initialProduct.sizes?.[0]?.name || "Standart";
      return initialProduct.variants.map((v) => {
        const c = initialProduct.colors?.find((col) => col.id === v.colorId);
        const s = initialProduct.sizes?.find((siz) => siz.id === v.sizeId);
        return {
          id: v.id,
          colorName: c?.name || (v as { colorName?: string }).colorName || defaultColorName,
          sizeName: s?.name || (v as { sizeName?: string }).sizeName || defaultSizeName,
          sku: v.sku,
          stockQuantity: v.stockQuantity ?? 10,
          costPrice: v.costPrice,
        };
      });
    }
    return [
      {
        colorName: "Siyah",
        sizeName: "Standart",
        sku: `HM-SIY-STD-${Math.floor(100 + Math.random() * 900)}`,
        stockQuantity: 10,
        costPrice: undefined,
      },
    ];
  });

  // 4. Medyalar
  const [media, setMedia] = useState<EditableMedia[]>(
    initialProduct?.media?.map((m) => {
      const c = initialProduct.colors?.find((col) => col.id === m.colorId);
      return {
        id: m.id,
        colorName: c?.name || (m as { colorName?: string }).colorName,
        type: m.type,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl || m.url,
        altText: m.altText || "",
        isThumbnail: m.isThumbnail,
        displayOrder: m.displayOrder,
      };
    }) || []
  );

  const hydrateFromProduct = React.useCallback((prod: ProductItem) => {
    setResolvedId(prod.id);
    setTitle(prod.title || "");
    setSlug(prod.slug || "");
    if (prod.categorySlug) setCategorySlug(prod.categorySlug);
    setSelectedCollections(
      prod.collectionSlugs && prod.collectionSlugs.length > 0
        ? prod.collectionSlugs
        : ["yeni-sezon"]
    );
    setBasePrice(String(prod.basePrice));
    setDiscountPrice(prod.discountPrice ? String(prod.discountPrice) : "");
    setBadge(prod.badge || "");
    setDescription(prod.description || "");
    setFabricDetails(prod.fabricDetails || "");
    setModelDimensions(prod.modelDimensions || "");

    const loadedColors =
      prod.colors && prod.colors.length > 0
        ? prod.colors.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            colorCode: c.colorCode,
          }))
        : [{ name: "Siyah", slug: "siyah", colorCode: "#141414" }];
    setColors(loadedColors);

    const fallbackColor = loadedColors[0]?.name || "Siyah";
    const fallbackSize = prod.sizes?.[0]?.name || "Standart";

    if (prod.variants && prod.variants.length > 0) {
      setVariants(
        prod.variants.map((v) => {
          const c = prod.colors?.find((col) => col.id === v.colorId);
          const s = prod.sizes?.find((siz) => siz.id === v.sizeId);
          return {
            id: v.id,
            colorName: c?.name || (v as { colorName?: string }).colorName || fallbackColor,
            sizeName: s?.name || (v as { sizeName?: string }).sizeName || fallbackSize,
            sku: v.sku,
            stockQuantity: v.stockQuantity ?? 10,
            costPrice: v.costPrice,
          };
        })
      );
    }

    if (prod.media) {
      setMedia(
        prod.media.map((m) => {
          const c = prod.colors?.find((col) => col.id === m.colorId);
          return {
            id: m.id,
            colorName: c?.name || (m as { colorName?: string }).colorName,
            type: m.type,
            url: m.url,
            thumbnailUrl: m.thumbnailUrl || m.url,
            altText: m.altText || "",
            isThumbnail: m.isThumbnail,
            displayOrder: m.displayOrder,
          };
        })
      );
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    const targetLookup = (productId || initialProduct?.id || "").trim();

    const applySnapshot = (data: {
      products?: ProductItem[];
      categories?: CategoryItem[];
      collections?: CollectionItem[];
      product?: ProductItem | null;
    }) => {
      if (!active || !data) return;
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        setCategories(data.categories);
        if (isNew && !initialProduct?.categorySlug) {
          setCategorySlug((prev) =>
            data.categories!.some((c: CategoryItem) => c.slug === prev)
              ? prev
              : data.categories![0].slug
          );
        }
      }
      if (Array.isArray(data.collections) && data.collections.length > 0) {
        setCollections(data.collections);
      }
      if (!isNew && targetLookup) {
        const lower = targetLookup.toLowerCase();
        const matchedProduct: ProductItem | undefined =
          data.product ||
          (Array.isArray(data.products)
            ? data.products.find(
                (p: ProductItem) =>
                  p.id === targetLookup ||
                  p.slug === targetLookup ||
                  p.id.toLowerCase() === lower ||
                  p.slug.toLowerCase() === lower
              )
            : undefined);
        if (matchedProduct) {
          hydrateFromProduct(matchedProduct);
        }
      }
    };

    const unsubscribe = subscribeStoreChanges((snap) => {
      applySnapshot(snap);
    });

    fetchSharedStore()
      .then((snap) => {
        applySnapshot(snap);
      })
      .finally(() => {
        if (active) setIsFetchingProduct(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isNew, productId, initialProduct?.id, initialProduct?.categorySlug, hydrateFromProduct]);

  const [activeMediaColorTab, setActiveMediaColorTab] = useState<string>("all");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Renk Ekle
  const handleAddColor = () => {
    const newName = `Yeni Renk ${colors.length + 1}`;
    const updated = [...colors, { name: newName, colorCode: "#C8B89C" }];
    setColors(updated);

    // Bu yeni renge varsayılan ilk beden varyantını ekle
    const prefix = (slug || title || "HM").slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const colorCodeShort = newName.slice(0, 3).toUpperCase();
    const autoSku = `${prefix}-${colorCodeShort}-STD-${Math.floor(100 + Math.random() * 900)}`;

    setVariants((prev) => [
      ...prev,
      {
        colorName: newName,
        sizeName: "Standart",
        sku: autoSku,
        stockQuantity: 10,
        costPrice: undefined,
      },
    ]);
  };

  // Renk Sil
  const handleRemoveColor = (idx: number) => {
    const colorToRemove = colors[idx];
    if (!colorToRemove) return;
    setColors((prev) => prev.filter((_, i) => i !== idx));
    setVariants((prev) =>
      prev.filter((v) => v.colorName.toLowerCase() !== colorToRemove.name.toLowerCase())
    );
    setMedia((prev) =>
      prev.filter((m) => m.colorName?.toLowerCase() !== colorToRemove.name.toLowerCase())
    );
  };

  // Renk Adı Değiştiğinde Varyant ve Medyaları Güncelle
  const handleColorNameChange = (idx: number, newName: string) => {
    const oldName = colors[idx].name;
    const updated = [...colors];
    updated[idx].name = newName;
    setColors(updated);

    setVariants((prev) =>
      prev.map((v) =>
        v.colorName.toLowerCase() === oldName.toLowerCase() ? { ...v, colorName: newName } : v
      )
    );

    setMedia((prev) =>
      prev.map((m) =>
        m.colorName?.toLowerCase() === oldName.toLowerCase() ? { ...m, colorName: newName } : m
      )
    );
  };

  // Belirli bir renge özel beden ekle
  const handleAddSizeToColor = (colorName: string, sizeName: string) => {
    const trimmedSize = sizeName.trim();
    if (!trimmedSize) return;

    // Aynı renkte aynı beden var mı kontrolü
    const exists = variants.some(
      (v) =>
        v.colorName.toLowerCase() === colorName.toLowerCase() &&
        v.sizeName.toLowerCase() === trimmedSize.toLowerCase()
    );
    if (exists) {
      alert(`"${colorName}" renginde "${trimmedSize}" bedeni zaten ekli.`);
      return;
    }

    const prefix = (slug || title || "HM").slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const colorShort = colorName.slice(0, 3).toUpperCase();
    const sizeShort = trimmedSize.replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase() || "STD";
    const autoSku = `${prefix}-${colorShort}-${sizeShort}-${(variants.length + 1).toString().padStart(3, "0")}`;

    setVariants((prev) => [
      ...prev,
      {
        colorName,
        sizeName: trimmedSize,
        sku: autoSku,
        stockQuantity: 10,
        costPrice: undefined,
      },
    ]);
  };

  // Belirli bir varyantı kaldır
  const handleRemoveVariant = (variantIdx: number) => {
    setVariants((prev) => prev.filter((_, idx) => idx !== variantIdx));
  };

  // Koleksiyon Seçimi Değiştirme
  const toggleCollection = (cSlug: string) => {
    setSelectedCollections((prev) =>
      prev.includes(cSlug) ? prev.filter((s) => s !== cSlug) : [...prev, cSlug]
    );
  };

  // Medya Dosyası Yükleme (Fotoğraf & Video Kesin Ayrımı)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
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

        const uploaded = data.media;
        const colorForMedia = activeMediaColorTab !== "all" ? activeMediaColorTab : colors[0]?.name;

        setMedia((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}-${i}`,
            colorName: colorForMedia,
            type: uploaded.mediaType || (uploaded.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE"),
            url: uploaded.url,
            thumbnailUrl: uploaded.thumbnailUrl || uploaded.url,
            altText: `${title || "Ürün"} görseli`,
            isThumbnail: prev.length === 0 && uploaded.mediaType !== "VIDEO",
            displayOrder: prev.length + 1,
          },
        ]);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Dosya yüklenirken hata oluştu.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Medya Sil
  const handleRemoveMedia = (idx: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== idx));
  };

  // Kapak Resmi Yap
  const handleSetCover = (idx: number) => {
    setMedia((prev) =>
      prev.map((m, i) => ({
        ...m,
        isThumbnail: i === idx,
      }))
    );
  };

  // Formu Kaydet
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      if (!title.trim()) {
        throw new Error("Lütfen ürün başlığını giriniz.");
      }
      if (!basePrice || isNaN(Number(basePrice)) || Number(basePrice) <= 0) {
        throw new Error("Geçerli bir normal satış fiyatı giriniz.");
      }
      const activeColors = colors.length > 0 ? colors : [{ name: "Siyah", slug: "siyah", colorCode: "#141414" }];

      let activeVariants = [...variants];
      if (activeVariants.length === 0) {
        const primaryColor = activeColors[0]?.name || "Siyah";
        activeVariants = [
          {
            colorName: primaryColor,
            sizeName: "Standart",
            sku: `HM-${(slug || title || "HM").slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "")}-${Date.now().toString().slice(-4)}`,
            stockQuantity: 10,
            costPrice: undefined,
          },
        ];
      }

      // Negatif stok ve SKU denetimi
      const seenSkus = new Set<string>();
      activeVariants = activeVariants.map((v, i) => {
        let skuTrimmed = (v.sku || "").trim().toUpperCase();
        if (!skuTrimmed) {
          skuTrimmed = `HM-${(slug || title || "HM").slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "")}-${i + 1}-${Math.floor(100 + Math.random() * 900)}`;
        }
        if (seenSkus.has(skuTrimmed)) {
          skuTrimmed = `${skuTrimmed}-${i + 1}`;
        }
        seenSkus.add(skuTrimmed);
        return {
          ...v,
          sku: skuTrimmed,
          stockQuantity: isNaN(v.stockQuantity) || v.stockQuantity < 0 ? 0 : v.stockQuantity,
        };
      });

      // Otomatik benzersiz beden listesi derle
      const uniqueSizeNames = Array.from(new Set(activeVariants.map((v) => v.sizeName.trim()))).filter(Boolean);
      const computedSizes = uniqueSizeNames.length > 0
        ? uniqueSizeNames.map((name, i) => ({ name, displayOrder: i + 1 }))
        : [{ name: "Standart", displayOrder: 1 }];

      const targetUpdateId = resolvedId || productId || initialProduct?.id || "";
      const currentSnapshot = getClientStoreSnapshot() || {
        updatedAt: Date.now(),
        categories,
        collections,
        products: initialProduct ? [initialProduct] : [],
      };

      const payload = {
        ...(isNew ? {} : { id: targetUpdateId }),
        _snapshot: currentSnapshot,
        title: title.trim(),
        slug: slug.trim() || undefined,
        description,
        fabricDetails,
        modelDimensions,
        basePrice: Number(basePrice),
        discountPrice: discountPrice ? Number(discountPrice) : undefined,
        badge: badge.trim() || undefined,
        categorySlug,
        collectionSlugs:
          selectedCollections.length > 0 ? selectedCollections : ["yeni-sezon", "cok-satanlar"],
        colors: activeColors,
        sizes: computedSizes,
        variants: activeVariants,
        media,
      };

      const url = "/api/admin/products";
      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ürün kaydedilemedi.");
      }

      saveClientStoreSnapshot({
        updatedAt: data.updatedAt,
        products: Array.isArray(data.products)
          ? data.products
          : data.product
          ? isNew
            ? [data.product, ...(currentSnapshot.products || [])]
            : (currentSnapshot.products || []).map((p) =>
                p.id === data.product.id ? data.product : p
              )
          : currentSnapshot.products,
        categories: Array.isArray(data.categories) ? data.categories : categories,
        collections: Array.isArray(data.collections) ? data.collections : collections,
        bumpVersion: true,
      });

      setSuccessMessage("Ürün başarıyla kaydedildi! Yönlendiriliyorsunuz...");
      setTimeout(() => {
        router.push("/admin/urunler");
      }, 600);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Kaydetme sırasında bir hata oluştu.");
      setIsSaving(false);
    }
  };

  if (isFetchingProduct && !title) {
    return (
      <div className="hm-admin-card" style={{ padding: "3rem", textAlign: "center", color: "#718096" }}>
        Ürün bilgileri yükleniyor...
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      encType="multipart/form-data"
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
    >
      {/* Üst Bar */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "#718096" }}>
            <Link href="/admin/urunler" style={{ textDecoration: "none" }}>
              Ürünler
            </Link>
            <span>/</span>
            <span style={{ color: "#1A202C", fontWeight: 600 }}>
              {isNew ? "Yeni Ürün Ekle" : title || initialProduct?.title || "Ürün Düzenle"}
            </span>
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1A202C", marginTop: "0.25rem" }}>
            {isNew ? "Yeni Ürün Oluştur" : `Ürünü Düzenle: ${title || initialProduct?.title || ""}`}
          </h1>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/admin/urunler" className="hm-admin-btn hm-admin-btn-outline">
            İptal
          </Link>
          <button
            type="submit"
            disabled={isSaving}
            className="hm-admin-btn hm-admin-btn-primary"
          >
            {isSaving ? "Kaydediliyor..." : isNew ? "Ürünü Yayınla" : "Değişiklikleri Kaydet"}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            backgroundColor: "#FFF5F5",
            border: "1px solid #FEB2B2",
            color: "#C53030",
            padding: "0.875rem 1rem",
            borderRadius: "4px",
            fontSize: "0.875rem",
          }}
        >
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            backgroundColor: "#E6F4EA",
            border: "1px solid #A8DAB5",
            color: "#137333",
            padding: "0.875rem 1rem",
            borderRadius: "4px",
            fontSize: "0.875rem",
          }}
        >
          {successMessage}
        </div>
      )}

      {/* 2 Kolonlu Form Izgarası */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "1.5rem",
        }}
        className="hm-admin-form-grid"
      >
        {/* Sol Kolon: Temel Bilgiler & Varyantlar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* 1. Temel Bilgiler Kartı */}
          <div className="hm-admin-card" style={{ padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem", color: "#1A202C" }}>
              1. Temel Ürün Bilgileri
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="hm-admin-label" htmlFor="prod-title">
                  Ürün Başlığı *
                </label>
                <input
                  id="prod-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Qapitone Garnili Scuba İkili Takım"
                  className="hm-admin-input"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="hm-admin-label" htmlFor="prod-slug">
                    Bağlantı Adresi (Slug)
                  </label>
                  <input
                    id="prod-slug"
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="Otomatik oluşturulur (örn: scuba-ikili-takim)"
                    className="hm-admin-input"
                  />
                </div>

                <div>
                  <label className="hm-admin-label" htmlFor="prod-category">
                    Kategori *
                  </label>
                  <select
                    id="prod-category"
                    value={categorySlug}
                    onChange={(e) => setCategorySlug(e.target.value)}
                    className="hm-admin-select"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="hm-admin-label" htmlFor="prod-base-price">
                    Normal Fiyat (₺) *
                  </label>
                  <input
                    id="prod-base-price"
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                    placeholder="1749.00"
                    className="hm-admin-input"
                  />
                </div>

                <div>
                  <label className="hm-admin-label" htmlFor="prod-disc-price">
                    İndirimli Fiyat (₺)
                  </label>
                  <input
                    id="prod-disc-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={discountPrice}
                    onChange={(e) => setDiscountPrice(e.target.value)}
                    placeholder="Boş bırakılırsa indirim uygulanmaz"
                    className="hm-admin-input"
                  />
                </div>

                <div>
                  <label className="hm-admin-label" htmlFor="prod-badge">
                    Ürün Rozeti
                  </label>
                  <select
                    id="prod-badge"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    className="hm-admin-select"
                  >
                    <option value="">Rozet Yok</option>
                    <option value="YENİ ÜRÜN">YENİ ÜRÜN</option>
                    <option value="ÇOK SATAN">ÇOK SATAN</option>
                    <option value="ÖN SİPARİŞ">ÖN SİPARİŞ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="hm-admin-label">Koleksiyon Grupları</label>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                  {collections.map((col) => (
                    <label
                      key={col.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCollections.includes(col.slug)}
                        onChange={() => toggleCollection(col.slug)}
                      />
                      <span>{col.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="hm-admin-label" htmlFor="prod-desc">
                  Ürün Açıklaması
                </label>
                <textarea
                  id="prod-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Kalıp, dikim ve tasarım detayları..."
                  className="hm-admin-textarea"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="hm-admin-label" htmlFor="prod-fabric">
                    Kumaş ve Yıkama Bilgisi
                  </label>
                  <textarea
                    id="prod-fabric"
                    rows={2}
                    value={fabricDetails}
                    onChange={(e) => setFabricDetails(e.target.value)}
                    placeholder="%80 Pamuk, %20 Polyester vb."
                    className="hm-admin-textarea"
                  />
                </div>

                <div>
                  <label className="hm-admin-label" htmlFor="prod-model">
                    Manken Ölçüleri
                  </label>
                  <textarea
                    id="prod-model"
                    rows={2}
                    value={modelDimensions}
                    onChange={(e) => setModelDimensions(e.target.value)}
                    placeholder="Boy: 176 cm, Beden: 1 Beden vb."
                    className="hm-admin-textarea"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. Renge Özel Beden ve Stok Yönetimi */}
          <div className="hm-admin-card" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h3 style={{ fontSize: "1.0625rem", fontWeight: 600, color: "#1A202C", margin: "0 0 0.25rem 0" }}>
                  2. Renge Özel Beden ve Stok Yönetimi
                </h3>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "#718096" }}>
                  Her rengin bedenlerini, stok miktarlarını ve birim maliyetlerini birbirinden bağımsız yönetin.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddColor}
                className="hm-admin-btn hm-admin-btn-primary"
                style={{ fontSize: "0.75rem", padding: "0.4rem 0.8rem" }}
              >
                + Yeni Renk Ekle
              </button>
            </div>

            {/* Renk Bazında Gruplanmış Beden & Stok Kartları */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {colors.map((c, colorIdx) => {
                const colorVariantsWithIndex = variants
                  .map((v, originalIdx) => ({ ...v, originalIdx }))
                  .filter((v) => v.colorName.toLowerCase() === c.name.toLowerCase());

                const totalColorStock = colorVariantsWithIndex.reduce((sum, v) => sum + v.stockQuantity, 0);

                return (
                  <div
                    key={colorIdx}
                    style={{
                      border: "1px solid var(--hm-admin-border)",
                      borderRadius: "6px",
                      backgroundColor: "#FFF",
                      overflow: "hidden",
                    }}
                  >
                    {/* Renk Başlık Çubuğu */}
                    <div
                      style={{
                        padding: "0.75rem 1rem",
                        backgroundColor: "#F8FAFC",
                        borderBottom: "1px solid var(--hm-admin-border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <input
                          type="color"
                          value={c.colorCode}
                          onChange={(e) => {
                            const updated = [...colors];
                            updated[colorIdx].colorCode = e.target.value;
                            setColors(updated);
                          }}
                          style={{
                            width: "28px",
                            height: "28px",
                            padding: 0,
                            border: "1px solid rgba(0,0,0,0.15)",
                            cursor: "pointer",
                            borderRadius: "50%",
                          }}
                          title="Renk tonunu seç"
                        />
                        <div>
                          <input
                            type="text"
                            value={c.name}
                            onChange={(e) => handleColorNameChange(colorIdx, e.target.value)}
                            placeholder="Renk Adı (Örn: Siyah)"
                            style={{
                              fontSize: "0.9375rem",
                              fontWeight: 600,
                              color: "#1A202C",
                              border: "1px solid transparent",
                              borderRadius: "4px",
                              padding: "0.2rem 0.4rem",
                              backgroundColor: "transparent",
                            }}
                            onFocus={(e) => (e.target.style.border = "1px solid #CBD5E0")}
                            onBlur={(e) => (e.target.style.border = "1px solid transparent")}
                          />
                        </div>
                        <span
                          className={`hm-admin-badge ${
                            totalColorStock > 0 ? "hm-admin-badge-success" : "hm-admin-badge-danger"
                          }`}
                          style={{ fontSize: "0.6875rem" }}
                        >
                          {colorVariantsWithIndex.length} Beden | Toplam Stok: {totalColorStock}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {colors.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveColor(colorIdx)}
                            className="hm-admin-btn hm-admin-btn-outline"
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.25rem 0.6rem",
                              color: "#C5221F",
                              borderColor: "#FCE8E6",
                            }}
                          >
                            Rengi Sil
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Renk İçi Beden ve Stok Tablosu */}
                    <div style={{ padding: "1rem" }}>
                      {colorVariantsWithIndex.length === 0 ? (
                        <div
                          style={{
                            padding: "1rem",
                            textAlign: "center",
                            backgroundColor: "#FFF9F5",
                            borderRadius: "4px",
                            color: "#9C4221",
                            fontSize: "0.8125rem",
                            marginBottom: "0.75rem",
                          }}
                        >
                          Bu renge henüz beden eklenmedi. Aşağıdaki butonlarla beden ekleyebilirsiniz.
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto", marginBottom: "0.75rem" }}>
                          <table className="hm-admin-table" style={{ margin: 0, fontSize: "0.8125rem" }}>
                            <thead>
                              <tr>
                                <th style={{ width: "160px" }}>Beden Adı</th>
                                <th>Stok Kodu (SKU) *</th>
                                <th style={{ width: "120px" }}>Stok Adedi *</th>
                                <th style={{ width: "120px" }}>Birim Maliyet (₺)</th>
                                <th style={{ width: "60px", textAlign: "center" }}>İşlem</th>
                              </tr>
                            </thead>
                            <tbody>
                              {colorVariantsWithIndex.map((v) => (
                                <tr key={v.originalIdx}>
                                  <td>
                                    <input
                                      type="text"
                                      value={v.sizeName}
                                      onChange={(e) => {
                                        const updated = [...variants];
                                        updated[v.originalIdx].sizeName = e.target.value;
                                        setVariants(updated);
                                      }}
                                      className="hm-admin-input"
                                      style={{ padding: "0.3rem 0.5rem", fontSize: "0.8125rem" }}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      required
                                      value={v.sku}
                                      onChange={(e) => {
                                        const updated = [...variants];
                                        updated[v.originalIdx].sku = e.target.value;
                                        setVariants(updated);
                                      }}
                                      className="hm-admin-input"
                                      style={{ padding: "0.3rem 0.5rem", fontSize: "0.8125rem" }}
                                    />
                                  </td>
                                  <td>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                      <input
                                        type="number"
                                        min="0"
                                        required
                                        value={v.stockQuantity}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value);
                                          const updated = [...variants];
                                          updated[v.originalIdx].stockQuantity = isNaN(val) ? 0 : Math.max(0, val);
                                          setVariants(updated);
                                        }}
                                        className="hm-admin-input"
                                        style={{
                                          padding: "0.3rem 0.5rem",
                                          fontSize: "0.8125rem",
                                          borderColor: v.stockQuantity === 0 ? "#E53E3E" : undefined,
                                          backgroundColor: v.stockQuantity === 0 ? "#FFF5F5" : undefined,
                                        }}
                                      />
                                      {v.stockQuantity === 0 && (
                                        <span
                                          style={{
                                            fontSize: "9px",
                                            fontWeight: 700,
                                            color: "#C5221F",
                                            backgroundColor: "#FCE8E6",
                                            padding: "2px 4px",
                                            borderRadius: "3px",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          TÜKENDİ
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="Maliyet girin"
                                      value={v.costPrice !== undefined ? v.costPrice : ""}
                                      onChange={(e) => {
                                        const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
                                        const updated = [...variants];
                                        updated[v.originalIdx].costPrice = val !== undefined && !isNaN(val) ? Math.max(0, val) : undefined;
                                        setVariants(updated);
                                      }}
                                      className="hm-admin-input"
                                      style={{ padding: "0.3rem 0.5rem", fontSize: "0.8125rem" }}
                                    />
                                  </td>
                                  <td style={{ textAlign: "center" }}>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveVariant(v.originalIdx)}
                                      style={{
                                        color: "#C5221F",
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        fontSize: "1rem",
                                        padding: "2px 6px",
                                      }}
                                      title="Bu bedeni renkten sil"
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Hızlı Beden Ekle Butonları */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                          paddingTop: "0.5rem",
                          borderTop: "1px dashed #E2E8F0",
                        }}
                      >
                        <span style={{ fontSize: "0.75rem", color: "#718096", fontWeight: 600 }}>
                          + &quot;{c.name}&quot; Rengine Beden Ekle:
                        </span>
                        {["36-38", "40-42", "44-46", "36", "38", "40", "42", "44", "Standart"].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleAddSizeToColor(c.name, preset)}
                            style={{
                              padding: "0.2rem 0.5rem",
                              fontSize: "0.6875rem",
                              backgroundColor: "#EDF2F7",
                              border: "1px solid #CBD5E0",
                              borderRadius: "4px",
                              cursor: "pointer",
                              color: "#2D3748",
                            }}
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sağ Kolon: Renge Özel Medya Galerisi */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className="hm-admin-card" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#1A202C" }}>
                3. Renge Özel Medya Galerisi
              </h3>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="hm-admin-btn hm-admin-btn-primary"
                style={{ fontSize: "0.75rem", padding: "0.4rem 0.8rem" }}
              >
                {isUploading ? "Yükleniyor..." : "+ Dosya Yükle"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/mp4"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </div>

            {/* Renk Filtresi Sekmeleri */}
            <div
              style={{
                display: "flex",
                gap: "0.35rem",
                overflowX: "auto",
                borderBottom: "1px solid var(--hm-admin-border)",
                paddingBottom: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <button
                type="button"
                onClick={() => setActiveMediaColorTab("all")}
                style={{
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.75rem",
                  borderRadius: "4px",
                  border: "none",
                  backgroundColor: activeMediaColorTab === "all" ? "#141414" : "#EDF2F7",
                  color: activeMediaColorTab === "all" ? "#FFF" : "#4A5568",
                  cursor: "pointer",
                }}
              >
                Tümü ({media.length})
              </button>

              {colors.map((c) => {
                const count = media.filter(
                  (m) => m.colorName?.toLowerCase() === c.name.toLowerCase()
                ).length;
                const isSelected = activeMediaColorTab === c.name;

                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setActiveMediaColorTab(c.name)}
                    style={{
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.75rem",
                      borderRadius: "4px",
                      border: "none",
                      backgroundColor: isSelected ? "#141414" : "#EDF2F7",
                      color: isSelected ? "#FFF" : "#4A5568",
                      cursor: "pointer",
                    }}
                  >
                    {c.name} ({count})
                  </button>
                );
              })}
            </div>

            {/* Yüklü Medya Listesi */}
            {media.length === 0 ? (
              <div
                style={{
                  border: "2px dashed #CBD5E0",
                  borderRadius: "6px",
                  padding: "2.5rem 1rem",
                  textAlign: "center",
                  color: "#718096",
                }}
              >
                <p style={{ fontSize: "0.8125rem" }}>Henüz görsel veya video yüklenmedi.</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="hm-admin-btn hm-admin-btn-outline"
                  style={{ marginTop: "0.75rem", fontSize: "0.75rem" }}
                >
                  Bilgisayardan Dosya Seç
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {media.map((item, idx) => {
                  const isVisible =
                    activeMediaColorTab === "all" ||
                    item.colorName?.toLowerCase() === activeMediaColorTab.toLowerCase();

                  if (!isVisible) return null;

                  return (
                    <div
                      key={idx}
                      style={{
                        position: "relative",
                        border: item.isThumbnail ? "2px solid #8B2635" : "1px solid var(--hm-admin-border)",
                        borderRadius: "4px",
                        overflow: "hidden",
                        backgroundColor: "#F7FAFC",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 4" }}>
                        {item.type === "VIDEO" ? (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              backgroundColor: "#000",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#FFF",
                              fontSize: "0.75rem",
                            }}
                          >
                            ▶ Video (MP4)
                          </div>
                        ) : (
                          <Image
                            src={item.thumbnailUrl || item.url}
                            alt={item.altText}
                            fill
                            sizes="130px"
                            style={{ objectFit: "cover" }}
                          />
                        )}

                        <span
                          style={{
                            position: "absolute",
                            top: "4px",
                            right: "4px",
                            backgroundColor: item.type === "VIDEO" ? "#1E40AF" : "rgba(0,0,0,0.65)",
                            color: "#FFF",
                            fontSize: "9px",
                            fontWeight: 600,
                            padding: "2px 5px",
                            borderRadius: "2px",
                            textTransform: "uppercase",
                          }}
                        >
                          {item.type === "VIDEO" ? "VİDEO" : "FOTO"}
                        </span>

                        {item.isThumbnail && (
                          <span
                            style={{
                              position: "absolute",
                              top: "4px",
                              left: "4px",
                              backgroundColor: "#8B2635",
                              color: "#FFF",
                              fontSize: "9px",
                              fontWeight: 600,
                              padding: "2px 5px",
                              borderRadius: "2px",
                              textTransform: "uppercase",
                            }}
                          >
                            Kapak
                          </span>
                        )}
                      </div>

                      <div style={{ padding: "0.4rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        {/* Renge Ata Seçimi */}
                        <select
                          value={item.colorName || ""}
                          onChange={(e) => {
                            const updated = [...media];
                            updated[idx].colorName = e.target.value;
                            setMedia(updated);
                          }}
                          className="hm-admin-select"
                          style={{ fontSize: "0.6875rem", padding: "0.2rem" }}
                        >
                          <option value="">Renksiz (Genel)</option>
                          {colors.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          {!item.isThumbnail && (
                            <button
                              type="button"
                              onClick={() => handleSetCover(idx)}
                              style={{ fontSize: "0.6875rem", color: "#4A5568", background: "none", cursor: "pointer", textDecoration: "underline" }}
                            >
                              Kapak Yap
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveMedia(idx)}
                            style={{ fontSize: "0.6875rem", color: "#E53E3E", background: "none", cursor: "pointer", marginLeft: "auto" }}
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

export default ProductEditor;
