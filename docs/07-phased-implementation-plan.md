# Hümra Moda — Kademeli Uygulama Planı ve Test Stratejisi

## 1. Uygulama Yaklaşımı
Proje, her aşaması bağımsız olarak test edilebilir, geriye dönük regresyon riski taşımayan ve somut kabul kriterlerine dayanan 7 aşamalı bir yol haritası ile yürütülecektir.

---

## 2. Aşamalar, Kabul Kriterleri ve Test Stratejisi

### Faz 1: Keşif, Referans İncelemesi ve Mimari Planlama (TAMAMLANDI)
- **Kapsam:** Çalışma alanı analizi, referans site (`modanurgulbutik.com`) mimarisinin ve UX akışlarının incelenmesi, veri modeli, PayTR güvenlik spesifikasyonu ve mimari dokümantasyonun hazırlanması.
- **Kabul Kriteri:** Kod yazımına başlanmadan önce tüm mimari, veritabanı, medya ve ödeme planının onaylanması.

---

### Faz 2: Proje Temeli, Tasarım Sistemi, Veritabanı ve Medya Hattı (TAMAMLANDI)
- **Kapsam ve Uygulama Kararları:**
  1. Next.js 16.4.2 (Turbopack, TypeScript 5.7.3, React 19.3.0) altyapısı başlatıldı. Sıkı tip denetimi (`strict: true`) devrede.
  2. Vanilla CSS tasarım sistemi token'ları (`src/styles/tokens.css` ve `globals.css`) oluşturuldu: Alabaster Chalk (`#FAF9F6`), Kömür Siyahı (`#141414`), Merat Bordo (`#8B2635`), 3:4 kart en-boy oranı, responsive container ve akıcı tipografi (`Plus Jakarta Sans` & `Playfair Display` latin-ext).
  3. Reusable foundation bileşenleri (`Container`, `Button`, `Badge`) ve responsive layout shell (`Header`, `Footer`, `layout.tsx`, `page.tsx`) tamamlandı.
  4. Prisma 6.19.3 şeması (`prisma/schema.prisma`) yapılandırıldı; `Product`, `ProductColor`, `ProductVariant`, `ProductMedia`, `Category`, `StoreSetting`, `Order`, `PaymentTransaction` varlıkları ve ilişkileri tanımlandı. `prisma generate` ile tip-güvenli istemci üretildi.
  5. `scripts/process-images.ts` ile `humraresimler/` altındaki 22 adet orijinal Apple `.HEIC` görseli `heic-convert` + `sharp` pipeline'ı ile WebP ve AVIF formatlarında 3 boyutta (`thumb`, `card`, `detail`) dönüştürüldü. Idempotent yapı test edildi (22 başarılı, 0 hata; ikinci çalıştırmada 22 atlandı).
  6. `prisma/seed.ts` hazırlandı; gerçek görselleri taslak kayıt olarak (`isDraft: true`, `isActive: false`) veritabanına bağlayacak güvenli akış oluşturuldu. Canlı veritabanı yokluğunda uygulamanın derlenmesini ve çalışmasını engellemeyecek şekilde tasarlandı.
  7. `.env.example`, `.gitignore`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs` ve detaylı PowerShell dostu `README.md` hazırlandı.
- **Doğrulama ve Test Sonuçları:**
  - `npm.cmd run typecheck` (`tsc --noEmit`): 0 hata (Geçti)
  - `npm.cmd run lint` (`eslint .`): 0 hata, 0 uyarı (Geçti)
  - `npm.cmd test` (`vitest run`): 2 dosya, 10 birim testi (Geçti - 558ms)
  - `npm.cmd run build` (`next build`): Başarılı statik derleme (3.1s derleme, 553ms statik sayfa üretimi)

---

### Faz 3: Mağaza Vitrini, Renge Özel Ürün Detay Sayfası (PDP) ve Gezinme
- **Kapsam:**
  1. Header, Footer, Mobil Kayan Menü (Drawer) ve Mobil 5'li Alt Menü (Bottom Navigation).
  2. Dinamik Ana Sayfa: Hero Slider, Dikey Video Afişi, 2'li Koleksiyon Gridleri, "Çok Satanlar" Karuseli.
  3. Kategori ve Koleksiyon Listeleme Sayfaları (`/kategori/[slug]`): 3:4 kart en-boy oranı, kart içi renk değiştirici butonlar, indirim ve durum rozetleri.
  4. Ürün Detay Sayfası (`/urun/[slug]`):
     - Renge özel görsel ve video galerisi (Masaüstü dikey thumbnail + zoom; mobilde yatay snap slider).
     - Butonlu renk seçici ve URL parametre senkronizasyonu (`?renk=...`).
     - Renge göre aktif/pasif beden matrisi ve tükenen bedenlerin üzeri çizili gösterimi.
     - Ücretsiz kargo ilerleme çubuğu ve kampanya kartları.
     - Mobilde yapışkan alt satın alma barı (Sticky Add-to-Cart).
- **Kabul Kriterleri:**
  - Renk tıklandığında yalnızca o rengin görselleri ve videoları gösterilmeli.
  - Sayfa yenilenmeden URL güncellenmeli ve paylaşıldığında seçilen renk açılmalı.
  - Tükenen bedenler sepete eklenememeli.
- **Testler:**
  - Playwright browser testleri: Masaüstü ve mobil ekran boyutlarında renk ve beden tıklama senaryoları.

---

### Faz 4: Sepet, Müşteri Hesabı ve Sipariş Öncesi Süreç
- **Kapsam:**
  1. Sağdan açılan Kayan Sepet (Slide-over Cart Drawer) ve tam `/sepet` sayfası.
  2. Müşteri Kayıt, Giriş, Şifremi Unuttum sayfaları (`/hesabim/giris`, `/hesabim/kayit`).
  3. Müşteri Paneli: Teslimat adresleri ekleme/düzenleme/silme, sipariş geçmişi ve favoriler listesi.
  4. Misafir Alışverişi (Guest Checkout): Üye olmadan hızlı sipariş verebilme desteği.
- **Kabul Kriterleri:**
  - Farklı renk ve bedenlerdeki ürünler sepete ayrı satırlar olarak eklenmeli.
  - Sepetteki adet artırma/azaltma işlemleri stok miktarını aşamamalı.
  - Ücretsiz kargo eşiği (örn: 3.500 ₺) dinamik olarak hesaplanmalı.
- **Testler:**
  - Sepet durum yönetimi birim testleri (useCart).
  - Adres validasyon şeması (Zod) testleri.

---

### Faz 5: PayTR Ödeme Entegrasyonu ve Sipariş Doğrulama
- **Kapsam:**
  1. Sunucu taraflı token üretim rotası (`/api/payments/paytr/token`): Sepet tutarını kuruş cinsinden hesaplama, HMAC-SHA256 hash üretimi ve PayTR iFrame token alımı.
  2. Ödeme Sayfası (`/odeme`): PayTR responsive iFrame entegrasyonu.
  3. Callback Webhook Uç Noktası (`/api/payments/paytr/callback`):
     - PayTR imza doğrulaması.
     - İdempotent sipariş güncellemesi (`PENDING_PAYMENT` -> `PAID`).
     - Prisma Transaction ile stok düşümü.
     - Düz metin `OK` yanıtı.
  4. Ödeme Sonuç Sayfası (`/siparis/sonuc`): Tarayıcıya sipariş onay özetini sunucudan sorgulayarak gösterme.
- **Kabul Kriterleri:**
  - Hatalı hash ile gelen sahte callback istekleri 400 ile reddedilmeli.
  - PayTR bildirimi mükerrer gelse dahi stoklar yalnızca 1 kez düşülmeli.
  - Tarayıcı manipülasyonu ile sipariş ödendi durumuna geçirilememeli.
- **Testler:**
  - PayTR HMAC-SHA256 imza hesaplama birim testleri.
  - Mock PayTR callback istekleri (Başarılı, Başarısız, Hatalı Hash, Tekrarlayan Callback).

---

### Faz 6: Kapsamlı Türkçe Yönetici Paneli (Admin) ve CMS
- **Kapsam:**
  1. `/admin` güvenli giriş ve oturum koruması.
  2. Gösterge Paneli: Ciro, siparişler, kritik stok bildirimleri.
  3. Ürün Yönetimi: Çok adımlı ürün, renk, beden, SKU ve stok oluşturma.
  4. Renge Özel Medya Yöneticisi: Sürükle-bırak fotoğraf ve video yükleme.
  5. Sipariş Yönetimi: Sipariş detayları, kargo takip no girişi ve kargo firması seçimi.
  6. Vitrin Yöneticisi: Kod yazmadan ana sayfa slider, dikey video ve grid banner'larını değiştirme.
  7. Mağaza & SEO Ayarları: Sosyal linkler, WhatsApp hattı, kargo barı tutarı, sözleşme metinleri.
- **Kabul Kriterleri:**
  - Yönetici panelindeki tüm işlemler anında canlı mağazaya yansımalı.
  - Yetkisiz kullanıcılar `/admin` rotalarına erişememeli.
- **Testler:**
  - Yetkilendirme (RBAC) middleware testleri.
  - CRUD eylem testleri (Ürün ekleme, stok güncelleme, sipariş statü değişimi).

---

### Faz 7: Uçtan Uca Tarayıcı Testleri, Güvenlik Taraması ve Canlıya Hazırlık
- **Kapsam:**
  1. Playwright ile uçtan uca alışveriş akışı testi (Ana sayfa -> Kategori -> PDP -> Renk seçimi -> Beden seçimi -> Sepet -> Checkout -> PayTR Callback -> Sipariş Onayı).
  2. Mobil tarayıcı uyumluluğu ve dokunmatik jest testleri (iOS Safari, Android Chrome).
  3. bfcache geri dönüş testi (Instagram tarayıcısından PayTR'a gidip dönüldüğünde sepet tazeliği).
  4. OWASP güvenlik kontrolleri: SQL Injection, XSS, CSRF, Rate Limiting, Gizli anahtarların dışa sızmaması.
  5. Lighthouse / Core Web Vitals performans testi (Mobil LCP < 2.5s, CLS < 0.1).
- **Kabul Kriterleri:**
  - Tüm Playwright testleri yeşil olmalı.
  - Lighthouse Performans puanı > 90, SEO puanı 100 olmalı.
