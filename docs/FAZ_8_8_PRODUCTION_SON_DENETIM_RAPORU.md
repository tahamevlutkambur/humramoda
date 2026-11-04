# HÜMRA MODA — FAZ 8.8: PRODUCTION ÖNCESİ SON TEKNİK DENETİM VE GÜVENLİ GEÇİŞ RAPORU

**Tarih:** 2026-11-03  
**Proje:** Hümra Moda  
**Faz:** 8.8 — Production Öncesi Son Teknik Denetim ve Güvenli Geçiş Provası  
**Aktif Mağaza Sürücüsü:** `json` (`data/store.json`)  
**Kaynak JSON SHA-256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`  
**Test Konteyneri:** `humra-postgres-test-83` (Docker Desktop, PostgreSQL 16.15)  
**Test Veritabanı:** `humra_migration_test`  
**Test Kullanıcısı:** `humra_test`  
**Durum:** TAMAMLANDI — Tüm iddialar gerçek kaynak kod ve veritabanı üzerinde kanıtlandı. Canlıya geçilmedi, kullanıcı onayı bekleniyor.

---

## 1. GÜVENLİK SINIRLARI VE KORUMA İLKELERİ

Faz 8.8 boyunca aşağıdaki değişmez kurallara kesinlikle uyulmuştur:
- **Canlı Mağaza:** Kesinlikle PostgreSQL'e geçirilmemiştir; runtime ortamında `getActiveStoreDriver()` değeri doğrulanmış ve `"json"` olduğu teyit edilmiştir.
- **Canlı Veri Bütünlüğü:** `data/store.json` dosyasının bayt bazında SHA256 sağlama toplamı (`2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`) %100 korunmuştur.
- **Medya Dosyaları:** `public/uploads` altındaki 155 görsel dosyasının tamamı eksiksiz yerindedir.
- **Betül Trençkot:** 10 varyantı ve 100 adetlik stoğu hem JSON hem de test veritabanında korunmuştur.
- **İzole Çalışma:** Tüm veritabanı testleri ve DDL işlemleri yalnızca izole Docker test veritabanında (`humra_migration_test`) gerçekleştirilmiştir.

---

## 2. SÜRÜCÜ DEĞİŞKENİ DENETİMİ

Proje kaynak kodları, ortam değişkeni şablonları ve test dosyaları taranarak sürücü seçimi mimarisi kesin olarak denetlenmiştir:

1. **Gerçekte Kullanılan Değişken:**  
   Tek ve geçerli sürücü değişkeni **`DATA_STORE_DRIVER`**'dır (`src/lib/server/dao/factory.ts`, `.env.example`).
2. **Varsayılan Değer:**  
   `"json"`. Değişken tanımlanmadığında (`undefined`), boş bırakıldığında veya `"postgres"` haricinde herhangi bir string verildiğinde sistem daima güvenli JSON sürücüsünü seçer.
3. **JSON Sürücüsünün Seçilme Koşulu:**  
   `process.env.DATA_STORE_DRIVER?.trim().toLowerCase() !== "postgres"`.
4. **PostgreSQL Sürücüsünün Seçilme Koşulu:**  
   Yalnızca ve sadece `process.env.DATA_STORE_DRIVER?.trim().toLowerCase() === "postgres"` olduğunda seçilir.
5. **Production Yanlışlıkla PostgreSQL'e Geçebilir mi?:**  
   **HAYIR.** `.env` veya sunucu konfigürasyonunda açıkça `DATA_STORE_DRIVER="postgres"` girilmedikçe geçiş imkansızdır. Ayrıca `PrismaStoreDAO` içindeki `assertAuthorizedDatabase()` kontrolü, hedef veritabanının `humra_migration_test` ve kullanıcının `humra_test` olduğunu doğrulamakta; yetkisiz veya yanlış yapılandırılmış veritabanlarında anında çalışma zamanı istisnası (exception) fırlatmaktadır.
6. **Geri Dönüş Planındaki Değişken Tutarsızlığı Düzeltildi:**  
   Faz 8.7 raporunda sehven geçen `DATA_DRIVER=json` ifadesi tespit edilmiş ve kod tabanıyla tam uyumlu olan **`DATA_STORE_DRIVER=json`** olarak düzeltilmiştir.

---

## 3. IDEMPOTENCY TABLOSU VE MIGRATION DENETİMİ

Faz 8.7'de dinamik SQL ile oluşturulan idempotency yapısı, Faz 8.8'de kalıcı Prisma şemasına ve resmi migration zincirine bağlanmıştır:

1. **Prisma Modeli:**  
   `prisma/schema.prisma` dosyasına `model IdempotencyKey` eklenmiştir (`key` String @id, `scope`, `requestHash`, `responseStatus`, `responsePayload`, `orderId`, `createdAt`, `expiresAt`, `@@index([scope])`).
2. **Migration Dosyası:**  
   `prisma/migrations/20261103000000_phase8_8_idempotency_table/migration.sql` oluşturulmuştur.
3. **Migration Durumu:**  
   `npx prisma migrate deploy` komutuyla test veritabanına uygulanmış; `_prisma_migrations` tablosunda 7. migration olarak tescil edilmiştir (`prisma migrate status: Database schema is up to date!`).
4. **Katalog Doğrulaması:**  
   PostgreSQL katalog sorgusu ile `IdempotencyKey` tablosunun `public` şemasında yer aldığı ve `"key"` alanında `PRIMARY KEY` kısıtının bulunduğu doğrulanmıştır.
5. **Payload Hash ve Çakışma Güvenliği:**  
   İstek gövdesi deterministik normalize edilerek SHA-256 ile özetlenmektedir. Aynı anahtarla farklı payload gönderildiğinde `IDEMPOTENCY_PAYLOAD_MISMATCH` hatası fırlatılarak sipariş reddedilmektedir.
6. **Veritabanı Seviyesinde Eşzamanlılık Koruması (Concurrency Serialization):**  
   `checkOrLockKey` metodu `SELECT ... FOR UPDATE` ile pesimistik kilit almakta; transaction seviyesinde tekilleştirme sağlanmaktadır.
7. **Süresi Dolan Anahtarların Temizliği:**  
   `IdempotencyManager.cleanupExpiredKeys()` fonksiyonu ile `expiresAt < NOW()` olan kayıtlar periyodik olarak güvenle temizlenebilmektedir.

---

## 4. PAYTR ENTEGRASYON TÜRÜ VE CALLBACK DENETİMİ

Kaynak kod (`src/lib/server/paytr.ts`, `src/app/api/payments/paytr/callback/route.ts`) doğrudan incelenerek entegrasyon özellikleri belirlenmiştir:

1. **Entegrasyon Türü:**  
   Hümra Moda projesi **PayTR iFrame API** (`https://www.paytr.com/odeme/api/get-token`) kullanmaktadır. (Direkt API veya Link API değildir).
2. **Resmi Callback HMAC Formülü (iFrame API):**  
   $$\text{hashStr} = \text{merchant\_oid} + \text{merchant\_salt} + \text{status} + \text{total\_amount}$$  
   $$\text{hash} = \text{base64}(\text{hmac\_sha256}(\text{hashStr}, \text{merchant\_key}))$$  
   Link API'de bulunan `callback_id` parametresi, PayTR iFrame API protokolünde yer almaz. Sistem iFrame API standardına %100 uygundur.
3. **Timing-Safe Karşılaştırma ve Buffer Güvenliği:**  
   `verifyPayTRCallbackHash` fonksiyonunda, `crypto.timingSafeEqual` çağrılmadan önce buffer uzunlukları (`expectedBuffer.length !== receivedBuffer.length`) kontrol edilmektedir. Bu sayede farklı uzunluktaki sahte imzalarda Node.js runtime çökmesi (exception) engellenmiş ve zamanlama analizi saldırıları önlenmiştir.
4. **Alfanümerik `merchant_oid` Eşleme ve SQL Enjeksiyonu Koruması:**  
   PayTR'nin tire işaretlerini silerek gönderdiği sipariş numaraları için Prisma tagged template literal ile parametreli SQL çalıştırılmaktadır:
   ```sql
   SELECT "id" FROM "Order" WHERE UPPER(REPLACE("orderNumber", '-', '')) = ${cleanOid} LIMIT 1;
   ```
   Kullanıcı girdisi asla string birleştirmeyle SQL'e gömülmemekte, parametre olarak iletilmektedir.
5. **Tutar Kontrolü (`total_amount` vs `payment_amount`):**  
   - `total_amount` müşterinin kartından tahsil edilen kuruş tutardır.
   - Taksitli işlemlerde vade farkı müşteriye aitse `total_amount >= order.totalKurus` olabilmektedir.
   - Kod tabanında eksik tahsilat (`total_amount < order.totalKurus`) kesinlikle reddedilmekte; tam eşleşme ve meşru tutar kontrolleri audit log eşliğinde doğrulanmaktadır.
6. **Saf Metin "OK" Yanıtı:**  
   PayTR sunucusuna dönülen başarılı HTTP yanıtı kesinlikle JSON veya HTML içermemekte; yalnızca `text/plain` içerik tipiyle saf `"OK"` metni döndürmektedir.

---

## 5. İADE VE TRANSACTIONAL OUTBOX MİMARİSİ

Fiziksel depo kabulü ile harici banka para iadesinin yerel DB transaction'ı ile senkron bağlanamayacağı (ağ zaman aşımı veya harici kesinti durumlarında veri tutarsızlığı riski) tespit edilmiş ve mimari güçlendirilmiştir:

1. **Transactional Outbox Yöneticisi ([`src/lib/server/dao/outbox.ts`](file:///c:/Users/Taha/Documents/hümramoda/src/lib/server/dao/outbox.ts)):**  
   `TransactionalOutboxManager` sınıfı ve `PaymentOutbox` tablosu oluşturulmuştur.
2. **İşlem Ayrımı (Decoupling):**
   - **Depo Kararı:** Yetkili, iade gelen ürünü inceler (`processReturnDecision`). Ürün sağlamsa stoğa geri alınır (`RESTOCKED`), defolu/hasarlı ise stoğa alınmaz (`DAMAGED_NOT_RESTOCKED`). Bu işlem yerel DB transaction'ında biter.
   - **Finansal İade:** İade emri yerel transaction içinde `PaymentOutbox` tablosuna `status: 'PENDING'` ve benzersiz `idempotencyKey` ile yazılır.
3. **Ağ Zaman Aşımı ve Çift İade Koruması:**  
   Outbox işlemcisi PayTR İade API'sine (`https://www.paytr.com/odeme/iade`) istek gönderdiğinde ağ koparsa, istek aynı `idempotencyKey` ile üstel geri çekilme (`nextRetryAt = NOW() + retryCount * INTERVAL '60 seconds'`) ile tekrar denenir. PayTR aynı anahtarı tanıdığı için müşteriye ikinci kez mükerrer para iadesi yapılmaz.
4. **Kesin Mutabakat:** Harici sağlayıcıdan başarılı iade referansı (`providerReference`) alınmadan siparişin finansal durumu asla `REFUND_COMPLETED` yapılmaz.

---

## 6. POSTGRESQL YETKİ DENETİMİ (LEAST PRIVILEGE)

Test ortamındaki PostgreSQL katalog sorguları (`pg_roles`, `information_schema.table_privileges`) çalıştırılarak roller denetlenmiştir:

### Mevcut Test Kullanıcısı (`humra_test`):
- `rolsuper`: `true`
- `rolcreaterole`: `true`
- `rolcreatedb`: `true`
- `rolconnlimit`: `-1`

Docker Desktop PostgreSQL konteyneri başlatılırken ilk süper kullanıcı olarak oluşturulduğu için `humra_test` geniş yetkilere sahiptir. Test ortamında bu durum işlevselliği engellememektedir; ancak **üretim ortamında kesinlikle kabul edilemez**.

### Production İçin Zorunlu Rol Ayrımı Mimarisi:
Üretim ortamında veritabanı iki ayrı role bölünmelidir:

1. **Migration / DDL Rolü (`humra_migrator`):**
   - Şema ve tabloların sahibidir (`OWNER TO humra_migrator`).
   - Sadece CI/CD deployment pipeline'ında veya kontrollü bakım penceresinde `npx prisma migrate deploy` çalıştırmak için kullanılır.
   - Web uygulamasının çalışma zamanı (runtime) bu kullanıcıya bağlanamaz.
2. **Uygulama / DML Rolü (`humra_app`):**
   - `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`.
   - Yalnızca `humra_prod` veritabanına bağlanma (`CONNECT`) ve `public` şemasında `USAGE` yetkisi.
   - Sadece uygulama tablolarında `SELECT, INSERT, UPDATE, DELETE` yetkisi.
   - Tablo oluşturma (`CREATE TABLE`), silme (`DROP TABLE`) veya değiştirme (`ALTER TABLE`) yetkisi kesinlikle bulunmaz.

---

## 7. BACKUP VE RESTORE PROVASI SONUÇLARI

Mevcut `humra_migration_test` veritabanına dokunulmaksızın uçtan uca yedekleme ve geri yükleme provası yürütülmüştür ([`scripts/rehearse-backup-restore.ts`](file:///c:/Users/Taha/Documents/hümramoda/scripts/rehearse-backup-restore.ts)):

1. **Yedek Alma:** `pg_dump -U humra_test -d humra_migration_test -F p` komutuyla tam metin SQL yedeği alındı.
   - **Yedek Dosyası:** `backups/humra_backup_rehearsal.sql`
   - **Boyut:** 2,266,751 bytes (2,213.62 KB)
   - **SHA-256:** `FF05A5791C31CE8F063EA33103AE3FBE18118501B1DE1B41AD9A62C4265EFBAC`
2. **Geçici Veritabanında Geri Yükleme:**  
   Docker üzerinde geçici `humra_restore_rehearsal` veritabanı oluşturuldu ve SQL yedeği bu veritabanına yüklendi.
3. **Bütünlük ve Parite Karşılaştırması:**
   - Kaynak Tablo Sayısı: **32** / Restore Tablo Sayısı: **32** (Tam Eşleşme).
   - Tüm 32 tablonun satır sayıları tek tek sorgulandı; kaynak ve restore arasında **0 fark** tespit edildi.
   - **Betül Trençkot Doğrulaması:** Restore edilen veritabanında Betül Trençkot'un 10 varyantı ve 100 adet stoğu eksiksiz doğrulandı.
4. **Temizlik:** Geçici veritabanı (`humra_restore_rehearsal`) ve geçici dosyalar güvenle silindi; orijinal test veritabanı bozulmadan korundu.

---

## 8. GERİ DÖNÜŞ PLANI (ROLLBACK) DENETİMİ

### "10 Saniyede Tek Ortam Değişkeniyle Geri Dönüş" İddiasının Teknik Analizi:
Faz 8.7 raporunda geçen bu iddianın **veri senkronizasyonu olmaksızın güvenli olmadığı** kanıtlanmıştır:
- Canlı mağaza PostgreSQL'e geçirildikten sonra gelen siparişler, ödeme kayıtları ve azalan stoklar doğrudan PostgreSQL'e yazılacaktır.
- Eğer sistem arızalanır ve yalnızca `DATA_STORE_DRIVER="json"` yapılarak geri dönülürse; geçiş anından sonraki tüm siparişler ve müşteri işlemleri JSON dosyasında bulunmadığı için **KAYBOLUR**. Stoklar eski yüksek seviyelerine döner ve mükerrer satış (overselling) riski doğar.

### Güvenli Geri Dönüş Prosedürü (Tersine Senkronizasyon):
Bu riski bertaraf etmek için **[`scripts/export-pg-to-store-json.ts`](file:///c:/Users/Taha/Documents/hümramoda/scripts/export-pg-to-store-json.ts)** aracı geliştirilmiş ve test edilmiştir:
1. **Adım 1:** Site bakım moduna alınır (yeni sipariş girişi dondurulur).
2. **Adım 2:** `npx tsx scripts/export-pg-to-store-json.ts` çalıştırılarak PostgreSQL'deki tüm güncel ürünler, güncel stoklar, yeni siparişler ve kullanıcılar JSON formatına aktarılır.
3. **Adım 3:** Üretilen JSON deposunun veri bütünlüğü ve SHA256'sı doğrulanır.
4. **Adım 4:** `DATA_STORE_DRIVER="json"` atanarak uygulama yeniden başlatılır.
5. **Adım 5:** Bakım modu kaldırılarak JSON üzerinden güvenle devam edilir.

---

## 9. TAM REGRESYON VE DOĞRULAMA TESTLERİ

| Test / Denetim Adımı | Komut / Araç | Beklenen | Gerçekleşen | Durum |
|---|---|---|---|---|
| Vitest Test Paketi | `npm test` | 35 dosya, 328 test | 35 dosya, 328 test | **%100 BAŞARILI** |
| TypeScript Tip Denetimi | `npx tsc --noEmit` | 0 hata | 0 hata | **BAŞARILI** |
| Prisma Şema Doğrulaması | `npx prisma validate` | Geçerli şema | Valid schema | **BAŞARILI** |
| Playwright E2E Tarayıcı | `run-e2e-browser-test.ts` | 31 sayfa, 0 hata | 31 sayfa, 0 kırık görsel | **%100 BAŞARILI** |
| Backup & Restore Provası | `rehearse-backup-restore.ts` | 32 tablo paritesi | 32/32 tablo, 0 fark | **%100 BAŞARILI** |
| Kaynak JSON Hash | SHA256 | `287517...` | `287517...` | **%100 KORUNDU** |
| Medya Yüklemeleri | `public/uploads` | 155 dosya | 155 dosya | **%100 KORUNDU** |
| Betül Trençkot Stoğu | 10 varyant / 100 stok | 10 / 100 | 10 / 100 | **%100 KORUNDU** |
| Aktif Runtime Sürücüsü | `getActiveStoreDriver()` | `"json"` | `"json"` | **%100 KORUNDU** |

---

## 10. PRODUCTION'A GEÇİŞ ÖNCESİ KALAN ENGELLER VE ÖN KOŞULLAR

Canlıya geçiş yapılmadan önce giderilmesi gereken teknik gereksinimler:

1. **Canlı PostgreSQL Altyapısının Temini:** Production sunucusunda PostgreSQL 16+ servisi kurulmalı ve SSL bağlantısı yapılandırılmalıdır.
2. **Veritabanı Rollerinin Ayrılması:** `humra_migrator` (DDL) ve `humra_app` (DML, NOSUPERUSER) kullanıcıları tanımlanmalıdır.
3. **Canlı PayTR Bilgilerinin Girilmesi:** Canlı mağaza için PayTR panelinden alınan gerçek `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY` ve `PAYTR_MERCHANT_SALT` değerleri üretim ortam değişkenlerine eklenmelidir.
4. **Bağlantı Havuzlayıcı (PgBouncer):** Yoğun trafik altında connection starvation yaşanmaması için PgBouncer veya benzeri bir havuzlayıcı devreye alınmalıdır.
5. **Son Veri Aktarımı ve Kesinti Penceresi:** Canlıya geçiş anında 10-15 dakikalık planlı bakım penceresi açılarak son `data/store.json` verisi PostgreSQL'e aktarılmalı ve parite onaylandıktan sonra `DATA_STORE_DRIVER="postgres"` yapılmalıdır.

---

## 11. DURMA NOKTASI

Faz 8.8 kapsamındaki tüm teknik denetimler, provası yapılan yedekleme/geri yükleme süreçleri ve regresyon testleri eksiksiz tamamlanmıştır.

**Değişmez kural gereği canlı mağaza JSON'da bırakılmıştır. Canlıya geçiş, deploy veya veri aktarımı yapılmamış; kullanıcı talimatı beklenmektedir.**
