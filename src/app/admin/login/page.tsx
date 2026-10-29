"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "@/styles/admin.css";

function getSafeRedirectUrl(target: string | null): string {
  if (!target) return "/admin";
  const trimmed = target.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes(":")
  ) {
    return "/admin";
  }
  return trimmed;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = getSafeRedirectUrl(searchParams.get("from"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Giriş başarısız. Lütfen bilgilerinizi kontrol ediniz.");
        setIsLoading(false);
        return;
      }

      if (data.user?.role === "CARRIER") {
        router.push("/kargo");
      } else {
        router.push(redirectTarget);
      }
      router.refresh();
    } catch {
      setError("Bağlantı hatası oluştu. Lütfen tekrar deneyiniz.");
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#121316",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        fontFamily: "var(--hm-font-sans)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          backgroundColor: "#FFFFFF",
          borderRadius: "8px",
          padding: "2.5rem 2rem",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
      >
        {/* Logo ve Başlık */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <span
            style={{
              fontFamily: "var(--hm-font-display)",
              fontSize: "1.5rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              display: "block",
              color: "#141414",
              fontWeight: 500,
            }}
          >
            HÜMRA MODA
          </span>
          <span
            style={{
              fontSize: "0.625rem",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "#718096",
              display: "block",
              marginTop: "4px",
            }}
          >
            YÖNETİM PANELİ
          </span>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: "#FFF5F5",
              border: "1px solid #FEB2B2",
              color: "#C53030",
              padding: "0.75rem 1rem",
              borderRadius: "4px",
              fontSize: "0.8125rem",
              marginBottom: "1.5rem",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label className="hm-admin-label" htmlFor="admin-email">
              E-Posta Adresi
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@humramoda.com"
              className="hm-admin-input"
              autoComplete="email"
              autoFocus
            />
          </div>

          <div>
            <label className="hm-admin-label" htmlFor="admin-password">
              Yönetici Şifresi
            </label>
            <input
              id="admin-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="hm-admin-input"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="hm-admin-btn hm-admin-btn-primary"
            style={{
              width: "100%",
              padding: "0.75rem",
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            {isLoading ? "Giriş Yapılıyor..." : "Güvenli Giriş Yap"}
          </button>
        </form>

        <div
          style={{
            marginTop: "2rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid var(--hm-admin-border-subtle)",
            textAlign: "center",
            fontSize: "0.75rem",
            color: "#A0AEC0",
          }}
        >
          <span>🔒 256-Bit SSL Korumalı Yönetici Alanı</span>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", backgroundColor: "#121316" }} />}>
      <LoginForm />
    </Suspense>
  );
}

