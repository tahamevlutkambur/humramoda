"use client";

import React from "react";
import { Container } from "@/components/ui/Container";

export default function PrivacyAndCookiePolicyPage() {
  const handleOpenCookiePreferences = () => {
    if (typeof window !== "undefined" && typeof (window as unknown as { __openCookiePreferences?: () => void }).__openCookiePreferences === "function") {
      (window as unknown as { __openCookiePreferences: () => void }).__openCookiePreferences();
    } else {
      alert("Çerez tercihleri penceresi açılıyor...");
    }
  };

  return (
    <div style={{ backgroundColor: "#FFFFFF", padding: "var(--hm-space-12) 0 var(--hm-space-20)" }}>
      <Container>
        <div style={{ maxWidth: "860px", margin: "0 auto" }}>
          {/* Üst Başlık */}
          <div
            style={{
              borderBottom: "1px solid var(--hm-color-border-subtle)",
              paddingBottom: "var(--hm-space-6)",
              marginBottom: "var(--hm-space-8)",
            }}
          >
            <span
              style={{
                fontSize: "var(--hm-text-2xs)",
                letterSpacing: "var(--hm-tracking-wider)",
                textTransform: "uppercase",
                color: "var(--hm-color-text-muted)",
                display: "block",
                marginBottom: "0.25rem",
              }}
            >
              Kişisel Verilerin Korunması ve Gizlilik
            </span>
            <h1
              style={{
                fontFamily: "var(--hm-font-display)",
                fontSize: "clamp(1.75rem, 3.5vw, 2.25rem)",
                fontWeight: "var(--hm-font-regular)",
                letterSpacing: "var(--hm-tracking-tight)",
                color: "var(--hm-color-text-main)",
              }}
            >
              Gizlilik ve Çerez Politikası
            </h1>
            <div style={{ fontSize: "var(--hm-text-xs)", color: "var(--hm-color-text-muted)", marginTop: "0.5rem" }}>
              Son Güncelleme: <strong>21 Ekim 2026</strong> | Politika Sürümü: <strong>2026-v1.0</strong>
            </div>
          </div>

          {/* İçerik */}
          <div
            style={{
              fontSize: "var(--hm-text-sm)",
              lineHeight: 1.8,
              color: "var(--hm-color-text-main)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--hm-space-6)",
            }}
          >
            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                1. Giriş ve Kapsam
              </h2>
              <p>
                Hümra Moda (&ldquo;Şirketimiz&rdquo;) olarak ziyaretçilerimizin ve müşterilerimizin gizlilik haklarına azami
                saygı gösteriyoruz. İşbu Gizlilik ve Çerez Politikası, web sitemizi ziyaret ettiğinizde, sipariş
                oluşturduğunuzda veya bizimle iletişime geçtiğinizde toplanan kişisel verilerin nasıl işlendiğini, saklandığını
                ve çerezlerin hangi amaçlarla kullanıldığını şeffaf bir biçimde açıklamaktadır.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                2. Gerçek Sistem Davranışına Dayalı Veri İşleme
              </h2>
              <p>
                Sitemizde yalnızca e-ticaret hizmetinin sunulması, ödemelerin güvenli tahsili ve siparişlerin teslimatı için
                zorunlu olan veriler işlenir. <strong>Kullanılmayan hiçbir reklam izleyicisi veya üçüncü taraf casus yazılım
                çalıştırılmamaktadır.</strong>
              </p>
              <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
                <li>
                  <strong>Sipariş ve Teslimat Bilgileri:</strong> Ad-soyad, teslimat adresi, telefon ve e-posta (siparişin
                  faturası, kargo takibi ve teslimatı için).
                </li>
                <li>
                  <strong>Ödeme Güvenliği:</strong> Ödemeler PayTR altyapısıyla 3D Secure güvencesinde gerçekleştirilir. Kart
                  numaranız, son kullanma tarihi veya CVV kodunuz sunucularımızda <em>kesinlikle saklanmaz</em>.
                </li>
                <li>
                  <strong>İşlem Güvenliği ve Loglar:</strong> Bilgi güvenliği ve yasal yükümlülükler uyarınca IP adresiniz,
                  işlem zaman damgaları ve sistem hata kayıtları şifreli biçimde denetim kayıtlarımızda tutulur.
                </li>
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                3. Çerez (Cookie) Kullanımı ve Türleri
              </h2>
              <p>
                Çerezler, web sitemizin düzgün çalışabilmesi ve kullanıcı oturumunun korunabilmesi amacıyla tarayıcınıza
                kaydedilen küçük metin dosyalarıdır. Sitemizde kullanılan çerezler aşağıdaki gibidir:
              </p>

              <div style={{ display: "grid", gap: "1rem", marginTop: "0.75rem" }}>
                <div style={{ backgroundColor: "#F8FAFC", padding: "1rem", borderRadius: "6px" }}>
                  <strong style={{ display: "block", color: "#1E293B" }}>
                    A. Zorunlu ve Teknik Çerezler (Her Zaman Aktif)
                  </strong>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#64748B" }}>
                    Sitenin temel işlevlerini yürütmesi için teknik olarak gereklidir. Bu çerezler olmadan sepet yönetimi,
                    yönetici oturumu ve güvenli ödeme doğrulanamaz:
                  </p>
                  <ul style={{ fontSize: "0.8125rem", marginTop: "0.25rem", paddingLeft: "1.25rem" }}>
                    <li><code>cookie_consent</code>: Çerez izin tercihlerinizi saklar.</li>
                    <li><code>admin_token</code>: Yetkili personel oturum güvenliğini sağlar (HttpOnly, Secure).</li>
                    <li><code>cart_session</code> (LocalStorage): Alışveriş sepetinizin kaybolmasını önler.</li>
                  </ul>
                </div>

                <div style={{ backgroundColor: "#F8FAFC", padding: "1rem", borderRadius: "6px" }}>
                  <strong style={{ display: "block", color: "#1E293B" }}>
                    B. İsteğe Bağlı Fonksiyonel ve Analitik Çerezler
                  </strong>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#64748B" }}>
                    Site hızını optimize etmek ve kullanıcı deneyimini geliştirmek amacıyla açık rızanız doğrultusunda
                    kullanılır. Açık onayınız olmadan hiçbir isteğe bağlı çerez veya harici izleme aracı çalıştırılmaz.
                  </p>
                </div>
              </div>
            </section>

            {/* Çerez Tercihlerini Yönet Butonu */}
            <div
              style={{
                backgroundColor: "rgba(180, 83, 9, 0.05)",
                border: "1px solid rgba(180, 83, 9, 0.2)",
                borderRadius: "8px",
                padding: "1.25rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <strong style={{ display: "block", fontSize: "var(--hm-text-sm)", color: "#92400E" }}>
                  Çerez Tercihlerinizi İstediğiniz Zaman Değiştirebilirsiniz
                </strong>
                <span style={{ fontSize: "var(--hm-text-xs)", color: "#B45309" }}>
                  Zorunlu çerezler haricindeki tercihlerinizi dilediğiniz zaman güncelleyebilir veya geri alabilirsiniz.
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenCookiePreferences}
                style={{
                  padding: "0.6rem 1.25rem",
                  fontSize: "var(--hm-text-xs)",
                  fontWeight: 600,
                  backgroundColor: "#141414",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Çerez Tercihlerini Yönet
              </button>
            </div>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                4. Veri Güvenliği ve Saklama Süreleri
              </h2>
              <p>
                Kişisel verileriniz güncel güvenlik standartlarına (SSL/TLS, veri maskeleme, timing-safe hash) uygun olarak
                korunur. Verileriniz Türk Ticaret Kanunu, Vergi Usul Kanunu ve Elektronik Ticaretin Düzenlenmesi Hakkında Kanun
                kapsamındaki yasal saklama süreleri boyunca muhafaza edilir; sürenin dolmasını müteakip silinir veya anonim hale
                getirilir.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                5. İletişim ve Veri Sahibi Başvurusu
              </h2>
              <p>
                Gizlilik politikamız ve çerez uygulamalarımız hakkında her türlü soru ve talebiniz için{" "}
                <a href="mailto:destek@humramoda.com" style={{ color: "var(--hm-color-primary)", textDecoration: "underline" }}>
                  destek@humramoda.com
                </a>{" "}
                adresi üzerinden Veri Sorumlumuza başvurabilirsiniz.
              </p>
            </section>
          </div>
        </div>
      </Container>
    </div>
  );
}
