# Hümra Moda — Ortam Değişkenleri, Dağıtım Stratejisi ve Risk Yönetimi

## 1. Gerekli Ortam Değişkenleri (Sadece İsimler)
*Güvenlik Kuralı: Gizli anahtarlar veya parola değerleri asla kaynak kodda veya dokümanlarda yer almaz; yalnızca `.env.local` veya sunucu yönetim panelinde tutulur.*

### 1.1. Temel Uygulama ve Güvenlik
- `NODE_ENV`
- `NEXT_PUBLIC_APP_URL` (Örn: `https://humramoda.com`)
- `AUTH_SECRET` (Oturum imzalama anahtarı)
- `ADMIN_INITIAL_EMAIL` (İlk yönetici hesabı için)
- `ADMIN_INITIAL_PASSWORD` (İlk yönetici hesabı kurulumu için)

### 1.2. Veritabanı
- `DATABASE_URL` (PostgreSQL bağlantı URI'si - SSL ve connection pooling destekli)
- `DIRECT_URL` (Prisma migrasyonları için doğrudan bağlantı URI'si)

### 1.3. PayTR Ödeme Entegrasyonu
- `PAYTR_MERCHANT_ID` (PayTR Mağaza No)
- `PAYTR_MERCHANT_KEY` (PayTR Mağaza Parolası)
- `PAYTR_MERCHANT_SALT` (PayTR Mağaza Gizli Anahtarı)
- `PAYTR_TEST_MODE` (`"1"` test modu, `"0"` canlı mod)
- `PAYTR_DEBUG_ON` (`"1"` geliştirme ortamı için detaylı hata)

### 1.4. Medya Depolama ve CDN (Cloudflare R2 / S3)
- `STORAGE_PROVIDER` (`"local"` yerel geliştirme için, `"s3"` veya `"r2"` canlı için)
- `STORAGE_ENDPOINT`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_SECRET_ACCESS_KEY`
- `STORAGE_BUCKET_NAME`
- `STORAGE_PUBLIC_URL` (Görsellerin sunulacağı CDN adresi)

---

## 2. Dağıtım (Deployment) Stratejisi Önerileri

| Seçenek | Mimari Yapı | Avantajları | Dikkat Edilmesi Gerekenler |
|---|---|---|---|
| **Öneri A (Hibrit Bulut - Tavsiye Edilen)** | Vercel veya Node.js Container + Supabase/Neon PostgreSQL + Cloudflare R2 | Sıfır sunucu bakım yükü, global edge caching, otomatik SSL, anında preview ortamları. | Veritabanı bağlantı havuzu (pgBouncer/Prisma Accelerate) zorunludur. |
| **Öneri B (Müstakil Linux VPS)** | Ubuntu 24.04 LTS + Docker Compose (Next.js + PostgreSQL + Nginx + Certbot) | Tam veri egemenliği, sabit aylık maliyet, yerel Türk veri merkezinde barındırma imkanı. | Sunucu yedeklemesi, güvenlik yamaları ve Nginx yapılandırması operasyonel takip gerektirir. |

---

## 3. Risk Matrisi ve Azaltma Stratejileri

| Risk | Olasılık | Etki | Azaltma / Çözüm Stratejisi |
|---|---|---|---|
| **PayTR Callback Gecikmesi veya Ağ Kesintisi** | Orta | Yüksek | Sipariş `PENDING_PAYMENT` durumunda kalır; müşteri sipariş sorgulama ekranında sunucu arka planda PayTR API'sine "sipariş durum sorgulama" isteği atarak senkronize eder. |
| **Mükerrer Callback İsteği (Double Spend / Overselling)** | Orta | Kritik | Prisma Transaction içinde satır kilitleme ve `order.status === PAID` idempotency kontrolü. Zaten işlenmiş siparişte anında `OK` dönülür. |
| **HEIC Görsellerinin Tarayıcıda Açılmaması** | Yüksek | Kritik | Sisteme yüklenen veya yerel `humraresimler/` klasöründeki tüm HEIC dosyaları Sharp ile otomatik olarak WebP/AVIF formatlarına dönüştürülür. |
| **Instagram İçi Tarayıcıda Donmuş Önbellek (bfcache)** | Yüksek | Orta | Referans sitede de doğrulanmış olan `pageshow` persisted dinleyicisi eklenerek kullanıcı PayTR'dan geri döndüğünde sayfanın güncel sepeti çekmesi sağlanır. |
| **Eşzamanlı Son Ürün Satışı (Stok Yarışı)** | Düşük | Yüksek | Stok düşümü `stockQuantity >= quantity` koşullu güncellemesiyle yapılır; yetersiz stok durumunda sipariş reddedilir. |
| **Büyük Medya Yüklemelerinde Sunucu Yavaşlaması** | Orta | Orta | Medya işleme asenkron olarak arka planda veya kuyrukta çalıştırılır; CDN üzerinden önbelleklenerek ana sunucu yükten arındırılır. |
