"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [debugResetUrl, setDebugResetUrl] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setDebugResetUrl(null);

    if (!email.trim() || !email.includes("@")) {
      setErrorMsg("Lütfen geçerli bir e-posta adresi giriniz.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Talebiniz işlenemedi.");
      } else {
        setSuccessMsg(
          data.message ||
            "Eğer bu e-posta adresi sistemimizde kayıtlıysa, şifre sıfırlama bağlantısı oluşturulmuştur."
        );
        if (data.debugResetUrl) {
          setDebugResetUrl(data.debugResetUrl);
        }
      }
    } catch {
      setErrorMsg("Bir bağlantı hatası oluştu. Lütfen tekrar deneyiniz.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: "var(--hm-color-bg-base)", minHeight: "80vh", padding: "4rem 0" }}>
      <Container>
        <div
          style={{
            maxWidth: "460px",
            margin: "0 auto",
            backgroundColor: "var(--hm-color-surface)",
            border: "1px solid var(--hm-color-border-subtle)",
            borderRadius: "var(--hm-radius-md)",
            padding: "clamp(1.5rem, 5vw, 2.5rem)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.03)",
          }}
        >
          {/* Başlık */}
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <span
              style={{
                fontFamily: "var(--hm-font-display)",
                fontSize: "1.75rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 500,
                color: "var(--hm-color-text-main)",
                display: "block",
              }}
            >
              Şifremi Unuttum
            </span>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--hm-color-text-muted)",
                marginTop: "0.5rem",
              }}
            >
              Hesabınıza ait e-posta adresinizi girin. Şifrenizi yenilemeniz için güvenli bir bağlantı oluşturulacaktır.
            </p>
          </div>

          {/* Hata Bildirimi */}
          {errorMsg && (
            <div
              style={{
                backgroundColor: "rgba(220, 38, 38, 0.08)",
                border: "1px solid rgba(220, 38, 38, 0.2)",
                color: "#DC2626",
                padding: "0.875rem 1rem",
                borderRadius: "var(--hm-radius-sm)",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Başarı Bildirimi */}
          {successMsg && (
            <div
              style={{
                backgroundColor: "rgba(34, 197, 94, 0.08)",
                border: "1px solid rgba(34, 197, 94, 0.2)",
                color: "#16A34A",
                padding: "0.875rem 1rem",
                borderRadius: "var(--hm-radius-sm)",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
              }}
            >
              {successMsg}
            </div>
          )}

          {/* Yerel Geliştirme Simülasyon Bağlantısı */}
          {debugResetUrl && (
            <div
              style={{
                backgroundColor: "rgba(217, 119, 6, 0.08)",
                border: "1px solid rgba(217, 119, 6, 0.25)",
                color: "#B45309",
                padding: "1rem",
                borderRadius: "var(--hm-radius-sm)",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
              }}
            >
              <span style={{ fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                🛠️ Geliştirici / Test Ortamı Bağlantısı:
              </span>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.8125rem" }}>
                Yerel geliştirme modunda SMTP bağlantısı olmadan test edebilmeniz için şifre sıfırlama bağlantısı üretildi:
              </p>
              <Link
                href={debugResetUrl}
                style={{
                  display: "inline-block",
                  padding: "0.5rem 0.875rem",
                  backgroundColor: "#B45309",
                  color: "#FFF",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Şifre Sıfırlama Ekranını Aç →
              </Link>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label
                htmlFor="email"
                style={{
                  display: "block",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--hm-color-text-secondary)",
                  marginBottom: "0.375rem",
                }}
              >
                Kayıtlı E-posta Adresi
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@alanadi.com"
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  border: "1px solid var(--hm-color-border-subtle)",
                  borderRadius: "var(--hm-radius-sm)",
                  fontSize: "0.9375rem",
                  backgroundColor: "var(--hm-color-bg-base)",
                  outline: "none",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "0.5rem",
                width: "100%",
                padding: "0.875rem",
                backgroundColor: "var(--hm-color-text-main)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "var(--hm-radius-sm)",
                fontSize: "0.875rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Gönderiliyor..." : "Sıfırlama Bağlantısı Gönder"}
            </button>
          </form>

          <div
            style={{
              textAlign: "center",
              marginTop: "2rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid var(--hm-color-border-subtle)",
              fontSize: "0.875rem",
              color: "var(--hm-color-text-secondary)",
            }}
          >
            Hatırladınız mı?{" "}
            <Link
              href="/giris"
              style={{
                color: "var(--hm-color-text-main)",
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              Giriş Ekranına Dön
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}

