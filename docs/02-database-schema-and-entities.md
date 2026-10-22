# Hümra Moda — Veritabanı Varlıkları ve İlişkisel Şema (Prisma / PostgreSQL)

## 1. Veritabanı Tasarım Prensipleri
1. **İlişkisel Bütünlük:** Ürün, renk, beden, varyant ve medya arasındaki ilişkiler veri tutarlılığını sağlamak için katı yabancı anahtarlarla (Foreign Key) yönetilir.
2. **Finansal Hassasiyet:** Para tutarları para birimi yuvarlama hatalarını önlemek için `Decimal(10, 2)` veya kuruş cinsinden tam sayı (`Int`) olarak saklanır. PayTR isteklerinde kuruş cinsine dönüştürülür.
3. **Stok Kilitleme & Atomiklik:** Varyant stokları tek bir tabloda tutulur; sipariş onaylandığında işlem (transaction) içinde güncellenir.
4. **Dinamik Vitrin Mimarisi:** Ana sayfa afişleri, videoları ve gridleri için kod değişikliği gerektirmeyen esnek `HomepageBlock` ve `BlockItem` varlıkları kurgulanmıştır.

---

## 2. Prisma Şema Modeli (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// -------------------------------------------------------------
// 1. KULLANICI VE YETKİLENDİRME (AUTH & USERS)
// -------------------------------------------------------------

enum UserRole {
  ADMIN
  STAFF
  CUSTOMER
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  fullName      String
  phone         String?
  role          UserRole  @default(CUSTOMER)
  isActive      Boolean   @default(true)
  emailVerified DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  addresses     Address[]
  orders        Order[]
  favorites     Favorite[]
  cart          Cart?

  @@index([email])
}

model Address {
  id           String   @id @default(cuid())
  userId       String
  title        String   // Örn: "Evim", "İş Yeri"
  recipient    String   // Teslim alacak kişi adı soyadı
  phone        String
  city         String   // İl
  district     String   // İlçe
  neighborhood String?  // Mahalle
  fullAddress  String   // Açık adres
  postalCode   String?
  isDefault    Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  orders       Order[]

  @@index([userId])
}

// -------------------------------------------------------------
// 2. KATALOG VE KATEGORİLER
// -------------------------------------------------------------

model Category {
  id             String    @id @default(cuid())
  name           String
  slug           String    @unique
  description    String?
  imageUrl       String?
  displayOrder   Int       @default(0)
  isActive       Boolean   @default(true)
  parentId       String?
  seoTitle       String?
  seoDescription String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  parent         Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children       Category[] @relation("CategoryHierarchy")
  products       Product[]

  @@index([slug])
  @@index([displayOrder])
}

model Collection {
  id             String    @id @default(cuid())
  name           String    // Örn: "Yeni Koleksiyon", "1 Alana 1 Bedava"
  slug           String    @unique
  description    String?
  bannerDesktop  String?
  bannerMobile   String?
  displayOrder   Int       @default(0)
  isActive       Boolean   @default(true)
  seoTitle       String?
  seoDescription String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  products       ProductCollection[]

  @@index([slug])
}

// -------------------------------------------------------------
// 3. ÜRÜN, RENK, BEDEN VE VARYANT MİMARİSİ
// -------------------------------------------------------------

model Product {
  id              String    @id @default(cuid())
  title           String
  slug            String    @unique
  description     String    @db.Text
  fabricDetails   String?   @db.Text // Kumaş bilgisi
  modelDimensions String?   @db.Text // Manken ölçüleri
  basePrice       Decimal   @db.Decimal(10, 2)
  discountPrice   Decimal?  @db.Decimal(10, 2) // İndirimli satış fiyatı
  isPreOrder      Boolean   @default(false)    // Ön sipariş ürünü mü?
  preOrderNote    String?                      // Tahmini kargo tarihi vb.
  badge           String?                      // "YENİ ÜRÜN", "ÇOK SATAN"
  categoryId      String
  isActive        Boolean   @default(true)
  displayOrder    Int       @default(0)
  seoTitle        String?
  seoDescription  String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  category        Category              @relation(fields: [categoryId], references: [id])
  collections     ProductCollection[]
  colors          ProductColor[]
  sizes           ProductSize[]
  variants        ProductVariant[]
  media           ProductMedia[]
  favorites       Favorite[]
  cartItems       CartItem[]
  orderItems      OrderItem[]

  @@index([slug])
  @@index([categoryId])
  @@index([isActive])
}

model ProductCollection {
  productId    String
  collectionId String

  product      Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)

  @@id([productId, collectionId])
}

model ProductColor {
  id           String   @id @default(cuid())
  productId    String
  name         String   // Örn: "Siyah", "Haki", "Bordo", "Lacivert"
  slug         String   // Örn: "siyah" (URL'de ?renk=siyah için)
  colorCode    String   // Hex formatı: "#111111"
  displayOrder Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  product      Product          @relation(fields: [productId], references: [id], onDelete: Cascade)
  variants     ProductVariant[]
  media        ProductMedia[]

  @@unique([productId, slug])
  @@index([productId])
}

model ProductSize {
  id           String   @id @default(cuid())
  productId    String
  name         String   // Örn: "1 Beden (36-38)", "2 Beden (40-42)", "S", "M"
  slug         String   // Örn: "1-beden-36-38"
  displayOrder Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  product      Product          @relation(fields: [productId], references: [id], onDelete: Cascade)
  variants     ProductVariant[]

  @@unique([productId, slug])
  @@index([productId])
}

model ProductVariant {
  id              String   @id @default(cuid())
  productId       String
  colorId         String
  sizeId          String
  sku             String   @unique // Benzersiz stok kodu, örn: "HM-4510-SYH-B1"
  barcode         String?  // EAN / Barkod
  stockQuantity   Int      @default(0)
  priceAdjustment Decimal? @default(0) @db.Decimal(10, 2)
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  product         Product      @relation(fields: [productId], references: [id], onDelete: Cascade)
  color           ProductColor @relation(fields: [colorId], references: [id], onDelete: Cascade)
  size            ProductSize  @relation(fields: [sizeId], references: [id], onDelete: Cascade)
  cartItems       CartItem[]
  orderItems      OrderItem[]

  @@unique([productId, colorId, sizeId])
  @@index([sku])
  @@index([stockQuantity])
}

enum MediaType {
  IMAGE
  VIDEO
}

model ProductMedia {
  id           String    @id @default(cuid())
  productId    String
  colorId      String?   // Belirli bir renge aitse doldurulur (Renge Özel Galeri)
  type         MediaType @default(IMAGE)
  url          String    // WebP veya MP4 URL'si
  thumbnailUrl String?   // Küçük önizleme görseli
  posterUrl    String?   // Video için poster resmi
  altText      String?
  displayOrder Int       @default(0)
  isThumbnail  Boolean   @default(false)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  product      Product       @relation(fields: [productId], references: [id], onDelete: Cascade)
  color        ProductColor? @relation(fields: [colorId], references: [id], onDelete: SetNull)

  @@index([productId, colorId])
  @@index([displayOrder])
}

// -------------------------------------------------------------
// 4. SEPET VE FAVORİLER
// -------------------------------------------------------------

model Cart {
  id        String     @id @default(cuid())
  userId    String?    @unique // Misafir için null olabilir
  sessionId String?    @unique // Misafir sepet takibi için
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  user      User?      @relation(fields: [userId], references: [id], onDelete: Cascade)
  items     CartItem[]
}

model CartItem {
  id        String   @id @default(cuid())
  cartId    String
  productId String
  variantId String
  quantity  Int      @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  cart      Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  product   Product        @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant   ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([cartId, variantId])
}

model Favorite {
  id        String   @id @default(cuid())
  userId    String
  productId String
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([userId, productId])
}

// -------------------------------------------------------------
// 5. SİPARİŞ VE ÖDEME (PAYTR VE İŞLEM YÖNETİMİ)
// -------------------------------------------------------------

enum OrderStatus {
  PENDING_PAYMENT // Ödeme Bekleniyor
  PAID            // Ödeme Alındı / Onaylandı
  PREPARING       // Hazırlanıyor
  SHIPPED         // Kargoya Verildi
  DELIVERED       // Teslim Edildi
  CANCELLED       // İptal Edildi
  REFUNDED        // İade Edildi
}

model Order {
  id               String       @id @default(cuid())
  orderNumber      String       @unique // Müşteriye görünen sipariş no: "HM-20261021-0001"
  userId           String?
  customerEmail    String
  customerFullName String
  customerPhone    String
  status           OrderStatus  @default(PENDING_PAYMENT)
  subtotal         Decimal      @db.Decimal(10, 2)
  discountAmount   Decimal      @default(0) @db.Decimal(10, 2)
  shippingAmount   Decimal      @default(0) @db.Decimal(10, 2)
  totalAmount      Decimal      @db.Decimal(10, 2)
  totalKurus       Int          // PayTR ile birebir eşleşen kuruş tutar (örn: 157410)
  shippingAddress  Json         // Sipariş anındaki adres görüntüsü
  trackingCode     String?      // Kargo takip no
  shippingCompany  String?      // "Yurtiçi Kargo", "Aras Kargo" vb.
  customerNotes    String?
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  user             User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
  addressId        String?
  address          Address?     @relation(fields: [addressId], references: [id], onDelete: SetNull)
  items            OrderItem[]
  payments         PaymentTransaction[]

  @@index([orderNumber])
  @@index([status])
  @@index([customerEmail])
}

model OrderItem {
  id          String   @id @default(cuid())
  orderId     String
  productId   String
  variantId   String
  productName String
  colorName   String
  sizeName    String
  sku         String
  price       Decimal  @db.Decimal(10, 2)
  quantity    Int
  totalPrice  Decimal  @db.Decimal(10, 2)

  order       Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product     Product        @relation(fields: [productId], references: [id])
  variant     ProductVariant @relation(fields: [variantId], references: [id])
}

enum PaymentStatus {
  INITIALIZED
  SUCCESS
  FAILED
}

model PaymentTransaction {
  id              String        @id @default(cuid())
  orderId         String
  merchantOid     String        @unique // PayTR benzersiz sipariş kodu
  paymentProvider String        @default("PAYTR")
  status          PaymentStatus @default(INITIALIZED)
  amountKurus     Int
  paytrToken      String?
  paytrHash       String?
  callbackPayload Json?         // PayTR'dan gelen ham callback verisi (denetim amaçlı)
  failedReason    String?
  paidAt          DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  order           Order         @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([merchantOid])
}

// -------------------------------------------------------------
// 6. DİNAMİK VİTRİN VE ANA SAYFA BLOKLARI (CMS)
// -------------------------------------------------------------

enum BlockLayout {
  SLIDER
  VIDEO_HERO
  GRID2
  PRODUCT_CAROUSEL
  PROMO_BANNER
}

model HomepageBlock {
  id           String      @id @default(cuid())
  title        String?
  layout       BlockLayout
  displayOrder Int         @default(0)
  isActive     Boolean     @default(true)
  mobileStack  Boolean     @default(true)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  items        BlockItem[]

  @@index([displayOrder])
}

model BlockItem {
  id               String        @id @default(cuid())
  blockId          String
  desktopImage     String?
  mobileImage      String?
  desktopVideo     String?
  mobileVideo      String?
  videoPoster      String?
  linkUrl          String?
  heading          String?
  subheading       String?
  buttonText       String?
  deviceVisibility String        @default("both") // "both", "mobile", "desktop"
  displayOrder     Int           @default(0)

  block            HomepageBlock @relation(fields: [blockId], references: [id], onDelete: Cascade)

  @@index([blockId])
}

// -------------------------------------------------------------
// 7. MAĞAZA VE KAMPANYA AYARLARI
// -------------------------------------------------------------

model StoreSetting {
  key         String   @id // Örn: "site_title", "free_shipping_threshold", "whatsapp_number"
  value       String   @db.Text
  description String?
  updatedAt   DateTime @updatedAt
}

model DiscountCampaign {
  id               String    @id @default(cuid())
  title            String    // Örn: "Sepette %10 İndirim"
  code             String?   @unique // Kupon kodu ise (opsiyonel)
  percentage       Decimal?  @db.Decimal(5, 2)
  fixedAmount      Decimal?  @db.Decimal(10, 2)
  minSpendAmount   Decimal?  @db.Decimal(10, 2)
  startDate        DateTime
  endDate          DateTime
  isActive         Boolean   @default(true)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```
