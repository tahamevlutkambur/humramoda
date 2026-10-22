# Hümra Moda — PayTR iFrame ve Callback Güvenlik Entegrasyonu

## 1. Temel Güvenlik Prensipleri
1. **Asla Tarayıcıya Güvenme:** Müşterinin ödeme ekranından geri döndüğü tarayıcı URL'si (`/siparis/sonuc?status=success`) asla ödemenin kanıtı sayılamaz. Sipariş durumu sadece ve sadece PayTR sunucusundan gelen imzalı arka plan bildirimi (server-to-server callback) ile güncellenir.
2. **Sunucu Taraflı Tutar Hesaplama:** Ödenecek tutar istemciden değil; sepet içeriğinin veritabanındaki güncel fiyatları, kargo ücreti ve aktif kuponlar sunucu tarafında toplanarak hesaplanır.
3. **Kuruş Bazlı Hassasiyet:** PayTR API'si TL değil, 100 ile çarpılmış kuruş tam sayısı (`Integer`) bekler. Örneğin `1.574,10 ₺` için PayTR'a gönderilen tutar tam olarak `157410` olmalıdır.
4. **İdempotent Webhook Yönetimi:** PayTR sunucuları ağ gecikmesi veya yanıt alamama durumunda aynı bildirimi birden fazla kez tekrarlayabilir. İlk bildirimde sipariş `PAID` durumuna getirilir, stok düşülür; tekrarlayan bildirimlerde tekrar stok düşülmeden anında `OK` cevabı dönülür.
5. **Saf Metin `OK` Yanıtı:** PayTR callback uç noktası, işlem başarılı olduğunda HTTP 200 durum koduyla **sadece ve sadece düz metin "OK"** yanıtı vermelidir. HTML etiketi, JSON çıktısı veya boşluk karakteri bulunmamalıdır.

---

## 2. İki Adımlı Entegrasyon Mimarisi

```
[ Müşteri Tarayıcısı ]            [ Hümra Moda Sunucusu (Next.js) ]           [ PayTR Sunucuları ]
         │                                       │                                     │
         │ 1. "Siparişi Tamamla"                │                                     │
         ├──────────────────────────────────────>│                                     │
         │                                       │ 2. Sepeti Doğrula & Kuruş Hesapla   │
         │                                       │ 3. merchant_oid Üret                │
         │                                       │ 4. HMAC-SHA256 Token İmzala         │
         │                                       │ 5. POST https://paytr.../get-token  │
         │                                       ├────────────────────────────────────>│
         │                                       │<────────────────────────────────────┤
         │                                       │    iframe_token Dönüşü              │
         │ 6. iframe_token İstemciye İletilir    │                                     │
         │<──────────────────────────────────────┤                                     │
         │                                                                             │
         │ 7. PayTR Güvenli iFrame Formunu Göster (3D Secure Kart Girişi)             │
         ├────────────────────────────────────────────────────────────────────────────>│
         │                                                                             │
         │                                       │ 8. Arka Plan Bildirimi (POST Callback)
         │                                       │<────────────────────────────────────┤
         │                                       │ 9. Callback Hash Doğrula            │
         │                                       │ 10. Tutar & merchant_oid Kontrol    │
         │                                       │ 11. DB Transaction (Stok Düş & PAID)│
         │                                       │ 12. Düz Metin "OK" Yanıtı Ver       │
         │                                       ├────────────────────────────────────>│
         │                                       │                                     │
         │ 13. Tarayıcı Başarı Sayfasına Döner   │                                     │
         ├──────────────────────────────────────>│                                     │
         │ 14. DB'den Güncel Sipariş Durumu Oku  │                                     │
         │<──────────────────────────────────────┤                                     │
```

---

## 3. Adım 1: Sunucu Taraflı Token Üretimi (`/api/payments/paytr/token`)

### 3.1. Parametre Listesi ve Hash Dizilimi
Token oluşturulurken string concatenation sırası PayTR standartlarına harfiyen uymalıdır:
```typescript
const hashStr = [
  merchant_id,
  user_ip,
  merchant_oid,
  email,
  payment_amount, // Kuruş cinsinden tam sayı (örn: 157410)
  user_basket,    // Base64 kodlanmış sepet dizisi
  no_installment, // "0" (taksit var) veya "1" (tek çekim)
  max_installment,// "12"
  currency,       // "TL"
  test_mode       // "0" (Canlı) veya "1" (Test)
].join('');

// merchant_salt sona eklenir, merchant_key ile HMAC-SHA256 hesaplanır:
const paytr_token = crypto
  .createHmac('sha256', process.env.PAYTR_MERCHANT_KEY!)
  .update(hashStr + process.env.PAYTR_MERCHANT_SALT!)
  .digest('base64');
```

### 3.2. Sepet Formatı (`user_basket`)
Sepetteki her ürün `[ürün_adı, birim_fiyat, adet]` formatında bir dizi olmalı ve JSON string'i base64 formatına çevrilmelidir:
```typescript
const basket = order.items.map(item => [
  item.productName + ' - ' + item.colorName + ' (' + item.sizeName + ')',
  (Number(item.price)).toFixed(2), // TL cinsinden string, örn: "1574.10"
  item.quantity
]);
const user_basket = Buffer.from(JSON.stringify(basket)).toString('base64');
```

---

## 4. Adım 2: Callback Doğrulama ve Webhook Yönetimi (`/api/payments/paytr/callback`)

### 4.1. İmza Doğrulama Algoritması
PayTR'dan gelen POST isteğinde yer alan `hash` değeri sunucuda şu formülle tekrar hesaplanır:
```typescript
// PayTR POST gövdesi: { merchant_oid, status, total_amount, hash, failed_reason_code, failed_reason_msg }
const calculatedHash = crypto
  .createHmac('sha256', process.env.PAYTR_MERCHANT_KEY!)
  .update(
    merchant_oid +
    process.env.PAYTR_MERCHANT_SALT! +
    status +
    total_amount // PayTR'ın gönderdiği kuruş cinsinden değer
  )
  .digest('base64');

if (calculatedHash !== receivedHash) {
  // İmza uyuşmazlığı - Kesinlikle güvenlik ihlali veya hatalı istek
  return new Response('PAYTR notification failed: bad hash', { status: 400 });
}
```

### 4.2. İdempotent İşlem ve Stok Düşüm Mantığı
```typescript
// Prisma Transaction içinde atomik işlem:
await prisma.$transaction(async (tx) => {
  const order = await tx.order.findUnique({
    where: { orderNumber: merchant_oid },
    include: { items: true, payments: true }
  });

  if (!order) {
    throw new Error('Sipariş bulunamadı');
  }

  // 1. İdempotency kontrolü: Zaten ödendiyse tekrar stok düşme
  if (order.status === OrderStatus.PAID) {
    return; // Zaten işlenmiş, aşağıda "OK" döneceğiz
  }

  // 2. Tutar doğrulaması: Callback ile gelen kuruş ile sipariş kuruşu eşit mi?
  if (order.totalKurus !== Number(total_amount)) {
    throw new Error('Tutar uyuşmazlığı tespit edildi');
  }

  // 3. Durum değerlendirmesi
  if (status === 'success') {
    // Siparişi PAID yap
    await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PAID }
    });

    // Varyant stoklarını atomik olarak düş
    for (const item of order.items) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: {
          stockQuantity: { decrement: item.quantity }
        }
      });
    }

    // Ödeme işlemini SUCCESS olarak logla
    await tx.paymentTransaction.updateMany({
      where: { merchantOid: merchant_oid },
      data: {
        status: PaymentStatus.SUCCESS,
        paidAt: new Date(),
        callbackPayload: body
      }
    });
  } else {
    // Ödeme başarısız
    await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELLED }
    });

    await tx.paymentTransaction.updateMany({
      where: { merchantOid: merchant_oid },
      data: {
        status: PaymentStatus.FAILED,
        failedReason: failed_reason_msg,
        callbackPayload: body
      }
    });
  }
});

// PayTR'a işlemin eksiksiz kaydedildiğini bildiren saf metin yanıt:
return new Response('OK', {
  status: 200,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' }
});
```
