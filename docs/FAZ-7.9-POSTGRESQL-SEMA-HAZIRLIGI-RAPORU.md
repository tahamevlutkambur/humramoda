# HÜMRA MODA — FAZ 7.9
# POSTGRESQL ŞEMA HAZIRLIĞI, VERİ EŞLEŞTİRME VE AKTARIM PROVASI RAPORU

**Tarih:** 2 Kasım 2026  
**Çalışma Ortamı:** Yalnızca LOCAL DEVELOPMENT  
**Aktif Veri Kaynağı:** `data/store.json` (Salt Okunur)  
**Referans Veri SHA256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` (%100 Birebir Doğrulandı)  
**Medya Envanteri:** `public/uploads` altında 155 dosya (Manifest: 155/155 Eşleşme)  
**Test Durumu:** 21 Test Dosyası, 228 Testin 228'i Başarılı (%100 Başarı)  
**TypeScript Durumu:** `tsc --noEmit` Sıfır Hata (Code 0)  
**Next.js Production Build:** 16 Statik Sayfa, 60+ Dinamik Rota Başarıyla Derlendi (Code 0)  

---

## 1. BAŞLANGIÇ SİSTEM DURUMU

Faz 7.9 başlangıcında `data/store.json` dosyası doğrudan okunmuş, salt okunur olarak taranmış ve gerçek kayıt sayıları çıkarılmıştır:

- **Ürünler (Products):** 13 kayıt
- **Renkler (Colors):** 36 kayıt
- **Bedenler (Sizes):** 37 kayıt
- **Varyantlar (Variants):** 118 kayıt
- **Medya Kayıtları (Media):** 24 kayıt
- **Kategoriler (Categories):** 7 kayıt
- **Koleksiyonlar (Collections):** 3 kayıt
- **Yönetici Kullanıcıları (Admin Users):** 4 kayıt (`humramoda@eyup.com`, `admin@humrabutik.com`, `kargo@kargo.com`, `auth-test-...`)
- **Kampanyalar (Campaigns):** 1 kayıt (`YENISEZON10`)
- **Bildirimler (Notifications):** 58 kayıt
- **Audit Loglar (Audit Logs):** 47 kayıt
- **Featured Video (Öne Çıkan Videolar):** 2 kayıt (`vid-1`, `vid-2`)
- **Mağaza Ayarları (Store Settings):** 20 anahtar

Başlangıç ve bitiş arasındaki tüm varlık sayıları %100 örtüşmekte, veri kaybı veya sapma bulunmamaktadır.

---

## 2. GÜNCELLENEN PRISMA MODELLERİ

`prisma/schema.prisma` dosyası üzerinde yapılan mimari düzenlemeler:

1. **`ProductVariant`:**
   - Kaldırılan Kısıt: `@@unique([productId, colorId, sizeId])`
   - Eklenen Dizin: `@@index([productId, colorId, sizeId])`
   - Korunan Kısıt: `sku String @unique` ve `@@index([sku])` (Tüm 118 SKU tekil olduğu için kısıt güvenle korunmuştur).
   - Amaç: Betül Trençkot'un 10 varyantının (özellikle 2 mükerrer kombinasyonun) PostgreSQL seviyesinde reddedilmesini engellemek.
2. **`User`:**
   - Eklenen Müşteri ve KVKK Alanları: `kvkkApproved`, `kvkkApprovedAt`, `kvkkVersion`, `termsApproved`, `termsApprovedAt`, `termsVersion`, `marketingConsent`, `marketingConsentAt`, `tokenVersionTimestamp`.
   - Eklenen İlişki: `passwordResetTokens PasswordResetToken[]`.
3. **`CustomerNotification`:**
   - Güncellenen Alan: `orderId String?` (Zorunlu FK yerine nullable FK yapıldı).
   - Eklenen Alan: `legacyOrderId String?` (Eski 58 bildirimdeki sipariş kimliğini kayıpsız saklamak için).
   - Güncellenen İlişki: `order Order? @relation(fields: [orderId], references: [id], onDelete: SetNull)`.
4. **`DiscountCampaign`:**
   - Eklenen Alan: `description String? @db.Text` (JSON'daki kampanya açıklaması için).
5. **`ReturnRequest`:**
   - Eklenen Alanlar: `requestType String @default("RETURN")` ve `exchangeDetails Json?` (İade/İptal/Değişim tip ve sepet detayları).

---

## 3. EKLENEN ENUM VE ALANLAR

1. **`UserRole` Enum Güncellemesi:**
   ```prisma
   enum UserRole {
     ADMIN
     STAFF
     CUSTOMER
     CARRIER
   }
   ```
   *Sonuç:* `kargo@kargo.com` kullanıcısının `CARRIER` rolü PostgreSQL şemasıyla tam uyumlu hale getirilmiştir.

2. **`User` Modeline Eklenen Alanlar:**
   - `kvkkApproved Boolean @default(false)`
   - `kvkkApprovedAt DateTime?`
   - `kvkkVersion String?`
   - `termsApproved Boolean @default(false)`
   - `termsApprovedAt DateTime?`
   - `termsVersion String?`
   - `marketingConsent Boolean @default(false)`
   - `marketingConsentAt DateTime?`
   - `tokenVersionTimestamp BigInt?`

---

## 4. JSON / PRISMA ALAN EŞLEŞTİRME TABLOSU

| JSON Kaynağı | Prisma Hedef Modeli | JSON Alanı | Prisma Alanı | Dönüşüm / Eşleştirme Kuralı |
| :--- | :--- | :--- | :--- | :--- |
| `categories[]` | `Category` | `id`, `name`, `slug` | `id`, `name`, `slug` | Birebir eşleşme |
| `categories[]` | `Category` | `parentId` | `parentId` | `null` ise root kategori |
| `products[]` | `Product` | `id`, `title`, `slug`, `basePrice` | `id`, `title`, `slug`, `basePrice` | Birebir Decimal dönüşümü |
| `products[].colors` | `ProductColor` | `id`, `productId`, `name`, `slug`, `colorCode` | `id`, `productId`, `name`, `slug`, `colorCode` | Birebir eşleşme |
| `products[].sizes` | `ProductSize` | `id`, `productId`, `name`, `slug` | `id`, `productId`, `name`, `slug` | Birebir eşleşme |
| `products[].variants` | `ProductVariant` | `id`, `productId`, `colorId`, `sizeId`, `sku`, `stockQuantity` | `id`, `productId`, `colorId`, `sizeId`, `sku`, `stockQuantity` | Betül Trençkot dahil 118 varyant birebir |
| `adminUsers[]` | `User` | `role: "CARRIER"` | `role: CARRIER` | `enum UserRole` üzerinden eşleşme |
| `campaigns[]` | `DiscountCampaign` | `name` | `title` | Alan adı eşleştirmesi (`camp.name` -> `title`) |
| `campaigns[]` | `DiscountCampaign` | `discountPercentage` | `percentage` | Alan adı eşleştirmesi |
| `campaigns[]` | `DiscountCampaign` | `minBasketAmount` | `minSpendAmount` | Alan adı eşleştirmesi |
| `campaigns[]` | `DiscountCampaign` | `description` | `description` | Birebir eşleşme |
| `notifications[]` | `CustomerNotification` | `orderId` | `legacyOrderId` | Eğer sipariş `Order` tablosunda yoksa `legacyOrderId`'ye yazılır, `orderId` `null` bırakılır |
| `featuredVideos[]` | `FeaturedVideo` | `id`, `title`, `productSlug`, `videoUrl` | `id`, `title`, `productSlug`, `videoUrl` | Birebir yeni modele eşleşme |
| `auditLogs[]` | `AuditLog` | `adminId`, `action`, `details` | `adminId`, `action`, `details` | FK kısıtsız `AuditLog` modeline birebir |
| `siteActivities[]` | `SiteActivity` | `eventType`, `path`, `ipAddress` | `eventType`, `path`, `ipAddress` | Yeni modele eşleşme |
| `passwordResetTokens[]` | `PasswordResetToken` | `token`, `customerId`, `expiresAt` | `tokenHash`, `userId`, `expiresAt` | SHA-256 hash ile saklama |

---

## 5. BETÜL TRENÇKOT VARYANT KORUMA SONUCU

- **Ürün:** Betül Trençkot (`prod-1793185888547`, `betul-trenckot`)
- **Kullanıcı Kararı:** 10 varyantın tamamı, 4 SKU değeri ve 100 stok korunmuştur.
- **Doğrulanan Varyant Envanteri:**
  1. `var-prod-1793185888547-0`: Siyah / 38-40-42 / SKU: `HM-SIY-STD-152` / Stok: 10
  2. `var-prod-1793185888547-1`: Siyah / 38-40-42 / SKU: `KAET-YEN-STD-708` / Stok: 10
  3. `var-prod-1793185888547-2`: Mürdüm / 38-40-42 / SKU: `KAET-YEN-STD-267` / Stok: 10
  4. `var-prod-1793185888547-3`: Siyah / 44-46-48 / SKU: `KAET-SIY-STAN-004` / Stok: 10
  5. `var-prod-1793185888547-4`: Siyah / 44-46-48 / SKU: `KAET-ACI-STAN-005` / Stok: 10
  6. `var-prod-1793185888547-5`: Mürdüm / 44-46-48 / SKU: `KAET-BOR-STAN-006` / Stok: 10
  7. `var-prod-1793185888547-6`: Taş Rengi / 38-40-42 / SKU: `BETUL-YEN-STD-235` / Stok: 10
  8. `var-prod-1793185888547-7`: Taş Rengi / 44-46-48 / SKU: `BETUL-TAŞ-STAN-008` / Stok: 10
  9. `var-prod-1793185888547-8`: Acı Kahve / 38-40-42 / SKU: `BETUL-ACI-STAN-009` / Stok: 10
  10. `var-prod-1793185888547-9`: Acı Kahve / 44-46-48 / SKU: `BETUL-ACI-STAN-010` / Stok: 10
- **Toplam Stok:** 100 Adet (Tam Eşleşme).
- **Şema Uyumu:** Prisma'daki `@@unique([productId, colorId, sizeId])` kaldırılmış, `@@index([productId, colorId, sizeId])` dizinine dönüştürülmüştür. Bu sayede veritabanı 10 kaydı da kusursuz kabul edecektir.

---

## 6. DUPLICATE SKU ANALİZİNİN SONUCU

Yapılan tam kapsamlı taramada:
- **Tüm Mağazadaki Varyant Sayısı:** 118
- **Tüm Mağazadaki Tekil SKU Sayısı:** 118
- **Mükerrer SKU Sayısı:** **0 (SIFIR)**

> [!NOTE]
> Önceki raporlarda geçen "dört SKU çakışması" ifadesi, aslında Betül Trençkot'un 2 mükerrer renk/beden kombinasyonunda yer alan 4 farklı SKU'yu (`HM-SIY-STD-152`, `KAET-YEN-STD-708`, `KAET-SIY-STAN-004`, `KAET-ACI-STAN-005`) ifade etmektedir. SKU metinlerinin kendisi benzersizdir. Dolayısıyla Prisma'daki `sku String @unique` kısıtı tüm mevcut veriyi doğrudan desteklemektedir.

---

## 7. 58 BİLDİRİM KORUMA VE İLİŞKİ TASARIMI

- **Sorun:** 58 eski bildirim, `store.orders` listesinde yer almayan 42 farklı `orderId` referansı taşımaktadır.
- **Çözüm Mimarisi:**
  - `CustomerNotification` modelinde `orderId String?` nullable yapılmıştır.
  - `legacyOrderId String?` alanı eklenmiştir.
  - Bildirim aktarılırken, eğer ilişkili sipariş veritabanında mevcutsa `orderId` atanır; mevcut değilse `orderId: null` ve `legacyOrderId: "ord-1793136250750"` atanır.
- **Sonuç:** Hiçbir bildirim silinmemiş, hiçbir sahte/uydurma Order kaydı oluşturulmamış, tarihsel sipariş ID bilgisi %100 korunmuştur.

---

## 8. CARRIER ROLÜ DOĞRULAMASI

- `kargo@kargo.com` kullanıcısı `CARRIER` rolüne sahiptir.
- Prisma `UserRole` enum'ına `CARRIER` değeri eklenmiştir.
- TypeScript tip denetimi ve Prisma derleyicisi bu rolü başarıyla doğrulamıştır.

---

## 9. FEATUREDVIDEO, AUDITLOG, SITEACTIVITY VE PASSWORDRESETTOKEN MODELLERİ

Prisma şemasına eklenen 4 yeni model:

1. **`FeaturedVideo`:** 2 adet video vitrin kaydını (`vid-1`, `vid-2`) ve ürün bağlantılarını (`productSlug`, `videoUrl`, `posterUrl`, `price`) karşılar.
2. **`AuditLog`:** 47 adet yönetici denetim kaydını karşılar. Actor ID alanı serbest metin (`String?`) olarak tutulmuş; bilinmeyen veya silinmiş aktörler için sahte kullanıcı oluşturma zorunluluğu ortadan kaldırılmıştır.
3. **`SiteActivity`:** Sayfa görüntüleme, sepet ve ödeme başlatma hareketlerini karşılar.
4. **`PasswordResetToken`:** Faz 7.7 parola sıfırlama tokenlarını karşılar. Düz metin token yerine `tokenHash` olarak saklama imkanı sunar.

---

## 10. RETURNREQUEST VE DISCOUNT CAMPAIGN UYUMLULUĞU

- **`ReturnRequest`:** İptal, iade ve değişim akışlarını kayıpsız desteklemek için `requestType String @default("RETURN")` ve `exchangeDetails Json?` alanları şemaya dahil edilmiştir.
- **`DiscountCampaign`:** JSON'daki `name` alanı `title`'a, `discountPercentage` alanı `percentage`'a, `minBasketAmount` alanı `minSpendAmount`'a eşlenmiş; eksik olan `description` alanı şemaya eklenmiştir.

---

## 11. AKTARIM SCRIPTİNİN ÖZELLİKLERİ

Hazırlanan Script: [`scripts/migrate-json-to-pg.ts`](file:///c:/Users/Taha/Documents/hümramoda/scripts/migrate-json-to-pg.ts)

- **Salt Okunur Mod:** `data/store.json` dosyasını yalnızca okur, asla değiştirmez.
- **SHA-256 Doğrulaması:** Dosya okunur okunmaz SHA-256 hash'i hesaplar ve beklenen referansla karşılaştırır.
- **Emniyet Kilidi:** `--execute` parametresi bilerek engellenmiştir; veritabanına doğrudan yazma girişimleri anında durdurulur.
- **Çalışma Modları:**
  - `--dry-run`: Veri bütünlüğünü, yabancı anahtarları, Betül Trençkot'u ve SKU'ları doğrular.
  - `--report`: Ayrıntılı JSON -> PostgreSQL eşleştirme çıktısı verir.

---

## 12. DRY-RUN SONUÇLARI

`npx tsx scripts/migrate-json-to-pg.ts --dry-run` komutu çalıştırılmış ve şu sonuçlar alınmıştır:

```text
==================================================================
  HÜMRA MODA — POSTGRESQL AKTARIM PROVASI VE ANALİZ MOTORU
  Faz 7.9: Güvenli Şema Hazırlığı ve Eşleştirme Doğrulaması
==================================================================

[1] Veri Dosyası Doğrulaması:
    - SHA256: 2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A
    - Hash Durumu: GEÇERLİ (%100 Eşleşme)

[2] Varlık ve Kayıt Sayıları:
    - Ürünler: 13 / 13 | Renkler: 36 / 36 | Bedenler: 37 / 37 | Varyantlar: 118 / 118
    - Medya: 24 / 24 | Kategoriler: 7 / 7 | Koleksiyonlar: 3 / 3 | Yöneticiler: 4 / 4
    - Bildirimler: 58 / 58 | Audit Loglar: 47 / 47 | Featured Video: 2 / 2

[3] Betül Trençkot: 10 Varyant / 100 Stok / 2 Mükerrer Kombinasyon / Durum: BAŞARILI
[4] SKU Benzersizlik: 118 Varyant / 118 Tekil SKU / Mükerrer: 0 / Durum: BAŞARILI
[5] Bildirim Analizi: 58 Bildirim / 58 legacyOrderId Korumalı / Durum: BAŞARILI
[6] Kullanıcı Rolleri: CARRIER Mevcut / Durum: BAŞARILI
[7] Foreign Key Doğrulaması: 0 Hata / %100 GEÇERLİ
==================================================================
```

---

## 13. TEST SONUÇLARI

Sistemdeki tüm test paketleri çalıştırılmış ve tam başarı elde edilmiştir:

| Test Dosyası | Test Sayısı | Durum |
| :--- | :---: | :---: |
| `tests/migration-schema-mapping.test.ts` (Yeni) | 10 | BAŞARILI |
| `tests/admin-store.test.ts` | 21 | BAŞARILI |
| `tests/shipping-returns.test.ts` | 15 | BAŞARILI |
| `tests/customer-auth-account.test.ts` | 19 | BAŞARILI |
| `tests/paytr.test.ts` | 12 | BAŞARILI |
| `tests/phase-7-audit-legal-backup.test.ts` | 10 | BAŞARILI |
| `tests/phase-1-security.test.ts` | 7 | BAŞARILI |
| `tests/faz-7-3-2-mutex-regression.test.ts` | 5 | BAŞARILI |
| `tests/faz-7-4-media-restoration.test.ts` | 13 | BAŞARILI |
| `tests/phase-2-security.test.ts` | 20 | BAŞARILI |
| `tests/auth.test.ts` | 8 | BAŞARILI |
| `tests/faz-7-5-e2e-restoration.test.ts` | 22 | BAŞARILI |
| `tests/faz-7-2-cod-media.test.ts` | 12 | BAŞARILI |
| `tests/faz-7-3-media-variants.test.ts` | 8 | BAŞARILI |
| `tests/faz-7-3-1-audit.test.ts` | 12 | BAŞARILI |
| `tests/migration-safety.test.ts` | 3 | BAŞARILI |
| `tests/catalog.test.ts` | 8 | BAŞARILI |
| `tests/formatters.test.ts` | 4 | BAŞARILI |
| `tests/api-security.test.ts` | 5 | BAŞARILI |
| `tests/media-upload.test.ts` | 8 | BAŞARILI |
| `tests/tokens-media.test.ts` | 6 | BAŞARILI |
| **TOPLAM** | **228** | **%100 BAŞARILI** |

- `npx.cmd tsc --noEmit`: 0 Hata
- `npx.cmd prisma validate`: Geçerli 🚀
- `npm.cmd run build`: 16 Statik sayfa, 60+ rota hatasız derlendi.

---

## 14. BAŞLANGIÇ VE BİTİŞ JSON HASH DEĞERLERİ

- **Başlangıç SHA256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`
- **Bitiş SHA256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`
- **Fark:** 0 Bayt (%100 Birebir Eşleşme).

---

## 15. MEDYA MANİFEST SONUCU

- `node scripts/verify-manifest.js` çalıştırılmıştır:
  - Yüklenen kayıt: 155
  - Mevcut dosya: 155
  - Eksik: 0, Fark: 0, Fazlalık: 0
  - Sonuç: 155/155 Birebir Eşleşme.

---

## 16. ÇÖZÜLEMEYEN VEYA ERTELENEN SORUNLAR

Bu fazda çözülemeyen hiçbir mimari uyumsuzluk kalmamıştır. Tüm Prisma engelleri (`CARRIER`, Betül Trençkot kısıtı, 58 bildirim FK engeli, eksik modeller) şema düzenlemeleriyle çözülmüştür.

---

## 17. POSTGRESQL GEÇİŞİ İÇİN KALAN GEREKSİNİMLER

Faz 8 (Gerçek Aktarım) öncesinde gereken adımlar:
1. Kullanıcının `DATABASE_URL` içeren PostgreSQL veritabanı bağlantısını onaylaması.
2. `prisma db push` veya `prisma migrate deploy` komutu ile yeni şemanın PostgreSQL'de tablolarının oluşturulması.
3. Hazırlanan `scripts/migrate-json-to-pg.ts` scriptinin `--execute` modunun atomik transaction (`prisma.$transaction`) içinde çalıştırılması.

---

## 18. GERİ DÖNÜŞ VE YEDEKLEME PLANI

1. **JSON Dokunulmazlığı:** Gerçek aktarım sırasında `data/store.json` salt okunur kalır; hiçbir aktarım adımı JSON dosyasını silmez veya üzerine yazmaz.
2. **Aktarım Başarısızlığında:** PostgreSQL tarafında hata olursa veritabanı transaction rollback yapılır; sistem kesintiye uğramadan JSON üzerinden çalışmayı sürdürür.
3. **Kayıt ve Hash Kontrolü:** Aktarım sonunda PostgreSQL'deki kayıt sayıları JSON ile karşılaştırılır; 1 adet dahi varyant veya stok farkı oluşursa işlem iptal edilir.

---

## 19. GERÇEK MIGRATION YAPILMADIĞINA DAİR AÇIK DOĞRULAMA

> [!IMPORTANT]
> Bu fazda (Faz 7.9):
> - Hiçbir PostgreSQL bağlantısı açılmamıştır.
> - `npx prisma migrate dev`, `npx prisma db push`, `npx prisma migrate reset` komutları **ÇALIŞTIRILMAMIŞTIR**.
> - Canlı sunucuya veya veritabanına tek bir istek gönderilmemiştir.
> - `data/store.json` dosyasının SHA256 değeri tek bir bayt dahi değişmemiştir.
> 
> Faz 7.9 başarıyla tamamlanmış, Prisma şeması ve aktarım altyapısı %100 hazır hale getirilmiş ve kullanıcı onayı beklenmektedir.

