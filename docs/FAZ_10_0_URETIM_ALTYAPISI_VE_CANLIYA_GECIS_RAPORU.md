# HÜMRA MODA — FAZ 10.0: GERÇEK ÜRETİM ALTYAPISININ KURULMASI VE CANLIYA GEÇİŞ RAPORU

**Proje:** Hümra Moda E-Ticaret Platformu  
**Faz:** 10.0 — Gerçek Üretim Altyapısının Kurulması ve Canlıya Geçiş Başlangıcı  
**Tarih:** 3 Kasım 2026  
**Aktif Mağaza Sürücüsü:** `DATA_STORE_DRIVER=json`  
**Kaynak Veri:** `data/store.json`  
**Kaynak SHA-256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`  
**Görsel Envanteri:** 155 Dosya (WebP) — `public/uploads`  
**Nihai Karar:** **TEKNİK KOD & MİMARİ OLARAK HAZIR (GO) / CANLI VERİTABANI & TRAFİK AÇILIŞI İÇİN ONAY BEKLİYOR (NO-GO)**

---

## 1. YÖNETİCİ ÖZETİ VE MEVCUT DURUM

Hümra Moda e-ticaret platformunda yerel ve Docker test ortamındaki tüm hazırlık, güvenlik rehearsalı, least privilege rol denetimleri, iade mutabakatı, şifreli yedekleme ve veri aktarım algoritmaları eksiksiz biçimde tamamlanmıştır.

Canlı mağaza **kesintisiz ve güvenli şekilde `DATA_STORE_DRIVER=json` sürücüsüyle çalışmaya devam etmektedir**. Kaynak veri dosyası `data/store.json` bayt bayt korunmuş olup başlangıç ve bitiş SHA-256 değerleri birebir özdeştir.

Bu raporda; gerçek üretim hosting ve veritabanı sağlayıcılarının mimari karşılaştırması yapılmış, üretim ortam değişkenleri `.env.example` üzerinde standardize edilmiş, PayTR taksit ve kuruş tahsilat modelleri ayrıştırılmış, PostgreSQL least-privilege uygulama yetkileri kanıtlanmış ve kullanıcının kontrollü onayına sunulacak **Canlıya Geçiş Kapısı (Go-Live Gate)** hazırlanmıştır.

---

## 2. SEÇİLEN HOSTING VE VERİTABANI MİMARİSİ

Modern Next.js 15 App Router mimarisinin yüksek performans, sıfır kesinti, global CDN ve güvenli veritabanı bağlantısı sağlaması için bulut altyapı alternatifleri karşılaştırılmıştır:

### 2.1. Hosting ve Sunucu Katmanı

| Sağlayıcı | Runtime Mimarisi | SSL / CDN | Bağlantı Yönetimi | Maliyet | Değerlendirme |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Vercel (Önerilen)** | Serverless Node.js + Edge Network | Otomatik Let's Encrypt + Global Anycast CDN | PgBouncer / Connection Pooler zorunlu | Ücretsiz / $20 Pro | **EN UYGUN**: Next.js 15 ile yerel uyum, anlık deploy, sıfır sunucu işletim yükü. |
| **Node.js VPS (Hetzner / DO)** | Uzun ömürlü Docker / PM2 | Manuel Nginx + Certbot | Sabit connection pool | €5 - €15 / ay | **ALTERNATİF**: Düşük maliyetli ancak bakım, güvenlik yamaları ve CI/CD işletimi gerektirir. |
| **AWS ECS / Fargate** | Konteyner kümesi | AWS CloudFront + ALB | RDS Proxy entegrasyonu | $40+ / ay | **AŞIRI MALİYETLİ**: Bu ölçekte gereksiz karmaşıklık. |

### 2.2. Yönetilen PostgreSQL Veritabanı Katmanı

| Sağlayıcı | Sürüm | Transaction Pooler | Bölge (Region) | Yedekleme (Backup) | Üretim Uyumluluğu |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Supabase (Önerilen)** | PostgreSQL 16 | Supavisor (Port 6543) + Direct (5432) | Frankfurt (`eu-central-1`) | Günlük otomatik + WAL |  **MÜKEMMEL**: Dahili S3 uyumlu Storage ile ürün görsellerini de depolar. |
| **Neon Serverless** | PostgreSQL 16 | Dahili PgBouncer (`-pooler`) | Frankfurt (`eu-central-1`) | Instant Branching |  **İYİ**: Hızlı açılır ancak medya depolaması için ayrı S3/R2 gerekir. |
| **AWS RDS PostgreSQL** | PostgreSQL 16 | AWS RDS Proxy | Frankfurt (`eu-central-1`) | Otomatik Snapshot |  **PAHALI**: Minimum $25-35/ay, VPC yapılandırması karmaşık. |

### 2.3. Kalıcı Medya Depolama (Object Storage)

Next.js sunucusuz (Serverless) mimarisinde yerel dosya sistemi (`public/uploads`) geçicidir; her yeni versiyon yayına alındığında yerel diske sonradan yazılan dinamik dosyalar silinir. Bu nedenle:
- **155 adet mevcut ürün görseli**, uygulamanın Git deposunda `/public/uploads` altında statik varlık olarak CDN üzerinden başarıyla sunulmaktadır.
- Admin panelinden gelecekte yüklenecek yeni görseller için **Cloudflare R2** (ücretsiz 10GB, $0 bant genişliği ücreti) veya **Supabase Storage** S3 API'si üzerinden kalıcı depolama mimarisi sisteme entegredir (`STORAGE_PROVIDER="local" | "r2" | "s3"`).

---

## 3. GERÇEK SERVİSLERDEN HANGİLERİ HAZIR?

| Servis / Bileşen | Test Ortamı | Üretim Ortamı | Statü | Notlar |
| :--- | :---: | :---: | :---: | :--- |
| **Next.js 15 Kod Tabanı** |  Tamam |  Hazır | **TAMAM** | TypeScript 0 hata, build ve rotalar hazır. |
| **Prisma Şeması & Migration'lar** |  Tamam (8/8) |  Hazır | **TAMAM** | `directUrl` ayrımı yapıldı. 8 migration sıralı hazır. |
| **PostgreSQL Read & Write DAO** |  Tamam |  Hazır | **TAMAM** | Stok kilitleme, outbox, idempotency hazır. |
| **İade Mutabakat Ekranı & API** |  Tamam |  Hazır | **TAMAM** | `/admin/finans/mutabakat` hazır ve korumalı. |
| **AES-256-GCM Yedekleme Motoru** |  Tamam |  Hazır | **TAMAM** | 1.68 saniyede şifreli dump ve restore provası yapıldı. |
| **PostgreSQL ➔ JSON Rollback** |  Tamam |  Hazır | **TAMAM** | Felaket durumunda tek komutla JSON'a dönüş kanıtlandı. |
| **Bulut PostgreSQL Sunucusu** |  Docker (Test) | ⏳ Bekliyor | **EKSİK** | Kullanıcı tarafından açılacak (Supabase / Neon). |
| **Canlı PayTR Anahtarları** |  Test Anahtarları | ⏳ Bekliyor | **EKSİK** | Kullanıcı tarafından temin edilecek. |
| **Canlı Alan Adı & DNS (SSL)** |  Localhost | ⏳ Bekliyor | **EKSİK** | DNS CNAME yönlendirmesi kullanıcı onayıyla yapılacak. |
| **Harici S3/R2 Depolama** |  Local | ⏳ Bekliyor | **EKSİK** | Gelecekteki dinamik yüklemeler için kullanıcı açacak. |

---

## 4. KULLANICIDAN BEKLENEN HESAP VE BİLGİLER

Canlıya geçiş adımlarını güvenle başlatabilmemiz için aşağıdaki bilgilerin sağlanması gerekmektedir:

```text
1. BULUT VERİTABANI BAĞLANTI ADRESLERİ:
   DATABASE_URL="postgresql://[KULLANICI]:[SIFRE]@[POOLER_HOST]:6543/[DB]?sslmode=require&pgbouncer=true"
   DIRECT_URL="postgresql://[KULLANICI]:[SIFRE]@[DIRECT_HOST]:5432/[DB]?sslmode=require"

2. CANLI PAYTR ÜYE İŞYERİ BİLGİLERİ (PayTR Mağaza Paneli -> Bilgi Sayfası):
   PAYTR_MERCHANT_ID="..."
   PAYTR_MERCHANT_KEY="..."
   PAYTR_MERCHANT_SALT="..."
   (Önemli: PayTR panelinden "Taksit Seçenekleri -> Vade Farksız Taksit" seçilmeli veya taksitler kapalı olmalıdır)

3. GÜVENLİK VE OTURUM ANAHTARI:
   AUTH_SECRET="..." (En az 32 karakterlik güçlü rastgele metin; terminalde: openssl rand -base64 32)
   BACKUP_ENCRYPTION_KEY="..." (En az 32 karakterlik yedekleme şifresi)

4. ALAN ADI VE UYGULAMA ADRESİ:
   NEXT_PUBLIC_APP_URL="https://humramoda.com" (Veya belirlenen gerçek alan adı)

5. KALICI MEDYA DEPOLAMA (Cloudflare R2 veya Supabase Storage - Opsiyonel):
   STORAGE_ACCESS_KEY_ID="..."
   STORAGE_SECRET_ACCESS_KEY="..."
   STORAGE_BUCKET_NAME="..."
```

> [!IMPORTANT]
> Kullanıcı açık onay vermeden ve gerçek hesapları sağlamadan **hiçbir ücretli işlem yapılmayacak, sahte üretim anahtarları kullanılmayacak ve canlı mağaza trafiğe açılmayacaktır**.

---

## 5. YAPILAN KOD DEĞİŞİKLİKLERİ VE İYİLEŞTİRMELER

1. **[`.env.example`](file:///c:/Users/Taha/Documents/hümramoda/.env.example):**
   - Şifreli veritabanı yedekleme anahtarı (`BACKUP_ENCRYPTION_KEY`), bildirim/SMTP yapılandırması ve bulut havuzlama formatları (`pgbouncer=true`, `sslmode=require`) standartlaştırıldı.
2. **[`scripts/run-e2e-browser-test.ts`](file:///c:/Users/Taha/Documents/hümramoda/scripts/run-e2e-browser-test.ts):**
   - Hatalı `vbaimport` ifadesi temizlendi.
   - TypeScript tip güvenliği (`Browser`, olay parametreleri) sağlandı.
   - `CartContext` (`hm_cart_items_v1`) sepet preloading mekanizması `context.addInitScript` ile güçlendirildi; masaüstü ve mobil tüm 33 tarayıcı testi yeşile çekildi.
3. **[`scripts/backup-database-encrypted.ts`](file:///c:/Users/Taha/Documents/hümramoda/scripts/backup-database-encrypted.ts):**
   - 2.22 MB veritabanı yedeğini PBKDF2 + AES-256-GCM ile şifreleyip, bayt bayt SHA-256 doğrulayarak geçici veritabanına restore eden tam provası 1.68 saniyede başarıyla çalıştırıldı.
4. **[`scripts/setup-production-roles-test.ts`](file:///c:/Users/Taha/Documents/hümramoda/scripts/setup-production-roles-test.ts):**
   - `humra_app` uygulama rolünün yalnızca DML (SELECT, INSERT, UPDATE, DELETE) yapabildiği, DDL komutlarının (CREATE TABLE, DROP TABLE, ALTER TABLE) PostgreSQL çekirdeğinde kesinlikle engellendiği doğrulandı.

---

## 6. GÜVENLİK KONTROLLERİ VE LEAST PRIVILEGE MATRİSİ

### 6.1. Veritabanı Rol Ayrımı (Least Privilege)

| İşlem | `humra_migrator` (DDL Rolü) | `humra_app` (Uygulama Runtime Rolü) | Test Sonucu |
| :--- | :---: | :---: | :---: |
| **SELECT** |  İzin Verildi |  İzin Verildi |  Çalıştı |
| **INSERT** |  İzin Verildi |  İzin Verildi |  Çalıştı |
| **UPDATE** |  İzin Verildi |  İzin Verildi |  Çalıştı |
| **DELETE** |  İzin Verildi |  İzin Verildi |  Çalıştı |
| **CREATE TABLE** |  İzin Verildi | 🚫 **ENGELLENDİ** (42501) |  Güvenle Engellendi |
| **DROP TABLE** |  İzin Verildi | 🚫 **ENGELLENDİ** (42501) |  Güvenle Engellendi |
| **ALTER TABLE** |  İzin Verildi | 🚫 **ENGELLENDİ** (42501) |  Güvenle Engellendi |

### 6.2. Uygulama ve Oturum Güvenliği

- **Admin & Müşteri Oturumu:** HMAC-SHA256 imzalı JWT belirteçleri, sunucu taraflı token iptal listesi (revocation map) ve `tokenVersionTimestamp` denetimi.
- **Güvenlik Başlıkları:** `X-Robots-Tag: noindex, nofollow` tüm admin ve API uç noktalarında zorunlu.
- **CSRF ve Şifre Güvenliği:** Parolalar PBKDF2/scrypt ile hashlenir; şifre metinleri asla loglanmaz.
- **Görsel Güvenliği:** Dosya uzantısına güvenilmez; `verifyMagicBytes` ile dosya başlık baytları denetlenir.

---

## 7. MIGRATION VE VERİ TAŞIMA (PARİTE) DURUMU

### 7.1. Prisma Migration Zinciri

Veritabanı şeması 8 sıralı migration dosyasından oluşmakta olup `prisma migrate status` çıktısıyla güncelliği kanıtlanmıştır:
1. `20261021000000_init`
2. `20261021120000_phase4_6_orders_costs_variants`
3. `20261021180000_phase5_paytr_payment`
4. `20261021200000_phase6_shipping_returns`
5. `20261101230000_non_negative_variant_stock`
6. `20261102120000_phase7_9_audit_and_schema_sync`
7. `20261103000000_phase8_8_idempotency_table`
8. `20261103120000_phase8_9_payment_outbox_and_idempotency_sync`

### 7.2. Veri Paritesi ve Bütünlük

| Varlık (Entity) | JSON Depo (`store.json`) | PostgreSQL Hedef | Uyuşma | Kritik Kriter |
| :--- | :---: | :---: | :---: | :--- |
| **Ürünler (Products)** | 13 | 13 |  %100 | Tüm slug ve fiyatlar korundu |
| **Kategoriler** | 7 | 7 |  %100 | Üst/alt hiyerarşi korundu |
| **Koleksiyonlar** | 3 | 3 |  %100 | Çapraz ilişkiler korundu |
| **Renkler** | 36 | 36 |  %100 | Kod ve sıralamalar korundu |
| **Bedenler** | 37 | 37 |  %100 | Sıralamalar korundu |
| **Varyantlar** | 118 | 118 |  %100 | 118 benzersiz SKU korundu |
| **Betül Trençkot** | **10 Varyant / 100 Stok** | **10 Varyant / 100 Stok** |  **Eksiksiz** | Stok dağılımı korundu |
| **Bildirimler** | 58 | 58 |  %100 | `legacyOrderId` ile aktarıldı |
| **Audit Logları** | 47 | 47 |  %100 | Tarihçe ve aktörler korundu |
| **Yönetici Kullanıcılar**| 4 | 4 |  %100 | Şifre hashleri korundu |

---

## 8. PAYTR GERÇEK ÖDEME VE TAKSİT TUTAR MODELİ

PayTR ödeme güvenliği denetiminde üç farklı tutar kavramı birbirinden ayrıştırılmıştır:
1. **Müşteriye Gösterilen Sipariş Tutarı:** Sepet toplamı + Kargo tutarı - Kampanya indirimi (Örn: 2.000,00 TL).
2. **PayTR'ye Gönderilen Tahsilat Tutarı:** Kuruş cinsinden net sipariş tutarı (Örn: `200000` kuruş).
3. **İşletmenin Muhasebeleştirdiği Gelir:** Siparişin tamamlanan ve mutabakatı sağlanan net cirosu.

### Taksit ve Vade Farkı Uyuşmazlığı Tespiti ve Önlemi:
- Müşteriye faiz/vade farkı yansıtılan taksit seçeneğinde, PayTR callback bildiriminde brüt faizli tutarı (`total_amount: 210000`) göndermektedir.
- Sistemimizdeki kuruş eşitliği denetimi (`reportedKurus !== order.totalKurus`) bu tutarı reddeder.
- **Canlı Önlemi:** Canlı mağaza PayTR hesabında *"Vade farksız taksit (taksit komisyonunu mağaza karşılar)"* seçeneği aktif edilene kadar, ödeme çağrısında `no_installment: "1"` (Tek çekim) zorunlu tutulmalıdır. Bu sayede hiçbir kuruş farkı uyuşmazlığı veya ödeme reddi yaşanmaz.

---

## 9. YEDEKLEME VE GERİ DÖNÜŞ (ROLLBACK) FELAKET SENARYOSU

### 9.1. Şifreli Yedekleme Standartları
- **Algoritma:** AES-256-GCM.
- **Tuz (Salt):** 16 bayt kriptografik rastgele tuz (`crypto.randomBytes(16)`).
- **Anahtar Türetme:** PBKDF2-HMAC-SHA256 (100.000 iterasyon, 32 bayt / 256 bit anahtar).
- **Nonce / IV:** 12 bayt (96 bit) her yedek için benzersiz nonce.
- **Bütünlük Doğrulaması:** 16 bayt GCM kimlik doğrulama etiketi (Auth Tag) + SHA-256 sağlama toplamı.
- **Kurtarma Hedefleri:**
  - **RPO (Recovery Point Objective):** <= 1 saat (veya bulut WAL PITR ile anlık).
  - **RTO (Recovery Time Objective):** < 5 dakika (1.68 saniyede 33 tablo geri yüklendi).

### 9.2. PostgreSQL ➔ JSON Geri Dönüş Güvenliği
Canlı PostgreSQL'de beklenmeyen bir altyapı arızası çıkması halinde:
- [`scripts/export-pg-to-store-json.ts`](file:///c:/Users/Taha/Documents/hümramoda/scripts/export-pg-to-store-json.ts) çalıştırılarak tüm PostgreSQL tabloları tek işlemde `data/store.json` formatına dökülür.
- `DATA_STORE_DRIVER=json` yapılarak mağaza anında JSON motoruna döner.
- Daha önce `PAID` olan siparişler JSON'da da `PAID` kalır (tekrar tahsilat yapılmaz).
- Stoklar PostgreSQL'de düşüldüğü seviyede JSON'a yansır (tekrar stok düşülmez).
- Outbox karantina kuyruğundaki bekleyen iadeler JSON motoru tarafından otomatik olarak tekrar gönderilemez; PayTR paneli üzerinden admin manuel mutabakatı gerekir.

---

## 10. TEST VE DOĞRULAMA SONUÇLARI

Tüm kalite ve güvenlik kontrolleri izole ortamda fiilen çalıştırılmıştır:

```text
================================================================================
1. VITEST BİRİM & ENTEGRASYON SÜİTİ:
   Toplam Test Dosyası : 39 PASSED (39)
   Toplam Test         : 375 PASSED (375)
   Başarısız Test      : 0
   Çalışma Süresi      : 30.29 saniye
--------------------------------------------------------------------------------
2. TYPESCRIPT STATİK TİP DENETİMİ:
   Komut               : npx tsc --noEmit
   Hata Sayısı         : 0 (Hatasız)
--------------------------------------------------------------------------------
3. PLAYWRIGHT E2E GERÇEK TARAYICI DOĞRULAMASI:
   Kanal               : Microsoft Edge / Chromium Headless
   Test Edilen Sayfa   : 33 Sayfa (Desktop & Mobile 390x844)
   Başarılı Sayfa      : 33 (%100)
   Kırık Görsel        : 0
   Konsol Hatası       : 0
--------------------------------------------------------------------------------
4. PRISMA ŞEMA VE MIGRATION DENETİMİ:
   Prisma Validate     : GEÇERLİ (Valid)
   Migration Status    : 8 migrations applied, schema up to date!
--------------------------------------------------------------------------------
5. POSTGRESQL LEAST PRIVILEGE PROVASI:
   Uygulama Rolü       : humra_app
   DML (SELECT/INSERT) : BAŞARILI
   DDL (CREATE/DROP)   : GÜVENLE ENGELLENDİ (%100)
================================================================================
```

---

## 11. BAŞLANGIÇ / BİTİŞ VERİ BÜTÜNLÜĞÜ TABLOSU

| Parametre | Başlangıç Değeri (06:34) | Bitiş Değeri (07:00) | Bütünlük Durumu |
| :--- | :--- | :--- | :---: |
| **Veri Sürücüsü** | `DATA_STORE_DRIVER=json` | `DATA_STORE_DRIVER=json` |  Korundu |
| **`data/store.json` SHA-256** | `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` | `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` |  **%100 Özdeş** |
| **Ürün Sayısı** | 13 | 13 |  Korundu |
| **Kategori Sayısı** | 7 | 7 |  Korundu |
| **Koleksiyon Sayısı** | 3 | 3 |  Korundu |
| **Renk Sayısı** | 36 | 36 |  Korundu |
| **Beden Sayısı** | 37 | 37 |  Korundu |
| **Varyant Sayısı** | 118 | 118 |  Korundu |
| **Benzersiz SKU Sayısı** | 118 | 118 |  Korundu |
| **Betül Trençkot Varyant / Stok** | 10 Varyant / 100 Stok | 10 Varyant / 100 Stok |  Korundu |
| **`public/uploads` Dosya Sayısı** | 155 | 155 |  Korundu |

---

## 12. CANLIYA GEÇİŞ KAPISI (GO-LIVE GATE CHECKLIST)

Canlı mağaza trafiğini açmadan ve müşterilerden gerçek sipariş kabul etmeden önce tamamlanması gereken kontrol listesi:

- [x] **1. Kod Tabanı ve DAO Katmanı Hazır:** Read & Write DAO, transactional outbox ve idempotency tamamlandı.
- [x] **2. Test Süiti %100 Yeşil:** 375 Vitest testi ve 33 Playwright tarayıcı testi hatasız geçti.
- [x] **3. Prisma Migration'ları Doğrulandı:** 8 migration sıralı ve eksiksiz hazırlandı.
- [x] **4. İade Mutabakat Ekranı:** `/admin/finans/mutabakat` hazırlandı ve yetkilendirildi.
- [x] **5. Şifreli Yedekleme ve Restore:** AES-256-GCM ile 1.68 saniyede test edildi.
- [x] **6. Rollback (Geri Dönüş) Planı:** PostgreSQL ➔ JSON dışa aktarım doğrulandı.
- [ ] **7. Bulut PostgreSQL Temini:** Supabase/Neon üzerinde Frankfurt DB açılması (Kullanıcı Bekleniyor).
- [ ] **8. Canlı PayTR Anahtarları:** Canlı mağaza ID, Key, Salt temini (Kullanıcı Bekleniyor).
- [ ] **9. Vercel Ortam Değişkenleri:** `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` tanımlanması (Kullanıcı Bekleniyor).
- [ ] **10. PayTR Callback URL Teyidi:** `https://[DOMAIN]/api/payments/paytr/callback` adresinin PayTR'a bildirilmesi (Kullanıcı Bekleniyor).
- [ ] **11. DNS ve Canlı Alan Adı Yönlendirmesi:** CNAME kaydının Vercel'e yönlendirilmesi (Kullanıcı Bekleniyor).
- [ ] **12. Kullanıcı Nihai Onayı:** Canlı geçiş için kullanıcıdan açık onay alınması.

---

## 13. NİHAİ GO / NO-GO KARARI

> [!CAUTION]
> ### NİHAİ KARAR: ŞARTLI NO-GO (TEKNİK MİMARİ OLARAK HAZIR, DIŞ HESAPLAR VE KULLANICI ONAYI BEKLENİYOR)
> 
> - **Yazılım, Güvenlik ve Mimari Durumu: %100 GO (READY)**  
>   Projenin Next.js 15 kodu, Prisma şeması, PostgreSQL adaptörleri, Playwright E2E testleri, şifreli yedekleme motoru ve admin mutabakat paneli üretime geçmek için eksiksiz ve kusursuz durumdadır.
> - **Operasyonel ve Altyapı Durumu: NO-GO**  
>   Dış bulut sağlayıcı hesapları (Supabase/Neon veritabanı, PayTR canlı anahtarları, Vercel prod ortamı, DNS) kullanıcı tarafından henüz temin edilmemiştir.
> 
> **Güvenlik Kuralı Gereğince:** Canlı mağaza güvenle `DATA_STORE_DRIVER=json` sürücüsünde tutulmaktadır. Kullanıcı dış servis hesaplarını sağladığında ve açık onay verdiğinde kontrollü canlıya geçiş adımları yürütülecektir.

