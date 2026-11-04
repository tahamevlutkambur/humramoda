"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProductItem, ProductMediaItem } from "@/lib/catalog";
import {
  saveClientStoreSnapshot,
  getClientStoreSnapshot,
  compressImageBeforeUpload,
  safeParseJsonResponse,
} from "@/lib/client-store-sync";

interface MissingMediaRestorationDeckProps {
  products: ProductItem[];
  onProductUpdated?: (updated: ProductItem) => void;
}

export function MissingMediaRestorationDeck({
  products,
  onProductUpdated,
}: MissingMediaRestorationDeckProps) {
  // Seçili ürünler: Medyası eksik olan 6 ürün veya genel liste
  const missingProducts = products.filter((p) => !p.media || p.media.length === 0);
  const targetProducts = missingProducts.length > 0 ? missingProducts : products;

  // Her ürün için seçili renk sekmesi durumu: productId -> colorName
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>({});
  // Yükleme durumu: productId -> boolean
  const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({});
  // Sürükleme durumu: productId -> boolean
  const [draggingState, setDraggingState] = useState<Record<string, boolean>>({});
  // Bildirim mesajları: productId -> { type: "success" | "error"; text: string }
  const [notifications, setNotifications] = useState<
    Record<string, { type: "success" | "error"; text: string }>
  >({});
  // Kaydetme durumu: productId -> "saved" | "saving" | null
  const [saveStatus, setSaveStatus] = useState<Record<string, "saved" | "saving" | null>>({});

  // Dosya input referansları: productId -> HTMLInputElement
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getActiveColor = (product: ProductItem): string => {
    return selectedColors[product.id] || product.colors?.[0]?.name || "Genel";
  };

  const showNotification = (productId: string, text: string, type: "success" | "error" = "success") => {
    setNotifications((prev) => ({ ...prev, [productId]: { type, text } }));
    setTimeout(() => {
      setNotifications((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }, 5000);
  };

  // Bir ürünün medyasını anında kaydet ve sunucuya eşitle
  const persistProductMedia = async (product: ProductItem, newMedia: ProductMediaItem[]) => {
    setSaveStatus((prev) => ({ ...prev, [product.id]: "saving" }));

    const updatedProduct: ProductItem = {
      ...product,
      media: newMedia,
    };

    const snap = getClientStoreSnapshot();
    const currentProducts = snap?.products || [product];
    const nextProducts = currentProducts.map((p) =>
      p.id === product.id || p.slug === product.slug ? updatedProduct : p
    );

    const savedSnap = saveClientStoreSnapshot({
      editedProductId: product.id,
      products: nextProducts,
      bumpVersion: true,
    });

    try {
      await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _entity: "sync_product_media",
          id: product.id,
          updatedAt: savedSnap.updatedAt,
          media: newMedia,
        }),
      });
      setSaveStatus((prev) => ({ ...prev, [product.id]: "saved" }));
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [product.id]: null }));
      }, 3000);
    } catch (err) {
      console.warn("Media sync server notice:", err);
      setSaveStatus((prev) => ({ ...prev, [product.id]: "saved" }));
    }

    if (onProductUpdated) {
      onProductUpdated(updatedProduct);
    }
  };

  // Çoklu Dosya Yükleme İşlemi
  const handleUploadFiles = async (product: ProductItem, fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    setUploadingState((prev) => ({ ...prev, [product.id]: true }));
    const activeColor = getActiveColor(product);
    const matchedColor = product.colors?.find(
      (c) => c.name.toLowerCase() === activeColor.toLowerCase()
    );

    let runningMedia = [...(product.media || [])];
    const uploadedNames: string[] = [];

    try {
      for (let i = 0; i < filesArray.length; i++) {
        const rawFile = filesArray[i];

        let fileToUpload: File | Blob = rawFile;
        try {
          fileToUpload = await compressImageBeforeUpload(rawFile);
        } catch {
          fileToUpload = rawFile;
        }

        const formData = new FormData();
        formData.append("file", fileToUpload, rawFile.name);

        const res = await fetch("/api/admin/media/upload", {
          method: "POST",
          body: formData,
        });

        const data = await safeParseJsonResponse(res);
        if (!res.ok || !data.media) {
          throw new Error(data.error || `"${rawFile.name}" yüklenemedi.`);
        }

        const uploaded = data.media;

        // Mükerrer görsel kontrolü (SHA-256 içerik hash'i veya url)
        const isDuplicate = runningMedia.some(
          (m) =>
            (uploaded.hash && (m as { hash?: string }).hash === uploaded.hash) ||
            m.url === uploaded.url ||
            (uploaded.fileName && m.url.includes(uploaded.fileName))
        );

        if (isDuplicate) {
          showNotification(
            product.id,
            `"${rawFile.name}" görseli bu üründe zaten mevcut. Mükerrer ekleme engellendi.`,
            "error"
          );
          continue;
        }

        const isFirstForThisColor = !runningMedia.some((m) => m.colorId === matchedColor?.id);
        const newItem: ProductMediaItem & { hash?: string; colorName?: string } = {
          id: `med-${product.id}-${Date.now()}-${i}`,
          colorId: matchedColor?.id,
          colorName: matchedColor?.name || activeColor,
          type: uploaded.mediaType || "IMAGE",
          url: uploaded.url,
          thumbnailUrl: uploaded.thumbnailUrl || uploaded.url,
          altText: `${product.title} - ${activeColor}`,
          isThumbnail: runningMedia.length === 0 || isFirstForThisColor,
          displayOrder: runningMedia.length + 1,
          hash: uploaded.hash,
        };

        runningMedia.push(newItem);
        uploadedNames.push(rawFile.name);
      }

      await persistProductMedia(product, runningMedia);

      if (uploadedNames.length > 0) {
        showNotification(
          product.id,
          `✓ ${uploadedNames.length} adet görsel "${product.title}" (${activeColor}) varyantına başarıyla eklendi ve kaydedildi.`,
          "success"
        );
      }
    } catch (err: unknown) {
      showNotification(
        product.id,
        err instanceof Error ? err.message : "Görseller yüklenirken hata oluştu.",
        "error"
      );
    } finally {
      setUploadingState((prev) => ({ ...prev, [product.id]: false }));
      if (fileInputRefs.current[product.id]) {
        fileInputRefs.current[product.id]!.value = "";
      }
    }
  };

  // Kapak Görseli Belirle
  const handleSetCover = async (product: ProductItem, mediaIdx: number) => {
    const currentMedia = product.media || [];
    if (mediaIdx < 0 || mediaIdx >= currentMedia.length) return;

    const target = currentMedia[mediaIdx];
    const targetColorId = target.colorId;

    // Renge özel kapak: Yalnızca hedef rengin kapak bayrağını günceller
    const updated = currentMedia.map((m, idx) => {
      if (idx === mediaIdx) {
        return { ...m, isThumbnail: true };
      }
      if (targetColorId ? m.colorId === targetColorId : !m.colorId) {
        return { ...m, isThumbnail: false };
      }
      return m;
    });

    await persistProductMedia(product, updated);
    showNotification(product.id, "Kapak görseli başarıyla güncellendi.", "success");
  };

  // Görsel Rengini Değiştir (Yanlış renge atandıysa güvenle düzeltme)
  const handleChangeColor = async (
    product: ProductItem,
    mediaIdx: number,
    newColorName: string
  ) => {
    const currentMedia = product.media || [];
    if (mediaIdx < 0 || mediaIdx >= currentMedia.length) return;

    const matchedColor = product.colors?.find(
      (c) => c.name.toLowerCase() === newColorName.toLowerCase()
    );

    const updated = currentMedia.map((m, idx) => {
      if (idx === mediaIdx) {
        return {
          ...m,
          colorId: matchedColor?.id,
          colorName: matchedColor?.name || (newColorName === "Genel" ? undefined : newColorName),
        };
      }
      return m;
    });

    await persistProductMedia(product, updated);
    showNotification(
      product.id,
      `Görsel "${newColorName}" rengine başarıyla taşındı.`,
      "success"
    );
  };

  // Sıralama Değiştir (◀ / ▶)
  const handleMove = async (product: ProductItem, mediaIdx: number, direction: "left" | "right") => {
    const currentMedia = [...(product.media || [])];
    const targetIdx = direction === "left" ? mediaIdx - 1 : mediaIdx + 1;
    if (targetIdx < 0 || targetIdx >= currentMedia.length) return;

    const temp = currentMedia[mediaIdx];
    currentMedia[mediaIdx] = currentMedia[targetIdx];
    currentMedia[targetIdx] = temp;

    const reordered = currentMedia.map((m, i) => ({ ...m, displayOrder: i + 1 }));
    await persistProductMedia(product, reordered);
  };

  // Görsel Sil (Onay İle)
  const handleDeleteMedia = async (product: ProductItem, mediaIdx: number) => {
    if (!confirm(`"${product.title}" ürününden bu görseli silmek istediğinize emin misiniz?`)) {
      return;
    }

    const currentMedia = product.media || [];
    const updated = currentMedia
      .filter((_, idx) => idx !== mediaIdx)
      .map((m, i) => ({ ...m, displayOrder: i + 1 }));

    await persistProductMedia(product, updated);
    showNotification(product.id, "Görsel galeriden silindi.", "success");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Üst Bilgilendirme Kartı */}
      <div
        className="hm-admin-card"
        style={{
          padding: "1.25rem 1.5rem",
          backgroundColor: "#FFFBEB",
          border: "1px solid #FCD34D",
          borderRadius: "8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#92400E", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>🎨 Eksik Görsel Restorasyon Masası</span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                backgroundColor: "#F59E0B",
                color: "#FFF",
                padding: "2px 8px",
                borderRadius: "12px",
              }}
            >
              {missingProducts.length} Eksik Ürün
            </span>
          </h2>
          <p style={{ fontSize: "0.8125rem", color: "#B45309", marginTop: "4px", maxWidth: "800px", lineHeight: "1.4" }}>
            Aşağıdaki 6 ürünün fotoğraflarını renklere göre gruplayarak sürükleyip bırakabilir, anında yükleyebilir ve kapak fotoğrafını belirleyebilirsiniz. Yüklenen fotoğraflar sunucuda ve tarayıcıda kalıcı olarak saklanır.
          </p>
        </div>

        <div style={{ fontSize: "0.75rem", color: "#78350F", textAlign: "right" }}>
          Desteklenen formatlar: <strong>JPG, PNG, WebP, AVIF</strong> (Maks. 15MB)
        </div>
      </div>

      {/* Ürün Kartları Izgarası */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {targetProducts.map((product) => {
          const activeColor = getActiveColor(product);
          const currentMedia = product.media || [];
          const isUploading = Boolean(uploadingState[product.id]);
          const isDragging = Boolean(draggingState[product.id]);
          const notification = notifications[product.id];
          const status = saveStatus[product.id];

          return (
            <div
              key={product.id}
              className="hm-admin-card"
              style={{
                padding: "1.5rem",
                borderRadius: "8px",
                backgroundColor: "#FFFFFF",
                border: "1px solid #E2E8F0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              {/* Kart Üst Bilgisi */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  borderBottom: "1px solid #EDF2F7",
                  paddingBottom: "1rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1A202C" }}>
                      {product.title}
                    </h3>
                    <code
                      style={{
                        fontSize: "0.6875rem",
                        padding: "2px 6px",
                        backgroundColor: "#F7FAFC",
                        border: "1px solid #E2E8F0",
                        borderRadius: "4px",
                        color: "#4A5568",
                      }}
                    >
                      {product.id}
                    </code>
                  </div>
                  <span style={{ fontSize: "0.8125rem", color: "#718096", marginTop: "2px" }}>
                    {product.categoryName} • Slug: <code>/urun/{product.slug}</code>
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {/* Görsel Sayısı Durumu */}
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      padding: "4px 10px",
                      borderRadius: "6px",
                      backgroundColor: currentMedia.length === 0 ? "#FEE2E2" : "#DCFCE7",
                      color: currentMedia.length === 0 ? "#991B1B" : "#166534",
                    }}
                  >
                    {currentMedia.length === 0
                      ? "⚠️ Görsel Eksik (0 Görsel)"
                      : `✓ ${currentMedia.length} Görsel Mevcut`}
                  </span>

                  {/* Kaydetme Durumu */}
                  {status === "saving" && (
                    <span style={{ fontSize: "0.75rem", color: "#D97706", fontWeight: 600 }}>
                      ⏳ Kaydediliyor...
                    </span>
                  )}
                  {status === "saved" && (
                    <span style={{ fontSize: "0.75rem", color: "#16A34A", fontWeight: 600 }}>
                      ✓ Kaydedildi
                    </span>
                  )}

                  {/* Detaylı Düzenleme Butonu */}
                  <Link
                    href={`/admin/urunler/${encodeURIComponent(product.id)}`}
                    className="hm-admin-btn hm-admin-btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                  >
                    ✏️ Detaylı Düzenle
                  </Link>
                </div>
              </div>

              {/* Bildirim Alanı */}
              {notification && (
                <div
                  style={{
                    padding: "0.625rem 1rem",
                    borderRadius: "6px",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    backgroundColor: notification.type === "success" ? "#F0FDF4" : "#FEF2F2",
                    color: notification.type === "success" ? "#15803D" : "#B91C1C",
                    border: `1px solid ${notification.type === "success" ? "#BBF7D0" : "#FECACA"}`,
                  }}
                >
                  {notification.text}
                </div>
              )}

              {/* Renk Seçenekleri & Yükleme Alanı */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#4A5568" }}>
                      Yüklenecek Renk Varyantı:
                    </span>
                    {product.colors && product.colors.length > 0 ? (
                      product.colors.map((color) => {
                        const isSelected = activeColor === color.name;
                        const countForColor = currentMedia.filter(
                          (m) =>
                            m.colorId === color.id ||
                            (m as { colorName?: string }).colorName?.toLowerCase() ===
                              color.name.toLowerCase()
                        ).length;

                        return (
                          <button
                            key={color.id || color.name}
                            type="button"
                            onClick={() =>
                              setSelectedColors((prev) => ({
                                ...prev,
                                [product.id]: color.name,
                              }))
                            }
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "0.35rem 0.75rem",
                              borderRadius: "20px",
                              fontSize: "0.75rem",
                              fontWeight: isSelected ? 700 : 500,
                              border: isSelected ? "2px solid #8B2635" : "1px solid #CBD5E0",
                              backgroundColor: isSelected ? "#8B2635" : "#F7FAFC",
                              color: isSelected ? "#FFFFFF" : "#2D3748",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span
                              style={{
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                backgroundColor: color.colorCode || "#141414",
                                border: "1px solid rgba(0,0,0,0.2)",
                              }}
                            />
                            <span>{color.name}</span>
                            <span
                              style={{
                                fontSize: "10px",
                                padding: "1px 5px",
                                borderRadius: "10px",
                                backgroundColor: isSelected ? "rgba(255,255,255,0.25)" : "#E2E8F0",
                                color: isSelected ? "#FFF" : "#4A5568",
                              }}
                            >
                              {countForColor}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "#A0AEC0" }}>
                        Standart Renk
                      </span>
                    )}
                  </div>
                </div>

                {/* Sürükle - Bırak Yükleme Alanı */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDraggingState((prev) => ({ ...prev, [product.id]: true }));
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDraggingState((prev) => ({ ...prev, [product.id]: true }));
                  }}
                  onDragLeave={() => {
                    setDraggingState((prev) => ({ ...prev, [product.id]: false }));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDraggingState((prev) => ({ ...prev, [product.id]: false }));
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleUploadFiles(product, e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRefs.current[product.id]?.click()}
                  style={{
                    border: isDragging ? "2px dashed #8B2635" : "2px dashed #CBD5E0",
                    backgroundColor: isDragging ? "rgba(139, 38, 53, 0.05)" : "#F8FAFC",
                    borderRadius: "8px",
                    padding: "1.25rem",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <input
                    ref={(el) => {
                      fileInputRefs.current[product.id] = el;
                    }}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleUploadFiles(product, e.target.files);
                      }
                    }}
                    style={{ display: "none" }}
                  />

                  {isUploading ? (
                    <div style={{ color: "#8B2635", fontWeight: 600, fontSize: "0.875rem" }}>
                      ⏳ Fotoğraflar optimize ediliyor ve yükleniyor, lütfen bekleyiniz...
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>📸 ⬆️</div>
                      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#2D3748" }}>
                        <strong>{activeColor}</strong> rengi için fotoğrafları buraya sürükleyin veya dosya seçin
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "#A0AEC0", marginTop: "4px" }}>
                        Birden fazla fotoğrafı aynı anda seçebilirsiniz (JPG, PNG, WebP, AVIF)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Galeri Önizleme Izgarası */}
              {currentMedia.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#4A5568" }}>
                    Yüklü Fotoğraflar ({currentMedia.length}):
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: "0.75rem",
                    }}
                  >
                    {currentMedia.map((item, idx) => {
                      const itemColorName =
                        (item as { colorName?: string }).colorName ||
                        product.colors?.find((c) => c.id === item.colorId)?.name ||
                        "Genel";

                      return (
                        <div
                          key={item.id || idx}
                          style={{
                            border: item.isThumbnail ? "2px solid #8B2635" : "1px solid #E2E8F0",
                            borderRadius: "6px",
                            overflow: "hidden",
                            backgroundColor: "#F8FAFC",
                            display: "flex",
                            flexDirection: "column",
                            position: "relative",
                          }}
                        >
                          <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 4" }}>
                            <Image
                              src={item.thumbnailUrl || item.url}
                              alt={item.altText || product.title}
                              fill
                              unoptimized={(item.thumbnailUrl || item.url).startsWith("data:")}
                              sizes="140px"
                              style={{ objectFit: "cover" }}
                            />

                            {/* Kapak Rozeti */}
                            {item.isThumbnail && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: "4px",
                                  left: "4px",
                                  backgroundColor: "#8B2635",
                                  color: "#FFF",
                                  fontSize: "9px",
                                  fontWeight: 700,
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  textTransform: "uppercase",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                                }}
                              >
                                ⭐ Kapak
                              </span>
                            )}

                            {/* Renk Rozeti */}
                            <span
                              style={{
                                position: "absolute",
                                bottom: "4px",
                                left: "4px",
                                backgroundColor: "rgba(0,0,0,0.75)",
                                color: "#FFF",
                                fontSize: "9px",
                                fontWeight: 600,
                                padding: "2px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              {itemColorName}
                            </span>
                          </div>

                          {/* Kart Alt Kontrolleri */}
                          <div
                            style={{
                              padding: "0.4rem",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.35rem",
                              backgroundColor: "#FFFFFF",
                            }}
                          >
                            {/* Rengi Değiştir Seçici */}
                            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                              <select
                                value={itemColorName}
                                onChange={(e) => handleChangeColor(product, idx, e.target.value)}
                                className="hm-admin-select"
                                style={{
                                  fontSize: "0.6875rem",
                                  padding: "0.2rem",
                                  width: "100%",
                                  backgroundColor: "#F7FAFC",
                                }}
                                title="Fotoğrafın ait olduğu rengi değiştirin"
                              >
                                {product.colors && product.colors.length > 0 ? (
                                  product.colors.map((c) => (
                                    <option key={c.name} value={c.name}>
                                      {c.name}
                                    </option>
                                  ))
                                ) : (
                                  <option value="Genel">Genel</option>
                                )}
                              </select>
                            </div>

                            {/* Sıralama, Kapak ve Sil Butonları */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "0.25rem",
                              }}
                            >
                              <div style={{ display: "flex", gap: "2px" }}>
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMove(product, idx, "left")}
                                  style={{
                                    fontSize: "0.6875rem",
                                    padding: "2px 5px",
                                    background: "#EDF2F7",
                                    border: "1px solid #CBD5E0",
                                    borderRadius: "3px",
                                    cursor: idx === 0 ? "not-allowed" : "pointer",
                                    opacity: idx === 0 ? 0.4 : 1,
                                  }}
                                  title="Öne Al"
                                >
                                  ◀
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === currentMedia.length - 1}
                                  onClick={() => handleMove(product, idx, "right")}
                                  style={{
                                    fontSize: "0.6875rem",
                                    padding: "2px 5px",
                                    background: "#EDF2F7",
                                    border: "1px solid #CBD5E0",
                                    borderRadius: "3px",
                                    cursor: idx === currentMedia.length - 1 ? "not-allowed" : "pointer",
                                    opacity: idx === currentMedia.length - 1 ? 0.4 : 1,
                                  }}
                                  title="Sona Al"
                                >
                                  ▶
                                </button>
                              </div>

                              {!item.isThumbnail && (
                                <button
                                  type="button"
                                  onClick={() => handleSetCover(product, idx)}
                                  style={{
                                    fontSize: "0.6875rem",
                                    color: "#4A5568",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                  }}
                                  title="Bu rengin kapak fotoğrafı yap"
                                >
                                  Kapak Yap
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeleteMedia(product, idx)}
                                style={{
                                  fontSize: "0.6875rem",
                                  color: "#E53E3E",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  marginLeft: "auto",
                                }}
                                title="Görseli Sil"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

