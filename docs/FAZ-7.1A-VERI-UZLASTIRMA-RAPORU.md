# HÜMRA MODA — Faz 7.1A Veri Uzlaştırma Raporu

**Tarih:** 1 Kasım 2026  
**Kapsam:** Salt okunur inceleme. Tam aktarım yapılmadı. Local PostgreSQL’deki kısmi kayıtlar kaynak kabul edilmedi.

## 1. Kaynak bütünlüğü

| Kaynak | SHA256 | Sonuç |
|---|---|---|
| `data/store.json` | `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` | Kaynak |
| ZIP içindeki `store.json` | `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` | Birebir eşleşti |
| Ön-migration ZIP’in tamamı | `5141A348DF1F317B5653A3C0D49173EEC46E6614175E5A325A30780588789622` | Okunabildi |

ZIP içindeki 146 `uploads/` dosyasının tümü mevcut `public/uploads` dosyalarıyla SHA256 düzeyinde eşleşti. Eksik veya farklı dosya yok. İnceleme sırasında JSON, upload dosyaları veya PostgreSQL değiştirilmedi; PostgreSQL hiç okunmadı.

## 2. `betul-trenckot` varyant çakışmaları

Ürün: **Betül Trençkot** — ID `prod-1793185888547`, slug `betul-trenckot`; kaynak ürün oluşturma tarihi `2026-10-28T11:11:28.547Z`. Kaynakta ürün `updatedAt` alanı yok. Varyant nesnelerinde `createdAt`/`updatedAt` alanı yok.

Kaynakta iki ayrı renk/beden çifti çakışıyor:

| Renk / ID | Beden / ID | Varyant ID | SKU | Stok | Oluşturma/güncelleme |
|---|---|---|---|---:|---|
| Siyah / `col-1793185888546-0` | 38-40-42 / `size-prod-1793185888547-0` | `var-prod-1793185888547-0` | `HM-SIY-STD-152` | 10 | Yok |
| Siyah / `col-1793185888546-0` | 38-40-42 / `size-prod-1793185888547-0` | `var-prod-1793185888547-1` | `KAET-YEN-STD-708` | 10 | Yok |
| Siyah / `col-1793185888546-0` | 44-46-48 / `size-prod-1793185888547-1` | `var-prod-1793185888547-3` | `KAET-SIY-STAN-004` | 10 | Yok |
| Siyah / `col-1793185888546-0` | 44-46-48 / `size-prod-1793185888547-1` | `var-prod-1793185888547-4` | `KAET-ACI-STAN-005` | 10 | Yok |

### Kanıt ve karar

- Dört SKU da farklı varyant ID’siyle kaynakta bulunuyor; SKU’lar global olarak tekil ve stokları ayrı ayrı 10. Stokları toplamak veya kayıtlardan birini silmek için kaynakta kanıt yok.
- Aynı dört kayıt `src/lib/default-catalog.json` içinde de aynı kombinasyon ve stoklarla var. Bu dosya JSON kataloğunun fallback kopyasıdır; bağımsız stok veya ürün kaydı kanıtı sayılmaz.
- Bu ürün/SKU’lara referans veren bir `auditLogs` kaydı bulunamadı. Toplam 47 audit satırından hiçbirinin `targetId`, `details` veya SKU içeriği bu ürüne bağlanmıyor. Admin kullanıcılarının e-posta/hash bilgileri rapora alınmadı. Variant seviyesinde admin değişiklik geçmişi yok.
- Ürün/varyant kaynak satırları: `data/store.json:1346–1500`; fallback kopyası: `src/lib/default-catalog.json:1403–1537`.
- Ürün oluşturma/güncelleme kodu `src/lib/server/store.ts:1027` ve `:1234` çevresinde SKU çakışmalarını ele alıyor; aynı `colorId + sizeId` için yinelenen kombinasyonu reddetmiyor. Eşleşmeyen renk/beden ilk tanımlı değere düşebiliyor. `ProductEditor` renk eklerken `Standart` bedenli varyant ekliyor; mevcut beden adları farklıysa sunucu tarafındaki ilk-beden fallback’i çakışma oluşturabilir. Bu, çakışmanın oluşabileceği kod yoludur; geçmişte bu ürüne hangi adminin hangi işlemi yaptığı kanıtlanamıyor.
- Prisma `ProductVariant` hem `sku` için tekillik hem de `[productId, colorId, sizeId]` tekilliği şart koşuyor (`prisma/schema.prisma:191–212`). Bu iki çakışma mevcut şema altında kayıpsız aktarılamaz.

**Manuel karar gerekli:** Her iki kombinasyonda da hangi SKU’nun satış/stok kaydı olarak kalacağı mevcut JSON, ZIP ve fallback katalogla kanıtlanamıyor. Her iki kayıt da korunmalı; SKU silme/birleştirme veya stok değişikliği yapılmamalı. Alternatif ürün kuralı (aynı renk/bedene birden fazla SKU gerçekten izin verilecek mi?) ayrıca karara bağlanmalı; varsayılan olarak şemadaki tek varyant kuralını korumak gerekir.

## 3. Kaynak koleksiyon sayımları ve veri tutarlılığı

| JSON alanı | Kayıt sayısı | Prisma karşılığı | Denetim / aktarım notu |
|---|---:|---|---|
| `categories` | 7 | `Category` | Slug çakışması yok; ürün kategori referanslarında 0 kopukluk. Kaynakta alan olmayan parent/SEO/tarih değerleri varsayılan/null olmalı. |
| `collections` | 3 | `Collection` | Slug çakışması yok; bütün `collectionSlugs` geçerli. İlişki `ProductCollection` join tablosuna açılmalı. |
| `products` | 13 | `Product` | ID/slug çakışması yok. JSON `categorySlug`/`categoryName` alanları `categoryId` ilişkisine çevrilmeli; `_mediaTruncated` aktarım alanı değil, bütünlük uyarısıdır. |
| `products[].colors` | 36 | `ProductColor` | ID çakışması yok; ürün içi slug unique denetimi yapılmalı. JSON’da `isActive` yok, Prisma’da da renk aktiflik alanı yok. |
| `products[].sizes` | 37 | `ProductSize` | ID çakışması yok; ürün içi slug unique denetimi yapılmalı. |
| `products[].variants` | 118 | `ProductVariant` | ID/SKU çakışması yok, stoklar negatif değil ve tam sayı. 2 yinelenen ürün+renk+beden kombinasyonu var. |
| `products[].media` | 24 | `ProductMedia` | 24 kaydın URL alanı inline `data:` WebP. 8 ürün kısmi galerili işaretli; altı ürünün medya listesi boş. Renk referanslarında kopukluk yok. |
| `adminUsers` | 4 | `User` | E-posta tekil. 3 `ADMIN`, 1 `CARRIER`; Prisma `UserRole` enum’unda `CARRIER` yok. `STAFF`’e map etmek rol bilgisini kaybettirir. |
| `campaigns` | 1 | `DiscountCampaign` | Kod çakışması yok. JSON alanı `name` → Prisma `title`; Prisma modelinde JSON `description` için alan yok. |
| `orders` | 0 | `Order`, `OrderItem` | Kaynakta aktarılacak sipariş yok. Sipariş ID/numara/finans durumu için kaynak doğrulaması yine gerekli. |
| Ödemeler | 0 ayrı koleksiyon | `PaymentTransaction` | JSON’da bağımsız `payments` alanı yok. Ödeme hareketi ancak sipariş içine gömülü/başka yerdeyse kaynak kanıtı olmadan oluşturulmamalı. |
| `shipments` | 0 | `Shipment`, `ShippingEvent` | Kaynakta kayıt yok; varsa `events[]` alanı `ShippingEvent`’e açılmalı. |
| `returnRequests` | 0 | `ReturnRequest`, `ReturnItem` | Kaynakta kayıt yok. JSON’daki `requestType`/`exchangeDetails` alanları (dolu kayıt çıkarsa) şemada karşılanmıyor. |
| `notifications` | 58 | `CustomerNotification` | `idempotencyKey` tekil; **58/58 `orderId`, boş `orders` listesinde bulunmadığı için orphan**. Prisma ilişkisi zorunlu Order FK’si; mevcut haliyle kayıpsız aktarım mümkün değil. Bildirim içeriği/alıcı PII içerdiğinden rapora alınmadı. |
| `auditLogs` | 47 | Model yok | `AdminAuditLog` modeli yok. 47 kaydın yalnız 1’i mevcut admin ID/e-postasıyla eşleşiyor; 46 actor kaydı mevcut admin listesine bağlanamıyor. Kaynak `adminId`/e-posta snapshot’ı korumalı; mevcut olmayan aktörleri uydurmamalı. IP/details alanları hassas veri içerir. |
| `siteActivityLogs` | 0/alan yok | Model yok | JSON anahtarı mevcut değil; aktarılacak kayıt yok. |
| `featuredVideos` | 2 | Doğrudan model yok | `id/title/productSlug/colorSlug/videoUrl/posterUrl/price`; `BlockItem` video alanlarıyla doğrudan eşleşmiyor ve ürün/renk ilişki snapshot’ı eksik kalır. Özel model veya tam JSON saklama kararı gerekir. |
| `homepageContent` | 1 nesne / 4 ana bölüm | `HomepageBlock`, `BlockItem` veya `StoreSetting` | Hero/announcement/spotlight/brandValues alanları doğrudan block modeline aynı yapıda karşılanmıyor. JSON’ı StoreSetting altında kaydetmek mümkün ama sorgulanabilir yapı kaybolur. |
| `settings` | 20 üst seviye anahtar | `StoreSetting` | Anahtar/değer kayıtlarına JSON değer olarak map edilebilir. İçteki `paytr` alanları sır içerir; rapor/loglara dökülmemeli ve plaintext ayar olarak gelişigüzel taşınmamalı. |
| `updatedAt` | 1 scalar | Doğrudan model yok | Store snapshot zamanı; tarih biçimine dönüştürülmeden kayıt başına `updatedAt` olarak kullanılamaz. |
| `backups` | 0/alan yok | Uygulama backup dosya sistemi | JSON’da koleksiyon yok; disk yedekleri ayrı kaynak. |

### FK ve unique ön denetim özeti

- Tekil: category slug, collection slug, product ID/slug, varyant ID/SKU, campaign code, admin e-postası ve notification idempotency key için duplicate yok.
- Geçerli: ürün-kategori, ürün-koleksiyon, varyant-renk/beden ve medya-renk referanslarında kopuk kayıt yok.
- Geçersiz: 2 varyant composite unique çakışması; 58 orphan notification Order FK’si; audit satırlarının 46 actor’ı güncel adminlerle bağlanamıyor.
- Top-level `customers`, `payments` veya `siteActivityLogs` dizisi yok. `User` modelini “müşteri kayıtları” olarak doldurmak için kaynakta müşteri hesabı verisi bulunmuyor.

## 4. Görsel bulguları

- Ürün JSON’undaki 24 ürün medya kaydının tümü inline WebP `data:` URL. Bunların hiçbiri public dosyalarından biriyle tam SHA256 içerik eşleşmesi göstermedi.
- Sekiz `_mediaTruncated` ürünün ilgili JSON/backup kopyaları tarandı. Her ürün 120 yerel backup JSON’unda bulunuyor; bu kopyalarda galeriler daha dolu değil: Şalvar Pantolon ve Qapitone Garnili birer inline görsel, Betül Trençkot ve kalan beş ürün sıfır görsel.
- Uygulama kodunda `_mediaTruncated`, localStorage kotası 1.9M karakteri aşınca medyayı bir kapakla/sıfır medyayla kompaktlaştıran `client-store-sync.ts` akışında üretiliyor. Tam galerinin IndexedDB’den geri alınıp `/api/admin/products` üzerinden ayrı gönderilmesi bekleniyor; arka plan fetch hataları `.catch(() => {})` ile sessizce yutuluyor. Dolayısıyla source snapshot’ın kısmi kalması bu senaryoda mümkün; hangi özgün galeri öğelerinin eksik olduğu backup’lardan kanıtlanamıyor.
- `public/uploads/products/manifest.json` 22 HEIC kaynağı ve türevlerini listeliyor; manifestteki `sourceDirectory` (`humraresimler`) bu bilgisayarda yok ve 22 orijinal HEIC dosyası ne `public/uploads` ne de Faz 7.1 ZIP’i içinde bulundu. Türevler (WebP/AVIF) korunuyor. Orijinal HEIC’lerin başka yedekte olup olmadığı bu iki kaynaktan doğrulanamadı.
- Görsel contact sheet üzerinde IMG_2190–2201 grubu ekose görünümlü üstlük ve siyah pantolonları; IMG_2217–2219 açık renk üstlükleri; IMG_2231/2235/2237/2246 koyu dış giyimi; IMG_2262/2263/2270 gri trençkotları; IMG_2279 açık bej dış giyimi gösteriyor. Bunlar yalnız görsel adaylardır. JSON URL/hash veya açık ürün metadata bağlantısı olmadığından hiçbirine ürün ilişkisi atanmamıştır.
- `Gemini_Generated_Image_s66txgs66txgs66t.jpg` ve `hero-editorial.jpg` aynı SHA256 içeriğe sahip. İki dosya da korunmuştur; tek başına ürün galerisi bağlantısı kanıtı değildir.

### Sekiz ürün için tek tek medya uzlaştırması

| Ürün / ID | JSON’da bulunan medya | ZIP ve tarihli JSON backup kopyaları | Upload dosyalarında kanıtlı ilişki | Görsel incelemesi / manuel liste |
|---|---|---|---|---|
| Şalvar Pantolon / `prod-1793197224147` | 1 inline WebP `data:` URL; 57,627 karakter; thumb URL boş | 120 kopyanın en yüksek adedi 1; ilgili ZIP aynı | Exact URL yok; inline byte SHA’sı public dosyalarda yok | JSON’daki içerik düz siyah bol pantolon ürünü gösteriyor. Model fotoğraflarındaki siyah pantolonlar (IMG_2190–2201 grubu) ek görsel adayı olabilir; kesin değil. |
| Qapitone Garnili / `prod-1793187886341` | 1 inline WebP `data:` URL; 86,371 karakter; thumb URL boş | 120 kopyanın en yüksek adedi 1; ilgili ZIP aynı | Exact URL/hash yok | JSON’daki inline içerik desenli koyu ceket gösteriyor. IMG_2190–2201 ekose üstlük grubu görsel olarak benzer; aynı ürün veya renk olduğu doğrulanmadı. |
| Betül Trençkot / `prod-1793185888547` | 0; truncation işareti var | 120 kopyanın tümünde max 0; ilgili ZIP aynı | Yok | IMG_2231/2235/2237/2246 koyu dış giyim, IMG_2262/2263/2270 gri trençkot ve IMG_2279 açık bej dış giyim görsel adayları. Siyah/acı kahve/mürdüm/taş rengi galerisine doğru eşleme belirsiz. |
| Buklet Ceket / `prod-1793185124060` | 0; truncation işareti var | 120 kopyanın tümünde max 0; ilgili ZIP aynı | Yok | IMG_2217/2218/2219 açık renk üstlükler görsel adayları; ürün/renk doğrulaması yok. |
| Ekose Desenli Kuşaklı Ceket / `prod-1793184672798` | 0; truncation işareti var | 120 kopyanın tümünde max 0; ilgili ZIP aynı | Yok | IMG_2190–2201 ekose görünümlü üstlükler muhtemel görsel adayları; kuşak/renk/ürün ilişkisi kanıtlanmadı. |
| Unisex Scuba Kumaş İçi Peluşlu Pantolon / `prod-1793184327059` | 0; truncation işareti var | 120 kopyanın tümünde max 0; ilgili ZIP aynı | Yok | IMG_2190–2201 modellerindeki siyah pantolonlar yalnız görsel aday; kumaş ve unisex ürünü doğrulanamıyor. |
| Kot ceket / `prod-1793183353452` | 0; truncation işareti var | 120 kopyanın tümünde max 0; ilgili ZIP aynı | Yok | Contact sheet’te açık biçimde denim olduğu doğrulanabilen bir aday yok. Manuel kaynak gerekli. |
| Scuba Pantolon / `prod-1793180587059` | 0; truncation işareti var | 120 kopyanın tümünde max 0; ilgili ZIP aynı | Yok | IMG_2190–2201 model fotoğraflarındaki siyah pantolonlar ve Şalvar ürününün inline görseli aday; iki ürünün galerileri ayırt edilemiyor. |

Tablodaki adaylar hiçbir yere atanmadı. Exact URL/hash kanıtı olmayan dosyalar ürün galerisine bağlanmamalıdır. 146 dosyanın tamamı envanterde bulunur.

Tam 146 dosyanın adı, boyutu, uzantısı, imzadan MIME türü, görsel boyutları, erişim durumu, SHA256’ı, JSON’dan kanıtlı ürün referansı ve türev/kardeş yolları [görsel envanterinde](FAZ-7.1A-GORSEL-ENVANTERI.md) bulunur.

## 5. PostgreSQL kısmi importu

Önceki Faz 7 testinin eski importer’ı transaction kullanmadan local `humra_moda_local` veritabanına kısmi kayıt yazdı. Bu DB, JSON kaynağı kabul edilmedi ve bu rapor için okunmadı. Durumun ayrı yedeği [local PG dump dosyasıdır](../data/backups/phase7.1-local-postgres-after-safety-test-20261101-225854.dump). Faz 7.1A sırasında PostgreSQL’e yazma/okuma yapılmadı.

## 6. Karar bekleyen maddeler

1. Siyah `38-40-42` çifti için iki SKU’dan hangisinin satış kaydı olduğu ve diğerinin gerçekten ayrı ürün stoğu sayılıp sayılmadığı.
2. Siyah `44-46-48` çifti için aynı karar.
3. Aynı renk/beden altında birden fazla SKU iş kuralı olarak kabul edilecek mi? Kabul edilmiyorsa doğru SKU/stok hangi bağımsız kayıttan alınacak?
4. Galerisi boş beş ürün için özgün dosya/renk sırası nereden geri kazanılacak? Sekiz ürünün tam galeri kaynakları kullanıcı cihazındaki IndexedDB yedeğinde olabilir mi?
5. 58 bildirimin Order bağlantısı yok. Korunmaları için optional order relation + legacy orphan kaydı mı, yoksa bağımsız bildirim arşivi modeli mi isteniyor?
6. 46 audit actor kaydı mevcut admin hesabıyla eşleşmiyor. Snapshot aktör bilgisi olarak korunması kabul edilmeli; gerçek kullanıcıya tahmini bağlanmamalı.

Bu rapor hiçbir kaydı düzeltmez ve aktarım onayı değildir.
