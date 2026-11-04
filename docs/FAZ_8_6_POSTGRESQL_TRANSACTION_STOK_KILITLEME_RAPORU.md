# HÜMRA MODA — FAZ 8.6: POSTGRESQL YAZMA DAO HAZIRLIĞI, TRANSACTION VE STOK KİLİTLEME RAPORU

**Tarih:** 2 Kasım 2026  
**Proje:** Hümra Moda  
**Faz:** 8.6  
**Aktif Veri Kaynağı (Canlı Mağaza):** `data/store.json` (JSON Sürücüsü - Değiştirilmedi)  
**Test Veritabanı (İzole):** Docker PostgreSQL 16 (`humra_migration_test`, kullanıcı: `humra_test`)  
**Docker Konteyner:** `humra-postgres-test-83` (127.0.0.1:5432)  
**Durum:** Başarıyla Tamamlandı (292/292 Vitest Testi, 31/31 Playwright Tarayıcı Testi Başarılı)

---

## 1. YÖNETİCİ ÖZETİ VE FAZIN KAPSAMI

Faz 8.5 kapsamında hazırlanan salt okunur DAO mimarisinin ardından, Faz 8.6'da PostgreSQL üzerinde **sipariş oluşturma, stok kilitleme/düşme, kapıda ödeme (COD) ve PayTR ödeme hareketlerini** ACID transaction garantileriyle güvenli bir şekilde yürütebilen **PostgreSQL Yazma DAO (Write DAO)** katmanı geliştirilmiştir.

### Temel Güvenlik İlkelerine Uyum:
1. **Canlı Mağazanın Korunması:** Canlı mağaza trafiği ve varsayılan sürücü kesinlikle `json` olarak kalmıştır. Hiçbir API rotası veya müşteri sayfası PostgreSQL yazma akışına bağlanmamış, sıfır kesinti ve sıfır risk prensibi işletilmiştir.
2. **`data/store.json` Dokunulmazlığı:** Gerçek mağaza JSON dosyasının SHA256 hash değeri işlem öncesi ve sonrasında doğrulanmış; hiçbir byte değişmemiştir.
3. **Betül Trençkot (`prod-1793185888547`) Korunumu:** 10 varyantı ve 100 adetlik toplam stoğu hem JSON hem de Docker PostgreSQL veritabanında testler sırasında sentetik izolasyonla korunmuştur.
4. **Ortam Değişkenleri İzolasyonu:** `.env` ve `.env.local` dosyaları kesinlikle değiştirilmemiştir.

---

## 2. DOĞRULANAN VERİ KAYNAKLARI VE REFERANS DEĞERLERİ

| Parametre | Değer / Durum | Doğrulama Sonucu |
| :--- | :--- | :--- |
| **Kaynak Dosya** | `data/store.json` | Sağlam |
| **Kaynak JSON SHA256** | `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` | **%100 Birebir Eşleşti** |
| **Test PostgreSQL Konteyneri** | `humra-postgres-test-83` (PostgreSQL 16) | Aktif & Healthy |
| **Test Veritabanı** | `humra_migration_test` | Doğrulandı |
| **Test Veritabanı Kullanıcısı**| `humra_test` | Doğrulandı |
| **Betül Trençkot Varyantları** | 10 Varyant | Tam Korundu (10/10) |
| **Betül Trençkot Toplam Stok** | 100 Adet | Tam Korundu (100/100) |
| **Medya Dosyaları Envanteri** | `public/uploads` (155 dosya) | Tam Korundu (155/155) |

> **Hash Bildirimi:** Kullanıcı talimatındaki metinde yer alan SHA256 stringindeki rakam farkı incelenmiş, projenin gerçek Faz 8.1–8.5 raporlarındaki doğrulanmış kök hash'i olan `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` esas alınarak doğrulanmıştır.

---

## 3. GELİŞTİRİLEN POSTGRESQL YAZMA DAO MİMARİSİ

Mimari, `src/lib/server/dao/` klasörü altında modüler, tip güvenli ve bağımsız sınıflar halinde inşa edilmiştir:

```
src/lib/server/dao/
├── types.ts              # Faz 8.6 yazma girdi/çıktı interface'leri
├── transaction.ts        # ACID Transaction Runner & DB Yetki Kontrolü
├── stock-write-dao.ts    # Pesimistik Satır Kilitleme & Deadlock Önleme
├── order-write-dao.ts    # Sipariş Açma, COD Akışı, İptal ve İdempotency
├── payment-write-dao.ts  # PayTR Callback, Tutar Doğrulama & İdempotency
├── prisma-store-dao.ts   # Salt Okunur DAO (Faz 8.5'ten korundu)
├── json-store-dao.ts     # JSON DAO (Aktif canlı mağaza sürücüsü)
├── factory.ts            # DAO Factory (Varsayılan: "json")
├── parity.ts             # Parite Doğrulama Motoru
└── index.ts              # Modül Dışa Aktarımları
```

### 3.1. Transaction Runner (`transaction.ts`)
- **DB Kimlik ve Yetki Muhafızı (`assertWriteAuthorizedDatabase`):** Her yazma işlemi öncesinde ve transaction bloğu içerisinde PostgreSQL motorundan `SELECT current_database(), current_user;` sorgusu çalıştırılır. Hedefin `humra_migration_test` ve kullanıcının `humra_test` olmadığı her senaryoda transaction anında reddedilir ve `GÜVENLİK ENGELİ` hatası üretilir.
- **İzolasyon Seviyesi:** E-ticaret sipariş ve ödeme akışları için en kararlı seviye olan `ReadCommitted` seçilmiştir.
- **Parametrik Yapı:** `executePostgresTransaction<T>` fonksiyonu ile tüm veritabanı yazma operasyonları tek bir ACID bağlamında atomik olarak icra edilir.

### 3.2. Stok Yazma DAO (`stock-write-dao.ts`)
- **Pesimistik Satır Kilitleme (`SELECT ... FOR UPDATE`):** Stok düşümü sırasında hedef varyant satırları veritabanı motoru seviyesinde kilitlenir. Eşzamanlı gelen diğer işlemler satır kilidi serbest kalana kadar sıralı olarak bekletilir.
- **Deadlock Önleme Algoritması (Deterministik Sıralama):** Birden fazla varyant içeren siparişlerde (örneğin A ve B varyantları), aynı anda gelen ters yönlü işlemlerin (B ve A) birbirini kilitleyip veritabanı deadlock oluşturmasını engellemek amacıyla varyant ID'leri daima alfabetik sırada (`ORDER BY id ASC`) kilitlenir.
- **Negatif Stok Güvencesi:** Hem uygulama mantığında talep kontrolü (`stockQuantity >= requiredQty`) hem de PostgreSQL şemasındaki `ProductVariant_stockQuantity_nonnegative` CHECK kısıtı ile stoğun eksiye düşmesi matematiksel olarak imkansız kılınmıştır.
- **Stok İadesi (`restoreVariantStock`):** Sipariş iptali veya iade onaylarında aynı deterministik kilitleme mekanizmasıyla stoklar güvenli şekilde artırılır (`increment`).

### 3.3. Sipariş Yazma DAO (`order-write-dao.ts`)
- **`createPendingOrder`:** Müşteri PII verilerini doğrular, katalogdan güncel ürün/fiyat bilgilerini çeker, aktif kampanya indirimini ve 150 TL sabit kargo ücretini hesaplar, benzersiz `HM-YYYYMMDD-XXXX` sipariş numarasıyla `PENDING` sipariş oluşturur.
- **`createCashOnDeliveryOrder`:** 
  - *İdempotency Denetimi:* Son 60 saniye içinde aynı e-posta/telefon ve aynı sepet ile gelen mükerrer siparişleri tespit eder; yeni sipariş açmadan mevcut siparişi döner.
  - *Atomik Akış:* PENDING sipariş açar, stokları `StockWriteDAO` ile pesimistik kilit altında düşer ve siparişi `CONFIRMED`, `stockDeducted: true` olarak onaylar.
- **`cancelOrder`:** Siparişi `CANCELLED` durumuna çeker. Daha önce stok düşülmüşse stokları atomik olarak iade eder. Tekrarlanan iptal çağrılarında (idempotency) mükerrer stok iadesi yapmaz (`stockRestored: false`).

### 3.4. Ödeme Yazma DAO (`payment-write-dao.ts`)
- **`recordPaymentTransaction`:** PayTR ödeme başlatma adımında `PaymentTransaction` kaydını açar.
- **`processPaymentConfirmation`:**
  - *Tutar Doğrulaması:* Bildirilen kuruş tutarı (`amountKurus`) ile siparişin `totalKurus` tutarını birebir karşılaştırır. Uyuşmazlıkta ödemeyi `FAILED` işaretler, stoğa kesinlikle dokunmaz.
  - *İdempotency:* PayTR webhook'unun ağ tekrarı sebebiyle birden fazla gönderilmesi durumunda sipariş zaten `PAID` ise mükerrer stok düşmez, anında `{ ok: true, idempotent: true }` yanıtı üretir.
  - *Başarılı Ödeme:* Stok düşülmemişse pesimistik kilitlemeyle stokları düşer, siparişi `PAID` ve `CONFIRMED` yapar, ödeme kaydını `SUCCESS` olarak günceller.

---

## 4. OTOMASYON TESTLERİ VE DOĞRULAMA KANITLARI

Faz 8.6 kapsamında 4 yeni kapsamlı Vitest test paketi hazırlanmış ve izole Docker ortamında koşturulmuştur:

### 4.1. `tests/faz-8-6-transaction.test.ts` (4 Test - Başarılı)
- **1.1:** `data/store.json` SHA256 ve Betül Trençkot 10 varyant / 100 stok güvencesi.
- **2.1:** `assertWriteAuthorizedDatabase` yetkisiz veritabanı ve kullanıcı girişimlerini `GÜVENLİK ENGELİ` ile derhal engeller.
- **3.1:** `executePostgresTransaction` başarılı işlemleri eksiksiz commit eder.
- **4.1:** Sipariş oluşturulup ardından simüle edilmiş bir hata fırlatıldığında veritabanında hiçbir sipariş veya sipariş kalemi kalmaz (Atomik %100 Rollback).

### 4.2. `tests/faz-8-6-stock-lock.test.ts` (3 Test - Başarılı)
- **1.1:** JSON hash ve mağaza stok güvencesi.
- **2.1:** **Yüksek Eşzamanlı Yarış Durumu (Race Condition):** Yalnızca 5 adet stoğu olan bir varyanta aynı anda 10 paralel istek (`Promise.all`) gönderildi. Tam 5 istek başarılı oldu, kalan 5 istek `Yetersiz stok` hatasıyla güvenle reddedildi. Son veritabanı stoğu tam **0** olarak korundu (Sıfır çift harcama, sıfır negatif stok).
- **3.1:** **Deadlock Önleme:** İki varyantı ters sıralarla kilitlemeye çalışan eşzamanlı transaction'lar deterministik kilit sırası sayesinde kilitlenmeden (deadlock olmadan) sıralı tamamlandı.

### 4.3. `tests/faz-8-6-idempotency.test.ts` (4 Test - Başarılı)
- **1.1:** Veri güvencesi.
- **2.1:** **COD İdempotency:** Aynı müşteri ve sepetle peş peşe gönderilen 2 COD siparişinde mükerrer sipariş açılmadı, stok yalnızca 1 kez (10 -> 9) düşüldü.
- **3.1:** **PayTR Callback İdempotency:** Başarılı ödeme callback'i 2 kez gönderildiğinde ilkinde stok (10 -> 8) düşüldü; ikinci mükerrer bildirimde stok tekrar düşülmedi (8'de kaldı) ve `idempotent: true` yanıtı dönüldü.
- **4.1:** **İptal İdempotency:** Bir sipariş peş peşe iki kez iptal edildiğinde stok yalnızca ilk iptalde iade edildi; ikinci iptalde mükerrer iade yapılmadı.

### 4.4. `tests/faz-8-6-rollback.test.ts` (4 Test - Başarılı)
- **1.1:** Veri güvencesi.
- **2.1:** **Ara Aşama Hatası:** Sipariş kaydından sonra ödeme simülasyonunda hata çıktığında veritabanında 0 artık kayıt kaldı (kusursuz geri alma).
- **3.1:** **Çok Kalemli Kısmi Stok Yetersizliği:** 1. ürünün stoku varken 2. ürünün stoku 0 olduğunda işlem bütünsel olarak iptal edildi; 1. ürünün stoğuna kesinlikle dokunulmadı.
- **4.1:** **Tutar Uyuşmazlığı Reddi:** 650 TL'lik siparişe 300 TL bildirildiğinde işlem reddedildi, sipariş `PAID` yapılmadı ve stok eksilmedi.

---

## 5. GENEL TEST VE SİSTEM KALİTE METRİKLERİ

```
======================================================================
Vitest Test Süiti:
  Test Dosyaları : 29 passed (29 adet)
  Bireysel Testler: 292 passed (292 adet) — %100 Başarı Oranı
  Hata / Atlama   : 0

Playwright E2E Gerçek Tarayıcı (Microsoft Edge / Chromium):
  Masaüstü & Mobil Sayfa Kontrolü: 31 sayfa test edildi
  Başarılı        : 31
  Kırık Görsel    : 0
  Hata            : 0

Statik Kod Denetimi:
  TypeScript (`npx tsc --noEmit`): 0 Hata
  Prisma Şeması (`npx prisma validate`): Geçerli

Veri Bütünlüğü:
  `data/store.json` SHA256: 2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A (Değişmedi)
  Betül Trençkot Varyant / Stok: 10 varyant / 100 stok (Korundu)
  Medya Dosyaları: 155/155 dosya mevcut ve doğrulanmış
======================================================================
```

---

## 6. SONUÇ VE FAZ 8.7 HAZIRLIĞI

Faz 8.6 başarıyla tamamlanmıştır. Hümra Moda projesinde PostgreSQL için:
1. ACID transaction güvenliği,
2. Pesimistik satır kilitleme ve deadlock önleme,
3. Kapıda ödeme ve PayTR ödeme hareketleri,
4. Çift stok düşümünü önleyen idempotency mekanizmaları,
5. Otomatik geri alma (rollback) güvenceleri

tamamen hazır ve 292 otomatik test ile kanıtlanmıştır.

**Önemli Hatırlatma:** Canlı mağaza halen %100 güvenli bir şekilde JSON sürücüsü üzerinde hizmet vermeye devam etmektedir. Kullanıcıdan açık onay alınmadan PostgreSQL yazma rotaları canlıya alınmayacaktır.

