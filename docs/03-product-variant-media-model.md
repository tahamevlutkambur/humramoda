# Hümra Moda — Ürün, Varyant, Renge Özel Galeri ve Medya Mimarisi

## 1. Temel Problem ve İhtiyaç
Kadın giyim ve butik e-ticaretinde müşterinin satın alma kararını doğrudan etkileyen en kritik unsur **renk ve kalıp algısıdır**.
Hümra Moda müşterisi:
1. Ürün detay sayfasına girdiğinde seçtiği rengin (örn: "Siyah") sadece o renge ait fotoğraf ve videolarını görmek ister. Başka bir rengin (örn: "Haki") araya karışması güveni zedeler.
2. Instagram'da veya WhatsApp'ta bir rengi gören kullanıcıya o renge özel doğrudan link (`/urun/qapitone-garnili-scuba-ikili-takim?renk=haki`) paylaşılabilmelidir.
3. Renk değiştirildiğinde, o renge ait bedenlerin stok durumları (tükenenlerin üzeri çizilerek) anında güncellenmelidir.

---

## 2. Renge Özel Galeri ve Varyant Mantığı (Data Flow)

### 2.1. Varlık İlişkileri
```
Product (Ana Ürün: Başlık, Fiyat, Kategori, Genel Açıklama)
  ├── ProductColor (Renkler: Siyah [#111111], Haki [#4b5320], Bordo [#7f1d1d])
  ├── ProductSize (Bedenler: 1 Beden (36-38), 2 Beden (40-42))
  ├── ProductMedia (Görseller ve Videolar)
  │     ├── colorId: [Siyah ID] -> Siyah'ın 6 fotoğrafı + 1 dikey videosu
  │     ├── colorId: [Haki ID]  -> Haki'nin 5 fotoğrafı
  │     └── colorId: null       -> Genel kumaş/detay görselleri
  └── ProductVariant (Stok & SKU Matrisi)
        ├── Siyah + 1 Beden -> SKU: HM-4510-SYH-B1 | Stok: 12
        ├── Siyah + 2 Beden -> SKU: HM-4510-SYH-B2 | Stok: 0  (TÜKENDİ)
        ├── Haki  + 1 Beden -> SKU: HM-4510-HKI-B1 | Stok: 4
        └── Haki  + 2 Beden -> SKU: HM-4510-HKI-B2 | Stok: 8
```

---

## 3. İstemci Tarafı Davranışı ve Paylaşılabilir Renge Özel URL

### 3.1. URL Yapısı ve SEO Koruma
- **Birincil URL:** `/urun/[productSlug]?renk=[colorSlug]`
  - Örnek: `https://humramoda.com/urun/qapitone-garnili-scuba-ikili-takim?renk=bordo`
- **SEO Canonical Yönetimi:** Google'ın yinelenen içerik (duplicate content) cezası vermemesi için, tüm renk parametreli sayfalarda canonical etiket ana ürüne bağlanır:
  ```html
  <link rel="canonical" href="https://humramoda.com/urun/qapitone-garnili-scuba-ikili-takim" />
  ```
  Ancak OpenGraph görseli (`og:image`) ve `og:title` seçilen renge göre dinamik olarak servis edilir:
  - Başlık: `Qapitone Garnili Scuba İkili Takım — Bordo | Hümra Moda`
  - Görsel: Bordo rengin ilk vitrin görseli.

### 3.2. Sıfır Gecikmeli Renk Değişimi (Instant Color Switching)
- Sayfadaki tüm varyant ve medya verileri sayfa ilk yüklendiğinde sunucu tarafından JSON olarak teslim edilir (`initialData`).
- Kullanıcı renk butonuna tıkladığında:
  1. `window.history.replaceState` veya Next.js `useRouter.replace(..., { scroll: false })` ile URL güncellenir (sayfa baştan yüklenmez).
  2. Galeri bileşeni filtrelenir: `activeColorId` ile eşleşen `ProductMedia[]` listesi aktif karusele aktarılır.
  3. Beden matrisi taranır: Seçilen renge ait varyantların `stockQuantity` değerleri kontrol edilir.
     - `stockQuantity > 0`: Seçilebilir normal buton.
     - `stockQuantity === 0`: Üzeri çizili buton (`disabled`, üzeri çizgi ve "Tükendi" ipucu).
  4. Eğer mevcut seçili beden yeni renkte tükenmişse, beden seçimi sıfırlanır ve "Sepete Ekle" butonu "Beden Seçiniz" durumuna döner.

---

## 4. `humraresimler/` Dizini Görsellerinin Entegrasyon Stratejisi

### 4.1. Analiz
Mevcut çalışma alanında `humraresimler/` altında 22 adet `.HEIC` uzantılı gerçek çekim yer almaktadır.
- Dosya adları: `IMG_2190.HEIC` ... `IMG_2279.HEIC`
- Dosya boyutları: 0.9 MB - 1.8 MB aralığında, yüksek çözünürlüklü.

### 4.2. Otomatik Dönüştürme ve Eşleme Scripti (`scripts/process-local-images.ts`)
Uygulama kurulum aşamasında çalışacak bir Node.js yardımcı scripti hazırlanacaktır:
1. `heic-convert` veya `sharp` (libheif eklentisiyle) kullanılarak tüm HEIC dosyaları okunur.
2. Her görsel için:
   - WebP (85 kalite, kayıpsız sıkıştırma ayarı)
   - AVIF (daha yüksek sıkıştırma verimliliği)
   - 3 farklı çözünürlük kırılımı (`thumbnail`, `card`, `detail`) üretilir.
3. Veritabanı tohumlama (seed) aşamasında:
   - Bu fotoğraflar Hümra Moda'nın ilk ürünlerine ("Qapitone Scuba Takım", "Şardonlu İkili Takım" vb.) ve renklerine (Siyah, Haki, Taş, Vizon) atanarak galeriler gerçek görsel verisiyle doldurulacaktır. Hiçbir yerde sahte placeholder görsel kullanılmayacaktır.
