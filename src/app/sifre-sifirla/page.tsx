"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/Container";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!token) {
      setErrorMsg("Geçersiz veya eksik şifre sıfırlama bağlantısı.");
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg("Yeni şifreniz en az 6 karakter olmalıdır.");
      return;
    }
    if (password !== passwordRepeat) {
      setErrorMsg("Şifreler birbiriyle eşleşmiyor.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, passwordRepeat }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Şifre sıfırlama işlemi başarısız oldu.");
      } else {
        setSuccess(true);
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
              Yeni Şifre Belirleme
            </span>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--hm-color-text-muted)",
                marginTop: "0.5rem",
              }}
            >
              Hesabınız için lütfen güçlü ve yeni bir şifre giriniz.
            </p>
          </div>

          {!token && (
            <div
              style={{
                backgroundColor: "rgba(220, 38, 38, 0.08)",
                border: "1px solid rgba(220, 38, 38, 0.2)",
                color: "#DC2626",
                padding: "1rem",
                borderRadius: "var(--hm-radius-sm)",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
                textAlign: "center",
              }}
            >
              Şifre sıfırlama kodu (token) eksik veya geçersiz. Lütfen e-postanıza gelen bağlantıya tekrar tıklayınız.
            </div>
          )}

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

          {success ? (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(34, 197, 94, 0.12)",
                  color: "#16A34A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1.25rem auto",
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3
                style={{
                  fontFamily: "var(--hm-font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 600,
                  color: "var(--hm-color-text-main)",
                  marginBottom: "0.5rem",
                }}
              >
                Şifreniz Güncellendi
              </h3>
              <p style={{ fontSize: "0.875rem", color: "var(--hm-color-text-muted)", marginBottom: "2rem" }}>
                Yeni şifreniz başarıyla kaydedildi. Artık yeni şifrenizle giriş yapabilirsiniz.
              </p>
              <Link
                href="/giris"
                style={{
                  display: "inline-block",
                  padding: "0.875rem 2rem",
                  backgroundColor: "var(--hm-color-text-main)",
                  color: "#FFF",
                  borderRadius: "var(--hm-radius-sm)",
                  fontSize: "0.875rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Giriş Yap →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Yeni Şifre */}
              <div>
                <label
                  htmlFor="password"
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
                  Yeni Şifre
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="En az 6 karakter"
                    style={{
                      width: "100%",
                      padding: "0.75rem 2.5rem 0.75rem 1rem",
                      border: "1px solid var(--hm-color-border-subtle)",
                      borderRadius: "var(--hm-radius-sm)",
                      fontSize: "0.9375rem",
                      backgroundColor: "var(--hm-color-bg-base)",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    style={{
                      position: "absolute",
                      right: "0.75rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--hm-color-text-muted)",
                      cursor: "pointer",
                      padding: "0.25rem",
                    }}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="23" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Yeni Şifre Tekrar */}
              <div>
                <label
                  htmlFor="passwordRepeat"
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
                  Yeni Şifre Tekrar
                </label>
                <input
                  id="passwordRepeat"
                  name="passwordRepeat"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={passwordRepeat}
                  onChange={(e) => setPasswordRepeat(e.target.value)}
                  placeholder="Şifrenizi tekrar giriniz"
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
                disabled={loading || !token}
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
                  cursor: loading || !token ? "not-allowed" : "pointer",
                  opacity: loading || !token ? 0.7 : 1,
                }}
              >
                {loading ? "Şifre Güncelleniyor..." : "Şifreyi Güncelle"}
              </button>
            </form>
          )}
        </div>
      </Container>
    </div>
  );
}

