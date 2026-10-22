import React from "react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PrintButton } from "@/components/ui/PrintButton";
import { getStoreSettings } from "@/lib/server/store";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni | Hümra Moda",
  description:
    "6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) uyarınca Hümra Moda müşterileri ve web sitesi ziyaretçileri için hazırlanmış Aydınlatma Metni.",
};

export default function KvkkClarificationPage() {
  const settings = getStoreSettings();

  return (
    <div style={{ backgroundColor: "#FFFFFF", padding: "var(--hm-space-12) 0 var(--hm-space-20)" }}>
      <Container>
        <div style={{ maxWidth: "860px", margin: "0 auto" }}>
          {/* Üst Bilgi ve Yazdır */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              borderBottom: "1px solid var(--hm-color-border-subtle)",
              paddingBottom: "var(--hm-space-6)",
              marginBottom: "var(--hm-space-8)",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
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
                6698 Sayılı Kanun Uyarınca
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
                KVKK Aydınlatma Metni
              </h1>
              <div style={{ fontSize: "var(--hm-text-xs)", color: "var(--hm-color-text-muted)", marginTop: "0.5rem" }}>
                Metin Sürümü: <strong>2026-v1.0</strong> | Son Güncelleme: <strong>21 Ekim 2026</strong>
              </div>
            </div>

            <PrintButton />
          </div>

          {/* Hukuki Uyarı */}
          <div
            style={{
              padding: "1rem",
              backgroundColor: "#FFFBEB",
              border: "1px solid #FDE68A",
              borderRadius: "6px",
              fontSize: "var(--hm-text-xs)",
              color: "#92400E",
              lineHeight: 1.6,
              marginBottom: "var(--hm-space-8)",
            }}
          >
            <strong>Hukuki Not:</strong> Bu aydınlatma metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&ldquo;KVKK&rdquo;)
            10. maddesi ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca
            hazırlanmıştır. Şirket veri sorumlusu tescil bilgileri yönetim panelinden yapılandırılmakta olup şirket hukuk
            müşavirinin onayına tabidir.
          </div>

          {/* Metin İçeriği */}
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
                1. Veri Sorumlusunun Kimliği
              </h2>
              <div style={{ backgroundColor: "#F8FAFC", padding: "1rem", borderRadius: "6px" }}>
                <div><strong>Unvan:</strong> {settings.companyTitle || "Hümra Moda [Kurumsal Bilgi Girişi Bekleniyor]"}</div>
                <div><strong>Adres:</strong> {settings.address}</div>
                <div><strong>Telefon:</strong> {settings.phone}</div>
                <div><strong>E-Posta:</strong> {settings.email}</div>
                <div><strong>KEP Adresi:</strong> {settings.kepAddress || "[KEP Adresi Tanımlanacak]"}</div>
              </div>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                2. İşlenen Kişisel Veri Kategorileri
              </h2>
              <ul style={{ paddingLeft: "1.5rem" }}>
                <li><strong>Kimlik Verisi:</strong> Ad, soyad.</li>
                <li><strong>İletişim Verisi:</strong> E-posta adresi, telefon numarası, teslimat ve fatura adresi.</li>
                <li><strong>Müşteri İşlem Verisi:</strong> Sipariş geçmişi, iade ve değişim talepleri, sepet kayıtları.</li>
                <li><strong>Finansal Veri:</strong> Ödeme tutarı, ödeme yöntemi (Kredi kartı numarası ve CVV sunucularımızda ASLA tutulmaz, PayTR PCI-DSS onaylı altyapısında işlenir).</li>
                <li><strong>İşlem Güvenliği Verisi:</strong> IP adresi, internet sitesi giriş-çıkış logları, erişim zaman damgaları.</li>
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                3. Kişisel Verilerin İşlenme Amaçları ve Hukuki Sebepleri
              </h2>
              <p>
                Kişisel verileriniz, KVKK&apos;nın 5. maddesinde belirtilen hukuki sebeplere dayanılarak işlenmektedir:
              </p>
              <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
                <li>
                  <strong>Sözleşmenin Kurulması ve İfası (m. 5/2-c):</strong> Mesafeli satış sözleşmesinin kurulması, ürünlerin
                  paketlenmesi, kargo firmaları ile adresinize ulaştırılması, iade ve değişim süreçlerinin yönetilmesi.
                </li>
                <li>
                  <strong>Kanuni Yükümlülüklerin Yerine Getirilmesi (m. 5/2-ç):</strong> 6563 sayılı Elektronik Ticaretin
                  Düzenlenmesi Hakkında Kanun, 6502 sayılı Kanun, 213 sayılı Vergi Usul Kanunu ve 5651 sayılı Kanun gereğince
                  fatura düzenlenmesi ve trafik kayıtlarının saklanması.
                </li>
                <li>
                  <strong>Veri Sorumlusunun Meşru Menfaati (m. 5/2-f):</strong> Bilgi güvenliğinin sağlanması, yetkisiz ve
                  şüpheli sipariş denemelerinin önlenmesi, müşteri memnuniyetinin artırılması.
                </li>
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                4. Kişisel Verilerin Aktarıldığı Taraflar ve Aktarım Amaçları
              </h2>
              <p>
                Kişisel verileriniz, yalnızca yukarıda belirtilen amaçların gerçekleştirilmesi doğrultusunda ve KVKK&apos;nın
                8. ve 9. maddelerine uygun olarak:
              </p>
              <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
                <li><strong>Kargo ve Lojistik Firmalarına:</strong> Siparişlerin fiziksel teslimatı amacıyla (Yurtiçi, Aras, MNG, PTT Kargo).</li>
                <li><strong>Ödeme Kuruluşuna (PayTR):</strong> 3D Secure güvenli ödemenin tahsili amacıyla.</li>
                <li><strong>Yetkili Kamu Kurum ve Kuruluşlarına:</strong> Yasal talep ve mevzuat zorunlulukları halinde (Tüketici Hakem Heyetleri, mahkemeler, Gelir İdaresi Başkanlığı).</li>
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                5. İlgili Kişinin (Veri Sahibinin) Hakları (KVKK Madde 11)
              </h2>
              <p>
                KVKK&apos;nın 11. maddesi uyarınca veri sahipleri; kişisel verilerinin işlenip işlenmediğini öğrenme, işlenmişse
                buna ilişkin bilgi talep etme, işlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme,
                yurt içinde veya yurt dışında kişisel verilerin aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmiş
                olması hâlinde bunların düzeltilmesini isteme, silinmesini veya yok edilmesini talep etme haklarına sahiptir.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                6. Başvuru Yöntemi
              </h2>
              <p>
                Yukarıda belirtilen haklarınızı kullanmak için kimliğinizi tespit edici belgeler ile birlikte{" "}
                <a href={`mailto:${settings.email}`} style={{ color: "var(--hm-color-primary)", textDecoration: "underline" }}>
                  {settings.email}
                </a>{" "}
                adresine kayıtlı e-posta adresiniz üzerinden elektronik posta göndererek veya şirket merkezimize yazılı olarak
                başvurabilirsiniz.
              </p>
            </section>
          </div>
        </div>
      </Container>
    </div>
  );
}
