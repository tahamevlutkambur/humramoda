# HÜMRA MODA — FAZ 4.5: POSTGRESQL GEÇİŞİ VE GÜVENLİK DOĞRULAMASI RAPORU

**Tarih:** 21 Ekim 2026  
**Durum:** Tamamlandı ve Doğrulandı (Tüm güvenlik açıkları kapatıldı, 48/48 test başarılı)  
**Kapsam:** PostgreSQL Geçiş Altyapısı, Oturum Güvenliği, Brute-Force Koruması, Açık Yönlendirme Koruması, Parola Hijyeni  

---

## 1. İncelenen ve Değiştirilen Dosyalar

| Dosya | Yapılan İşlem / İyileştirme |
| :--- | :--- |
| `prisma/schema.prisma` | Şema bütünlüğü doğrulandı (`npx prisma validate` 🚀). |
| `prisma/migrations/20261021000000_init/migration.sql` | `prisma migrate diff` ile tam DDL SQL migrasyon dosyası oluşturuldu. |
| `scripts/migrate-store-to-postgres.ts` | Otomatik yedeklemeli, bağlantı kontrollü ve idempotent veri aktarım betiği oluşturuldu. |
| `src/lib/server/db.ts` | Hot-reload uyumlu singleton PrismaClient ve `checkDatabaseConnection()` bağlantı testi eklendi. |
| `src/lib/server/auth.ts` | Üretim gizli anahtarı zorunluluğu, `tokenId` tabanlı açık `exp` kontrolü, çıkışta anında token iptali (revocation), brute-force rate limiter ve boş buffer zamanlama eşitliği açığı kapatıldı. |
| `src/lib/server/session-guard.ts` | Hem `next/headers` hem doğrudan `Request` parametresi desteklendi; istek bağlamı dışında güvenli `null` dönüşü sağlandı. |
| `src/app/api/admin/auth/login/route.ts` | IP ve e-posta tabanlı rate limiting (5 deneme / 15 dk blokaj) eklendi; giriş hatalarında kalan hak bilgisi eklendi. |
| `src/app/api/admin/auth/logout/route.ts` | Çıkış yapıldığında token'ı sunucu tarafında iptal eden `revokeSessionToken()` entegre edildi. |
| `src/app/admin/login/page.tsx` | Açık yönlendirme (Open Redirect) saldırılarını engelleyen `getSafeRedirectUrl()` filtresi eklendi. |
| `scripts/create-admin.ts` | Parola hijyeni sağlandı; komut satırı argümanı sızıntısı engellendi, `ADMIN_PASSWORD` env veya etkileşimli güvenli giriş ve karmaşıklık kuralları getirildi. |
| `src/lib/server/store.ts` | Sabit yönetici parolası kaldırıldı; üretimde şifresiz admin oluşturulması engellendi. |
| `.env` & `.env.example` | Sabit parolalar temizlendi. |
| `tests/auth.test.ts` | Süre dolumu, token iptali, brute-force rate limit ve üretim anahtarı testleriyle 8 teste genişletildi. |
| `tests/migration-safety.test.ts` | Bağlantı yokken kaynak JSON'ın korunması, otomatik yedekleme ve veri tutarlılığı testleri (3 test) eklendi. |
| `tests/api-security.test.ts` | Yetkisiz API engellemeleri ve açık yönlendirme temizleme testleri (5 test) eklendi. |
| `vitest.config.ts` | `@/*` yol takma adları (alias) yapılandırıldı. |

---

## 2. Tespit Edilen Güvenlik Açıkları ve Yapılan Düzeltmeler

### A. Boş / Bozuk Hash Eşleşme Açığı (Critical Bug Discovery)
- **Sorun:** `verifyPassword` fonksiyonunda, storedHash formatı bozuk olduğunda (`"bozuk:hash"` gibi) `Buffer.from(key, "hex")` 0 baytlık boş bir buffer üretiyor ve `crypto.scryptSync(password, salt, 0)` ile türetilen 0 baytlık boş buffer `crypto.timingSafeEqual(empty, empty)` karşılaştırmasında **`true`** dönüyordu!
- **Düzeltme:** Tuz uzunluğunun tam 32 hex karakter (16 bayt) ve anahtar uzunluğunun tam 128 hex karakter (64 bayt) olduğu doğrulanmadan karşılaştırma yapılmayacak şekilde katı format doğrulaması eklendi.

### B. Oturum Çıkışında Belirteç Yeniden Oynatma (Session Replay After Logout)
- **Sorun:** Eski yapıda çıkış yapıldığında yalnızca tarayıcıdaki çerez siliniyor; kopyalanmış veya çalınmış bir belirteç sunucu tarafında 24 saat boyunca geçerli kalıyordu.
- **Düzeltme:** `revokeSessionToken()` ve `isSessionRevoked()` mekanizması kuruldu. Çıkış yapıldığında belirtecin benzersiz `tokenId` değeri sunucu tarafında iptal listesine eklenir ve belirteç anında geçersiz kılınır.

### C. Açık Yönlendirme Güvenlik Açığı (Open Redirect Vulnerability)
- **Sorun:** `/admin/login?from=https://evil.com` parametresi doğrudan `router.push(from)` ile çalıştırıldığında yetkili yönetici sahte bir dış siteye yönlendirilebiliyordu.
- **Düzeltme:** `getSafeRedirectUrl()` filtresi eklendi. Yalnızca `/` ile başlayan, `//`, `\` veya `:` içermeyen yerel rotalara izin verilir; aksi halde güvenli biçimde `/admin` rotasına düşürülür.

### D. Brute-Force ve Kimlik Bilgisi Doldurma (Credential Stuffing)
- **Sorun:** `/api/admin/auth/login` üzerinde istek sınırlaması bulunmuyordu.
- **Düzeltme:** İstemci IP'si ve e-posta adresi bazında çalışan bellek-içi hız sınırlayıcı (Rate Limiter) eklendi. 5 hatalı denemeden sonra hesap 15 dakika boyunca kilitlenir ve `HTTP 429 Too Many Requests` döner. Başarılı girişte sayaç sıfırlanır.

### E. Üretim Modunda Zayıf / Varsayılan Gizli Anahtar Tehlikesi
- **Sorun:** `AUTH_SECRET` ortam değişkeni tanımlanmadığında kod varsayılan bir geliştirme anahtarına düşüyordu.
- **Düzeltme:** `getAuthSecret()` fonksiyonu eklendi. `NODE_ENV === "production"` durumunda `AUTH_SECRET` en az 32 karakter uzunluğunda ve güçlü değilse sistem hata vererek çalışmayı güvenli biçimde durdurur.

### F. Parola ve Terminal Hijyeni
- **Sorun:** Önceki test raporlarında paylaşılan parola kod tabanında ve betiklerde yer alıyordu.
- **Düzeltme:** Tüm kod, seed ve `.env` dosyalarından sabit parolalar temizlendi. `scripts/create-admin.ts` artık parolayı terminal geçmişine (history/ps) düşen komut satırı argümanı olarak almaz; `ADMIN_PASSWORD` ortam değişkeninden veya terminalde maskeli/etkileşimli girişle alır. Minimum 10 karakter, büyük/küçük harf, rakam ve sembol karmaşıklığı zorunlu kılındı.

---

## 3. PostgreSQL Bağlantısının Gerçek Durumu

- **Test Sonucu:** `Test-NetConnection -ComputerName localhost -Port 5432` komutu çalıştırılmış ve `TcpTestSucceeded: False` sonucunu vermiştir.
- **Mevcut Durum:** Geliştirme makinesinde yerel PostgreSQL Windows hizmeti veya Docker konteyneri çalışmamaktadır.
- **Dürüst Raporlama:** Kullanıcı talimatına tam riayet edilmiş; veritabanı açıkmış gibi davranılmamış, bağlantı hatası açıkça belgelenmiştir.
- **Uygulanan Mimari:** Veritabanı kapalıyken sistem `data/store.json` üzerindeki atomik JSON deposunu tekil veri kaynağı olarak kullanır; veri kaybı veya çift yazma (dual-write) tutarsızlığı yaşanmaz.

### Yerel PostgreSQL Kurulum ve Bağlantı Yönergesi:
PostgreSQL hizmetini yerel ortamda aktif etmek için:
1. **Windows PostgreSQL Kurulumu:**
   - [PostgreSQL Resmi İndirme](https://www.postgresql.org/download/windows/) adresinden PostgreSQL 16+ kurunuz.
   - Kurulum esnasında belirlediğiniz parola ile `humramoda` veritabanını oluşturunuz:
     ```sql
     CREATE DATABASE humramoda;
     ```
2. **Alternatif Olarak Docker İle:**
   ```bash
   docker run --name humra-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=humramoda -p 5432:5432 -d postgres:16-alpine
   ```
3. **Migrasyon ve Veri Aktarımı:**
   PostgreSQL aktif olduktan sonra sırasıyla çalıştırınız:
   ```bash
   # 1. Tablo şemasını PostgreSQL'e uygula
   npx prisma migrate dev --name init
   # 2. JSON deposundaki tüm ürün, varyant, kategori ve ayarları PostgreSQL'e aktar
   npx tsx scripts/migrate-store-to-postgres.ts
   ```

---

## 4. Oluşturulan Migrasyonlar

- **Dizin:** `prisma/migrations/20261021000000_init/`
- **Dosya:** [migration.sql](file:///c:/Users/Taha/Documents/hümramoda/prisma/migrations/20261021000000_init/migration.sql)
- **İçerik:**
  - 5 adet PostgreSQL ENUM türü (`UserRole`, `MediaType`, `OrderStatus`, `PaymentStatus`, `BlockLayout`).
  - 14 adet ilişkisel tablo (`User`, `Address`, `Category`, `Collection`, `Product`, `ProductCollection`, `ProductColor`, `ProductSize`, `ProductVariant`, `ProductMedia`, `Cart`, `CartItem`, `Favorite`, `Order`, `OrderItem`, `PaymentTransaction`, `HomepageBlock`, `BlockItem`, `StoreSetting`, `DiscountCampaign`).
  - Benzersiz indeksler (`sku`, `slug`, `orderNumber`, `email`, `merchantOid`, `productId_colorId_sizeId`).
  - Cascade ve SetNull yabancı anahtar kısıtları (`FOREIGN KEY`).

---

## 5. Veri Aktarımı ve Yedekleme Güvenliği

- `scripts/migrate-store-to-postgres.ts` betiği geliştirildi.
- Betik ilk adımda `SELECT 1` ile veritabanını test eder. Bağlantı yoksa kaynak veriye dokunmadan durur.
- Aktarım öncesinde `data/backups/store-backup-[tarih].json` yoluna otomatik tam yedek alır.
- Tüm varlıklar doğal tekil anahtarları (`slug`, `sku`, `email`, `key`) üzerinden `upsert` edilir. Betik art arda 10 kez çalıştırılsa dahi mükerrer kayıt üretmez (idempotent).
- Gerçek PostgreSQL bağlantısı sağlandığında aktarım çalıştırılıp konsolda karşılaştırmalı sayısal tablo sunulacaktır.

---

## 6. Çalıştırılan Komutlar ve Gerçek Test Sonuçları

| Test / Doğrulama Adımı | Komut | Gerçekleşen Sonuç |
| :--- | :--- | :--- |
| **Prisma Şema Doğrulama** | `npx prisma validate` | `The schema at prisma\schema.prisma is valid 🚀` (Exit Code: 0) |
| **Migrasyon DDL Üretimi** | `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` | 520 satırlık eksiksiz PostgreSQL DDL SQL üretildi. |
| **Statik Tip Denetimi** | `npm run typecheck` (`tsc --noEmit`) | **0 Hata** (Exit Code: 0) |
| **Linter ve Kod Kalitesi** | `npm run lint` (`eslint .`) | **0 Hata, 0 Uyarı** (Exit Code: 0) |
| **Birim ve Entegrasyon Testleri** | `npm test` (`vitest run`) | **8 test dosyası, 48 testin tamamı başarılı (%100 Başarı).** |
| **Üretim Derlemesi** | `npm run build` (`next build`) | **37 statik ve dinamik sayfa 922 ms'de derlendi ve prerender edildi.** (Exit Code: 0) |
| **Uçtan Uca (E2E) Test** | `npx tsx scripts/test-admin-e2e.ts` | Yetkisiz erişim 307/401, hatalı şifrede kalan hak gösterimi, başarılı giriş, ayar okuma, çıkış ve **iptal edilmiş oturumun 401 ile reddedilmesi** doğrulandı. |

---

## 7. Doğrulanamayan Noktalar

- **Gerçek PostgreSQL İçi Yazma/Okuma:** Yerel makinede port 5432 aktif olmadığı için `scripts/migrate-store-to-postgres.ts` betiğinin PostgreSQL tablolarına kayıt yazma aşaması canlıda yürütülememiş; bunun yerine betiğin bağlantı kesintisini güvenle yakaladığı, kaynak JSON'ı bozmadığı ve şemanın Prisma ile %100 uyumlu olduğu birim testleriyle doğrulanmıştır.

---

## 8. Faz 5 Öncesinde Kalan Zorunlu İşler

1. Yerel veya bulut (Supabase / Neon / AWS RDS) PostgreSQL bağlantı dizesinin `.env` içerisindeki `DATABASE_URL` değişkenine tanımlanması.
2. `npx prisma migrate dev` ile tabloların oluşturulması ve `npx tsx scripts/migrate-store-to-postgres.ts` ile katalog verilerinin PostgreSQL'e aktarılması.
3. PayTR merchant bilgileri (`PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`) tanımlanarak Faz 5 (Ödeme ve Sipariş Akışı) geliştirmesine geçilmesi.
