# Faz 7 — Kritik Sistem Denetimi

**Durum:** İlk kod ve mimari denetimi tamamlandı. Düzeltmelerin ve testlerin sonuçları Faz 7 tamamlanma raporuna eklenecek.

## Mimari ve ortam tespiti

- `package.json` istek aralıkları: Next.js `^16.4.2`, React `^19.3.0`, Prisma Client/CLI `^6.19.3`, TypeScript `^5.7.3`, Vitest `^3.2.7`, Sharp `^0.35.5`. `npm ls` kurulu sürümleri: Next.js `16.4.2`, React `19.3.1`, Prisma `6.19.3`, TypeScript `5.9.3`, Vitest `3.2.7`, Sharp `0.35.5`. Projede lock dosyası bulunamadı.
- Sipariş, katalog, stok, admin ve kargo uygulama işlemleri Prisma modellerini doğrudan kullanmıyor; `src/lib/server/store.ts` JSON/bellek tabanlı store, `persistent-store.ts` ise yalnızca remote URL algıladığında Prisma ile JSON snapshot kullanıyor.
- `DATABASE_URL` local loopback ise snapshot katmanı bunu bilinçli olarak devre dışı bırakıyor. Bu nedenle şemadaki PostgreSQL `Order` tabloları mevcut checkout’un gerçek sipariş kaynağı değil.
- `public/uploads` yerel dosya depolaması ve `data/store.json` store dosyası var. `.env` değerleri rapora/loglara kopyalanmamıştır; bağlantı ortamı doğrulaması tamamlanmadan migration veya veritabanı mutasyonu yapılmayacak.

## Bulgular

### 1. Sipariş kalıcılığı ve “sipariş bilgisi bulunamadı”

- **Dosya:** `src/app/api/payments/cash-on-delivery/create/route.ts`, `src/app/api/payments/paytr/create/route.ts`, `src/lib/server/store.ts`, `src/lib/server/persistent-store.ts`
- **Teknik neden:** Siparişler Prisma `Order` tablosuna yazılmıyor. COD route’u başta ve sonda `getPersistentStoreData`/`savePersistentStoreData` hatalarını boş `catch` ile yok sayıyor; local PostgreSQL URL’sinde snapshot DB zaten kullanılmıyor. JSON dosyası/bellek dışı kalıcılık başarısız olduğunda route yine başarı döndürebilir.
- **Kullanıcı etkisi:** Başarı sayfası veya sonraki takip isteği başka process/cihazda aynı siparişi bulamayabilir.
- **Düzeltme:** Siparişin başarı yanıtı kalıcı yazma başarılı olmadan dönmemeli; sipariş oluşturma, benzersiz referans ve stok güncelleme aynı atomik kalıcılık sınırında olmalı. Var olan JSON store’u sürprizli biçimde dönüştürmek yerine mevcut veri/migration yapısı ve local DB güvenliği gözetilmeli.
- **Test:** Local izole DB ile COD siparişini oluştur, kalıcılığı başka istek/process üzerinden oku; yazma hatası simülasyonunda başarı yanıtı olmadığını doğrula.

### 2. Order number / PayTR kimliği ve benzersizlik

- **Dosya:** `src/lib/server/store.ts` (`createPendingOrder`), `src/lib/server/paytr.ts`, `prisma/schema.prisma`
- **Teknik neden:** DB `id`, müşteri `orderNumber` ve `PaymentTransaction.merchantOid` ayrı kavramlar. Ancak store order number yalnızca tarih + 4 haneli rastgele sonek, ID ise milisaniye; DB unique constraint yok ve eşzamanlı/tekrarlı çakışma kontrolü yok. İlk varyantı sessizce seçme fallback’i de geçersiz varyantı maskeleyebilir.
- **Kullanıcı etkisi:** Nadir çakışmada takip yanlış/boş siparişe gidebilir; yanlış varyantın fiyat/stoku kullanılabilir.
- **Düzeltme:** Tek sipariş numarası standardı, çakışma kontrolü/DB unique kısıtı, geçersiz varyantın reddi.
- **Test:** Referans eşlemesi, çakışma/tekrar ve geçersiz varyant testleri.

### 3. COD ve PayTR ayrımı / stok düşümü

- **Dosya:** `src/lib/server/store.ts` (`createCashOnDeliveryOrder`, `createPendingOrder`), ödeme route’ları ve callback
- **Teknik neden:** COD, in-memory nesnede `CASH_ON_DELIVERY` ve `PENDING` olarak ayrılıyor, fakat sipariş ilk önce genel `PAYTR`/pending sipariş oluşturucusunda kaydediliyor. Stok kontrolü ile düşümü transaction/atomic DB update değil; COD düşümü `Math.max(0, ...)` ile yarış durumunu gizliyor. Birkaç ürün aynı varyantı içeriyorsa kontrol her satırda eski stoğa göre yapılabiliyor.
- **Kullanıcı etkisi:** Aynı son stok iki siparişe satılabilir veya stok kontrolü başarılı görünürken veri tutarsız kalabilir.
- **Düzeltme:** Sipariş + kalem + stok işlemini transaction’da yürüt; her varyant talebini birleştirip etkinlik, renk/beden ilişkisi ve yeterli stoğu sunucuda doğrula. COD callback beklemez; ödeme `PENDING`, operasyon yeni sipariş akışında kalır.
- **Test:** Stok sınırı, aynı varyanta bölünmüş satırlar ve eşzamanlı son stok testi.

### 4. Sipariş takip doğrulaması

- **Dosya:** `src/app/api/tracking/lookup/route.ts`, `src/lib/server/shipping.ts`, `src/app/api/payments/order-status/route.ts`
- **Teknik neden:** Takip route’u e-posta/telefon verilmezse masked view döndürüyor. Telefon doğrulamasında son dört haneye eşleşme kabul ediliyor; tahmin edilebilir order ID ve tracking number da arama anahtarı. Ödeme status endpoint’i ise müşteri doğrulaması almadan toplam, şehir/ilçe ve kalem detayını döndürüyor.
- **Kullanıcı etkisi:** Referansı tahmin edilen başka siparişin verileri kısmen açığa çıkabilir.
- **Düzeltme:** Takipte sipariş numarasıyla birlikte tam normalize telefon veya e-posta doğrulaması zorunlu; public payment status yanıtı kişisel/ürün detayını açığa çıkarmamalı. Admin ve imzalı sipariş erişimleri ayrıca korunmalı.
- **Test:** Doğru/yanlış iletişim bilgisi, ID/tracking numarası ile atlatma ve misafir takip testleri.

### 5. Başarı sayfası ve Meta Purchase

- **Dosya:** `src/app/odeme/basarili/page.tsx`, `src/components/analytics/MetaPixel.tsx`, `src/lib/meta-pixel.ts`
- **Teknik neden:** Başarı sayfası COD veya `PAID` halinde Purchase gönderiyor; COD ürün teslim edilmeden gerçekleşmiş sipariş sayılır. `useRef` yalnızca bileşen ömrü boyunca korur; yenileme/yeni sekmede tekrar gönderilebilir. Pixel ID sabit, test kodu `TEST47650` için repo eşleşmesi yok. PageView hem inline bootstrap hem effect ile ilk açılışta iki kez tetiklenebilir. ViewContent/AddToCart/InitiateCheckout olayları uygulama çapında doğrulanmalı.
- **Kullanıcı etkisi:** Meta dönüşüm verisi hatalı/çift olabilir; sayfa görüntüleme sayısı şişebilir.
- **Düzeltme:** Test kodunu sipariş referansından ayrı tut, yalnızca test ortamında isteğe bağlı config olarak kullan; Purchase idempotency ve ödeme iş kuralı tanımla. COD için “sipariş oluşturuldu” ile “ödendi” ayrımını açıkça ele al. Olayları kullanıcı aksiyonlarına bağla.
- **Test:** Event spy ile sayfa yenileme, COD, PayTR başarısı/başarısızlığı ve tekrar callback senaryoları.

### 6. Medya yerel dosya erişimi ve kayıp görsel riski

- **Dosya:** `src/lib/server/media.ts`, `src/app/api/admin/media/upload/route.ts`, `src/app/api/media/[...slug]/route.ts`, `next.config.ts`
- **Teknik neden:** Medya route’u bellekte, `/tmp` ve `public/uploads` içinde sırayla arıyor; bellekteki veri cihazlar/process’ler arası paylaşılamaz ve `/tmp` geçicidir. Upload işlemi disk yazma hatalarını yutabiliyor; fallback data URL döndürebiliyor. Sharp dönüşümü başarısız olunca HEIC/AVIF gibi kaynak MIME, WebP uzantısıyla kaydedilebilir; MIME/uzantı tutarsızlığı ve görüntülenemeyen kaynak olasılığı var. İsimde yalnız timestamp çakışmayı kesin önlemiyor. Kaydedilen görselin farklı cihazdan erişilebilirliği garanti edilmiyor.
- **Kullanıcı etkisi:** Admin’de başarılı görünen görsel başka cihazda veya yeniden başlatma sonrası kaybolabilir/404 olabilir.
- **Düzeltme:** Local geliştirme için başarısız disk yazımı başarı sayılmamalı, içerik/uzantı tutarlı olmalı, benzersiz dosya adı ve gerçek dosya doğrulaması kullanılmalı; URL standardı relative `/uploads/...` kalmalı. Mevcut dosyalar korunarak salt-okunur denetim aracı eksik/bozuk/tekrar referansları raporlamalı.
- **Test:** Upload ve dönüşüm, erişim URL’si, missing file fallback, audit script ve farklı tarayıcı/LAN erişim testi.

### 7. Varyant ve stok admin doğrulaması

- **Dosya:** `src/lib/server/store.ts`, `src/app/api/admin/products/**`, `src/components/product/ProductBuyBox.tsx`, `src/context/CartContext.tsx`
- **Teknik neden:** Checkout eşleşen varyant bulunamayınca `product.variants[0]` seçebiliyor. İstemci state/snapshot ve admin güncelleme sonrası revalidation akışı ayrıca incelenmeli; stok otoritesi memory snapshot olduğundan cihaz/process farkı oluşabilir.
- **Kullanıcı etkisi:** Seçilmeyen beden/renk satılabilir veya cihaz eski stok gösterebilir.
- **Düzeltme:** Açık varyant kimliği zorunlu, kombinasyon sunucu tarafında doğrulanmalı; ürün/renk/beden aktifliği ve stok admin/müşteri tarafında aynı kaynaktan okunmalı; değişiklik sonrası cache invalidation.
- **Test:** Renk ve beden değişimi, pasif varyant, farklı cihaz ve admin update sonrası müşteri görünümü.

### 8. Local/production DB ayrımı ve migration güvenliği

- **Dosya:** `.env` (değerler rapora yazılmadı), `.env.example`, `src/lib/server/persistent-store.ts`, `prisma/schema.prisma`
- **Teknik neden:** Uygulama remote DB URL algısını production bağlantısı gibi ele alıyor; loopback dışında her Postgres URL’si shared snapshot hedefi olabilir. Bu, local testlerin yanlışlıkla remote DB’ye yönelmesi riskini oluşturur. Prisma migration öncesi bağlantı host/db güvenli sınıflandırması yapılmalı.
- **Kullanıcı etkisi:** Local test veya migration yanlış veritabanına erişebilir.
- **Düzeltme:** Açık local ortam doğrulaması ve test DB allowlist/guard; test komutları öncesi host/database kontrolü. Bu denetim sırasında migration veya canlı bağlantıda yazma yapılmayacak.
- **Test:** Local DB guard negatif/pozitif testleri; `prisma validate` yalnız doğrulanmış local env ile.

## İlk denetim kapsamı dışı kalan doğrulamalar

Görüntülerin disk ve DB referans sayımı, admin ürün endpoint’lerinin tam transaction/cache davranışı, tüm analytics event’leri, PayTR gerçek test sandbox callback’i ve mobil/farklı tarayıcı fiziksel cihaz kontrolü bu rapor oluşturulurken henüz çalıştırılmadı; sonuçları tamamlanma raporunda dürüstçe belirtilecek.

## Düzeltme ve doğrulama durumu

Checkout strict variant matching, tracking access control, PayTR mode fallback, local upload behavior, media URL audit and fallback image changes are detailed in `docs/FAZ-7-TAMAMLANMA-RAPORU.md`. Automated checks and execution limits are recorded there. Prisma order persistence/transaction migration was not attempted because the running checkout is JSON-backed and the local PostgreSQL service is unavailable; it remains an explicit blocker to calling Faz 7 complete.
