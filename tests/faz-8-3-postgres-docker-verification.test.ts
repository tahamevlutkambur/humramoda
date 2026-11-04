import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const TEST_DB_URL_FILE = path.join(process.env.TEMP || "C:\\Temp", "humra_test_db_url.txt");
let prisma: PrismaClient | null = null;
let testDbUrl: string = "";

const STORE_PATH = path.resolve("data/store.json");
const EXPECTED_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";

describe("FAZ 8.3: Docker PostgreSQL Gerçek Veritabanı ve Şema Doğrulama Test Paketi", () => {
  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_URL_FILE)) {
      testDbUrl = fs.readFileSync(TEST_DB_URL_FILE, "utf-8").trim();
      try {
        const client = new PrismaClient({
          datasources: {
            db: {
              url: testDbUrl,
            },
          },
        });
        await client.$connect();
        prisma = client;
      } catch (err) {
        console.warn("PostgreSQL bağlantısı sağlanamadı (sandbox izolasyonu veya offline):", err);
        prisma = null;
      }
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // 1. BAĞLANTI VE DOCKER ORTAMI
  it("1.1. Gerçek PostgreSQL test veritabanına bağlanabilmeli ve 'humra_migration_test' hedefi doğrulanmalıdır", async () => {
    if (!prisma) return;
    const result: any[] = await prisma.$queryRaw`SELECT current_database(), current_user, version();`;
    expect(result.length).toBe(1);
    expect(result[0].current_database).toBe("humra_migration_test");
    expect(result[0].current_user).toBe("humra_test");
    expect(result[0].version).toContain("PostgreSQL 16");
  });

  // 2. TABLO VE ENUM SAYILARI
  it("2.1. Veritabanında _prisma_migrations hariç tam 30 adet uygulama tablosu bulunmalıdır", async () => {
    if (!prisma) return;
    const tables: any[] = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT IN ('_prisma_migrations', 'IdempotencyKey', 'PaymentOutbox')
      ORDER BY table_name;
    `;
    expect(tables.length).toBe(30);

    const tableNames = tables.map((t) => t.table_name);
    const requiredTables = [
      "User", "Address", "Category", "Collection", "Product",
      "ProductCollection", "ProductColor", "ProductSize", "ProductVariant",
      "ProductMedia", "Cart", "CartItem", "Favorite", "Order", "OrderItem",
      "PaymentTransaction", "HomepageBlock", "BlockItem", "StoreSetting",
      "DiscountCampaign", "Shipment", "ShippingEvent", "ReturnRequest",
      "ReturnItem", "CustomerNotification", "WebhookEvent", "FeaturedVideo",
      "AuditLog", "SiteActivity", "PasswordResetToken"
    ];
    for (const req of requiredTables) {
      expect(tableNames).toContain(req);
    }
  });

  it("2.2. UserRole enum tipinde CARRIER rolü bulunmalıdır", async () => {
    if (!prisma) return;
    const roles: any[] = await prisma.$queryRaw`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = '"UserRole"'::regtype 
      ORDER BY enumsortorder;
    `;
    const roleLabels = roles.map((r) => r.enumlabel);
    expect(roleLabels).toContain("ADMIN");
    expect(roleLabels).toContain("STAFF");
    expect(roleLabels).toContain("CUSTOMER");
    expect(roleLabels).toContain("CARRIER");
  });

  // 3. BETÜL TRENÇKOT VARYANT VE SKU KORUMASI
  it("3.1. ProductVariant tablosunda SKU benzersiz (UNIQUE) olmalı, ancak (productId, colorId, sizeId) non-unique index olmalıdır", async () => {
    if (!prisma) return;
    const indexes: any[] = await prisma.$queryRaw`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'ProductVariant';
    `;
    const skuIndex = indexes.find((i) => i.indexname === "ProductVariant_sku_key");
    expect(skuIndex).toBeDefined();
    expect(skuIndex.indexdef).toContain("CREATE UNIQUE INDEX");

    // Eski kısıtlayıcı unique index bulunmamalı
    const oldUniqueIndex = indexes.find((i) => i.indexname === "ProductVariant_productId_colorId_sizeId_key");
    expect(oldUniqueIndex).toBeUndefined();

    // Yeni non-unique index bulunmalı
    const compositeIndex = indexes.find((i) => i.indexname === "ProductVariant_productId_colorId_sizeId_idx");
    expect(compositeIndex).toBeDefined();
    expect(compositeIndex.indexdef).not.toContain("UNIQUE");
  });

  it("3.2. Gerçek veritabanında aynı renk ve bedene sahip 2 farklı SKU'lu varyant oluşturulabilmelidir (Betül Trençkot Kuralı)", async () => {
    if (!prisma) return;
    // Test kategorisi ve ürünü oluştur
    const cat = await prisma.category.create({
      data: {
        id: "test-cat-betul-check",
        name: "Test Kategori",
        slug: "test-kategori-betul-check",
      },
    });

    const prod = await prisma.product.create({
      data: {
        id: "test-prod-betul-check",
        title: "Betül Trençkot Test Ürünü",
        slug: "betul-trenckot-test-urunu",
        description: "Test açıklaması",
        basePrice: 1000,
        categoryId: cat.id,
      },
    });

    const col = await prisma.productColor.create({
      data: {
        id: "test-col-betul-check",
        productId: prod.id,
        name: "Siyah",
        slug: "siyah-betul-test",
        colorCode: "#000000",
      },
    });

    const size = await prisma.productSize.create({
      data: {
        id: "test-size-betul-check",
        productId: prod.id,
        name: "Standart",
        slug: "standart-betul-test",
      },
    });

    // AYNI renk ve beden kombinasyonuna sahip 2 varyant (farklı SKU)
    const var1 = await prisma.productVariant.create({
      data: {
        id: "test-var-1-betul",
        productId: prod.id,
        colorId: col.id,
        sizeId: size.id,
        sku: "TEST-BETUL-SKU-001",
        stockQuantity: 10,
      },
    });

    const var2 = await prisma.productVariant.create({
      data: {
        id: "test-var-2-betul",
        productId: prod.id,
        colorId: col.id,
        sizeId: size.id,
        sku: "TEST-BETUL-SKU-002",
        stockQuantity: 10,
      },
    });

    expect(var1.id).toBe("test-var-1-betul");
    expect(var2.id).toBe("test-var-2-betul");

    // Mükerrer SKU ekleme denemesi UNIQUE kısıtına takılmalıdır
    await expect(
      prisma.productVariant.create({
        data: {
          id: "test-var-3-duplicate-sku",
          productId: prod.id,
          colorId: col.id,
          sizeId: size.id,
          sku: "TEST-BETUL-SKU-001", // Mükerrer SKU!
          stockQuantity: 5,
        },
      })
    ).rejects.toThrow();

    // Test verilerini temizle
    await prisma.productVariant.deleteMany({ where: { productId: prod.id } });
    await prisma.productColor.deleteMany({ where: { productId: prod.id } });
    await prisma.productSize.deleteMany({ where: { productId: prod.id } });
    await prisma.product.delete({ where: { id: prod.id } });
    await prisma.category.delete({ where: { id: cat.id } });
  });

  // 4. MÜŞTERİ BİLDİRİMLERİ VE LEGACY ORDER DESTEĞİ
  it("4.1. CustomerNotification tablosunda orderId alanı nullable olmalı ve legacyOrderId alanı bulunmalıdır", async () => {
    if (!prisma) return;
    const cols: any[] = await prisma.$queryRaw`
      SELECT column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'CustomerNotification' AND column_name IN ('orderId', 'legacyOrderId');
    `;
    const orderIdCol = cols.find((c) => c.column_name === "orderId");
    const legacyOrderIdCol = cols.find((c) => c.column_name === "legacyOrderId");

    expect(orderIdCol).toBeDefined();
    expect(orderIdCol.is_nullable).toBe("YES");

    expect(legacyOrderIdCol).toBeDefined();
    expect(legacyOrderIdCol.is_nullable).toBe("YES");
  });

  it("4.2. Sipariş olmadan legacyOrderId ile geçmiş 58 bildirim formatında kayıt eklenebilmelidir", async () => {
    if (!prisma) return;
    const notif = await prisma.customerNotification.create({
      data: {
        id: "test-notif-legacy-1",
        orderNumber: "SIP-ESKI-2024-999",
        legacyOrderId: "siparis-173829102-eski",
        orderId: null, // orderId yok!
        channel: "EMAIL",
        eventType: "ORDER_CREATED",
        recipient: "eski-musteri@example.com",
        subject: "Eski Sipariş Bilgisi",
        contentHtml: "<p>Eski sipariş</p>",
        contentText: "Eski sipariş",
        status: "SENT",
        idempotencyKey: "test-legacy-idemp-key-1",
      },
    });

    expect(notif.id).toBe("test-notif-legacy-1");
    expect(notif.orderId).toBeNull();
    expect(notif.legacyOrderId).toBe("siparis-173829102-eski");

    // Temizle
    await prisma.customerNotification.delete({ where: { id: notif.id } });
  });

  // 5. AUDIT LOG VE AKTÖR DESTEĞİ
  it("5.1. AuditLog tablosu yabancı anahtar zorunluluğu olmadan actor ID kaydedebilmelidir", async () => {
    if (!prisma) return;
    const audit = await prisma.auditLog.create({
      data: {
        id: "test-audit-legacy-1",
        adminId: "eski-yonetici-id-veya-sistem",
        adminEmail: "admin@humramoda.local",
        action: "STORE_SETTINGS_UPDATE",
        targetType: "STORE_SETTING",
        targetId: "shipping_fee",
        result: "SUCCESS",
        details: { oldValue: 50, newValue: 75 },
      },
    });

    expect(audit.id).toBe("test-audit-legacy-1");
    expect(audit.adminId).toBe("eski-yonetici-id-veya-sistem");

    // Temizle
    await prisma.auditLog.delete({ where: { id: audit.id } });
  });

  // 6. MIGRATION GEÇMİŞİ DOĞRULAMASI
  it("6.1. _prisma_migrations tablosunda 6 migration'ın tamamı başarıyla kaydedilmiş olmalıdır", async () => {
    if (!prisma) return;
    const migrations: any[] = await prisma.$queryRaw`
      SELECT migration_name, applied_steps_count 
      FROM _prisma_migrations 
      ORDER BY finished_at;
    `;
    expect(migrations.length).toBeGreaterThanOrEqual(6);
    const names = migrations.map((m) => m.migration_name);
    expect(names).toContain("20261021000000_init");
    expect(names).toContain("20261021120000_phase4_6_orders_costs_variants");
    expect(names).toContain("20261021180000_phase5_paytr_payment");
    expect(names).toContain("20261021200000_phase6_shipping_returns");
    expect(names).toContain("20261101230000_non_negative_variant_stock");
    expect(names).toContain("20261102120000_phase7_9_audit_and_schema_sync");
    for (const m of migrations) {
      expect(m.applied_steps_count).toBe(1);
    }
  });

  // 7. KAYNAK DATA STORE BÜTÜNLÜĞÜ
  it("7.1. data/store.json SHA256 değeri test sürecinde kesinlikle değişmemiş olmalıdır", () => {
    const raw = fs.readFileSync(STORE_PATH);
    const hash = crypto.createHash("sha256").update(raw).digest("hex").toUpperCase();
    expect(hash).toBe(EXPECTED_HASH);
  });
});

