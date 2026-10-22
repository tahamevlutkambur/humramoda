# Hümra Moda — Referans Site Analizi ve Kullanıcı Deneyimi Çıkarımları

## 1. Referans Site
- **Adres:** `https://modanurgulbutik.com/`
- **İnceleme Tarihi:** 21 Ekim 2026
- **İncelenen Alanlar:** Ana sayfa, Kategori/Koleksiyon listeleme sayfası, Ürün Detay Sayfası (PDP), Sepet Drawer, Mobil Gezinme ve Ödeme Entegrasyonu.

---

## 2. Gözlemlenen Tasarım ve Alışveriş Akışları (Doğrulanmış Bulgular)

### 2.1. Teknoloji ve Temel Altyapı
- **Framework:** Next.js (App Router, Turbopack, React Server Components hydration)
- **Stil Altyapısı:** Tailwind CSS, Lucide Icons, özel CSS değişkenleri (örn: `--card-aspect: 3/4`)
- **Medya Sunumu:** Harici API/CDN depolama (`https://api.modanurgulbutik.com/storage/...`), WebP formatında görsel ve MP4 dikey/yatay videolar.
- **Kritik Tarayıcı & bfcache Çözümü:**
  ```javascript
  // Instagram ve mobil tarayıcı yönlendirmelerinden geri dönüşte donmuş önbelleği (bfcache) yenileme:
  window.addEventListener('pageshow', function(e) {
    if (e.persisted) { window.location.reload(); }
  });
  ```
  *Gözlem:* PayTR gibi 3D Secure yönlendirmesi gerektiren ödeme adımlarından veya Instagram uygulama içi tarayıcısından dönüldüğünde sepetin güncel kalmasını sağlayan pratik bir çözümdür.

### 2.2. Ana Sayfa Mimarisi ve Dinamik Bloklar
- Ana sayfa sabit kodlanmış bir şablon yerine **dinamik blok diziliminden** oluşmaktadır:
  1. **Slider Blok:** Masaüstü ve mobil için ayrı ayrı optimize edilmiş görseller (`desktop_image`, `mobile_image`), yönlendirme URL'si (`link_url`), metin bindirmeleri (`has_overlay`, `heading`, `subheading`).
  2. **Video Banner Blok:** Dikey/yatay video desteği (`desktop_video`, `mobile_video`), poster görseli (`video_poster`), otomatik oynatma (`autoPlay`, `muted`, `loop`, `playsInline`).
  3. **Grid Blokları:** 2'li (`grid2`) veya çoklu vitrin afişleri ile yeni koleksiyon ve çok satan yönlendirmeleri.
- **Mobil Gezinme:** 5 elemanlı sabit alt menü çubuğu (Bottom Navigation: *Ana Sayfa, Ara, Favoriler, Sepet, Hesabım*).
- **Masaüstü Başlık (Header):** Yapışkan (sticky), arka plan bulanıklığı (backdrop blur), minimalist büyük harf tipografi, arama, favori ikonu, üye menüsü ve sepet ikonu.
- **Kayan Sepet (Cart Drawer):** Sayfa değiştirmeden sağdan açılan modern sepet çekmecesi (`Sepetim (X)`, ücretsiz kargo teşviki, sepet içeriği ve doğrudan ödeme adımı).

### 2.3. Ürün Listeleme ve Kategori Sayfaları
- **Grid Düzeni:** Mobilde 2 sütun (`grid-cols-2`), tablette 3, masaüstünde 4 sütun (`grid-cols-4`), kart en-boy oranı `3:4`.
- **Renk Bazlı Gösterim:** Her rengin ayrı bir kart olarak veya kart üzerinde renk butonları (color swatches) ile listelenmesi. Kart linkinde `?renk=[renkSlug]` parametresi taşınmaktadır.
- **Kart İçi Medya Gezinmesi:** Kart üzerinde mobilde yatay kaydırma (touch snap slider), masaüstünde hover anında beliren sağ-sol okları ve alt nokta göstergeleri ile ürünün birden fazla fotoğrafı listeleme ekranından ayrılmadan incelenebilmektedir.
- **Rozetler (Badges):**
  - İndirim Oranı: Siyah zemin üzerine beyaz yüzde rozeti (örn: `%24`).
  - Kampanya Rozeti: Kırmızı zemin (örn: `Sepette %10 İNDİRİM`).
  - Durum Rozeti: Siyah zemin (örn: `YENİ ÜRÜN`, `TÜKENDİ`).
- **Fiyatlandırma:** Çizili liste fiyatı, kırmızı vurgulu güncel "Sepette Fiyat", Türk Lirası simgesi (`₺`), tabüler rakamlar (`tabular-nums`).

### 2.4. Ürün Detay Sayfası (PDP) ve Renk/Varyant Deneyimi
- **Masaüstü Galeri:** Sol tarafta dikey küçük resimler (thumbnails), merkezde `3:4` oranında büyük görsel, fare üzerine gelindiğinde büyüteç/yakınlaştırma (`cursor-zoom-in`), önceki/sonraki kontrolleri.
- **Mobilde Galeri:** Tam genişlikte dokunmatik yatay snap carousel.
- **Renge Özel Galeri:** Rengin değiştirilmesi yalnızca renk butonunu aktif etmekle kalmaz; tüm görsel ve video galerisini **o rengin çekimlerine** dönüştürür.
- **Renge Özel URL:** Renk değiştiğinde URL parametresi (`?renk=siyah`) değişir; sayfa linki başkasıyla paylaşıldığında doğrudan o renk açılır.
- **Beden Seçimi:**
  - Butonlu seçim (`1 Beden (36-38)`, `2 Beden (40-42)`, `S`, `M`, vb.).
  - Seçilen renge ait stok durumuna göre tükenen bedenlerin üzeri çizilir veya devre dışı bırakılır.
  - Beden seçilmeden önce buton "Seçim Yapınız" durumunda pasiftir; beden seçildiğinde "Sepete Ekle"ye döner.
- **Sepet ve Dönüşüm Teşvikleri:**
  - Dinamik Kargo Barı: "Sepete 3.500,00 ₺ daha ekle, kargo ücretsiz" ilerleme çubuğu.
  - Sadakat/Puan Rozeti: "17 Puan kazanın - Üye olun, her alışverişte biriktirin".
  - Bilgi Akordiyonları: "Ön Sipariş Nedir?", "Kumaş ve Kalıp Bilgisi", "Manken Ölçüleri", "Teslimat & İade".
- **Mobilde Yapışkan Eylem Çubuğu (Sticky Add-to-Cart):** Kullanıcı aşağı kaydırdığında ekranın altında fiyatı, seçili rengi ve "Sepete Ekle" butonunu sabitleyen bar.

---

## 3. Varsayımlar ve Ayrıştırılan Konular

| Alan | Doğrulanmış Gözlem | Varsayım / Hümra Moda Kararı |
|---|---|---|
| **Katalog Yapısı** | Referans sitede her renk ayrı kart gibi listelenebilmektedir. | Hümra Moda'da her renk varyantı opsiyonel olarak vitrinde bağımsız kart olarak gösterilebilir veya tek ana ürün kartında swatch geçişi yapılabilir. Yönetim panelinden bu ayar kontrol edilmelidir. |
| **Ön Sipariş (Pre-Order)** | Tesettür/kadın modasında üretim aşamasındaki ürünler satılabilmektedir. | Hümra Moda sisteminde varyant bazında `isPreOrder` (Ön Sipariş) ve `estimatedShippingDate` alanı desteklenmelidir. |
| **Görsel Formatı** | Referans site WebP formatı kullanmaktadır. | Hümra Moda yerel deposundaki görseller iPhone formatı olan `.HEIC`'tir. Canlıya alınmadan önce otomatik WebP/AVIF pipeline'ı kurulmalıdır. |
| **Görsel Dil & Marka İmajı** | Referans site hızlı tüketim butik tarzındadır. | Hümra Moda daha seçkin, editoryal, sessiz lüks (quiet luxury), yüksek tipografik disiplin ve rafine renk paleti ile premium konumlandırılacaktır. |
