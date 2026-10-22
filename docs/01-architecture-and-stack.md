# Hümra Moda — Mimari ve Teknoloji Yığını Değerlendirmesi

## 1. Yönetici Özeti ve Mimari Vizyon
Hümra Moda, Türkiye pazarında premium kadın giyim ve tesettür modasında seçkin marka kimliğiyle konumlanan, yüksek performanslı, mobil öncelikli ve güvenli bir e-ticaret platformudur.

Bu mimari; binlerce yüksek çözünürlüklü editoryal görsel ve dikey moda videosuna rağmen sıfır gecikmeli gezinme, renge özel dinamik galeriler, hatasız stok/varyant yönetimi, PayTR resmi standartlarında çift yönlü ödeme doğrulaması ve teknik bilgi gerektirmeyen zengin bir Türkçe yönetim paneli sunacak şekilde tasarlanmıştır.

---

## 2. Teknoloji Yığını Değerlendirmesi ve Gerekçelendirme

### 2.1. Çekirdek Çatı: TypeScript + Next.js (App Router, Node.js Runtime)
- **Tercih:** Next.js (App Router, En Güncel Kararlı Sürüm)
- **Gerekçe:**
  1. **Hibrit Render Gücü:** Ürün katalogları ve vitrin sayfaları React Server Components (RSC) ile sunucu tarafında hızlıca derlenerek ilk içerik boyama (FCP) süresini 1 saniyenin altına indirir.
  2. **SEO ve Semantik Zenginlik:** Dinamik OpenGraph etiketleri, JSON-LD Schema (Product, AggregateOffer, BreadcrumbList, CollectionPage) doğrudan sunucudan beslenir; Google ve sosyal ağ botları için eksiksiz indeksleme sağlanır.
  3. **Teknoloji Bütünlüğü (Monolitik Full-Stack):** Ayrı bir Express/NestJS backend yerine Next.js Route Handlers ve Server Actions kullanılması; API uyumsuzluklarını, CORS yükünü ve çift dağıtım (dual deployment) karmaşasını ortadan kaldırır. TypeScript tipleri (Zod şemaları, Prisma tipleri) veritabanından UI bileşenine kadar uçtan uca paylaşılır.
  4. **Alternatiflerin Değerlendirilmesi:**
     - *Ayrı SPA (React/Vite) + Harici API:* SEO için SSR ekstra sunucu/yapılandırma gerektirir, ilk yükleme süresi butik e-ticaret için yavaştır. Elendi.
     - *Mikroservisler:* Tek bir butik marka için gereksiz operasyonel maliyet, ağ gecikmesi ve veri tutarsızlığı riski yaratır. Elendi.

### 2.2. Veritabanı ve ORM: PostgreSQL + Prisma ORM
- **Tercih:** PostgreSQL (16+) + Prisma ORM
- **Gerekçe:**
  1. **ACID Uyumluluğu:** E-ticarette stok düşümü, kupon kullanımı ve PayTR ödeme kaydı eşzamanlı işlemlerde (concurrency) atomik olmak zorundadır. PostgreSQL'in satır kilitleme (`SELECT FOR UPDATE`) ve işlem (transaction) mekanizması çifte satışı (overselling) engeller.
  2. **İlişkisel Bütünlük:** Ürün -> Renk -> Varyant (Beden/SKU) -> Stok hiyerarşisi katı yabancı anahtarlarla (Foreign Key) korunmalıdır.
  3. **JSONB Esnekliği:** Ana sayfadaki dinamik bloklar (slider, video afiş, grid2), kampanya kuralları ve sistem günlükleri için PostgreSQL JSONB yetenekleri şema esnekliği sağlar.
  4. **Prisma ORM Avantajı:** Tip güvenli sorgu oluşturucu (`prisma.product.findMany`), otomatik migrasyon takibi (`prisma migrate`), ilişkisel önbellekleme ve model dokümantasyonu.

### 2.3. Kimlik Doğrulama ve Yetkilendirme (Auth & RBAC)
- **Mimari:** Çift Kapsamlı Oturum Yönetimi (Admin & Müşteri)
- **Model:**
  - **Müşteri Katmanı:** Standart e-posta/şifre, şifre sıfırlama token'ı, misafir alışverişi (guest checkout), JWT tabanlı veya güvenli veritabanı oturumu.
  - **Yönetici Katmanı (Admin RBAC):** Argon2/Bcrypt hashli şifreleme, `HttpOnly`, `Secure`, `SameSite=Strict` korumalı çerezler, brute-force korumalı hız sınırlama (Rate Limiting).
  - **Yol Koruması:** Next.js `middleware.ts` seviyesinde `/(admin)/admin/:path*` yolları oturum ve yetki kontrolü yapılmadan asla istemciye sunulmaz.

### 2.4. Medya Stratejisi ve HEIC Çözüm Hattı
- **Mevcut Durum Analizi:** Çalışma alanındaki `humraresimler/` dizininde 22 adet yüksek çözünürlüklü Apple `.HEIC` görseli tespit edilmiştir. Web tarayıcıları HEIC formatını doğrudan desteklemez.
- **Medya Çözüm Hattı (Pipeline):**
  1. **Görsel Dönüştürme:** Yükleme aşamasında `sharp` kütüphanesi ile HEIC/PNG/JPG kaynak dosyalar otomatik olarak WebP ve AVIF formatlarına dönüştürülür.
  2. **Çoklu Kırılım (Responsive Breakpoints):**
     - Thumbnail: `120x160` (PDP küçük resimleri, sepet çekmecesi)
     - Card: `600x800` (Listeleme gridleri, ana sayfa karuselleri)
     - PDP Main: `1200x1600` (Detay sayfası varsayılan görünüm)
     - Zoom: `1800x2400` (Büyüteç / tam ekran modal)
  3. **Video Optimizasyonu:** Dikey moda videoları H.264/AAC MP4 formatında, sıkıştırılmış bitrate, ses varsayılan olarak kapalı (`muted`), arka planda döngüsel oynatma (`playsinline`, `loop`), ve videonun ilk karesinden otomatik üretilen `poster` görseli.
  4. **Nesne Depolama & CDN:** Cloudflare R2 / AWS S3 uyumlu depolama + Cloudflare CDN (İstanbul PoP ile Türkiye geneli <30ms yanıt süresi, bant genişliği çıkış ücreti olmadan).

---

## 3. Sistem Mimarisi Şeması

```
[ Müşteri Tarayıcısı / Mobil Web ]       [ Yönetici Paneli Tarayıcısı ]
               │                                       │
               ▼                                       ▼
    ┌─────────────────────────────────────────────────────────────┐
    │              Cloudflare Edge (WAF, SSL, CDN)                │
    └──────────────────────────────┬──────────────────────────────┘
                                   │
                                   ▼
    ┌─────────────────────────────────────────────────────────────┐
    │             Next.js 15+ Full-Stack Uygulaması               │
    │  ┌───────────────────────┐       ┌───────────────────────┐  │
    │  │  Storefront (RSC)     │       │  Admin Panel (RSC/UI) │  │
    │  ├───────────────────────┤       ├───────────────────────┤  │
    │  │  Cart / Checkout / UI │       │  Catalog & Order Mgt  │  │
    │  ├───────────────────────┴───────┴───────────────────────┤  │
    │  │        API Route Handlers & Server Actions            │  │
    │  │   • /api/payments/paytr/token (Sunucu Başlatma)       │  │
    │  │   • /api/payments/paytr/callback (Webhook / OK)       │  │
    │  │   • /api/admin/media/upload (Sharp Image Pipeline)    │  │
    │  └──────────────────────────────┬────────────────────────┘  │
    └─────────────────────────────────┼───────────────────────────┘
                                      │
          ┌───────────────────────────┴───────────────────────────┐
          │                                                       │
          ▼                                                       ▼
┌──────────────────────────┐                             ┌───────────────────┐
│ PostgreSQL 16+ Veritabanı│                             │ PayTR API Gateway │
│ (Prisma ORM ile ACID     │                             │ (Sunucu-Sunucu    │
│  İşlemler & Stok Kilidi) │                             │  İmzalı İletişim) │
└──────────────────────────┘                             └───────────────────┘
```

---

## 4. Dizin Yapısı Önerisi (Feature-Driven / Clean Architecture)

```
c:/Users/Taha/Documents/hümramoda/
├── docs/                        # Mimari, veritabanı, API dokümanları
├── humraresimler/               # Ham çekim fotoğrafları (.HEIC)
├── prisma/
│   ├── schema.prisma            # Veritabanı şeması ve ilişkiler
│   ├── migrations/              # Veritabanı migrasyon geçmişi
│   └── seed.ts                  # İlk kurulum tohum verileri (Kategoriler, Renkler, Bedenler, Admin)
├── public/
│   ├── fonts/                   # Yerel font dosyaları (veya next/font)
│   ├── icons/                   # Sistem ikonları
│   └── images/                  # Statik logo, boş durum görselleri
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (admin)/             # Yönetici Paneli Rotaları
│   │   │   └── admin/
│   │   │       ├── layout.tsx
│   │   │       ├── page.tsx     # Dashboard
│   │   │       ├── urunler/     # Ürün listesi ve oluşturma
│   │   │       ├── siparisler/  # Sipariş takibi ve detay
│   │   │       ├── vitrin/      # Ana sayfa blok yöneticisi
│   │   │       ├── musteriler/  # Müşteri verileri
│   │   │       └── ayarlar/     # Mağaza & SEO ayarları
│   │   ├── (storefront)/        # Müşteri Yüzü Rotaları
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx         # Ana sayfa
│   │   │   ├── urun/[slug]/     # Ürün Detay Sayfası (?renk= destekli)
│   │   │   ├── kategori/[slug]/ # Kategori/Koleksiyon listeleme
│   │   │   ├── sepet/           # Sepet sayfası
│   │   │   ├── odeme/           # Checkout & PayTR iFrame adımı
│   │   │   ├── siparis/sonuc/   # Ödeme dönüş bilgilendirme sayfası
│   │   │   └── hesabim/         # Siparişler, adresler, favoriler
│   │   └── api/                 # API Uç Noktaları
│   │       ├── auth/            # Oturum işlemleri
│   │       ├── payments/paytr/  # PayTR token üretimi ve callback
│   │       └── media/upload/    # Sharp ile görsel işleme API'si
│   ├── components/              # Yeniden kullanılabilir UI bileşenleri
│   │   ├── admin/               # Yönetici arayüz elemanları
│   │   ├── common/              # Ortak modal, buton, input, spinner
│   │   ├── storefront/          # Header, Footer, BottomBar, CartDrawer
│   │   └── product/             # ProductCard, ColorSelector, MediaGallery, BuyBox
│   ├── lib/                     # Yardımcı kütüphaneler ve servisler
│   │   ├── prisma.ts            # Prisma client singleton
│   │   ├── auth.ts              # Şifre hashleme, oturum doğrulama
│   │   ├── paytr.ts             # HMAC-SHA256 hash hesaplayıcı ve doğrulayıcı
│   │   ├── media-processor.ts   # Sharp tabanlı HEIC->WebP dönüştürücü
│   │   └── formatters.ts        # Para birimi (₺), tarih ve Türkçe slug formatlayıcılar
│   ├── hooks/                   # React hook'ları (useCart, useFavorites)
│   ├── types/                   # Paylaşılan TypeScript tipleri
│   └── styles/                  # CSS değişkenleri, temel tipografi kuralları
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 5. Güvenlik, Performans ve Yedekleme Stratejisi

### 5.1. Güvenlik Temelleri
1. **PayTR Güvenliği:**
   - Ödeme tutarı hiçbir koşulda tarayıcıdan alınmaz; sepet içeriği ve veritabanı fiyatları sunucu tarafında toplanarak hesaplanır.
   - Callback imza doğrulaması (`merchant_key` & `merchant_salt`) yapılmadan sipariş durumu asla güncellenmez.
   - İdempotent yapı: Tekrarlayan callback çağrılarında mükerrer stok düşüşü yapılmaz.
2. **XSS & CSRF Koruması:** Next.js React JSX otomatik kaçış mekanizması, HTML içeren alanlarda `sanitize-html`, tüm state-changing isteklerde SameSite çerez kontrolleri.
3. **Girdi Doğrulama:** Tüm API istekleri Zod şemaları ile taranır.

### 5.2. Performans Optimizasyonu
1. **Görsel Sunumu:** Next.js `<Image>` bileşeni ile `sizes` özniteliği, lazy-loading, WebP/AVIF desteği.
2. **Video Yönetimi:** Sadece görünüm alanına (viewport) giren videolar için `IntersectionObserver` ile oynatma tetikleme, düşük bitrate'li MP4 kodlaması, ilk kare için `poster` desteği.
3. **Font Optimizasyonu:** Google Fonts üzerinden `next/font/google` kullanılarak yerel olarak alt kümelenmiş (subset: `latin-ext` Türkçe karakter desteğiyle) font yükleme (Sıfır Layout Shift).

### 5.3. Yedekleme ve Kurtarma
1. **Veritabanı Yedekleme:** Günlük otomatik `pg_dump` snapshot'ları ve Point-in-Time Recovery (PITR).
2. **Medya Yedekleme:** R2/S3 depolama alanında versiyonlama (Object Versioning) aktif edilerek yanlışlıkla silinen veya üzerine yazılan ürün fotoğraflarının korunması.
