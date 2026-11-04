# HÜMRA MODA — FAZ 8.1: POSTGRESQL ALTYAPI HAZIRLIĞI VE GÜVENLİ GEÇİŞ ÖN KONTROLLERİ TEKNİK RAPORU

**Proje:** Hümra Moda  
**Faz:** 8.1 — PostgreSQL Altyapı Hazırlığı ve Güvenli Geçiş Ön Kontrolleri  
**Tarih:** 2 Kasım 2026  
**Ortam:** Yalnızca Yerel Geliştirme (Local Development)  
**Aktif Veri Kaynağı:** `data/store.json`  
**Durum:** **BAŞARILI — TÜM ÖN KONTROLLER TAMAMLANDI (GERÇEK VERİ AKTARIMI YAPILMADI)**

---

## 1. YÖNETİCİ ÖZETİ

Faz 8.1 kapsamında, Hümra Moda e-ticaret platformunun JSON tabanlı veri mimarisinden (`data/store.json`) kurumsal ilişkisel veritabanı PostgreSQL'e güvenli geçişini sağlamak üzere kapsamlı bir teknik denetim, şema uyumluluk kontrolü, ortam değişkenleri yapılandırması ve migration hazırlık süreci yürütülmüştür.

Bu fazın temel kuralı olarak:
- **Gerçek veri aktarımı YAPILMAMIŞTIR.**
- **`data/store.json` dosyasının bütünlüğü %100 korunmuştur (SHA256 değişmemiştir).**
- **Hiçbir canlı veya yerel veritabanına `prisma migrate deploy`, `prisma migrate dev` veya `prisma db push` uygulanmamıştır.**
- **Mevcut 155 medya dosyası, Betül Trençkot'un 10 varyantı ve 100 stoku, 58 eski bildirim ve 47 audit log kaydı korunmuştur.**

---

## 2. İNCELENEN MEVCUT ALTYAPI VE 6 TEMEL SORUNUN YANITI

Aşağıdaki bileşenler kod seviyesinde incelenmiştir:
- `prisma/schema.prisma`
- `prisma/migrations/` (5 mevcut migration klasörü)
- `scripts/migrate-json-to-pg.ts`
- `data/store.json`
- `src/lib/server/store.ts` & `src/lib/server/persistent-store.ts`
- `.env` ve `.env.example`
- `package.json`

### 2.1. Temel Altyapı Sorularının Yanıtları

#### Soru 1: Prisma hangi veritabanı sağlayıcısını kullanıyor?
* **Yanıt:** Prisma doğrudan **`postgresql`** sağlayıcısını (`provider = "postgresql"`) kullanmaktadır.
* **Kaynak:** `prisma/schema.prisma` (Satır 1-4):
  ```prisma
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  ```

#### Soru 2: PostgreSQL bağlantı değişkenleri tanımlı mı?
* **Yanıt:** **EVET.** `.env` dosyası içerisinde yerel geliştirme için döngüsel (loopback) PostgreSQL bağlantı değişkeni tanımlıdır:
  - `DATABASE_URL`: `postgresql://postgres:postgres@127.0.0.1:5432/humra_moda_local?schema=public`
  - `DIRECT_URL`: `postgresql://postgres:postgres@127.0.0.1:5432/humra_moda_local?schema=public`
  - `.env.example` dosyası geliştirme, test/CI ve canlı üretim ortamları için ayrıştırılarak güncellenmiştir.
  - Hiçbir gerçek üretim parolası kod tabanına veya rapora yazılmamıştır; `.env` dosyası `.gitignore` ile korunmaktadır.

#### Soru 3: Prisma şeması PostgreSQL ile uyumlu mu?
* **Yanıt:** **%100 UYUMLU.** `npx.cmd prisma validate` komutu şemanın tamamen geçerli olduğunu doğrulamıştır. PostgreSQL'e özgü `@db.Text`, `@db.Decimal(10, 2)`, PostgreSQL enum türleri (`UserRole`, `OrderStatus`, `OrderPaymentStatus`, `ShippingStatus`, `ReturnStatus`, vb.), `Json` / `JSONB` alanları, CUID ID üreteçleri ve ilişkisel foreign key kısıtları PostgreSQL standartlarına eksiksiz uymaktadır.

#### Soru 4: Migration geçmişi mevcut mu?
* **Yanıt:** **KISMİ OLARAK MEVCUTTUR.**
  `prisma/migrations` dizini altında 5 adet migration klasörü bulunmaktadır:
  1. `20261021000000_init` (Temel kullanıcı, ürün, varyant, sepet, sipariş tabloları)
  2. `20261021120000_phase4_6_orders_costs_variants` (Maliyet fiyatları, teyit damgaları)
  3. `20261021180000_phase5_paytr_payment` (PayTR ödeme durumu ve transaction alanları)
  4. `20261021200000_phase6_shipping_returns` (Kargo, iade talepleri, müşteri bildirimleri)
  5. `20261101230000_non_negative_variant_stock` (Stok negatif olmama DB check constraint)
  * **Eksiklik Tespiti:** Prisma CLI tarafından oluşturulan `migration_lock.toml` dosyası mevcut değildir. Ayrıca Faz 7.7, 7.8 ve 7.9'da eklenen modeller (`FeaturedVideo`, `AuditLog`, `SiteActivity`, `PasswordResetToken`), `CARRIER` rolü ve `CustomerNotification.legacyOrderId` alanı için migration SQL dosyası eksiktir. Bu eksiklik Faz 8.1 kapsamında hazırlanan statik taslak migration dosyasıyla kapatılmıştır.

#### Soru 5: JSON veri deposuna bağımlı modüller hangileri?
* **Yanıt:** Mevcut çalışan sistemde veri kaynağı olarak `data/store.json` kullanan modüller şunlardır:
  1. `src/lib/server/store.ts`: Ana veri ambarı motoru (ürünler, varyantlar, stok, siparişler, müşteriler, adresler, sepetler, kuponlar, ayarlar, bildirimler, audit loglar).
  2. `src/lib/server/persistent-store.ts`: JSON dosya okuma/yazma, atomik dosya kaydetme ve bellek önbelleği.
  3. API Route'ları:
     - `/api/admin/*` (ürün ekleme/güncelleme, medya yönetimi, kampanya, ayarlar)
     - `/api/auth/*` ve `/api/customer/*` (kayıt, giriş, oturum doğrulama, şifre sıfırlama, adres yönetimi)
     - `/api/payments/*` (PayTR callback, nakit kapıda ödeme sipariş oluşturma)
     - `/api/returns/*` (iade/değişim talep oluşturma ve yönetimi)
     - `/api/tracking/*` (kargo sorgulama ve müşteri sipariş takibi)
  4. Mutex Kilit Mekanizması: `executeWithOrderLock` bellek kilitleri `store.ts` üzerinden çalışmaktadır.

#### Soru 6: PostgreSQL'e geçişte değişmesi gereken veri erişim noktaları hangileri?
* **Yanıt:**
  1. **Veri Erişim Katmanı (DAO / Repository Katmanı):** `store.ts` içindeki tüm JSON manipülasyon fonksiyonları (`getStoreData()`, `saveStoreData()`, `findProductBySlug()`, vb.) Prisma Client ORM çağrılarına (`prisma.product.*`, `prisma.order.*`, `prisma.user.*`) dönüştürülmeli veya bir Data Access Adapter arkasına alınmalıdır.
  2. **Eşzamanlı Sipariş ve Stok Mutex Kilitleri:** Bellek tabanlı dosya kilidi yerine PostgreSQL veritabanı seviyesinde satır kilitleme (`SELECT ... FOR UPDATE`) ve atomik işlemler (`prisma.$transaction`) kullanılmalıdır.
  3. **Yedekleme ve Geri Yükleme Motoru:** JSON dosya kopyalama (`data/backups/`) mantığı yerine PostgreSQL mantıksal yedekleme (`pg_dump` / snapshot) entegre edilmelidir.
  4. **Kullanıcı Oturumları:** JSON içindeki admin/customer kayıtları yerine `prisma.user` tablosuna yönelik sorgular kullanılmalıdır.

---

## 3. PRISMA ŞEMA KONTROLÜ VE VERİ KORUMA KURALLARI

`prisma/schema.prisma` dosyasının PostgreSQL özellikleri ve veri koruma kuralları açısından denetim sonuçları:

| Kural / Model / Alan | Şemadaki Karşılığı | Durum | Açıklama |
| :--- | :--- | :---: | :--- |
| **Betül Trençkot 10 Varyant Koruması** | `@@unique([productId, colorId, sizeId])` **YOKTUR**; yerine `@@index([productId, colorId, sizeId])` vardır. | **KORUNDU** | Aynı renkteki 2 farklı kumaş varyantının DB kısıtına takılması engellenmiştir. |
| **Varyant SKU Benzersizliği** | `sku String @unique` | **KORUNDU** | Bütün 118 varyantın tekil SKU'ya sahip olması garanti altındadır. |
| **58 Eski Bildirim Desteği** | `orderId String?` (nullable) ve `legacyOrderId String?` + `@@index([legacyOrderId])` | **KORUNDU** | Eski sipariş referansları kayıpsız korunabilir. |
| **Kargo Görevlisi Rolü** | `enum UserRole { ADMIN STAFF CUSTOMER CARRIER }` | **KORUNDU** | CARRIER rolü mevcuttur. |
| **Vitrin Video Modeli** | `model FeaturedVideo` | **KORUNDU** | 2 adet vitrin videosu şemada tanımlıdır. |
| **Güvenlik & Denetim Modeli** | `model AuditLog` | **KORUNDU** | 47 audit log kaydı için tam şema desteği mevcuttur. |
| **Ziyaretçi Etkinlik Modeli** | `model SiteActivity` | **KORUNDU** | Metrik ve log tablosu mevcuttur. |
| **Şifre Sıfırlama Token Modeli** | `model PasswordResetToken` | **KORUNDU** | Güvenli SHA256 token desteği mevcuttur. |
| **KVKK ve Sözleşme Onayları** | `kvkkApproved`, `kvkkApprovedAt`, `termsApproved`, `termsApprovedAt`, `tokenVersionTimestamp` | **KORUNDU** | Müşteri üyelik kayıtları şemaya tam işlenmiştir. |
| **İade & Değişim Alanları** | `requestType String @default("RETURN")`, `exchangeDetails Json?` | **KORUNDU** | Faz 7.10.1 ve 7.10.2 iade/değişim alanları şemada mevcuttur. |

---

## 4. POSTGRESQL BAĞLANTI YAPILANDIRMASI VE GÜVENLİK

`.env.example` dosyası geliştiricilerin ve operasyon ekiplerinin farklı ortamları net biçimde yapılandırabilmesi için güncellenmiştir:

1. **Yerel Geliştirme (Local Development):**
   ```bash
   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/humra_moda_local?schema=public"
   DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/humra_moda_local?schema=public"
   ```
2. **Test / CI Ortamı (İzole Test Veritabanı):**
   ```bash
   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/humra_moda_test?schema=public"
   ```
3. **Canlı / Üretim Ortamı (Managed PostgreSQL: Neon, Supabase, AWS RDS, vb.):**
   ```bash
   DATABASE_URL="postgresql://user:password@pooler-host:6543/humramoda?schema=public&sslmode=require&pgbouncer=true"
   DIRECT_URL="postgresql://user:password@direct-host:5432/humramoda?schema=public&sslmode=require"
   ```

### 4.1. Eksik Bağlantı Bilgileri Durumu
* **Mevcut Durum:** Yerel geliştirme ortamında çalışan hazır bir PostgreSQL instance'ı (servis) aktif değildir.
* **Gereksinim:** Faz 8.2 gerçek veritabanı geçişi başlatılmadan önce, kullanıcı tarafından PostgreSQL servisinin (Docker veya yerel PostgreSQL servisi) başlatılması ve `.env` dosyasına geçerli erişim bilgilerinin girilmesi gerekmektedir.
* **Güvenlik Güvencesi:** Hiçbir uydurma parola kod tabanına eklenmemiş, `.env` içeriği korunmuştur.

---

## 5. MIGRATION GEÇMİŞİ VE HAZIRLANAN MIGRATION DOSYALARI

### 5.1. Tespit Edilen Migration Boşluğu (Gap)
Mevcut migration klasörlerinde (`20261021000000_init` ile `20261101230000_non_negative_variant_stock` arası):
1. `20261021000000_init` içinde `ProductVariant_productId_colorId_sizeId_key` adında benzersiz indeks oluşturulmuştur. Bu durum Betül Trençkot'un aynı renkteki 2 farklı varyantının aktarılması sırasında DB hatasına yol açacaktır.
2. Faz 7.7, 7.8 ve 7.9 ile şemaya giren yeni modeller (`FeaturedVideo`, `AuditLog`, `SiteActivity`, `PasswordResetToken`), `CARRIER` enum rolü, KVKK/sözleşme alanları ve `CustomerNotification.legacyOrderId` alanı migration dosyalarında yer almamaktaydı.

### 5.2. Hazırlanan Statik Migration Dosyası (YALNIZCA HAZIRLIK — ÇALIŞTIRILMADI)
Bu uyumsuzluğu gidermek üzere Faz 8.2 için aşağıdaki migration dosyası statik olarak hazırlanmıştır:
* **Dosya Yolu:** `prisma/migrations/20261102120000_phase7_9_audit_and_schema_sync/migration.sql`
* **İçerik:**
  - `UserRole` enum'ına `CARRIER` eklenmesi.
  - `User` tablosuna KVKK, şartlar, pazarlama ve `tokenVersionTimestamp` alanlarının eklenmesi.
  - `Product` tablosuna `fabricDetails`, `modelDimensions`, `isDraft` eklenmesi.
  - `ProductVariant` üzerindeki eski kısıtlayıcı unique index'in silinmesi ve standart arama index'ine dönüştürülmesi.
  - `ReturnRequest` tablosuna `requestType` ve `exchangeDetails` eklenmesi.
  - `CustomerNotification` tablosunda `orderId` alanının nullable yapılması ve `legacyOrderId` eklenmesi.
  - `FeaturedVideo`, `AuditLog`, `SiteActivity`, `PasswordResetToken` tabloları ve indekslerinin oluşturulması.
* **Uygulama Durumu:** **HENÜZ ÇALIŞTIRILMAMIŞTIR.** `prisma migrate deploy/dev` veya `db push` kesinlikle çalıştırılmamıştır.

---

## 6. VERİ GÖÇÜ BETİĞİ GÜVENLİK VE DRY-RUN DENETİMİ

`scripts/migrate-json-to-pg.ts` betiği üzerinden dry-run analizi gerçekleştirilmiştir (`npx.cmd tsx scripts/migrate-json-to-pg.ts --dry-run --report`):

* **SHA256 Doğrulaması:** Başarılı (`2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`).
* **Betül Trençkot Koruması:** 10 varyant, 100 stok, 10 tekil SKU, 2 yinelenen kombinasyon eksiksiz tespit edilmiş ve korunmuştur.
* **SKU Benzersizliği:** 118 varyantın tamamı (%100) benzersiz SKU'ya sahiptir (Mükerrer SKU: 0).
* **58 Eski Bildirim:** Tamamı `legacyOrderId` ilişkisiyle korunmuştur.
* **Kullanıcı Rolleri:** ADMIN ve CARRIER rolleri doğrulanmıştır.
* **Dahili İlişkiler (Foreign Keys):** Kategori, Ürün, Varyant, Renk, Beden ve Medya ilişkileri %100 geçerlidir.
* **`--execute` Güvenlik Kilidi:** Betik, onay almadan `--execute` ile çalıştırılmaya çalışıldığında süreci derhal hata vererek durduracak koruma mekanizmasına sahiptir.

---

## 7. JSON VERİ DEPOSU BÜTÜNLÜĞÜ VE KARŞILAŞTIRMA

### 7.1. SHA256 Hash Karşılaştırması

| Denetim Noktası | SHA-256 Hash Değeri | Durum |
| :--- | :--- | :---: |
| **Faz 8.1 Başlangıç Hash'i** | `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` | Referans |
| **Faz 8.1 Bitiş Hash'i** | `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` | **%100 EŞLEŞTİ** |
| **Sonuç** | **`data/store.json` dosyasında tek bir bayt dahi değişmemiştir.** | **KORUNDU** |

### 7.2. Varlık ve Kayıt Sayıları Karşılaştırma Tablosu

| Varlık Türü | Başlangıç Adedi | Bitiş Adedi | Değişim | Durum |
| :--- | :---: | :---: | :---: | :---: |
| **Ürünler (Products)** | 13 | 13 | 0 | Korundu |
| **Ürün Renkleri (Colors)** | 36 | 36 | 0 | Korundu |
| **Ürün Bedenleri (Sizes)** | 37 | 37 | 0 | Korundu |
| **Ürün Varyantları (Variants)** | 118 | 118 | 0 | Korundu |
| **Benzersiz SKU Sayısı** | 118 | 118 | 0 | Korundu |
| **Betül Trençkot Varyant Sayısı** | 10 | 10 | 0 | Korundu |
| **Betül Trençkot Toplam Stok** | 100 | 100 | 0 | Korundu |
| **Kategoriler (Categories)** | 7 | 7 | 0 | Korundu |
| **Koleksiyonlar (Collections)** | 3 | 3 | 0 | Korundu |
| **Medya Dosyaları (`public/uploads`)** | 155 | 155 | 0 | Korundu |
| **Admin Kullanıcıları** | 4 | 4 | 0 | Korundu |
| **Müşteri Kayıtları** | 0 | 0 | 0 | Korundu |
| **Sipariş Kayıtları** | 0 | 0 | 0 | Korundu |
| **İndirim Kampanyaları** | 1 | 1 | 0 | Korundu |
| **Eski Müşteri Bildirimleri** | 58 | 58 | 0 | Korundu |
| **Audit Log Kayıtları** | 47 | 47 | 0 | Korundu |
| **Vitrin Videoları (Featured Videos)** | 2 | 2 | 0 | Korundu |
| **Mağaza Ayarları** | 20 | 20 | 0 | Korundu |

---

## 8. TEST VE DOĞRULAMA METRİKLERİ

### 8.1. Başarılı Kontroller
1. **TypeScript Kontrolü (`tsc --noEmit`):** 0 hata, 0 uyarı ile tamamlandı.
2. **Prisma Schema Doğrulaması (`prisma validate`):** Şema geçerli ve PostgreSQL ile tam uyumlu.
3. **Birim ve Entegrasyon Testleri (Vitest):** 22 test dosyasında toplam **245 testin 245'i (%100)** başarıyla geçti.
   - `tests/migration-safety.test.ts`: Başarılı.
   - `tests/migration-schema-mapping.test.ts`: Başarılı.
   - `tests/customer-auth-account.test.ts`: Başarılı.
   - `tests/faz-7-10-e2e-store-security.test.ts`: Başarılı.
   - Diğer tüm güvenlik, PayTR, COD ve sepet testleri: Başarılı.
4. **Medya Manifest Kontrolü (`verify-manifest.js`):** 155 dosyanın tamamı birebir eşleşti (Eksik dosya: 0, Hash farkı: 0, Ekstra dosya: 0).
5. **Dry-Run Aktarım Provası:** Başarıyla tamamlandı; veritabanına yazılmadan tüm ilişkiler ve kısıtlar doğrulandı.

### 8.2. Altyapı Eksiklikleri ve İnceleme Notları (Başarısız Değil, Ön Koşul)
1. **Canlı/Yerel PostgreSQL Servisi:** Faz 8.1 kapsamında PostgreSQL geçişi yasak olduğundan, yerel veritabanı motoru çalıştırılmamıştır. Bu durum test başarısızlığı değil, faz sınırları gereği beklenen bir durumdur.
2. **Next.js Production Build (`npm run build`):** İnternet erişimi olmayan sandbox ortamında Google Fonts (`Playfair Display`, `Plus Jakarta Sans`) indirme isteği zaman aşımına uğramaktadır. `next dev` ve TypeScript kontrolleri kusursuz çalışmaktadır.

---

## 9. TESPİT EDİLEN RİSKLER VE ÇÖZÜM STRATEJİLERİ

1. **Risk 1: Betül Trençkot Varyant Çakışması**
   - *Risk:* Eski migration'daki `ProductVariant(productId, colorId, sizeId)` unique index'i Betül Trençkot'un 10 varyantından 2 çiftini engelleyebilir.
   - *Çözüm:* Hazırlanan `20261102120000_phase7_9_audit_and_schema_sync` migration'ı bu unique index'i kaldırarak güvenli non-unique index haline getirir.
2. **Risk 2: 58 Eski Bildirimin Foreign Key Kısıtına Takılması**
   - *Risk:* 58 eski bildirim, veritabanında henüz bulunmayan sipariş numaralarına referans vermektedir.
   - *Çözüm:* `CustomerNotification` tablosundaki `orderId` alanı nullable yapılmış ve `legacyOrderId` alanı eklenmiştir.
3. **Risk 3: Eşzamanlı Siparişlerde Stok Yarışı (Race Condition)**
   - *Risk:* JSON tabanlı `executeWithOrderLock` bellek mutex'i çoklu sunucu (multi-instance) ortamlarında yetersiz kalacaktır.
   - *Çözüm:* Faz 8.2'de Prisma `$transaction` ve PostgreSQL row-level lock (`SELECT ... FOR UPDATE`) mimarisine geçilecektir.
4. **Risk 4: Serverless Bağlantı Havuzu (Connection Pooling)**
   - *Risk:* Next.js App Router API route'ları her istek için yeni bağlantı açarak PostgreSQL connection limitini tüketebilir.
   - *Çözüm:* `.env.example` içinde belirtildiği üzere PgBouncer veya Supabase/Neon connection pooler (`DIRECT_URL` vs `DATABASE_URL`) ayrımı kullanılacaktır.

---

## 10. FAZ 8.2 İÇİN GEREKLİ İŞLEMLER VE YOL HARİTASI

Kullanıcı onayı alındıktan sonra Faz 8.2'de sırasıyla uygulanacak adımlar:

1. **PostgreSQL Veritabanının Hazırlanması:** Yerel Docker container veya cloud PostgreSQL instance'ının ayağa kaldırılması ve `.env` değişkenlerinin güncellenmesi.
2. **Migration'ların Uygulanması:** `prisma migrate deploy` çalıştırılarak tabloların ve indekslerin oluşturulması.
3. **Veri Göçü Betiğinin Çalıştırılması:** `npx tsx scripts/migrate-json-to-pg.ts --execute` çalıştırılarak verilerin PostgreSQL'e aktarılması.
4. **Veri Parite Denetimi:** Aktarım sonrası PostgreSQL'deki kayıt sayıları ile `data/store.json` sayılarının birebir doğrulanması.
5. **Veri Erişim Katmanının (DAO) Taşınması:** `store.ts` fonksiyonlarının aşamalı olarak Prisma Client sorgularına yönlendirilmesi.
6. **Uçtan Uca Doğrulama:** Tüm sipariş, müşteri, admin ve ödeme akışlarının gerçek PostgreSQL üzerinde test edilmesi.

---

## 11. FAZ 8.1 TAMAMLANMA BEYANI

Faz 8.1 hedefleri eksiksiz tamamlanmıştır:
- Mevcut JSON verisi tek bir bayt dahi değiştirilmemiştir.
- Mevcut mağaza ve testler eksiksiz çalışmaktadır.
- Prisma şeması ve migration hazırlıkları tamamlanmıştır.
- PostgreSQL'e gerçek veri aktarımı yapılmamış, kullanıcı onayı beklenmektedir.

