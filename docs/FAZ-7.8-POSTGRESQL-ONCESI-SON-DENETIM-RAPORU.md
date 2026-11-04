# HÜMRA MODA — FAZ 7.8
# GÜVENLİK, ÜYELİK VE POSTGRESQL ÖNCESİ SON SİSTEM DENETİM RAPORU

**Tarih:** 2 Kasım 2026  
**Çalışma Ortamı:** Yalnızca LOCAL DEVELOPMENT  
**Aktif Veri Kaynağı:** `data/store.json`  
**Referans Veri SHA256 (Başlangıç ve Bitiş):**  
`2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` (%100 Birebir Doğrulandı)  
**Medya Dosya Sayısı:** `public/uploads` altında 155 dosya (Manifest: 155/155 eşleşme)  
**Test Durumu:** 20 Test Paketi, 218 Testin 218'i Başarılı (%100 Başarı)  
**TypeScript Durumu:** 0 Derleme Hatası (`tsc --noEmit` hatasız)  

---

## 1. DENETLENEN MODÜLLER

Faz 7.8 kapsamında sistemin tamamı PostgreSQL aktarımı ve canlı dağıtım öncesi bağımsız denetime tabi tutulmuştur:

1. **Müşteri Üyelik, Giriş ve Oturum Güvenliği (Faz 7.7):**
   - [`src/app/kayit/page.tsx`](file:///c:/Users/Taha/Documents/hümramoda/src/app/kayit/page.tsx) ve [`src/app/api/auth/register/route.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/app/api/auth/register/route.ts)
   - [`src/app/giris/page.tsx`](file:///c:/Users/Taha/Documents/hümramoda/src/app/giris/page.tsx) ve [`src/app/api/auth/login/route.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/app/api/auth/login/route.ts)
   - [`src/app/sifremi-unuttum/page.tsx`](file:///c:/Users/Taha/Documents/hümramoda/src/app/sifremi-unuttum/page.tsx) ve [`src/app/api/auth/forgot-password/route.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/app/api/auth/forgot-password/route.ts)
   - [`src/app/sifre-sifirla/page.tsx`](file:///c:/Users/Taha/Documents/hümramoda/src/app/sifre-sifirla/page.tsx) ve [`src/app/api/auth/reset-password/route.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/app/api/auth/reset-password/route.ts)
   - [`src/app/hesabim/page.tsx`](file:///c:/Users/Taha/Documents/hümramoda/src/app/hesabim/page.tsx) ve müşteri hesap API rotaları (`/api/customer/profile`, `/api/customer/password`, `/api/customer/addresses`, `/api/customer/orders`)
   - [`src/lib/server/customer-auth.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/customer-auth.ts)
2. **Admin Kimlik Doğrulama, Yetkilendirme ve Oturum Güvenliği (Faz 2 & 4):**
   - [`src/lib/server/auth.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/auth.ts)
   - [`src/lib/server/session-guard.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/session-guard.ts)
   - Admin RBAC matrisi (`ADMIN`, `STAFF`, `CARRIER`)
3. **Sipariş, Stok ve Ödeme Sistemi (Faz 5 & 7.3.2):**
   - Kapıda Ödeme (COD): [`src/app/api/payments/cash-on-delivery/create/route.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/app/api/payments/cash-on-delivery/create/route.ts)
   - PayTR iFrame Başlatma: [`src/app/api/payments/paytr/create/route.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/app/api/payments/paytr/create/route.ts)
   - PayTR Callback Webhook: [`src/app/api/payments/paytr/callback/route.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/app/api/payments/paytr/callback/route.ts)
   - Stok Mutex Kilidi: [`executeWithOrderLock`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/store.ts#L2765-L2778)
4. **Kargo, İade ve Bildirimler (Faz 6):**
   - [`src/lib/server/shipping.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/shipping.ts)
   - [`src/lib/server/returns.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/returns.ts)
   - [`src/lib/server/notifications.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/notifications.ts)
5. **Medya Yükleme ve Restorasyon Güvenliği (Faz 7.4 & 7.5):**
   - [`src/lib/server/media.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/media.ts)
   - [`src/app/api/admin/media/upload/route.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/app/api/admin/media/upload/route.ts)
   - [`public/uploads/products/`](file:///c:/Users/Taha/Documents/hümramoda/public/uploads/products) ve [`public/uploads/videos/`](file:///c:/Users/Taha/Documents/hümramoda/public/uploads/videos)
6. **Veritabanı Şeması ve Veri Bütünlüğü:**
   - [`prisma/schema.prisma`](file:///c:/Users/Taha/Documents/hümramoda/prisma/schema.prisma)
   - [`data/store.json`](file:///c:/Users/Taha/Documents/hümramoda/data/store.json)
   - [`src/lib/server/persistent-store.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/persistent-store.ts)

---

## 2. TESPİT EDİLEN GÜVENLİK AÇIKLARI VE MİMARİ RİSKLER

Yapılan teknik denetim sonucunda sistemde tespit edilen bulgular ve risk dereceleri aşağıda sıralanmıştır:

### 2.1. Dağıtık Ortamda Bellek İçi Oturum ve Hız Sınırlayıcı Sınırları (YÜKSEK MİMARİ RİSK)
- **Bulgu:** Müşteri oturum iptali (`revokedCustomerTokens`), giriş hızı sınırlayıcısı (`customerLoginLimits`) ve parola sıfırlama hız sınırlayıcısı (`passwordResetLimits`) Node.js sürecinin bellek içi `Map` veri yapılarında tutulmaktadır.
- **Risk:** Uygulama tek bir Node.js sürecinde (veya local dev ortamında) sorunsuz çalışmaktadır. Ancak Vercel Serverless veya birden çok konteyner/küme (cluster) ortamına alındığında her HTTP isteği farklı bir sunucusuz fonksiyona düşebileceği için bellek içi sayaçlar paylaşılamaz. Bir fonksiyonda kilitlenen IP, diğer fonksiyonda tekrar deneme yapabilir.
- **Çözüm Gereksinimi:** PostgreSQL'e geçildiğinde veya canlıya çıkılmadan önce bu sayaçların paylaşılan bir katmana (Redis / Upstash Redis veya PostgreSQL tablolarına) taşınması şarttır.

### 2.2. Dağıtık Ortamda Sipariş Mutex (Sıralama) Sınırları (YÜKSEK MİMARİ RİSK)
- **Bulgu:** Eşzamanlı sipariş ve stok tüketimini sıralayan `executeWithOrderLock` fonksiyonu bir Node.js Promise zinciridir.
- **Risk:** Tek bir Node.js sürecinde 5/5 regresyon testinde kanıtlandığı üzere tam yarış güvenliği sağlamaktadır. Ancak Vercel veya çoklu instance ortamında iki farklı süreç aynı anda farklı bellek kilitleri açar.
- **Çözüm Gereksinimi:** PostgreSQL'e geçildiğinde stok düşme işlemi veritabanı düzeyinde atomik işlemle (`BEGIN; SELECT stock_quantity FROM "ProductVariant" WHERE id = ... FOR UPDATE; ... COMMIT;`) veya dağıtık kilit (Redlock) ile korunmalıdır.

### 2.3. KVKK Aydınlatma ve Onay Takibinde Denetim İzi Eksikliği (ORTA RİSK - ÇÖZÜLDÜ)
- **Bulgu:** Faz 7.7 kayıt aşamasında KVKK onayı ve kullanım şartları boolean (`true/false`) olarak kaydediliyordu; ancak onay anındaki kesin zaman damgası (`timestamp`) ve kabul edilen hukuki metnin versiyon numarası kaydedilmiyordu.
- **Düzeltme:** Model geriye dönük uyumlu şekilde genişletilerek `kvkkApprovedAt`, `kvkkVersion`, `termsApprovedAt`, `termsVersion`, `marketingConsentAt` alanları eklenmiş ve kayıt fonksiyonuna entegre edilmiştir.

### 2.4. Scrypt CPU DoS (Kaynak Tüketimi) Riski (DÜŞÜK RİSK - ÇÖZÜLDÜ)
- **Bulgu:** Kayıt ve giriş uç noktalarında şifrenin alt sınırı (en az 6 karakter) kontrol ediliyordu ancak üst sınır bulunmuyordu. Kötü niyetli bir kullanıcı 100.000 karakterlik rastgele bir dize göndererek sunucunun scrypt algoritmasında yüksek CPU tüketmesine neden olabilirdi.
- **Düzeltme:** `validatePasswordStrength` fonksiyonuna 128 karakter azami sınır eklenmiştir.

### 2.5. E-Posta Formatı ve RFC 5322 Uyumluluğu (DÜŞÜK RİSK - ÇÖZÜLDÜ)
- **Bulgu:** Sadece `email.includes("@")` kontrolü yapılıyordu.
- **Düzeltme:** RFC 5322 standardına uygun regex denetimi ve 254 karakter uzunluk sınırı getirilmiştir (`validateEmailFormat`).

---

## 3. UYGULANAN DÜŞÜK RİSKLİ DÜZELTMELER

Mevcut sistemin çalışmasını bozmadan ve `data/store.json` verisine dokunmadan aşağıdaki güvenli iyileştirmeler uygulanmıştır:

1. **KVKK ve Sözleşme Denetim İzi Genişletmesi:**
   - [`src/lib/server/store.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/store.ts): `CustomerUser` arayüzüne `kvkkApprovedAt`, `kvkkVersion`, `termsApprovedAt`, `termsVersion` ve `marketingConsentAt` eklendi.
   - [`createCustomer`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/store.ts#L3132): Kayıt anında ISO zaman damgası ve `2026.1` versiyon bilgisi atanması sağlandı.
   - [`updateCustomerProfile`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/store.ts#L3188): Müşteri profilinden pazarlama iznini açıp kapattığında `marketingConsentAt` zaman damgasının otomatik güncellenmesi sağlandı.
2. **Şifre DoS Koruması:**
   - [`src/lib/server/customer-auth.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/customer-auth.ts): `validatePasswordStrength` fonksiyonuna azami 128 karakter sınırı eklendi.
3. **E-Posta Standart Doğrulama:**
   - [`src/lib/server/customer-auth.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/customer-auth.ts): `validateEmailFormat` fonksiyonu tanımlandı.

---

## 4. DÜZELTİLMEYEN VE KULLANICI KARARI GEREKTİREN KONULAR

Aşağıdaki maddeler veri kaybına veya şema uyumsuzluğuna yol açabileceği için **bilinçli olarak değiştirilmemiş**, kullanıcı kararına bırakılmıştır:

### 4.1. Betül Trençkot (`prod-1793185888547`) Varyant ve SKU Çakışması
- **Durum:** Üründe 4 renk ve 2 beden tanımı vardır (4 x 2 = 8 benzersiz varyant kombinasyonu mümkündür). Ancak veritabanında 10 varyant kayıtlıdır.
- **Detay:**
  - `col-1793185888546-0` (Siyah) x `size-prod-1793185888547-0` (38-40-42) kombinasyonunda 2 ayrı varyant vardır (`var-prod-1793185888547-0` / SKU: `HM-SIY-STD-152` ve `var-prod-1793185888547-1` / SKU: `KAET-YEN-STD-708`).
  - `col-1793185888546-0` (Siyah) x `size-prod-1793185888547-1` (44-46-48) kombinasyonunda 2 ayrı varyant vardır (`var-prod-1793185888547-3` / SKU: `KAET-SIY-STAN-004` ve `var-prod-1793185888547-4` / SKU: `KAET-ACI-STAN-005`).
- **Prisma Engeli:** Prisma şemasında `ProductVariant` üzerinde `@@unique([productId, colorId, sizeId])` kısıtı vardır. PostgreSQL migration çalıştırıldığında bu kısıt veritabanı seviyesinde **Unique Constraint Violation** hatası vererek göçü durduracaktır.
- **Gereken Kullanıcı Kararı:**
  - *Seçenek A (Önerilen):* Prisma şemasındaki `@@unique([productId, colorId, sizeId])` kısıtı kaldırılır veya `@@index([productId, colorId, sizeId])` yapılır. 10 varyantın tamamı ve 100 stok korunarak aktarılır.
  - *Seçenek B:* Yönetici mükerrer varyantları inceler; fazlalık olan 2 varyantı siler veya stoklarını (20 adet) birleştirir.

### 4.2. 58 Bildirim ve Olmayan Sipariş Referansları (Foreign Key Çıkmazı)
- **Durum:** `data/store.json` içinde 58 adet `notifications` kaydı bulunmaktadır. Bu kayıtların `orderId` alanları 42 farklı sipariş kimliğine işaret etmektedir; ancak `store.orders` listesinde bu siparişler bulunmamaktadır (eski test ve operasyon logları).
- **Prisma Engeli:** `CustomerNotification` modelinde `orderId String` ve `order Order @relation(...)` foreign key tanımlıdır.
- **Gereken Kullanıcı Kararı:**
  - *Seçenek A (Önerilen):* Prisma şemasında `orderId` isteğe bağlı (`String?`) ve ilişki `order Order? @relation(...)` yapılır. Böylece geçmiş 58 bildirim silinmeden PostgreSQL'e aktarılır.
  - *Seçenek B:* 58 eski bildirim arşivlenir veya silinir.

### 4.3. Kargo Yetkilisi (`kargo@kargo.com`) ve `CARRIER` Rolü
- **Durum:** `data/store.json` içindeki `kargo@kargo.com` kullanıcısının rolü `CARRIER`'dır.
- **Prisma Engeli:** Prisma `enum UserRole { ADMIN, STAFF, CUSTOMER }` tanımında `CARRIER` yer almamaktadır.
- **Gereken Kullanıcı Kararı:** Prisma şemasındaki `UserRole` enum'ına `CARRIER` eklenmelidir.

### 4.4. Prisma Şemasında Eksik Modeller ve Alanlar
- **`FeaturedVideo`:** JSON'da 2 adet video vitrin kaydı vardır; Prisma şemasında karşılığı yoktur.
- **`AuditLog`:** JSON'da 47 adet yönetici denetim logu vardır; Prisma şemasında karşılığı yoktur.
- **`SiteActivity`:** Sayfa görüntüleme ve sepet aktiviteleri; Prisma'da modeli yoktur.
- **`PasswordResetToken`:** Müşteri şifre sıfırlama token kayıtları; Prisma'da modeli yoktur.
- **`ReturnRequest`:** JSON ve servis kodunda `requestType` ("RETURN", "CANCEL", "EXCHANGE") ve `exchangeDetails` bulunmaktadır; Prisma modelinde bu alanlar eksiktir.

---

## 5. JSON VE MEDYA BÜTÜNLÜĞÜ

- **`data/store.json` Doğrulaması:**
  - Başlangıç SHA256: `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`
  - Faz 7.8 Sonu SHA256: `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`
  - Durum: **%100 Birebir Eşleşme (Tek bir bayt dahi bozulmamıştır).**
- **Medya Dosyaları:**
  - Manifest dosyasındaki 155 dosyanın 155'i de eksiksiz, boyut ve hash farkı olmaksızın doğrulanmıştır.
- **Görselsiz 6 Ürün (Tahmin Yapılmadan Korunan):**
  1. Betül Trençkot (`prod-1793185888547`, `betul-trenckot`)
  2. Buklet Ceket (`prod-1793185124060`, `buklet-ceket`)
  3. Ekose Desenli Kuşaklı Ceket – Şık ve Modern Tasarım 🖤 (`prod-1793184672798`, `ekose-desenli-kusakli-ceket-sik-ve-modern-tasarim-`)
  4. Unisex Scuba Kumaş İçi Peluşlu Pantolon (`prod-1793184327059`, `unisex-scuba-kumas-ici-peluslu-pantolon`)
  5. Kot ceket (`prod-1793183353452`, `kot-ceket`)
  6. Scuba Pantolon (`prod-1793180587059`, `pantolon`)

---

## 6. TEST SONUÇLARI

Sistemdeki tüm test paketleri çalıştırılmış ve tam başarı elde edilmiştir:

| Test Paketi | Test Sayısı | Sonuç | Süre |
| :--- | :---: | :---: | :---: |
| `tests/admin-store.test.ts` | 21 | BAŞARILI | 8.1s |
| `tests/shipping-returns.test.ts` | 15 | BAŞARILI | 4.5s |
| `tests/customer-auth-account.test.ts` | 19 | BAŞARILI | 1.7s |
| `tests/paytr.test.ts` | 12 | BAŞARILI | 1.8s |
| `tests/phase-7-audit-legal-backup.test.ts` | 10 | BAŞARILI | 1.5s |
| `tests/phase-1-security.test.ts` | 7 | BAŞARILI | 2.0s |
| `tests/faz-7-3-2-mutex-regression.test.ts` | 5 | BAŞARILI | 1.0s |
| `tests/faz-7-4-media-restoration.test.ts` | 13 | BAŞARILI | 0.7s |
| `tests/phase-2-security.test.ts` | 20 | BAŞARILI | 0.8s |
| `tests/auth.test.ts` | 8 | BAŞARILI | 0.7s |
| `tests/faz-7-5-e2e-restoration.test.ts` | 22 | BAŞARILI | 0.5s |
| `tests/faz-7-2-cod-media.test.ts` | 12 | BAŞARILI | 0.5s |
| `tests/faz-7-3-media-variants.test.ts` | 8 | BAŞARILI | 0.3s |
| `tests/faz-7-3-1-audit.test.ts` | 12 | BAŞARILI | 0.2s |
| `tests/migration-safety.test.ts` | 3 | BAŞARILI | 0.1s |
| `tests/formatters.test.ts` | 4 | BAŞARILI | 0.04s |
| `tests/catalog.test.ts` | 8 | BAŞARILI | 0.04s |
| `tests/api-security.test.ts` | 5 | BAŞARILI | 0.03s |
| `tests/tokens-media.test.ts` | 6 | BAŞARILI | 0.02s |
| `tests/media-upload.test.ts` | 8 | BAŞARILI | 0.03s |
| **TOPLAM** | **218** | **%100 BAŞARILI** | **40.0s** |

- `npx.cmd tsc --noEmit`: 0 Hata
- `npx.cmd prisma validate`: Geçerli 🚀
- `node scripts/verify-manifest.js`: 155/155 Eşleşme

---

## 7. PRİSMA / JSON UYUMLULUK VE SINIFLANDIRMA TABLOSU

| Model / Alan | JSON Karşılığı | Prisma Karşılığı | Sınıflandırma | Açıklama & Karar |
| :--- | :--- | :--- | :--- | :--- |
| `UserRole.CARRIER` | Rol mevcut (`kargo@kargo.com`) | Enum'da yok | **2. Prisma'da eksik** | `enum UserRole` içine `CARRIER` eklenmeli. |
| `User` (Müşteri Alanları) | `kvkkApproved`, `termsApproved`, `tokenVersionTimestamp` | `User` modelinde yok | **2. Prisma'da eksik** | Onay ve oturum geçersiz kılma alanları `User` tablosuna eklenmeli. |
| `ProductVariant` (Betül) | 10 varyant (2 mükerrer kombinasyon) | `@@unique([productId, colorId, sizeId])` | **5. Unique constraint riski** | Migration öncesi unique kısıt kaldırılmalı veya kullanıcı kararıyla varyantlar birleştirilmeli. |
| `ProductVariant.sku` | 4 çakışan SKU | `@unique` | **5. Unique constraint riski** | Betül Trençkot'un 4 SKU'su aynı; Prisma'da SKU unique tanımlı. |
| `CustomerNotification.orderId` | 58 bildirim, 42 sipariş store.orders'da yok | `@relation(fields: [orderId], references: [id])` | **4. İlişki uyuşmazlığı** | FK kısıtı 58 kaydı reddeder. `orderId String?` yapılmalıdır. |
| `DiscountCampaign` | `name`, `discountPercentage`, `description` | `title`, `percentage`, `description` yok | **3. Veri tipi uyuşmazlığı** | Alan adları eşleştirilmeli, `description` Prisma'ya eklenmeli. |
| `FeaturedVideo` | 2 adet video vitrin kaydı | Model yok | **2. Prisma'da eksik** | `FeaturedVideo` modeli Prisma'ya eklenmeli. |
| `AuditLog` | 47 denetim log kaydı | Model yok | **2. Prisma'da eksik** | `AuditLog` modeli Prisma'ya eklenmeli. |
| `SiteActivity` | Sayfa ve sepet logları | Model yok | **2. Prisma'da eksik** | `SiteActivity` modeli Prisma'ya eklenmeli. |
| `PasswordResetToken` | Şifre sıfırlama tokenları | Model yok | **2. Prisma'da eksik** | `PasswordResetToken` modeli Prisma'ya eklenmeli. |
| `ReturnRequest` | `requestType`, `exchangeDetails` | Alanlar yok | **2. Prisma'da eksik** | İade/İptal/Değişim alanları Prisma'ya eklenmeli. |
| `Category`, `Collection` | 7 kategori, 3 koleksiyon | Birebir mevcut | **1. JSON ile uyumlu** | Sorunsuz aktarılabilir. |
| `Product`, `ProductColor`, `ProductSize` | 13 ürün, renk ve bedenler | Birebir mevcut | **1. JSON ile uyumlu** | Betül Trençkot kısıtı hariç uyumlu. |
| `Address` | Müşteri adresleri | Birebir mevcut | **1. JSON ile uyumlu** | Sorunsuz aktarılabilir. |

---

## 8. POSTGRESQL'E GEÇİŞ İÇİN EKSİKLERİN LİSTESİ

PostgreSQL migration işlemine (Faz 8) başlamadan önce tamamlanması gereken teknik gereksinimler:

1. **`prisma/schema.prisma` Güncellemesi:**
   - `enum UserRole` içerisine `CARRIER` eklenmesi.
   - `User` modeline `kvkkApproved`, `kvkkApprovedAt`, `kvkkVersion`, `termsApproved`, `termsApprovedAt`, `termsVersion`, `marketingConsent`, `marketingConsentAt`, `tokenVersionTimestamp` eklenmesi.
   - `ProductVariant` üzerindeki `@@unique([productId, colorId, sizeId])` ve `sku @unique` kısıtlarının Betül Trençkot için `@@index` seviyesine esnetilmesi veya varyant konsolidasyonunun onaylanması.
   - `CustomerNotification` modelinde `orderId String?` ve `order Order?` yapılarak 58 bildirimin korunması.
   - `FeaturedVideo`, `AuditLog`, `SiteActivity` ve `PasswordResetToken` modellerinin eklenmesi.
   - `ReturnRequest` modeline `requestType` (RETURN, CANCEL, EXCHANGE) ve `exchangeDetails` (Json?) eklenmesi.
2. **Migration ve Veri Aktarım Scripti (`scripts/migrate-json-to-pg.ts`):**
   - `data/store.json` verisini atomik transaction (`prisma.$transaction`) ile PostgreSQL'e yazan script hazırlanması.
   - Aktarım öncesi ve sonrası hash/kayıt sayısı doğrulama motoru.

---

## 9. CANLIYA GEÇİŞ (PRODUCTION) İÇİN KALAN GERÇEK SERVİS ENTEGRASYONLARI

Projenin Vercel/Production ortamında canlıya alınabilmesi için kalan harici servis gereksinimleri:

1. **Ortak Oturum ve Hız Sınırlama Katmanı (Redis / Upstash):**
   - Vercel Serverless ortamında oturum iptali (`token revocation`) ve brute-force korumasının çoklu fonksiyonlar arasında senkronize çalışabilmesi için Upstash Redis veya PostgreSQL tablosuna bağlanması.
2. **Gerçek E-Posta Sağlayıcısı (SMTP / Resend / AWS SES):**
   - Parola sıfırlama ve sipariş bildirimlerinin müşterilere gerçek e-posta olarak ulaşması için SMTP kimlik bilgilerinin `.env.production` içine girilmesi.
3. **Gerçek PayTR Canlı API Anahtarları:**
   - PayTR test modundan canlı merchant credentials (`PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`) moduna geçiş.
4. **Gerçek Kargo API Entegrasyonu (Yurtiçi, MNG, Aras):**
   - Otomatik kargo barkodu ve takip numarası üretimi için kargo sağlayıcı API anahtarları.

---

## 10. POSTGRESQL'E GEÇİŞE HAZIRLIK DURUMU VE GEREKÇELİ SONUÇ

### Gerekçeli Değerlendirme:
1. **Kod ve Mantık Kalitesi:** Projenin iş mantığı, müşteri oturumları, sepet, ödeme ve kargo akışları 218 testin tamamından başarıyla geçmekte, TypeScript tarafında sıfır hata vermektedir.
2. **Veri ve Medya Bütünlüğü:** `data/store.json` başlangıç SHA256 değeri ile bitiş değeri kusursuz biçimde aynıdır (`2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`). Medya manifestindeki 155 dosya eksiksiz korunmaktadır.
3. **Veritabanı Uyumsuzluk Engelleri:** Ancak mevcut `prisma/schema.prisma` şeması, Betül Trençkot'un 10 varyantındaki çift kombinasyonları (`@@unique` hatası), 58 eski bildirimin olmayan 42 `orderId`'sini (`Foreign Key` hatası) ve `kargo@kargo.com` kullanıcısının `CARRIER` rolünü (`Enum` hatası) **doğrudan kabul etmeyecektir**.

### Nihai Karar:
> [!IMPORTANT]
> **Sistem kod ve veri seviyesinde PostgreSQL geçişine hazırdır; ancak yukarıda Bölüm 4'te belirtilen Prisma kısıt esnetmeleri (Betül Trençkot unique kısıtı, 58 bildirim orderId foreign key'i ve CARRIER rolü) uygulanmadan `prisma db push` veya `prisma migrate` ÇALIŞTIRILMAMALIDIR.**
> 
> Bu fazın koruma kuralları gereği veritabanına dokunulmamış, veriler ve şema güvenle dondurulmuştur. Kullanıcı Bölüm 4'teki kararları onayladığında bir sonraki fazda (Faz 8) Prisma şeması güncellenip PostgreSQL aktarımı güvenle icra edilebilir.

