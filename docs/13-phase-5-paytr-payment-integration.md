# Hümra Moda — Faz 5: PayTR Ödeme Entegrasyonu, Güvenli Sipariş Akışı ve Ödeme Doğrulama Raporu

**Tarih:** 21 Ekim 2026  
**Durum:** Tamamlandı (Test ve Doğrulama Ortamı)  
**Teknoloji:** Next.js App Router 16.4.2, TypeScript 5.8, Prisma 6.4.1, Node.js Crypto (HMAC-SHA256), Vanilla CSS  

---

## 1. PayTR Entegrasyon Yöntemi ve Resmî Dokümantasyon Referansı

Hümra Moda e-ticaret platformunda, kart güvenliğini (PCI-DSS uyumluluğu) ve 3D Secure akışını en üst düzeyde sağlayan **PayTR iFrame API** yöntemi tercih edilmiştir.

* **Resmî Dokümantasyon Kaynağı:** [https://dev.paytr.com/](https://dev.paytr.com/)
* **Kullanılan Protokoller:**
  * **1. Adım (Token Alma):** `POST https://www.paytr.com/odeme/api/get-token`
  * **2. Adım (Sunucu Bildirimi / Callback):** `POST /api/payments/paytr/callback`

---

## 2. İki Aşamalı Güvenli Ödeme Mimarisi

```
[ Müşteri Tarayıcısı ]              [ Hümra Moda Sunucusu (Next.js) ]           [ PayTR Sunucuları ]
         │                                         │                                     │
         │ 1. "Güvenli Ödemeye Geç"                │                                     │
         ├────────────────────────────────────────>│                                     │
         │                                         │ 2. Sepet & Stok Doğrula (Sunucu)    │
         │                                         │ 3. merchant_oid Üret (HM-YYYYMMDD)  │
         │                                         │ 4. HMAC-SHA256 Token İmzala         │
         │                                         │ 5. POST /odeme/api/get-token        │
         │                                         ├────────────────────────────────────>│
         │                                         │<────────────────────────────────────┤
         │                                         │    Token / iFrame URL Dönüşü        │
         │ 6. iFrame URL İstemciye İletilir        │                                     │
         │<────────────────────────────────────────┤                                     │
         │                                                                               │
         │ 7. PayTR 3D Secure Kart Girişi (iFrame)                                       │
         ├──────────────────────────────────────────────────────────────────────────────>│
         │                                                                               │
         │                                         │ 8. POST /api/payments/paytr/callback│
         │                                         │<────────────────────────────────────┤
         │                                         │ 9. Timing-Safe Hash Doğrula         │
         │                                         │ 10. Tutar & Sipariş No Eşleştir     │
         │                                         │ 11. İdempotency Denetimi            │
         │                                         │ 12. Stok Düşümü & PAID Güncellemesi │
         │                                         │ 13. Saf Metin "OK" Yanıtı Ver       │
         │                                         ├────────────────────────────────────>│
         │                                         │                                     │
         │ 14. Tarayıcı /odeme/basarili'ya Döner   │                                     │
         ├────────────────────────────────────────>│                                     │
         │ 15. Sunucudan Kesinleşmiş Durumu Oku    │                                     │
         │<────────────────────────────────────────┤                                     │
```

---

## 3. Ortam Değişkenleri ve Gizli Anahtar Güvenliği

Ödeme anahtarları ve sırları `.env` dosyasında sunucu tarafında saklanır; **kesinlikle `NEXT_PUBLIC_` öneki almaz** ve istemci JavaScript paketine sızdırılmaz:

```env
# PayTR Ödeme Entegrasyonu
PAYTR_MERCHANT_ID="123456"
PAYTR_MERCHANT_KEY="ornek_paytr_magaza_parolasi"
PAYTR_MERCHANT_SALT="ornek_paytr_gizli_anahtar"
PAYTR_TEST_MODE="1"     # Test ortamı için "1", canlı üretim için "0"
PAYTR_DEBUG_ON="1"      # Geliştirme/test için "1", canlıda "0"
APP_BASE_URL="http://localhost:3000" # Webhook ve bildirimlerin temel adresi
```

* **Güvenli Varsayılan:** Gerçek PayTR anahtarları tanımlı değilse, sistem canlı ödeme almaya kalkışmaz; geliştirme modunda güvenli test simülasyonu sunar, üretim modunda ise eksik anahtarı güvenle reddeder.
* **Sıfır Log Sızıntısı:** `PAYTR_MERCHANT_KEY` ve `PAYTR_MERCHANT_SALT` değerleri ile müşteri kart bilgileri log dosyalarına asla yazılmaz.

---

## 4. İmza Hesaplama ve Doğrulama Protokolü

### 4.1. 1. Adım Token Hash Formülü
```typescript
const hashStr =
  merchant_id +
  user_ip +
  merchant_oid +
  email +
  payment_amount + // Kuruş tamsayısı (örn: 157410)
  user_basket +    // Base64 kodlanmış JSON sepet dizisi
  no_installment + // "0"
  max_installment +// "0"
  currency +       // "TL"
  test_mode +      // "1" veya "0"
  merchant_salt;

const paytr_token = crypto
  .createHmac("sha256", merchant_key)
  .update(hashStr, "utf-8")
  .digest("base64");
```

### 4.2. 2. Adım Callback Hash Doğrulama Formülü
```typescript
const hashStr = merchant_oid + merchant_salt + status + total_amount;

const calculatedHash = crypto
  .createHmac("sha256", merchant_key)
  .update(hashStr, "utf-8")
  .digest("base64");

// Timing attack koruması (Timing-Safe Comparison):
const isVerified = crypto.timingSafeEqual(
  Buffer.from(calculatedHash, "utf-8"),
  Buffer.from(receivedHash, "utf-8")
);
```

### 4.3. Callback Bildirim Yanıtı
PayTR protokolü gereğince, bildirim eksiksiz işlendiğinde veya mükerrer geldiğinde sunucumuz HTTP 200 durum koduyla **yalnızca düz metin `"OK"`** yanıtı verir (`Content-Type: text/plain; charset=utf-8`).

---

## 5. Finansal Ödeme Durumu ve Operasyonel Durum Ayrımı

Sistemde **finansal ödeme durumu** ile **mağaza operasyonel sipariş durumu** birbirinden kesin sınırlarla ayrılmıştır:

| Alan | Enum Değerleri | Açıklama | Değiştirme Yetkisi |
| :--- | :--- | :--- | :--- |
| `paymentStatus` | `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED` | Finansal tahsilatın banka/PayTR tarafındaki durumu. | **Yalnızca doğrulanmış PayTR sunucu bildirimi** değiştirebilir. |
| `operationalStatus` | `CONFIRMED`, `CANCELLED`, `PENDING` | Siparişin mağaza içindeki hazırlık, paketleme ve kargo durumu. | Mağaza yöneticisi veya otomatik kural değiştirebilir. |

> [!IMPORTANT]
> Yönetici panelinden bir siparişin "Onayla" yapılması, onun ödeme durumunu asla `PAID` yapmaz. Aynı şekilde müşterinin tarayıcıdan başarı sayfasına dönmesi de tek başına ödeme kanıtı sayılamaz.

---

## 6. Stok Rezervasyonu, Eşzamanlılık ve İdempotency

1. **Sunucu Taraflı Katalog Hesabı:** İstemciden gelen hiçbir fiyat, indirim veya tutara güvenilmez. Tüm tutarlar doğrudan sunucu kataloğundan hesaplanır.
2. **Stok Güvencesi:** Sipariş oluşturulurken renk-beden varyantının stok adedi denetlenir. Yetersiz stok varsa işlem anında engellenir.
3. **Kesinleşme ve Stok Hareketi:** Callback'ten `status: "success"` bildirimi geldiğinde sipariş `PAID` yapılır ve stok atomik olarak düşülür (`stockDeducted = true`).
4. **Mükerrer Bildirim Koruması (Idempotency):** PayTR sunucuları ağ gecikmesinde aynı callback bildirimini birden fazla kez tekrarlayabilir. İlk bildirimde stok düşülür ve `PAID` yapılır; tekrarlayan çağrılarda siparişin zaten `PAID` olduğu tespit edilip **stok tekrar düşülmeden anında `"OK"` yanıtı verilir.**
5. **Ödeme Reddi / Başarısızlık:** `status: "failed"` bildirimi geldiğinde sipariş `FAILED` ve `CANCELLED` yapılır; rezerve edilmiş stok varsa iade edilir.

---

## 7. Kullanıcı Arayüzü ve Sayfalar

| Sayfa / Bileşen | URL | Açıklama |
| :--- | :--- | :--- |
| **Ödeme Sayfası** | `/odeme` | Teslimat adresi formu, sepet özeti, kupon girişi ve PayTR iFrame entegrasyonu. |
| **Başarılı Ödeme** | `/odeme/basarili` | Sunucudan kesinleşmiş siparişi doğrular; müşteri sepetini temizler; sipariş detaylarını gösterir. |
| **Başarısız Ödeme** | `/odeme/basarisiz` | Banka reddi veya iptal durumunda kullanıcıyı bilgilendirir; güvenli tekrar deneme butonu sunar. |
| **Ödeme Simülatörü** | `/odeme/simulasyon` | Geliştirici ve test ortamı için 3D Secure onay ve ret simülasyon terminali. |
| **Yönetim Paneli** | `/admin/siparisler` | Ödeme durumuna göre filtreleme (`Ödendi`, `Bekliyor`, `Başarısız`), PayTR referansı ve tahsilat dökümü. |

---

## 8. Veritabanı ve Migration Durumu

* **Prisma Şeması:** `OrderPaymentStatus` ve `PaymentStatus` enum'ları ile `Order.paymentStatus`, `Order.paymentProvider`, `Order.paidAt`, `Order.paymentFailedReason` alanları şemaya eklendi ve doğrulandı (`npx prisma validate` başarılı).
* **Migration SQL:** `prisma/migrations/20261021180000_phase5_paytr_payment/migration.sql` dosyası hazırlandı.
* **Canlı PostgreSQL Durumu:** Yerel Windows ortamında 5432 portundaki PostgreSQL servisi çevrimdışı olduğu için migrasyon dosyası hazırlanmış fakat canlı veritabanına uygulanmamıştır. Veri katmanı `data/store.json` üzerinde tam atomik destekle çalışmaya devam etmektedir.

---

## 9. Testler ve Doğrulama Sonuçları

`tests/paytr.test.ts` kapsamında 11 yeni güvenlik ve entegrasyon testi yazılmış; projedeki tüm testlerle birlikte çalıştırılmıştır:

```
 RUN  v3.2.7 C:/Users/Taha/Documents/hümramoda

 ✓ tests/paytr.test.ts (11 tests)
 ✓ tests/migration-safety.test.ts (3 tests)
 ✓ tests/auth.test.ts (8 tests)
 ✓ tests/admin-store.test.ts (21 tests)
 ✓ tests/formatters.test.ts (4 tests)
 ✓ tests/api-security.test.ts (5 tests)
 ✓ tests/tokens-media.test.ts (6 tests)
 ✓ tests/catalog.test.ts (9 tests)
 ✓ tests/media-upload.test.ts (8 tests)

 Test Files  9 passed (9)
      Tests  75 passed (75)
```

| Denetim | Komut | Durum |
| :--- | :--- | :--- |
| **TypeScript Tip Denetimi** | `npm run typecheck` | **0 Hata** (Temiz) |
| **ESLint Kod Standartları** | `npm run lint` | **0 Hata, 0 Uyarı** (Temiz) |
| **Birim ve Entegrasyon Testleri**| `npm test` | **75 / 75 Test Başarılı** |
| **Next.js Üretim Derlemesi** | `npm run build` | **55 rotanın tümü başarıyla derlendi** |

---

## 10. Canlıya Geçiş (Production) Öncesi Güvenlik Kontrol Listesi

1. **PayTR Mağaza Bilgileri:** PayTR panelinden alınan gerçek `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY` ve `PAYTR_MERCHANT_SALT` değerleri `.env.production` içine girilmelidir.
2. **Mod Ayarları:** `PAYTR_TEST_MODE="0"` ve `PAYTR_DEBUG_ON="0"` olarak ayarlanmalıdır.
3. **Bildirim URL Kaydı:** PayTR mağaza paneline `https://humramoda.com/api/payments/paytr/callback` adresi bildirim URL'si olarak kaydedilmelidir.
4. **PostgreSQL Migrasyonu:** Canlı PostgreSQL ayağa kaldırıldığında `npx prisma migrate deploy` çalıştırılarak `20261021180000_phase5_paytr_payment` migrasyonu uygulanmalıdır.
5. **SSL ve Alan Adı:** Canlı domain üzerinde geçerli bir SSL sertifikası (HTTPS) zorunludur.
