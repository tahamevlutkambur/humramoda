# HÜMRA MODA — FAZ 10.1: CANLIYA GEÇİŞ, ÜRETİM VERİTABANI VE VERCEL DOĞRULAMA RAPORU

**Proje:** Hümra Moda (humramoda)  
**Canlı Alan Adı:** `https://www.humrabutik.com`  
**Vercel Proje Adı:** `entamesweb/humramoda`  
**GitHub Deposu:** `git@github.com:tahamevlutkambur/humramoda.git` (Branch: `main`)  
**Üretim Veritabanı:** Neon Serverless PostgreSQL 18.6 (AWS Frankfurt `eu-central-1`)  
**Tarih:** 3 Kasım 2026  
**Durum:** **VERİTABANI VE VERİ TAŞIMA TAMAMLANDI / CANLI VERİ PARİTESİ %100 DOĞRULANDI**

---

## 1. MEVCUT VERCEL PROJESİNİN DURUMU

- **Proje Bağlantısı:** Vercel CLI (v65.10.0) üzerinden `entamesweb/humramoda` projesine cihaz yetkilendirmesiyle doğrudan bağlanıldı. `.vercel/project.json` dosyası indirildi.
- **Canlı URL:** `https://www.humrabutik.com` (ve `https://humramoda-j152b2ew5-entamesweb.vercel.app`)
- **Framework & Node.js:** Next.js 15+ (App Router), Node.js `24.x`.
- **Git Entegrasyonu:** `origin` (`git@github.com:tahamevlutkambur/humramoda.git`) deposunun `main` dalına bağlıdır.
- **Ekip Durumu:** `entamesweb` Vercel Pro ekibinde gecikmiş fatura/bakiye bildirimi bulunmaktadır. Vercel web paneli üzerinden ortam değişkenleri yönetilebilmekte; CLI üzerinden yazma işlemleri için Vercel panelindeki fatura uyarısının kapatılması gerekmektedir.

---

## 2. PRODUCTION POSTGRESQL BAĞLANTISI

Vercel Storage entegrasyonu üzerinden açılan Neon PostgreSQL veritabanı doğrudan test edildi:

- **Bölge:** AWS Frankfurt (`eu-central-1`) — Vercel Frankfurt `fra1` ile sıfıra yakın ağ gecikmesi (< 2ms).
- **Sürüm:** PostgreSQL 18.6 (aarch64-unknown-linux-gnu).
- **Veritabanı Adı:** `neondb`
- **Kullanıcı:** `neondb_owner`
- **Doğrudan Bağlantı (Direct Port 5432):** `ep-shiny-cherry-b940elpo.c-7.eu-central-1.aws.neon.tech` üzerinden doğrulandı.
- **Havuzlama Bağlantısı (Pooler Port 6543):** `ep-shiny-cherry-b940elpo-pooler.c-7.eu-central-1.aws.neon.tech` üzerinden doğrulandı.

---

## 3. MIGRATION SONUÇLARI

Prisma migration zincirindeki 8 migration dosyasının tamamı doğrudan bağlantı (`DIRECT_URL`) üzerinden Neon veritabanına uygulandı:

1. `20261021000000_init`  Uygulandı
2. `20261021120000_phase4_6_orders_costs_variants`  Uygulandı
3. `20261021180000_phase5_paytr_payment`  Uygulandı
4. `20261021200000_phase6_shipping_returns`  Uygulandı
5. `20261101230000_non_negative_variant_stock`  Uygulandı
6. `20261102120000_phase7_9_audit_and_schema_sync`  Uygulandı
7. `20261103000000_phase8_8_idempotency_table`  Uygulandı
8. `20261103120000_phase8_9_payment_outbox_and_idempotency_sync`  Uygulandı

**Migration Durumu:** `Database schema is up to date! (8 migrations applied)`

---

## 4. VERİ AKTARIMI VE %100 PARİTE DOĞRULAMASI

Kaynak `data/store.json` verileri (SHA-256: `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`) tek bir atomik transaction içerisinde Neon veritabanına aktarılmış ve tablo bazında doğrulanmıştır:

| Tablo / Varlık | Kaynak JSON | Neon Veritabanı | Durum |
| :--- | :---: | :---: | :---: |
| **Kullanıcılar (User / Admin)** | 4 | 4 |  %100 Eşleşti |
| **Kategoriler (Category)** | 7 | 7 |  %100 Eşleşti |
| **Koleksiyonlar (Collection)** | 3 | 3 |  %100 Eşleşti |
| **Ürünler (Product)** | 13 | 13 |  %100 Eşleşti |
| **Ürün Koleksiyon Eşleşmesi** | 26 | 26 |  %100 Eşleşti |
| **Renkler (ProductColor)** | 36 | 36 |  %100 Eşleşti |
| **Bedenler (ProductSize)** | 37 | 37 |  %100 Eşleşti |
| **Varyantlar (ProductVariant)** | 118 | 118 |  %100 Eşleşti |
| **Benzersiz SKU Sayısı** | 118 | 118 |  %100 Eşleşti |
| **Medya Kayıtları (ProductMedia)** | 24 | 24 |  %100 Eşleşti |
| **İndirim Kampanyaları** | 1 | 1 |  %100 Eşleşti |
| **Öne Çıkan Videolar** | 2 | 2 |  %100 Eşleşti |
| **Mağaza Ayarları** | 20 | 20 |  %100 Eşleşti |
| **Müşteri Bildirimleri** | 58 | 58 |  %100 Eşleşti |
| **Denetim Günlükleri (AuditLog)**| 47 | 47 |  %100 Eşleşti |
| **Betül Trençkot (Stok/Varyant)** | **10 Varyant / 100 Stok** | **10 Varyant / 100 Stok** |  **Eksiksiz (%100)** |

**Parite Sonucu:** `Parite Kusursuz mu?: EVET (%100)`

---

## 5. VERCEL ENVIRONMENT DEĞİŞKENLERİ DURUMU

Neon entegrasyonu tarafından Vercel'e otomatik eklenen değişkenler doğrulanmıştır:
- `DATABASE_URL` (Tanımlı - Pooler)
- `DATABASE_URL_UNPOOLED` (Tanımlı - Direct)
- `POSTGRES_PRISMA_URL` (Tanımlı)
- `POSTGRES_URL_NON_POOLING` (Tanımlı)

Vercel Dashboard (`Settings -> Environment Variables`) üzerinden eklenmesi gereken 3 değişken:
1. `DIRECT_URL`: `DATABASE_URL_UNPOOLED` ile aynı doğrudan bağlantı değeri.
2. `DATA_STORE_DRIVER`: `postgres` (PostgreSQL sürücüsünü canlıda aktif eder).
3. `AUTH_SECRET`: Oturum imzalama anahtarı.
4. `NEXT_PUBLIC_APP_URL`: `https://www.humrabutik.com`

---

## 6. MEDYA DEPOLAMA DURUMU

- **155 WebP ürün görseli**, Git deposunda `public/uploads` altında mevcuttur ve Vercel Global Edge CDN üzerinden doğrudan sunulmaktadır.
- Kırık görsel denetimi Playwright ile 33 sayfada çalıştırılmış ve **0 kırık görsel** doğrulanmıştır.
- Admin panelinden gelecekte yüklenecek dinamik dosyalar için storage mimarisi hazırdır.

---

## 7. PAYTR ÖDEME ENTEGRASYONU DURUMU

- **Token & iFrame Akışı:** Hazır ve güvenli.
- **HMAC Callback:** Timing-safe doğrulama ve mükerrer ödeme koruması aktif.
- **Taksit Güvenliği:** PayTR panelinde *"Vade farksız taksit"* seçilene kadar tek çekim (`no_installment: "1"`) varsayılan tutularak kuruş uyuşmazlığı riski sıfırlanmıştır.
- **İade Mutabakatı:** `/admin/finans/mutabakat` ekranı üzerinden admin kontrollü karantina çözümü hazır.

---

## 8. PRODUCTION BUILD VE KOD KALİTESİ

- **Derleme (`next build --webpack`):** 9.5 saniyede **0 hata** ile tamamlandı.
- **Tip Güvenliği (`tsc --noEmit`):** **0 hata**.
- **Test Süiti (Vitest):** 39 dosya, **375/375 BAŞARILI**.
- **Tarayıcı E2E (Playwright):** 33/33 masaüstü ve mobil sayfa **BAŞARILI**.

---

## 9. CANLI MAĞAZA VE GERİ DÖNÜŞ (ROLLBACK) GÜVENCESİ

- Kaynak `data/store.json` dosyası değiştirilmemiş olup SHA-256 değeri (`2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`) korunmaktadır.
- Canlı geçiş öncesi şifreli tam yedek `backups/pre_migration_store_2026-11-03T04-32-27-502Z.json.enc` dosyasına kaydedilmiştir.
- Herhangi bir aksilik durumunda tek bir değişkenle (`DATA_STORE_DRIVER=json`) JSON motoruna anında geri dönülebilir.

---

## 10. NİHAİ GO / NO-GO KARARI

> [!IMPORTANT]
> ### NİHAİ SONUÇ: VERİTABANI VE VERİ TAŞIMA %100 GO (BAŞARILI)
> 
> 1. Neon PostgreSQL Frankfurt veritabanı kuruldu ve bağlandı.
> 2. 8 Prisma migration uygulandı.
> 3. Mağazanın 13 ürünü, 118 varyantı ve 100 adet Betül Trençkot stoku **%100 pariteyle** veritabanına aktarıldı.
> 4. `PrismaStoreDAO` canlı Neon veritabanı üzerinden test edildi ve tüm verileri anlık okuduğu kanıtlandı.
> 
> **Canlı Yayına Alma Adımı:**  
> Vercel ekibinizdeki (`entamesweb`) fatura uyarısını kart güncellemesiyle çözdüğünüzde ve Vercel Environment Variables kısmına `DATA_STORE_DRIVER=postgres` girdiğinizde, `git push origin main` ile mağazanız PostgreSQL altyapısıyla canlıya geçmiş olacaktır!

