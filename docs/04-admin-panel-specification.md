# Hümra Moda — Türkçe Yönetici Paneli (Admin) Spesifikasyonu

## 1. Panel Amacı ve İlkeleri
Yönetici paneli; mağaza sahibinin ve yetkili personelin hiçbir teknik bilgiye veya kaynak kod düzenlemesine ihtiyaç duymadan, mağazanın tüm ürünlerini, renge özel görsellerini, stoklarını, siparişlerini, vitrin afişlerini ve kampanya kurallarını yönetebileceği güvenli bir yönetim arayüzüdür.

- **Dil:** %100 Doğru ve Akıcı Türkçe (Eksiksiz diyakritik harfler: ç, ğ, ı, ö, ş, ü).
- **Arayüz Tasarımı:** Sade, yüksek kontrastlı, lüks editoryal stile uygun minimalist tasarım; karmaşık olmayan sezgisel formlar.
- **Güvenlik:** Sadece `ADMIN` ve `STAFF` rollerine açık, `HttpOnly` güvenli çerez doğrulamalı, oturum düşme korumalı.

---

## 2. Navigasyon Haritası ve Veritabanı Eşleşmesi

| Menü Başlığı | Rota (URL) | Yönetilen Fonksiyonlar | Eşleşen Veritabanı Tablosu |
|---|---|---|---|
| **1. Gösterge Paneli** | `/admin` | Günlük ciro, bekleyen siparişler, kritik stok uyarıları, son işlemler. | `Order`, `ProductVariant` |
| **2. Ürün Yönetimi** | `/admin/urunler` | Ürün listesi, arama, filtreleme, yeni ürün ekleme, düzenleme, silme. | `Product` |
| **3. Varyant & Stok** | `/admin/urunler/[id]/varyantlar` | Renk ekleme/düzenleme, beden matrisi oluşturma, SKU tanımlama, stok girişi. | `ProductColor`, `ProductSize`, `ProductVariant` |
| **4. Medya & Galeri** | `/admin/urunler/[id]/medya` | Sürükle-bırak görsel/video yükleme, renge görsel atama, kapak resmi seçimi, sıralama. | `ProductMedia` |
| **5. Kategoriler** | `/admin/kategoriler` | Kategori ağacı, üst/alt kategori ilişkisi, menü sırası, görsel ve SEO açıklaması. | `Category` |
| **6. Koleksiyonlar** | `/admin/koleksiyonlar` | "Yeni Koleksiyon", "Çok Satanlar", "1 Alana 1 Bedava" gibi etiket/koleksiyon grupları. | `Collection`, `ProductCollection` |
| **7. Sipariş Yönetimi** | `/admin/siparisler` | Sipariş listesi, durum güncelleme (Ödendi, Hazırlanıyor, Kargolandı, İade), kargo takip no girişi, PayTR işlem logu. | `Order`, `OrderItem`, `PaymentTransaction` |
| **8. Vitrin & Bloklar** | `/admin/vitrin` | Ana sayfa slider'ı, dikey video afişleri, 2'li bannerlar, ürün karuselleri düzenleme, masaüstü/mobil görsel yükleme. | `HomepageBlock`, `BlockItem` |
| **9. Kampanyalar** | `/admin/kampanyalar` | "Sepette %10 İndirim", ücretsiz kargo barı eşiği, indirim kuponları tanımlama. | `DiscountCampaign`, `StoreSetting` |
| **10. Müşteriler** | `/admin/musteriler` | Kayıtlı müşteriler, sipariş geçmişleri, kayıt tarihleri. | `User`, `Address` |
| **11. Mağaza Ayarları** | `/admin/ayarlar` | Logo, favicon, WhatsApp destek hattı, Instagram linki, mağaza unvanı, fatura bilgileri. | `StoreSetting` |
| **12. Hukuki Metinler** | `/admin/sayfalar` | Mesafeli Satış Sözleşmesi, İade ve Değişim Koşulları, KVKK Aydınlatma Metni, Çerez Politikası. | `StoreSetting` (veya `LegalPage`) |

---

## 3. Kritik Modüllerin Form ve Arayüz Detayları

### 3.1. Ürün & Varyant Oluşturma Sihirbazı
1. **Adım 1: Temel Bilgiler:**
   - Ürün Başlığı (Türkçe)
   - Kategori Seçimi (Açılır kutu)
   - Koleksiyon Seçimi (Çoklu seçim etiketleri)
   - Fiyat: Normal Fiyat (₺) ve İndirimli Satış Fiyatı (₺)
   - Ön Sipariş Durumu: Açık/Kapalı + Tahmini Kargo Tarihi
   - Rozet: "Yeni Ürün", "Çok Satan", "Sınırlı Stok" vb.
   - Detaylı Açıklama (Kumaş içeriği, manken ölçüleri)
2. **Adım 2: Renk ve Beden Matrisi:**
   - Renk Ekleme: Renk Adı (örn: "Haki"), Hex Kodu renk paletinden seçici (Color Picker).
   - Beden Ekleme: Hızlı beden şablonları ("1 Beden / 2 Beden", "S / M / L / XL" veya serbest giriş).
   - "Matrisi Oluştur" butonu tıklandığında:
     - Sistem otomatik olarak her kombinasyon için (Renk x Beden) bir satır açar.
     - Otomatik benzersiz SKU üretir (Örn: `HM-8921-HKI-B1`).
     - Stok miktarı girişi ve barkod alanı sunar.
3. **Adım 3: Renge Özel Medya Yükleyici:**
   - Sayfada renk sekmeleri bulunur: `[Tümü]`, `[Siyah]`, `[Haki]`, `[Bordo]`.
   - "Haki" sekmesi seçilip fotoğraflar/videolar yüklendiğinde, yüklenen medyalar otomatik olarak `colorId` ile ilişkilendirilir.
   - Görseller sürükle-bırak yöntemiyle yeniden sıralanabilir (`displayOrder`).
   - "Kapak Fotoğrafı Yap" düğmesiyle ana vitrin görseli belirlenir.

### 3.2. Sipariş Detayı ve Kargo Entegrasyonu
- **Müşteri ve Teslimat Bilgisi:** Alıcı adı, teslimat adresi (İl, İlçe, Açık Adres), telefon ve e-posta.
- **PayTR Ödeme Özeti:**
  - PayTR Sipariş No (`merchant_oid`)
  - Ödenen Tutar (Kuruş ve TL)
  - Ödeme Zamanı ve Başarı Durumu (Banka Onayı)
- **Kargo İşlemleri:**
  - Kargo Şirketi seçimi (Yurtiçi, Aras, MNG, Sürat, PTT)
  - Kargo Takip Kodu alanı
  - "Kargoya Verildi Olarak İşaretle" tıklandığında sipariş durumu `SHIPPED` olur ve müşteriye bilgilendirme e-postası tetiklenir.

### 3.3. Vitrin ve Ana Sayfa Blok Yöneticisi (No-Code Homepage)
- Mağaza sahibi ana sayfadaki blokları yukarı/aşağı sürükleyerek sıralayabilir.
- **Yeni Blok Ekle:**
  - Blok Tipi: `SLIDER`, `VIDEO_HERO`, `GRID2`, `PRODUCT_CAROUSEL`.
  - Her öğe için: Masaüstü Görseli (Geniş en-boy), Mobil Görseli (Dikey/Kare), Tıklanma Bağlantısı (`link_url`).
  - Video Bloklarında: MP4 yükleme alanı ve otomatik poster belirleme.
