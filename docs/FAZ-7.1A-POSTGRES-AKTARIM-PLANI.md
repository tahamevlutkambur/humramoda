# HÜMRA MODA — Faz 7.1A PostgreSQL Aktarım Planı

**Durum:** Plan ve kaynak denetimi hazır. **Bu aşamada PostgreSQL’e aktarım yapılmadı.** Eski importer transaction ve tam koleksiyon kapsamı şartlarını sağlamadığından kod yolu DB yazımına kapalı tutuluyor.

## 1. Hedef ve kaynak güvenliği

### Şu an doğrulanan kaynak

- Tek kaynak dosya: `data/store.json`.
- SHA256: `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`.
- ZIP `store.json` SHA256’i aynı; ZIP bütünlüğü: `5141A348DF1F317B5653A3C0D49173EEC46E6614175E5A325A30780588789622`.
- ZIP’teki 146 upload dosyası `public/uploads` ile tüm içerik hash’lerinde eşleşti.
- Local PostgreSQL’deki eski testin kısmi kayıtları kaynak veya kabul edilen hedef sayım değildir. Faz 7.1A’da DB’ye bağlanılmadı.

### Migration öncesi koruma

1. Kaynak JSON ve ZIP hash’lerini yeniden doğrula; hash farkında dur.
2. `data/store.json`, ZIP ve `public/uploads` için ayrı checksum manifesti al. Kaynak dosyaları salt okunur tut.
3. Önceki kısmi import DB’sine dokunma. Import için ayrı, loopback adresine bağlı yeni bir local DB (ör. `humra_moda_reconciled`) oluştur; mevcut `humra_moda_local` üzerinde reset/drop/truncate kullanma.
4. Hedef bağlantıda `host=127.0.0.1`, database adı açık allowlist ve local cluster kimliği kontrol edilmeden Prisma client yazma işlemi başlatmamalı.
5. `DATABASE_URL` ve `DIRECT_URL` production host’u gösteriyorsa script başlamadan fail-closed olmalı. Rapor/console secret veya müşteri PII’si içermemeli.

## 2. Aktarımı bloklayan veri uzlaştırma kapıları

Aktarım öncesi bu maddeler çözülmeden importer yazımı açılmamalı:

1. **İki varyant çifti:** `betul-trenckot` siyah `38-40-42` ve siyah `44-46-48` çiftlerinde ayrı SKU/ID/stokları var. JSON, ZIP, 120 backup kopyası ve fallback katalog doğru SKU’yu belirlemiyor. Manuel katalog/stok kararı ve kaynak kanıtı gerekli. Otomatik silme, SKU birleştirme, stok toplama veya model constraint’ini gevşetme yapılmamalı.
2. **Galeriler:** Sekiz `_mediaTruncated` kayıttan ikisinde sadece inline data URI kapak, altısında hiç medya satırı yok. 120 backup kopyası bunlardan daha dolu değil. Admin cihazındaki IndexedDB veya başka güvenilir orijinal kaynak bulunmadan eksik görsel ilişkileri üretilemez. Public dosya isimleri ürün eşleştirmesi için yeterli kanıt değildir.
3. **Orijinal HEIC:** Ürün manifesti 22 kaynak HEIC adı kaydediyor; `humraresimler` dizini ve orijinal HEIC dosyaları yerelde/ZIP’te yok. Türevler mevcut. Orijinal kaynaklar bulunmadan “orijinal bütünlüğü doğrulandı” denmemeli.
4. **58 notification orphan:** JSON’da sipariş yok; bildirimlerin tamamı bir Order ID’ye bağlı olsa da hedef Order yok. FK’yi uydurma siparişe bağlamak yasak. Optional relation/legacy arşiv modeli için ürün kararı gerekli.
5. **Audit actor kaydı:** `AdminAuditLog` modeli yok; 47 satırın yalnız biri mevcut adminlerle ID/e-posta üzerinden eşleşiyor, 46’sı eşleşmiyor. Kaynak aktör snapshot’ı saklanmalı, admin hesabı tahmin edilmemeli.
6. **Rol ve alan kapsamı:** Bir `CARRIER` admin rolü enum’da yok. Campaign `description`, return `requestType/exchangeDetails`, `featuredVideos` ve audit log için doğrudan model alanları yok.

## 3. Kaynak → Prisma mapping taslağı

| Kaynak | Sayı | Hedef model(ler) | Dönüşüm ve kayıp önleme |
|---|---:|---|---|
| Kategoriler | 7 | `Category` | ID ve slug aynen; ürün `categorySlug` slug→ID map; bilinmeyen kategori rollback sebebi. |
| Koleksiyonlar | 3 | `Collection`, `ProductCollection` | ID/slug aynen; her ürün `collectionSlugs` için composite join satırı; bilinmeyen slug rollback. |
| Ürünler | 13 | `Product` | ID/slug aynen; fiyat Decimal; category ilişkisi; `categoryName` snapshot/denetim için karşılaştırılır. `createdAt` korunur; kaynakta `updatedAt` yok. `_mediaTruncated` Product alanı değildir ve import gate metadata’sıdır. |
| Renkler | 36 | `ProductColor` | JSON ID korunur; `productId` parent map; renk `slug` product scope’unda unique; renk adı/kodu/display order aynen. |
| Bedenler | 37 | `ProductSize` | JSON ID korunur; `productId` parent map; slug product scope’unda unique. |
| Varyantlar | 118 | `ProductVariant` | ID/SKU aynen; product/color/size FK map; stock integer ≥0; `sku` ve `(productId,colorId,sizeId)` unique preflight. Şu an iki combo gate’i başarısız. |
| Ürün medyası | 24 kayıt; 8 ürün kısmi | `ProductMedia` | id/product/color/type/url/thumbnail/poster/alt/order alanları. Inline `data:` URL mevcut şekliyle byte-for-byte korunmalı veya ayrı, checksum doğrulamalı dosya planı gerekir; dönüşüm URL’si source update olmadan yazılamaz. Eksik listeler gate’i başarısız. |
| Admin kullanıcıları | 4 | `User` | ID/e-posta/hash/isim/aktiflik/tarih korunur. `CARRIER` enum kapsamı additive migration ile çözülmeden `STAFF`’e kayıplı map yapılmamalı. Hash düz metin loglanmamalı. |
| Kampanya | 1 | `DiscountCampaign` | ID/code/tarih/aktiflik/indirim değerleri; `name→title`. `description` alanı için additive alan veya kayıpsız JSON arşiv kararı gerekir. |
| Sipariş | 0 | `Order`, `OrderItem` | Kaynakta kayıt yok. İleride order number, durum enum’ları, `totalKurus`, customer snapshot, address JSON, variant FK ve item fiyat snapshot’ları doğrulanmalı. |
| Ödeme | 0 ayrı koleksiyon | `PaymentTransaction` | JSON alanı yok; sipariş/başka kaynakta bulunmayan işlem icat edilmemeli. merchant OID unique. |
| Kargo | 0 | `Shipment`, `ShippingEvent` | Order relation zorunlu; mevcut kayıt yok. İleride events dizisi bağımsız satırlara map edilir. |
| İade | 0 | `ReturnRequest`, `ReturnItem` | Mevcut kayıt yok. `requestType/exchangeDetails` alanları için schema kararı gerekli. |
| Bildirim | 58 | `CustomerNotification` veya arşiv modeli | idempotency key unique; 58 Order FK orphan nedeniyle standart `CustomerNotification` insert edilemez. Yetkili karar olmadan sahte order oluşturma. |
| Audit | 47 | Yeni `AdminAuditLog` | Model yok. `adminId`, admin email snapshot, action, target type/id, result, IP, correlation ID, details ve timestamp kayıpsız taşınmalı; 46 aktör için User FK zorunlu olmamalı. IP/details log’a dökülmemeli. |
| Site aktivite | 0/alan yok | Hedef yok | JSON kaynağında anahtar yok; 0 kaydı raporla. |
| Homepage | 1 nesne | `HomepageBlock`/`BlockItem` veya `StoreSetting` JSON | Hero, announcement, spotlight, brand values yapısını alan-alan dönüştür ve round-trip parity doğrula. JSON snapshot alternatifi şemayı kayıpsız korur fakat sorgulanabilir yapı değildir. |
| Öne çıkan videolar | 2 | Yeni `FeaturedVideo` veya serialized StoreSetting | Ürün slug/renk slug/video/poster/price bağını kaybetmeden sakla. Mevcut HomepageBlock/BlockItem aynı ilişkiyi karşılamıyor. |
| Ayarlar | 20 key | `StoreSetting` | Her key için sabit key ve canonical JSON value. `paytr` sırları ayrı erişim/şifreleme kararı ister; secret değerleri çıktı/loga yazılmaz. |
| Root `updatedAt` | 1 | Import batch metadata | Millis timestamp’i batch/source metadata olarak sakla; kayıt `updatedAt` alanlarına uydurma olarak yayma. |
| Backup listesi | 0/alan yok | Dosya sistemi backup | JSON koleksiyonu yok; mevcut backup dosyaları ayrı checksum’la korunur. |

### Şemada ayrıca değerlendirilmesi gerekenler

- `Inventory` modeli yok; stok şu anda `ProductVariant.stockQuantity` alanında. Aynı miktarı ikinci bir modelde kopyalayıp iki otorite yaratma. Stok hareket geçmişi gerekirse ayrı `InventoryMovement` tasarlanmalı.
- Kayıtlı kullanıcı (`User`) ile misafir sipariş müşterisi farklı kavramlardır. Kaynakta müşteri koleksiyonu/siparişi olmadığından boş customer kayıtları üretme. Gelecekte customer CRM gerekiyorsa ayrı model kararı ver.
- `DiscountCampaign.description`, `ReturnRequest.requestType/exchangeDetails`, `CARRIER` enum üyesi ve `FeaturedVideo`/`AdminAuditLog` modelleri aktarım mapping’i tamamlanmadan additive migration olarak değerlendirilmelidir.
- 58 bildirimi korumak için nullable `orderId` tek başına yeterli olmayabilir; kaynakta orijinal orderNumber/orderId snapshot’ı saklanmalı ve orphan durum açıkça modellenmelidir.

## 4. Importer uygulama şartları

### A. Salt okunur preflight

- `data/store.json` JSON şemasını ve SHA256’ını doğrula; her koleksiyonun kaynak sayısını çıkar.
- Tüm ID, natural key, composite unique, enum, tutar, tarih, stok ve FK adaylarını bellekte doğrula.
- Medya URL’lerini fiziksel dosya/inline hash ile doğrula. `_mediaTruncated` kayıt varsa galerilerin tamamı geri gelene kadar fail.
- Bildirimlerin Order FK’lerini, audit actor eşleşmelerini ve enum kayıplarını sayısal, PII’siz raporla.
- Hedef DB host/port/name ve beklenen boş staging DB fingerprint’ini doğrula. Mevcut kısmi `humra_moda_local` için sessiz upsert/merge yapma.
- Preflight’ta tek bir hata varsa transaction açmadan dur.

### B. Tek transaction ve idempotence

1. Yeni local hedefte source SHA256 + schema version kaydeden migration batch/audit satırı oluştur.
2. `SERIALIZABLE` transaction ve advisory lock kullan; iki import sürecini aynı anda engelle.
3. Bağımlılık sırasıyla category/collection/admin, product, color/size, variant, collection join, media, campaign/settings, order/item, payment, shipment/event, return/item, notification, audit ve featured video kayıtlarını yaz.
4. JSON ID’lerini değiştirme. Natural key eşleşmesi farklı ID’ye gidiyorsa upsert ile üzerine yazma; conflict report ve rollback üret.
5. Kaynakta olmayan hedef satırları silme. Hedefte çakışan/önceden var olan satırlar ayrı raporlanmadan devam etme.
6. `ProductVariant.stockQuantity >= 0`, SKU/slug/email/order number/merchant OID/idempotency key/composite ilişkiler DB constraint’leriyle korunmalı.
7. Transaction içi başarısızlık testinde tüm yazmalar rollback olmalı; ardından count/hash snapshot’ı değişmediği kanıtlanmalı.

### C. Commit sonrası doğrulama

- Her kaynak collection count’unu hedef model/alt model/ilişki count’larıyla karşılaştır. Bildirim arşivi/audit gibi özel modellerde kayıt sayısı birebir olmalı.
- Product, color, size, variant, media, join, order item, shipment event ve return item FK taraması: 0 orphan.
- ID, doğal anahtar, exact monetary value, timestamp, enum dönüşümü ve JSON payload parity denetimi.
- Ürün/media referanslarını filesystem’e göre doğrula; inline media byte hash parity. 146 upload envanter hash’leri değişmemiş olmalı.
- Source JSON hash’i işlem öncesi ve sonrası aynı olmalı.
- Aynı batch’i ikinci kez çalıştır: row count değişmemeli, yeni duplicate oluşmamalı.
- Uygulamayı yeniden başlatıp target’tan aynı kayıtları tekrar oku; istemci/Next cache’e bakarak DB parity varsayma.
- Tüm gate’ler geçmedikçe raporda `BAŞARILI` yazma ve JSON sistemi devreden çıkarılmamalı.

## 5. Şu anki araç ve izin durumu

`scripts/migrate-store-to-postgres.ts` önceki yazmasız ön denetimde iki variant combo ve eksik medya buluyor. Eski mapper’ın tek transaction ve tam kayıt kapsamı yok. Bu nedenle bu script DB yazımına fail-closed tutuluyor; Faz 7.1A’da hiçbir importer çalıştırılmadı.

Tam aktarım başlatmak için gereken manuel kanıtlar  [uzlaştırma raporunun karar listesinde](FAZ-7.1A-VERI-UZLASTIRMA-RAPORU.md#6-karar-bekleyen-maddeler) belirtilmiştir. Bu plan aktarım izni değildir.
