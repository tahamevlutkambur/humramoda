# HÜMRA MODA — FAZ 8.7: ÖDEME GÜVENLİĞİ, İDEMPOTENCY, İADE VE PRODUCTION HAZIRLIK RAPORU

**Tarih:** 2026-11-02  
**Proje:** Hümra Moda  
**Faz:** 8.7 — Ödeme Güvenliği, İdempotency, İade ve Production Hazırlık Denetimi  
**Kaynak Veri (Aktif):** `data/store.json`  
**Kaynak SHA-256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`  
**Test Veritabanı:** PostgreSQL 16 (`humra-postgres-test-83` Docker konteyneri)  
**Veritabanı Adı:** `humra_migration_test`  
**Test Kullanıcısı:** `humra_test`  
**Durum:** Başarılı — Tüm denetimler, DAO geliştirmeleri ve testler tamamlandı. Canlıya geçiş öncesi onay bekleniyor.

---

## 1. YÖNETİCİ ÖZETİ VE GÜVENLİK SINIRLARI

Faz 8.7 kapsamında; Faz 8.6'da oluşturulan PostgreSQL yazma DAO altyapısı üretim ortamı güvenlik kriterlerine, PayTR resmi ödeme güvenlik standartlarına, kalıcı idempotency prensiplerine, muhasebesel iade-fiziksel stok ayrımına ve veritabanı kısıtlarına göre kapsamlı biçimde denetlenmiş ve güçlendirilmiştir.

### Korunan Güvenlik Sınırları:
- **Aktif Sürücü Korundu:** Canlı mağaza varsayılan sürücüsü `json` (`data/store.json`) olarak kalmaya devam etmektedir. Canlı API rotaları ve istemciler doğrudan PostgreSQL'e bağlanmamıştır.
- **İzole Veritabanı:** Tüm yazma, kilit, ödeme ve iade testleri yalnızca `humra-postgres-test-83` üzerindeki izole test veritabanında (`humra_migration_test`) yürütülmüştür.
- **Orijinal Veri Bütünlüğü:** `data/store.json` dosyasının SHA256 sağlama toplamı (`2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`) hiçbir bayt değişmeksizin %100 korunmuştur.
- **Medya Dosyaları:** `public/uploads` altındaki 155/155 medya dosyası eksiksiz doğrulanmıştır.
- **Kritik Ürün Verisi:** Betül Trençkot'un 10 varyantı ve 100 adetlik toplam stoğu hem JSON hem de PostgreSQL tarafında doğrulanmıştır.

---

## 2. YAPILAN MİMARİ GELİŞTİRMELER VE GÜVENLİK GÜÇLENDİRMELERİ

### 2.1. PayTR Callback Güvenliği ve Zamanlama Saldırısı Koruması (`payment-write-dao.ts`)
- **Resmi HMAC Formülü:** PayTR bildirim token'ı `crypto.createHmac("sha256", merchantKey).update(`${merchantOid}${merchantSalt}${status}${totalAmount}`).digest("base64")` formülüyle sunucu tarafında yeniden üretilerek doğrulanmaktadır.
- **Timing-Safe Karşılaştırma:** Dize karşılaştırmasında oluşabilecek zamanlama analizine dayalı sızıntıları (timing attack) önlemek amacıyla `crypto.timingSafeEqual(Buffer.from(receivedHash), Buffer.from(expectedHash))` kullanılmıştır.
- **Alfanümerik `merchant_oid` Eşleme:** PayTR entegrasyonu sipariş numaralarındaki tire işaretlerini (`-`) kaldırarak gönderebilmektedir (`HM-20261102-1234` yerine `HM202611021234`). Alfanümerik format uyuşmazlığını gidermek için doğrudan SQL seviyesinde fallback lookup uygulanmıştır:
  ```sql
  SELECT "id" FROM "Order" WHERE UPPER(REPLACE("orderNumber", '-', '')) = ${cleanOid} LIMIT 1;
  ```
- **Mükerrer Callback / İdempotency Güvenliği:** Sipariş zaten `PAID` durumundaysa, transaction tekrar stok düşürmeden veya çift ödeme işlemi kaydetmeden anında `"OK"` yanıtı üretmektedir.

### 2.2. Kalıcı İdempotency Yönetimi (`idempotency.ts`)
- **Bellek/Zaman Aralığı Zaafının Giderilmesi:** Önceki sürümlerdeki 60 saniyelik zaman penceresi kontrolü, arka arkaya farklı sepet siparişi veren müşterileri engellerken; milisaniyelik eşzamanlı çift tıklamalarda yarış durumuna (race condition) düşebilmekteydi.
- **Dedicated PostgreSQL Tablosu (`IdempotencyKey`):**
  - Kolonlar: `key` (PK), `scope`, `payloadHash`, `status` (`PENDING`, `COMPLETED`, `FAILED`), `result`, `createdAt`, `lockedAt`, `expiresAt`.
  - Atomik işlem kaydı ile veritabanı seviyesinde `PRIMARY KEY ("key")` benzersizliği sayesinde mükerrer işlem kesin olarak engellenir.
- **Payload Uyuşmazlığı Tespiti (`IDEMPOTENCY_PAYLOAD_MISMATCH`):** Aynı idempotency anahtarıyla farklı bir sepet veya farklı tutarda istek gönderildiğinde istek güvenle reddedilir (`409 Conflict`).
- **Geriye Dönük Uyumluluk:** İstemci idempotency anahtarı göndermediğinde 60 saniyelik zaman kontrolü devrede kalır; anahtar gönderildiğinde ise kalıcı tablo mimarisi devreye girer.

### 2.3. İade, Değişim ve İptal Süreçlerinin Denetimi (`returns-write-dao.ts`)
- **Fiziksel Restock vs Finansal İade Ayrımı:**
  - Banka / PayTR ödeme iadeleri harici ağ çağrıları gerektirdiğinden yerel DB transaction'ı ile senkron bağlanamaz (Outbox / Compensation Pattern gereksinimi).
  - `processReturnDecision`: Depo yetkilisinin fiziksel mal kabul kararını yönetir (`RESTOCKED` durumunda ilgili varyant stoğu iade edilir; `DAMAGED_NOT_RESTOCKED` durumunda defolu ürün depoya alınmaz ve stok artırılmaz).
  - `processRefundVerification`: Bankadan onaylanan iade dekont referansını (`refundReference`), tutarını (`refundedAmount`) ve ödeme durumunu (`REFUNDED`) siparişe finansal olarak işler.
- **Kısmi İade Desteği:** Müşteri 2 ürünlük bir siparişten yalnızca 1 tanesini iade ettiğinde yalnızca ilgili varyantın stoğu ve satır tutarı işlenir; sipariş `PARTIALLY_REFUNDED` statüsüne alınır.
- **Değişimde Hedef Varyant Stok Kilidi:** Değişim onaylandığında, istenen yeni bedenin/rengin stoğu `FOR UPDATE` ile kilitlenir; hedef stok yetersizse işlem rollback edilir.
- **İptal Senaryoları:** Sipariş kargoya verilmeden önceki iptallerde tüm kalemlerin stokları atomik olarak iade edilir.

### 2.4. Veritabanı ve Üretim Güvenlik Denetimi (`tests/faz-8-7-database-security.test.ts`)
- **En Az Yetki İlkesi (Least Privilege):**
  - Docker ortamında test kullanıcısı `humra_test` konteyner varsayılanı olarak `superuser` yetkisine sahiptir.
  - **Üretim Şartı:** Canlı PostgreSQL ortamında uygulama kullanıcısı kesinlikle `NOSUPERUSER` olmalı, `CREATEDB` veya `CREATEROLE` yetkilerine sahip olmamalı; yalnızca ilgili şemada (`public`) `SELECT, INSERT, UPDATE, DELETE` yetkilerine sahip olmalıdır.
- **Transaction Timeout:** Prisma üzerinden 5000ms işlem zaman aşımı doğrulanmış, kilitlenmiş bir oturumun bağlantı havuzunu bloke etmesi engellenmiştir.
- **Veri Bütünlüğü Kısıtları:**
  - `ProductVariant.sku` üzerinde UNIQUE constraint mevcuttur.
  - Sipariş ve sipariş kalemleri arasında Foreign Key bütünlüğü aktiftir.
  - Negatif stok koruması (`CHECK (stock_quantity >= 0)`) doğrulanmıştır.
- **Yedekleme ve Kurtarma (`pg_dump`):** `pg_dump` aracıyla test veritabanının yedeği alınabilmiş ve geçerli SQL çıktısı ürettiği test edilmiştir.

---

## 3. DOĞRULAMA VE TEST SONUÇLARI

### 3.1. Vitest Birim ve Entegrasyon Testleri
```bash
npm test
```
- **Sonuç:** 34 test dosyası, **316/316 test BAŞARILI** (0 hata).
- **Yeni Eklenen Faz 8.7 Test Dosyaları:**
  1. `tests/faz-8-7-paytr-security.test.ts` (4 test): HMAC imza üretimi, timing-safe doğrulama, mükerrer callback ve alfanümerik lookup.
  2. `tests/faz-8-7-idempotency.test.ts` (4 test): Eşzamanlı istek kilitleme, mükerrer anahtar koruması, payload mismatch tespiti ve hata rollback.
  3. `tests/faz-8-7-refund-exchange.test.ts` (5 test): Kısmi iade, hasarlı ürün restock reddi, değişim stok kontrolü, finansal ödeme iadesi dekont doğrulama.
  4. `tests/faz-8-7-database-security.test.ts` (7 test): Yetki denetimi, connection pool, tx timeout, unique constraint, FK bütünlüğü, negatif stok koruması, pg_dump.
  5. `tests/faz-8-7-json-postgres-parity.test.ts` (4 test): JSON ve PostgreSQL sipariş oluşturma, stok düşümü ve bakiye hesaplama paritesi.

### 3.2. Playwright E2E Gerçek Tarayıcı Testleri
```bash
npx tsx scripts/run-e2e-browser-test.ts
```
- **Test Edilen Sayfa:** 31 (Masaüstü ve Mobil)
- **Başarılı:** 31 / 31 (%100)
- **Kırık Görsel:** 0
- **Test Sırasında JSON Koruması:** İzole geçici test deposu kullanıldı; orijinal `data/store.json` SHA256 değeri değişmedi.

### 3.3. Statik Analiz ve Şema Kontrolleri
- **TypeScript:** `npx tsc --noEmit` -> 0 hata.
- **Prisma:** `npx prisma validate` -> Şema %100 geçerli.

### 3.4. Kritik Varlık Bütünlüğü
- **JSON SHA-256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` (Tam Eşleşme).
- **Medya Dosyaları:** `public/uploads` altında 155 dosya eksiksiz.
- **Betül Trençkot:** 10 varyant, toplam 100 stok korundu.

---

## 4. CANLIYA GEÇİŞ (PRODUCTION GO-LIVE) ÖN KOŞULLARI VE AÇIK RİSKLER

PostgreSQL sisteminin canlı mağaza için varsayılan sürücü yapılması planlandığında aşağıdaki kontrol listesi tamamlanmalıdır:

| Madde | Kontrol / Gereksinim | Durum | Açıklama |
|---|---|---|---|
| 1 | Production PostgreSQL Sunucusu | Hazırlanmalı | Canlı PostgreSQL 16+ servisi sağlanmalı. |
| 2 | Veritabanı Kullanıcı Yetkileri | Yapılandırılmalı | Üretim DB kullanıcısı `NOSUPERUSER` olmalı, sadece gerekli tablolara DML izni verilmeli. |
| 3 | `IdempotencyKey` Migration'ı | Hazır | `prisma/migrations` zincirine `IdempotencyKey` tablosu eklenmeli. |
| 4 | PayTR Canlı Anahtarları | Yapılandırılmalı | `.env` içine canlı `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` girilmeli. |
| 5 | Havuz Bağlantı Parametreleri | Hazır | `pgbouncer=true&connection_limit=20` ayarları canlı sunucu kapasitesine göre ayarlanmalı. |
| 6 | Veri Aktarımı Senkronizasyonu | Hazır | Canlıya geçiş anında son `data/store.json` verisi `scripts/migrate-store-to-postgres.ts` ile aktarılmalı. |
| 7 | Geri Dönüş (Rollback) Planı | Hazır | Olası bir aksilikte ortam değişkeni (`DATA_STORE_DRIVER=json`) ile JSON sürücüsüne geçilebilir (PostgreSQL'e yazılmış yeni siparişler varsa çift yönlü veri uzlaştırma gereklidir). |

---

## 5. SONUÇ VE DURMA NOKTASI

Faz 8.7 kapsamındaki tüm hedefler tamamlanmıştır.
Projede hiçbir canlı ayar değiştirilmemiş, JSON varsayılan sürücü olarak korunmuştur.

**Talimat uyarınca işlem durdurulmuştur. Canlıya geçiş veya bir sonraki aşama için kullanıcı talimatı beklenmektedir.**
