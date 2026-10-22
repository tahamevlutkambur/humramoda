import React from "react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PrintButton } from "@/components/ui/PrintButton";
import { getStoreSettings } from "@/lib/server/store";

export const metadata: Metadata = {
  title: "Mesafeli Satış Sözleşmesi | Hümra Moda",
  description:
    "Hümra Moda e-ticaret platformu üzerinden gerçekleştirilen alışverişlere ilişkin Mesafeli Satış Sözleşmesi, cayma hakkı ve teslimat koşulları.",
};

export default function DistanceSellingContractPage() {
  const settings = getStoreSettings();

  return (
    <div style={{ backgroundColor: "#FFFFFF", padding: "var(--hm-space-12) 0 var(--hm-space-20)" }}>
      <Container>
        <div style={{ maxWidth: "860px", margin: "0 auto" }}>
          {/* Üst Bilgi ve Yazdır Butonu */}
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
                Yasal Bilgilendirme ve Sözleşmeler
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
                Mesafeli Satış Sözleşmesi
              </h1>
              <div style={{ fontSize: "var(--hm-text-xs)", color: "var(--hm-color-text-muted)", marginTop: "0.5rem" }}>
                Sözleşme Sürümü: <strong>2026-v1.0</strong> | Son Güncelleme: <strong>21 Ekim 2026</strong>
              </div>
            </div>

            <PrintButton />
          </div>

          {/* Hukuki İnceleme Notu */}
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
            <strong>Önemli Bilgilendirme:</strong> İşbu sözleşme metni, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve
            Mesafeli Sözleşmeler Yönetmeliği hükümleri gözetilerek teknik altyapı amacıyla hazırlanmıştır. Şirket unvanı,
            vergi bilgileri ve teslimat süreleri kurumsal yönetim paneli üzerinden yapılandırılmakta olup mağaza hukuk
            müşavirinin nihai incelemesine tabidir.
          </div>

          {/* Sözleşme Maddeleri */}
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
                Madde 1 — Taraflar
              </h2>
              <div style={{ backgroundColor: "#F8FAFC", padding: "1rem", borderRadius: "6px", marginBottom: "0.75rem" }}>
                <strong style={{ display: "block", marginBottom: "0.25rem" }}>1.1. SATICI BİLGİLERİ</strong>
                <div>Ticari Unvan: {settings.companyTitle || "Hümra Moda [Hukuki Unvan Tescil Aşamasında]"}</div>
                <div>Adres: {settings.address}</div>
                <div>Telefon: {settings.phone} | WhatsApp: {settings.whatsapp}</div>
                <div>E-Posta: {settings.email}</div>
                <div>Vergi Dairesi / No: {settings.taxOffice || "Beşiktaş V.D."} / {settings.taxNumber || "[Vergi No: Panelden Belirlenecek]"}</div>
                <div>MERSİS No: {settings.mersisNumber || "[Mersis No: Panelden Belirlenecek]"}</div>
              </div>
              <p>
                <strong>1.2. ALICI (TÜKETİCİ) BİLGİLERİ:</strong> Sipariş aşamasında ALICI tarafından sisteme girilen ad, soyad,
                teslimat adresi, telefon ve e-posta bilgileri esas alınır. Sipariş onayı anında bu bilgiler sistemde zaman
                damgasıyla sabitlenir (snapshot) ve sözleşmenin ayrılmaz parçasını oluşturur.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Madde 2 — Sözleşmenin Konusu
              </h2>
              <p>
                İşbu sözleşmenin konusu, ALICI&apos;nın SATICI&apos;ya ait <strong>{settings.storeName}</strong> elektronik ticaret
                sitesi üzerinden siparişini verdiği, nitelikleri ve satış fiyatı sipariş özetinde belirtilen ürünlerin satışı,
                teslimi ve tarafların hak ve yükümlülüklerinin 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli
                Sözleşmeler Yönetmeliği hükümleri gereğince düzenlenmesidir.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Madde 3 — Sözleşme Konusu Malın Özellikleri ve Ödeme
              </h2>
              <p>
                Malın cinsi, türü, miktarı, rengi, adedi, satış bedeli ve ödeme koşulları siparişin tamamlandığı andaki sepet
                özeti ve faturada belirtildiği gibidir. SATICI, PayTR altyapısı üzerinden 3D Secure ve 256-Bit SSL güvencesiyle
                ödeme tahsilatı gerçekleştirir. Kart bilgileri SATICI sunucularında kesinlikle saklanmaz.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Madde 4 — Teslimat Koşulları ve Masrafları
              </h2>
              <p>
                Ürünler, ALICI&apos;nın sipariş formunda belirttiği teslimat adresine, anlaşmalı kargo firması (Yurtiçi Kargo,
                Aras Kargo, MNG Kargo veya PTT Kargo) aracılığıyla teslim edilir. Teslimat süresi yasal 30 günlük azami süreyi
                aşmamak kaydıyla, sipariş onayından itibaren olağan koşullarda 1 ila 5 iş günüdür. Sepet tutarı {settings.freeShippingThreshold} ₺
                ve üzerinde olduğunda kargo ücreti SATICI tarafından karşılanır.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Madde 5 — Cayma Hakkı ve İade Şartları
              </h2>
              <p>
                5.1. ALICI, hiçbir hukuki ve cezai sorumluluk üstlenmeksizin ve hiçbir gerekçe göstermeksizin, mal teslimine
                ilişkin sözleşmelerde malı teslim aldığı tarihten itibaren <strong>14 (on dört) gün</strong> içerisinde cayma hakkını
                kullanabilir.
              </p>
              <p>
                5.2. Cayma hakkının kullanılması için bu süre içinde SATICI&apos;ya sitemizdeki <strong>/iade-degisim</strong> sayfası
                üzerinden veya yazılı olarak bildirimde bulunulması şarttır.
              </p>
              <p>
                5.3. <strong>İade Şartları:</strong> İade edilecek ürünlerin kutusu, ambalajı, varsa standart aksesuarları ve
                koparılmamış orijinal ürün etiketleri ile birlikte eksiksiz ve hasarsız olarak teslim edilmesi gerekmektedir.
                Kullanılmış, yıkanmış, tadilat görmüş veya orijinalliği bozulmuş ürünlerin iadesi kabul edilmez.
              </p>
              <p>
                5.4. Cayma bildiriminin ve ürünün SATICI&apos;ya ulaşmasını ve depo kalite kontrolünün tamamlanmasını takiben,
                tahsil edilen bedel en geç 14 gün içerisinde ALICI&apos;nın ödeme yaptığı kart veya hesaba iade edilir.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Madde 6 — Uyuşmazlıkların Çözümü
              </h2>
              <p>
                İşbu sözleşmenin uygulanmasında, Ticaret Bakanlığı&apos;nca ilan edilen değere kadar Tüketici Hakem Heyetleri ile
                ALICI&apos;nın veya SATICI&apos;nın yerleşim yerindeki Tüketici Mahkemeleri yetkilidir.
              </p>
            </section>
          </div>
        </div>
      </Container>
    </div>
  );
}
