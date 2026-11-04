# HÜMRA MODA — FAZ 8.4: DAO GEÇİŞ ANALİZİ VE MİMARİ YOL HARİTASI

**Tarih:** 2 Kasım 2026  
**Faz:** 8.4 Analiz Çıktısı (Faz 8.5 Ön-Hazırlığı)  
**Doküman:** `docs/FAZ_8_4_DAO_GECIS_ANALIZI.md`  
**Amaç:** Mevcut JSON tabanlı `src/lib/server/store.ts` veri erişim katmanının, PostgreSQL ve Prisma ORM altyapısına güvenli, kesintisiz ve sıfır veri kaybı garantisiyle taşınması için teknik analiz ve geçiş planı.

---

## 1. MEVCUT VERİ ERİŞİM KATMANI (`store.ts`) ANALİZİ

Mevcut mimaride tüm veri saklama, sorgulama ve atomik işlemler tek bir devasa dosyada toplanmıştır:
- **Dosya:** `src/lib/server/store.ts` (~3.200 satır)
- **Depolama Modeli:** `data/store.json` dosyasını diske senkron yazan ve `globalThis.__humraStoreState.inMemoryStore` üzerinde önbellekleyen monolitik yapı.
- **Eşzamanlılık Koruması:** `executeWithOrderLock` fonksiyonu ile sağlanan process-içi asenkron kuyruk kilidi (in-memory Promise mutex).

### 1.1. Mevcut Fonksiyonların Modüler Gruplandırılması ve Prisma Karşılıkları

| Fonksiyon Grubu | Mevcut Fonksiyonlar (`store.ts`) | Prisma / PostgreSQL Karşılığı | Zorluk Derecesi |
| :--- | :--- | :--- | :---: |
| **Katalog & Ürünler** | `getAllProducts`, `getProductBySlug`, `getProductById`, `getFeaturedProducts`, `getCategoryProducts` | `prisma.product.findMany({ include: { colors: true, sizes: true, variants: true, media: true } })` | Düşük |
| **Kategori & Koleksiyon** | `getAllCategories`, `getCategoryBySlug`, `getAllCollections`, `getCollectionBySlug` | `prisma.category.findMany()`, `prisma.collection.findMany()` | Çok Düşük |
| **Varyant & Stok** | `getVariantById`, `getVariantBySku`, `getVariantsByProductId` | `prisma.productVariant.findUnique()`, `prisma.productVariant.findMany()` | Düşük |
| **Sepet & Favoriler** | `getCart`, `addToCart`, `removeFromCart`, `updateCartItemQuantity`, `getFavorites`, `toggleFavorite` | `prisma.cart.upsert()`, `prisma.cartItem.create()`, `prisma.favorite.upsert()` | Orta |
| **Sipariş Oluşturma** | `createPendingOrder`, `createCashOnDeliveryOrder` | `prisma.$transaction()` + `SELECT ... FOR UPDATE` (Row Locking) | **Yüksek** |
| **Sipariş Yönetimi** | `getAllOrders`, `getOrderById`, `getOrderByOrderNumber`, `updateOrderOperationalStatus`, `updateOrderPaymentStatus` | `prisma.order.findUnique()`, `prisma.order.update()` | Orta |
| **Kargo & Takip** | `createShipmentForOrder`, `getShipmentByOrderId`, `updateShipmentStatus`, `processShippingWebhook` | `prisma.shipment.create()`, `prisma.shippingEvent.create()`, `prisma.webhookEvent.create()` | Orta |
| **İade & Değişim** | `createReturnRequest`, `getReturnRequestById`, `processReturnDecision`, `verifyActualRefund` | `prisma.returnRequest.create()`, `prisma.returnItem.createMany()`, `prisma.productVariant.update(stockQuantity += qty)` | **Yüksek** |
| **Müşteri & Auth** | `getCustomerByEmail`, `createCustomer`, `updateCustomerProfile`, `createPasswordResetToken`, `usePasswordResetToken` | `prisma.user.findUnique()`, `prisma.user.create()`, `prisma.passwordResetToken.create()` | Düşük |
| **Admin & Güvenlik** | `getAdminByEmail`, `updateAdminPassword`, `logAuditEvent`, `getAuditLogs` | `prisma.user.findFirst()`, `prisma.auditLog.create()`, `prisma.auditLog.findMany()` | Düşük |
| **Ayarlar & CMS** | `getStoreSettings`, `updateStoreSettings`, `getDiscountCampaigns`, `getFeaturedVideos` | `prisma.storeSetting.findMany()`, `prisma.discountCampaign.findMany()`, `prisma.featuredVideo.findMany()` | Düşük |

---

## 2. EŞZAMANLILIK (CONCURRENCY) VE KİLİTLEME DÖNÜŞÜMÜ

### 2.1. Mevcut Mimari: Tek Süreçlik Mutex (`executeWithOrderLock`)
Mevcut kodda `store.ts` içindeki `executeWithOrderLock` tek bir Node.js process'i içinde işe yaramaktadır. Ancak:
- Sunucu cluster modunda veya birden fazla serverless instance (örn. Vercel) üzerinde çalıştığında iki ayrı instance bu kuyruğu paylaşamaz.
- Bu durum birden fazla sunucu açıldığında potansiyel **Race Condition** ve **Çift Stok Düşümü** riski oluşturur.

### 2.2. Hedef Mimari: PostgreSQL Satır Bazlı Kilitleme (`SELECT ... FOR UPDATE`)
PostgreSQL'e geçişle birlikte stok düşümü ve sipariş onay işlemleri doğrudan veritabanı motorunun ACID garantilerine devredilecektir.

#### Güvenli Stok Düşüm Algoritması (Prisma `$transaction` + Raw Lock):
```typescript
export async function deductVariantStockAtomic(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantityToDeduct: number
): Promise<{ success: boolean; newStock: number; error?: string }> {
  // 1. İlgili varyant satırını kilitleyerek oku (Pessimistic Row Lock)
  const [variant] = await tx.$queryRaw<Array<{ id: string; stockQuantity: number; isActive: boolean }>>`
    SELECT id, "stockQuantity", "isActive"
    FROM "ProductVariant"
    WHERE id = ${variantId}
    FOR UPDATE;
  `;

  if (!variant) {
    return { success: false, newStock: 0, error: "Varyant bulunamadı." };
  }

  if (!variant.isActive) {
    return { success: false, newStock: variant.stockQuantity, error: "Varyant satışa kapalı." };
  }

  if (variant.stockQuantity < quantityToDeduct) {
    return {
      success: false,
      newStock: variant.stockQuantity,
      error: `Yetersiz stok. Mevcut: ${variant.stockQuantity}, İstenen: ${quantityToDeduct}`,
    };
  }

  // 2. Stok düşümünü gerçekleştir (Check constraint 'nonnegative' güvencesi devrede)
  const updated = await tx.productVariant.update({
    where: { id: variantId },
    data: {
      stockQuantity: {
        decrement: quantityToDeduct,
      },
    },
  });

  return { success: true, newStock: updated.stockQuantity };
}
```

Bu model sayesinde:
1. İki müşteri aynı anda son kalan ürünü almaya çalıştığında, PostgreSQL ilk işleme kilidi verir.
2. İkinci işlem ilk işlem commit olana kadar satır kilidinde bekler.
3. İlk işlem stoğu 0 yaptığında, ikinci işlem uyandığında `stockQuantity = 0` görür ve sipariş "yetersiz stok" hatasıyla güvenle reddedilir.
4. Faz 8.3'te eklenen `ProductVariant_stockQuantity_nonnegative` CHECK constraint'i sayesinde hiçbir durumda eksi stok oluşamaz.

---

## 3. İKİLİ (DUAL) VE ADIM ADIM GEÇİŞ PLANI (FAZ 8.5 STRATEJİSİ)

Tüm sistemi tek seferde ("Big Bang") değiştirmek yüksek risk taşır. Bunun yerine Faz 8.5'te **Adapter Pattern (Veri Kaynağı Adaptörü)** uygulanacaktır.

### 3.1. Mimari Katman Şeması (Target Architecture):

```
+-------------------------------------------------------------+
|              Next.js Pages, App Router & API Routes         |
|  (src/app/api/..., src/components/..., src/context/...)     |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                 Hümra Data Access Interface                 |
|             (IStoreDAO / src/lib/server/dao/)               |
+-------------------------------------------------------------+
               /                              \
              /                                \
             v                                  v
+------------------------+          +-------------------------+
|     JsonStoreDAO       |          |     PrismaPostgresDAO   |
|   (Mevcut store.ts)    |          |   (Yeni PostgreSQL Katmanı) |
+------------------------+          +-------------------------+
             |                                  |
             v                                  v
     data/store.json                  Docker / Managed Postgres
```

### 3.2. Adım Adım Geçiş Sıralaması:

#### Aşama 1: Salt Okunur (Read-Only) Katalog Servisleri (Düşük Risk)
- `getAllProducts`, `getProductBySlug`, `getAllCategories`, `getAllCollections`, `getFeaturedVideos` fonksiyonları Prisma üzerinden okunacak şekilde uyarlanır.
- Mevcut testlerle hız ve veri doğruluğu kıyaslanır.

#### Aşama 2: Kimlik Doğrulama ve Müşteri Profili (Orta Risk)
- Müşteri kayıt, giriş, şifre sıfırlama, adres yönetimi `User` ve `Address` Prisma modellerine yönlendirilir.
- Scrypt şifre hashlerinin uyumu korunur.

#### Aşama 3: Sepet ve Dinamik Vitrin (Orta Risk)
- Misafir ve üye sepetleri `Cart` / `CartItem` modellerine yönlendirilir.

#### Aşama 4: Sipariş, Ödeme ve Stok Motoru (Kritik Aşama)
- `createPendingOrder`, `createCashOnDeliveryOrder`, PayTR callback ve stok düşüm işlemleri tek atomik `prisma.$transaction` bloğuna alınır.
- Kargo, iade ve bildirim akışları bağlanır.

#### Aşama 5: `DATA_STORE_DRIVER` Ortam Değişkeni İle Canlıya Alma
- `.env` içerisine eklenecek `DATA_STORE_DRIVER=postgres` (veya `json`) anahtarı ile tek bir bayrakla anında PostgreSQL'e geçilebilecek veya acil bir durumda 1 saniyede JSON altyapısına geri dönülebilecektir (Instant Rollback Flag).

---

## 4. RİSK ANALİZİ VE ALINACAK TEDBİRLER

| Risk Tanımı | Etki | Olasılık | Alınan Önleyici Tedbir |
| :--- | :---: | :---: | :--- |
| **Betül Trençkot Çakışması** | Yüksek | Sıfırlandı | Faz 8.3'te non-unique index oluşturuldu, Faz 8.4'te 10 varyantın ve 100 stok miktarının sorunsuz aktarıldığı kanıtlandı. |
| **Bağlantı Havuzu (Pool Exhaustion)** | Orta | Düşük | Prisma Client singleton örneği `src/lib/server/prisma.ts` üzerinden yönetilecek, `connection_limit` 10-20 arasında sınırlandırılacaktır. |
| **Serverless Cold Start** | Düşük | Orta | Prisma Client globalThis önbelleğinde tutulacak, gereksiz her istekte yeniden instance açılmayacaktır. |
| **JSON <> DB Parite Kaybı** | Yüksek | Düşük | Geçiş tamamlanana kadar her gece çalışan `verify-data-parity` kontrol scripti devrede kalacaktır. |

---

## 5. FAZ 8.5 ÇALIŞMA PLANI TAVSİYESİ

1. `src/lib/server/dao/` modülünün kurulması ve `IStoreDAO` arayüzünün tanımlanması.
2. `PrismaStoreDAO` implementasyonunun tamamlanması.
3. `DATA_STORE_DRIVER` anahtarı ile dinamik sağlayıcı (factory) oluşturulması.
4. Tüm Vitest ve Playwright testlerinin hem JSON hem PostgreSQL sürücüsüyle çalıştırılıp %100 başarı sağlanması.
5. Kullanıcı onayı ile üretim geçişine başlanması.

