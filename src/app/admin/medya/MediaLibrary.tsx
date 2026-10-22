"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";

export interface MediaFileItem {
  name: string;
  url: string;
  type: "IMAGE" | "VIDEO";
  sizeBytes: number;
}

interface MediaLibraryProps {
  initialFiles: MediaFileItem[];
}

export function MediaLibrary({ initialFiles }: MediaLibraryProps) {
  const [files, setFiles] = useState<MediaFileItem[]>(initialFiles);
  const [filterType, setFilterType] = useState<"ALL" | "IMAGE" | "VIDEO">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    setUploadError("");
    setUploadSuccess("");

    let successCount = 0;
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("prefix", "media");

        const res = await fetch("/api/admin/media/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || !data.media) {
          throw new Error(data.error || `${file.name} yüklenemedi.`);
        }

        const uploaded = data.media;
        const newMedia: MediaFileItem = {
          name: file.name,
          url: uploaded.url,
          type: uploaded.mediaType === "VIDEO" ? "VIDEO" : "IMAGE",
          sizeBytes: file.size,
        };

        setFiles((prev) => [newMedia, ...prev]);
        successCount++;
      }

      setUploadSuccess(`${successCount} dosya başarıyla yüklendi.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      if (err instanceof Error) {
        setUploadError(err.message);
      } else {
        setUploadError("Yükleme sırasında bir hata oluştu.");
      }
    } finally {
      setUploading(false);
    }
  };

  const filtered = files.filter((f) => {
    if (filterType !== "ALL" && f.type !== filterType) return false;
    if (searchQuery && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
            Medya Kütüphanesi
          </h1>
          <p style={{ margin: 0, color: "var(--hm-admin-text-muted)", fontSize: "0.875rem" }}>
            Tüm ürün fotoğrafları, look videoları ve vitrin görsellerini yönetin.
          </p>
        </div>
        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4"
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="hm-admin-btn hm-admin-btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Yükleniyor & İşleniyor..." : "+ Yeni Medya Yükle"}
          </button>
        </div>
      </div>

      {uploadSuccess && (
        <div
          style={{
            padding: "0.875rem 1rem",
            backgroundColor: "#E6F4EA",
            color: "#137333",
            borderRadius: "4px",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
          }}
        >
          {uploadSuccess}
        </div>
      )}

      {uploadError && (
        <div
          style={{
            padding: "0.875rem 1rem",
            backgroundColor: "#FCE8E6",
            color: "#C5221F",
            borderRadius: "4px",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
          }}
        >
          {uploadError}
        </div>
      )}

      {/* Filtre ve Arama Çubuğu */}
      <div
        className="hm-admin-card"
        style={{
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className={`hm-admin-btn ${
              filterType === "ALL" ? "hm-admin-btn-primary" : "hm-admin-btn-outline"
            }`}
            style={{ padding: "0.4rem 0.85rem", fontSize: "0.75rem" }}
            onClick={() => setFilterType("ALL")}
          >
            Tümü ({files.length})
          </button>
          <button
            type="button"
            className={`hm-admin-btn ${
              filterType === "IMAGE" ? "hm-admin-btn-primary" : "hm-admin-btn-outline"
            }`}
            style={{ padding: "0.4rem 0.85rem", fontSize: "0.75rem" }}
            onClick={() => setFilterType("IMAGE")}
          >
            Görseller ({files.filter((f) => f.type === "IMAGE").length})
          </button>
          <button
            type="button"
            className={`hm-admin-btn ${
              filterType === "VIDEO" ? "hm-admin-btn-primary" : "hm-admin-btn-outline"
            }`}
            style={{ padding: "0.4rem 0.85rem", fontSize: "0.75rem" }}
            onClick={() => setFilterType("VIDEO")}
          >
            Videolar ({files.filter((f) => f.type === "VIDEO").length})
          </button>
        </div>

        <div style={{ width: "260px" }}>
          <input
            type="text"
            placeholder="Dosya adına göre ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="hm-admin-input"
            style={{ fontSize: "0.75rem", padding: "0.4rem 0.75rem" }}
          />
        </div>
      </div>

      {/* Medya Izgarası (Grid) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {filtered.map((item, idx) => (
          <div
            key={idx}
            className="hm-admin-card"
            style={{
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                paddingTop: "133.33%", // 3:4 Aspect ratio
                backgroundColor: "#f5f5f5",
              }}
            >
              {item.type === "IMAGE" ? (
                <Image
                  src={item.url}
                  alt={item.name}
                  fill
                  style={{ objectFit: "cover" }}
                  sizes="(max-width: 768px) 50vw, 20vw"
                />
              ) : (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#111",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    gap: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "2rem" }}>▶</span>
                  <span style={{ fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    MP4 Video
                  </span>
                </div>
              )}
            </div>

            <div style={{ padding: "0.75rem", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: "0.25rem",
                  }}
                  title={item.name}
                >
                  {item.name}
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--hm-admin-text-muted)" }}>
                  {formatSize(item.sizeBytes)} • {item.type === "IMAGE" ? "3:4 WebP" : "Video"}
                </div>
              </div>

              <div style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="hm-admin-btn hm-admin-btn-outline"
                  style={{
                    width: "100%",
                    padding: "0.3rem 0.5rem",
                    fontSize: "0.6875rem",
                  }}
                  onClick={() => handleCopy(item.url)}
                >
                  {copiedUrl === item.url ? "✓ Kopyalandı" : "URL Kopyala"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
