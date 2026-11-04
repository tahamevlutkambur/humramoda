# HÜMRA MODA — FAZ 8.4: POSTGRESQL VERİ AKTARIMI, İZOLASYON VE GERİ DÖNÜŞ DOĞRULAMA RAPORU

**Tarih:** 2 Kasım 2026  
**Faz:** 8.4 — JSON Verilerinin PostgreSQL'e Kontrollü Aktarımı, Veri Parite Testi ve Geri Dönüş Doğrulaması  
**Proje:** Hümra Moda E-Ticaret Platformu  
**Kaynak Veri:** `data/store.json`  
**Hedef Ortam:** Docker PostgreSQL Test Container (`humra-postgres-test-83`)  
**Hedef Veritabanı:** `humra_migration_test`  
**Yetkili Veritabanı Kullanıcısı:** `humra_test`  
**Aktif Mağaza Veri Deposu:** JSON tabanlı `data/store.json` (Değişmedi, %100 korundu)

---

## 1. YÜRÜTME ÖZETİ VE GÜVENLİK SINIRLARI

Faz 8.4 kapsamında, Hümra Moda projesinin `data/store.json` dosyasındaki gerçek mağaza verileri, Faz 8.3'te Docker üzerinde kurulan ve 6 migration dosyasının tamamı uygulanan izole PostgreSQL 16 veritabanına (`humra_migration_test`) tek bir atomik transaction içerisinde aktarılmış, veri paritesi %100 doğrulanmış, mükerrer aktarım (idempotency) ve iki farklı geri dönüş (rollback) senaryosu test edilerek başarıyla tamamlanmıştır.

### Kesin Koruma Kuralları Uyumu:
1. **Kaynak Veri Bütünlüğü:** `data/store.json` dosyası kesinlikle salt okunur modda kullanılmış, dosya içeriğinde hiçbir değişiklik yapılmamış ve SHA256 baseline değeri korunmuştur:
   - **Başlangıç SHA256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`
   - **Bitiş SHA256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`
   - **Durum:** %100 Eşleşme (Kusursuz Bütünlük)
2. **Ön-Aktarım Yedeği:** Aktarım öncesinde `backups/phase-8-4/store-before-postgres-migration.json` yedeği ve SHA256 manifesti oluşturulmuştur.
3. **Canlı/Production İzolasyonu:** `.env` ve `.env.local` dosyaları kesinlikle değiştirilmemiştir. Hiçbir dış canlı veritabanına veya üretim sunucusuna bağlantı kurulmamıştır.
4. **Kod Tabanı İzolasyonu:** Aktif uygulama veri erişim katmanı (`src/lib/server/store.ts`) değiştirilmemiş, mağaza JSON altyapısıyla kesintisiz çalışmaya devam etmiştir.
5. **Güvenlik Kapısı (Safety Gate):** Aktarım motoru (`scripts/migrate-json-to-pg.ts`), `--execute` parametresinin tek başına girilmesini engellemiş; zorunlu olarak `--target=docker-test` parametresini ve veritabanı kimlik doğrulamasını (`current_database() = 'humra_migration_test'`, `current_user = 'humra_test'`) şart koşmuştur.

---

## 2. TEST DOCKER VE POSTGRESQL ORTAMI

| Parametre | Değer / Açıklama |
| :--- | :--- |
| **Docker Container** | `humra-postgres-test-83` (healthy) |
| **PostgreSQL Sürümü** | PostgreSQL 16.11 (Alpine) on x86_64 |
| **Port Eşlemesi** | `127.0.0.1:5432 -> 5432/tcp` (Yalnızca localhost loopback) |
| **Veritabanı Adı** | `humra_migration_test` |
| **Veritabanı Kullanıcısı** | `humra_test` |
| **Konteyner Volume** | `humra_pg_test_volume_83` |
| **Uygulanan Migration Sayısı** | 6 / 6 migration eksiksiz uygulanmış |
| **Uygulama Tabloları** | Tam 30 tablo + `_prisma_migrations` |

---

## 3. VERİ AKTARIM MOTORU VE İŞLEM SONUÇLARI

Aktarım motoru `scripts/migrate-json-to-pg.ts`, tüm varlıkları yabancı anahtar (Foreign Key) hiyerarşisine uygun sırada ve `prisma.$transaction` bloğu içerisinde tek bir atomik işlem olarak Docker PostgreSQL test veritabanına aktarmıştır.

### Komut:
```bash
npx tsx scripts/migrate-json-to-pg.ts --execute --target=docker-test
```

### İşlem Süresi:
- **Transaction Süresi:** 417 ms
- **Sonuç:** `SUCCESS` (Transaction başarıyla commit edildi)

### Tablo Bazında Eklenen / Aktarılan Kayıt Sayıları:

| No | Tablo Adı | JSON Kaynak Sayısı | PostgreSQL Eklenen Sayı | Durum |
| :---: | :--- | :---: | :---: | :---: |
| 1 | `User` (Admin & Görevli Kullanıcılar) | 4 | 4 | **%100 BAŞARILI** |
| 2 | `Category` (Ürün Kategorileri) | 7 | 7 | **%100 BAŞARILI** |
| 3 | `Collection` (Katalog Koleksiyonları) | 3 | 3 | **%100 BAŞARILI** |
| 4 | `Product` (Ana Ürünler) | 13 | 13 | **%100 BAŞARILI** |
| 5 | `ProductCollection` (Ürün-Koleksiyon Eşleşmesi) | 26 | 26 | **%100 BAŞARILI** |
| 6 | `ProductColor` (Ürün Renkleri) | 36 | 36 | **%100 BAŞARILI** |
| 7 | `ProductSize` (Ürün Bedenleri) | 37 | 37 | **%100 BAŞARILI** |
| 8 | `ProductVariant` (SKU & Stok Varyantları) | 118 | 118 | **%100 BAŞARILI** |
| 9 | `ProductMedia` (Görsel ve Medya Galerisi) | 24 | 24 | **%100 BAŞARILI** |
| 10 | `DiscountCampaign` (İndirim Kampanyaları) | 1 | 1 | **%100 BAŞARILI** |
| 11 | `FeaturedVideo` (Öne Çıkan Video Modülü) | 2 | 2 | **%100 BAŞARILI** |
| 12 | `StoreSetting` (Mağaza ve Entegrasyon Ayarları) | 20 | 20 | **%100 BAŞARILI** |
| 13 | `CustomerNotification` (Müşteri Bildirimleri) | 58 | 58 | **%100 BAŞARILI** |
| 14 | `AuditLog` (Güvenlik ve İşlem Günlükleri) | 47 | 47 | **%100 BAŞARILI** |
| **TOPLAM** | **14 Aktif Tablo** | **396 Kayıt** | **396 Kayıt** | **SIFIR KAYIP / SIFIR HATA** |

---

## 4. KRİTİK İLİŞKİ VE KORUMA DOĞRULAMALARI

### 4.1. Betül Trençkot (`prod-1793185888547`)
- **Varyant Sayısı:** 10 / 10 (%100 korundu)
- **Toplam Stok Miktarı:** 100 / 100 (%100 korundu)
- **Benzersiz SKU Sayısı:** 10 adet benzersiz SKU (Hiçbir varyant silinmedi veya birleştirilmedi)
- **Mükerrer Renk/Beden Kombinasyonları:** 2 adet aynı renk ve bedene sahip varyant çifti, PostgreSQL'in Faz 8.3'te doğrulanan `ProductVariant_productId_colorId_sizeId_idx` (non-unique index) yapısı sayesinde veri kaybı olmaksızın veritabanına yazılmıştır.

### 4.2. Müşteri Bildirimleri (`CustomerNotification`)
- **Toplam Bildirim Sayısı:** 58 / 58
- **`orderId` Durumu:** 58 / 58 NULL (Foreign Key ihlali önlendi)
- **`legacyOrderId` Durumu:** 58 / 58 dolu (Eski sipariş referansları kayıpsız aktarıldı)
- **`idempotencyKey` Benzersizliği:** 58 / 58 benzersiz anahtar doğrulandı.

### 4.3. Güvenlik Denetim Günlükleri (`AuditLog`)
- **Toplam Kayıt Sayısı:** 47 / 47
- **Aktör Referansı (`adminId` / `actorId`):** 47 / 47 kayıtın tamamında aktör kimliği korundu.
- **İşlem Türleri:** Şifre rotasyonları, ürün güncellemeleri ve sipariş olayları eksiksiz aktarıldı.

### 4.4. Mağaza Ayarları (`StoreSetting`)
- **Toplam Ayar Sayısı:** 20 / 20
- **Kritik Anahtarlar:** `storeName`, `currency`, `shippingFee`, `freeShippingThreshold`, `paytr`, `taxNumber`, `mersisNumber` eksiksiz aktarıldı.

---

## 5. MÜKERRER AKTARIM (IDEMPOTENCY) DOĞRULAMA TESTİ

Aynı aktarım komutu ikinci kez çalıştırılarak `skipDuplicates: true` mekanizması test edilmiştir:

```bash
npx tsx scripts/migrate-json-to-pg.ts --execute --target=docker-test
```

### İkinci Çalıştırma Sonuçları:
- **İşlem Durumu:** `SUCCESS` (311 ms)
- **Hata Sayısı:** 0 (Hiçbir unique constraint hatası alınmadı)
- **Eklenen Kayıt Sayıları:**
  - `User`: 0 yeni kayıt (Mevcut: 4)
  - `Category`: 0 yeni kayıt (Mevcut: 7)
  - `Collection`: 0 yeni kayıt (Mevcut: 3)
  - `Product`: 0 yeni kayıt (Mevcut: 13)
  - `ProductCollection`: 0 yeni kayıt (Mevcut: 26)
  - `ProductColor`: 0 yeni kayıt (Mevcut: 36)
  - `ProductSize`: 0 yeni kayıt (Mevcut: 37)
  - `ProductVariant`: 0 yeni kayıt (Mevcut: 118)
  - `ProductMedia`: 0 yeni kayıt (Mevcut: 24)
  - `DiscountCampaign`: 0 yeni kayıt (Mevcut: 1)
  - `FeaturedVideo`: 0 yeni kayıt (Mevcut: 2)
  - `StoreSetting`: 0 yeni kayıt (Mevcut: 20)
  - `CustomerNotification`: 0 yeni kayıt (Mevcut: 58)
  - `AuditLog`: 0 yeni kayıt (Mevcut: 47)
- **Değerlendirme:** Script tam anlamıyla idempotenttir; defalarca çalıştırılsa bile veritabanı tutarlılığını bozmaz ve mükerrer kayıt üretmez.

---

## 6. GERİ DÖNÜŞ (ROLLBACK) DOĞRULAMA TESTLERİ

### Senaryo A: Transaction Rollback ve Atomiklik Testi
- **Test Dosyası:** `scratch/test-transaction-rollback.ts`
- **Yöntem:** `$transaction` içerisinde geçici bir kayıt (`User`) eklendi, transaction içinde kaydın geçici olarak var olduğu (User: 5) doğrulandı ve ardından kasıtlı bir istisna (`SİMÜLE_EDİLEN_KRİTİK_HATA`) fırlatıldı.
- **Sonuç:**
  - Hata güvenle yakalandı.
  - PostgreSQL transaction'ı tamamen geri aldı (ROLLBACK).
  - Transaction sonrası sorguda `User` sayısı 4 olarak teyit edildi.
  - **Değerlendirme:** Atomiklik %100 kanıtlandı; herhangi bir hata durumunda kısmi veya bozuk veri sızması imkansızdır.

### Senaryo B: `pg_dump` ve İzole Restore Doğrulama Testi
- **Test Scripti:** `scratch/test-pgdump-restore.ps1`
- **Yöntem:**
  1. Docker konteyneri içerisinde `pg_dump -U humra_test -d humra_migration_test -f /tmp/backup.sql` komutuyla tam mantıksal yedek alındı.
  2. İzole yeni test veritabanı `humra_migration_restore_test` oluşturuldu.
  3. `psql` ile yedek bu veritabanına restore edildi.
  4. Restore edilen veritabanında satır sayıları ve Betül Trençkot stokları sorgulandı.
- **Restore Edilen Veritabanı Sonuçları:**
  - `User`: 4
  - `Category`: 7
  - `Collection`: 3
  - `Product`: 13
  - `ProductCollection`: 26
  - `ProductColor`: 36
  - `ProductSize`: 37
  - `ProductVariant`: 118
  - `ProductMedia`: 24
  - `DiscountCampaign`: 1
  - `FeaturedVideo`: 2
  - `StoreSetting`: 20
  - `CustomerNotification`: 58
  - `AuditLog`: 47
  - **Betül Trençkot Varyant Sayısı:** 10
  - **Betül Trençkot Toplam Stok:** 100
- **Temizlik:** Restore test veritabanı ve dump dosyası güvenle imha edildi.
- **Değerlendirme:** PostgreSQL veritabanının yedeğinin eksiksiz alınabildiği ve başka bir veritabanına sıfır kayıpla geri yüklenebildiği kanıtlanmıştır.

---

## 7. OTOMATİZE TEST VE BÜTÜNLÜK METRİKLERİ

| Kontrol / Test Adımı | Beklenen Değer | Gerçekleşen Değer | Durum |
| :--- | :---: | :---: | :---: |
| **`data/store.json` SHA256** | `28751735...` | `28751735...` | **%100 Eşleşti** |
| **Medya Dosyaları (Uploads)** | 155 / 155 | 155 / 155 | **%100 Eşleşti** |
| **TypeScript Derleme (`tsc`)** | 0 Hata | 0 Hata | **BAŞARILI** |
| **Vitest Test Paketi** | 24 Suite / 265 Test | 24 Suite / 265 Test | **%100 GEÇTİ** |
| **PostgreSQL Parite Testi** | 10 / 10 Kontrol | 10 / 10 Kontrol | **%100 GEÇTİ** |
| **Prisma Schema Doğrulaması** | Geçerli | Geçerli | **BAŞARILI** |

---

## 8. SONUÇ VE FAZ 8.5'E GEÇİŞ ÖNERİSİ

Faz 8.4 hedeflerinin tamamı başarıyla yerine getirilmiştir:
- Gerçek mağaza verisi izole Docker PostgreSQL veritabanına sıfır kayıpla aktarılmıştır.
- Veri paritesi hem testlerle hem SQL sorgularıyla doğrulanmıştır.
- Betül Trençkot varyantları ve stokları eksiksiz korunmuştur.
- Idempotency ve iki farklı rollback yöntemi doğrulanmıştır.
- Mevcut JSON tabanlı çalışan mağaza altyapısı hiçbir şekilde etkilenmemiştir.

**Bir Sonraki Adım:** Kullanıcı onayı alınarak, DAO geçiş analizi doğrultusunda `store.ts` veri erişim fonksiyonlarının Prisma ORM'e aktarılacağı **Faz 8.5**'e geçilebilir.

