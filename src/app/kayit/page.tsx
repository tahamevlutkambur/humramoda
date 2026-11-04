"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCustomerAuth } from "@/context/CustomerAuthContext";
import { Container } from "@/components/ui/Container";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/hesabim";

  const { register, customer } = useCustomerAuth();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    passwordRepeat: "",
    kvkkApproved: false,
    termsApproved: false,
    marketingConsent: false,
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Zaten giriş yapmışsa yönlendir
  React.useEffect(() => {
    if (customer) {
      router.push(redirectUrl);
    }
  }, [customer, redirectUrl, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!formData.fullName.trim()) {
      setErrorMsg("Lütfen adınızı ve soyadınızı giriniz.");
      return;
    }
    if (!formData.email.trim() || !formData.email.includes("@")) {
      setErrorMsg("Lütfen geçerli bir e-posta adresi giriniz.");
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      setErrorMsg("Şifreniz en az 6 karakter olmalıdır.");
      return;
    }
    if (formData.password !== formData.passwordRepeat) {
      setErrorMsg("Şifreler birbiriyle eşleşmiyor.");
      return;
    }
    if (!formData.kvkkApproved) {
      setErrorMsg("Lütfen KVKK Aydınlatma Metni'ni onaylayınız.");
      return;
    }
    if (!formData.termsApproved) {
      setErrorMsg("Lütfen Üyelik Sözleşmesi ve Kullanım Koşulları'nı onaylayınız.");
      return;
    }

    setLoading(true);

    try {
      const res = await register(formData);
      if (!res.success) {
        setErrorMsg(res.error || "Kayıt işlemi başarısız oldu.");
      } else {
        router.push(redirectUrl);
      }
    } catch {
      setErrorMsg("Bir bağlantı hatası oluştu. Lütfen tekrar deneyiniz.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: "var(--hm-color-bg-base)", minHeight: "85vh", padding: "3.5rem 0" }}>
      <Container>
        <div
          style={{
            maxWidth: "520px",
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
              Üye Ol
            </span>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--hm-color-text-muted)",
                marginTop: "0.5rem",
              }}
            >
              Hümra Moda ayrıcalıklarından yararlanmak için hesabınızı oluşturun.
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
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Ad Soyad */}
            <div>
              <label
                htmlFor="fullName"
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
                Ad Soyad <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Örn: Ayşe Yılmaz"
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

            {/* E-posta */}
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
                E-posta Adresi <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
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

            {/* Telefon */}
            <div>
              <label
                htmlFor="phone"
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
                Telefon Numarası
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="05XX XXX XX XX"
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

            {/* Şifre */}
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
                Şifre <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
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
                      <line x1="1" y1="1" x2="23" y2="23" />
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

            {/* Şifre Tekrar */}
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
                Şifre Tekrar <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                id="passwordRepeat"
                name="passwordRepeat"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={formData.passwordRepeat}
                onChange={handleChange}
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

            {/* Onay Kutuları */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
              {/* KVKK */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", cursor: "pointer", fontSize: "0.8125rem", color: "var(--hm-color-text-secondary)" }}>
                <input
                  type="checkbox"
                  name="kvkkApproved"
                  checked={formData.kvkkApproved}
                  onChange={handleChange}
                  required
                  style={{ marginTop: "3px" }}
                />
                <span>
                  <Link href="/kvkk" target="_blank" style={{ textDecoration: "underline", color: "var(--hm-color-text-main)" }}>
                    KVKK Aydınlatma Metni
                  </Link>
                  &apos;ni okudum ve kabul ediyorum. <span style={{ color: "#DC2626" }}>*</span>
                </span>
              </label>

              {/* Üyelik Sözleşmesi */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", cursor: "pointer", fontSize: "0.8125rem", color: "var(--hm-color-text-secondary)" }}>
                <input
                  type="checkbox"
                  name="termsApproved"
                  checked={formData.termsApproved}
                  onChange={handleChange}
                  required
                  style={{ marginTop: "3px" }}
                />
                <span>
                  <Link href="/mesafeli-satis-sozlesmesi" target="_blank" style={{ textDecoration: "underline", color: "var(--hm-color-text-main)" }}>
                    Üyelik Sözleşmesi ve Kullanım Koşulları
                  </Link>
                  &apos;nı okudum ve kabul ediyorum. <span style={{ color: "#DC2626" }}>*</span>
                </span>
              </label>

              {/* Pazarlama İzni (Önceden Seçilmemiş / Ayrı) */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", cursor: "pointer", fontSize: "0.8125rem", color: "var(--hm-color-text-muted)" }}>
                <input
                  type="checkbox"
                  name="marketingConsent"
                  checked={formData.marketingConsent}
                  onChange={handleChange}
                  style={{ marginTop: "3px" }}
                />
                <span>
                  Özel kampanya, indirim ve yeni sezon koleksiyonlarından e-posta ve SMS ile haberdar olmak istiyorum (Ticari elektronik ileti onayı).
                </span>
              </label>
            </div>

            {/* Gönder Butonu */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "1rem",
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
                transition: "opacity 0.2s",
              }}
            >
              {loading ? "Hesap Oluşturuluyor..." : "Kayıt Ol"}
            </button>
          </form>

          {/* Giriş Yap Linki */}
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
            Zaten bir hesabınız var mı?{" "}
            <Link
              href={`/giris?redirect=${encodeURIComponent(redirectUrl)}`}
              style={{
                color: "var(--hm-color-text-main)",
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              Giriş Yapın
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}

