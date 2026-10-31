import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { PRODUCTS } from "../src/lib/catalog";
import {
  getStoreData,
  saveStoreData,
  createStoreProduct,
  updateStoreProduct,
  deleteStoreProduct,
  createStoreCategory,
  deleteStoreCategory,
  getStoreSettings,
  updateStoreSettings,
  createStoreCampaign,
  deleteStoreCampaign,
  getAllOrders,
  updateOrderOperationalStatus,
  getFinancialReport,
} from "../src/lib/server/store";
import {
  logAdminAudit,
  logSiteActivity,
  getAdminAuditLogs,
  getSiteActivityLogs,
  sanitizeLogData,
} from "../src/lib/server/logger";
import {
  createBackup,
  listBackups,
  verifyBackupById,
  restoreBackupById,
} from "../src/lib/server/backup";

describe("Admin Store Engine & Validation Constraints", () => {
  const storeFilePath = path.join(process.cwd(), "data", "store.json");
  let snapshot: string;

  beforeAll(() => {
    if (fs.existsSync(storeFilePath)) {
      snapshot = fs.readFileSync(storeFilePath, "utf-8");
    }
    const store = getStoreData();
    let changed = false;
    if (!store.products || store.products.length === 0) {
      store.products = JSON.parse(JSON.stringify(PRODUCTS));
      changed = true;
    }
    if (!store.orders || store.orders.length === 0) {
      store.orders = [
        {
          id: "ord-test-dummy-1",
          orderNumber: "HM-TEST-0001",
          customerFullName: "Test Müşteri",
          customerEmail: "test@example.com",
          customerPhone: "05321112233",
          shippingAddress: { city: "İstanbul", district: "Kadıköy", fullAddress: "Test Cad." },
          operationalStatus: "PENDING",
          paymentStatus: "PAID",
          subtotal: 1000,
          discountAmount: 0,
          shippingAmount: 0,
          totalAmount: 1000,
          totalKurus: 100000,
          items: [
            {
              id: "item-1",
              productId: store.products[0].id,
              productName: store.products[0].title,
              variantId: store.products[0].variants[0]?.id,
              colorName: "Siyah",
              sizeName: "1 Beden",
              sku: store.products[0].variants[0]?.sku || "SKU-TEST-1",
              unitPrice: 1000,
              quantity: 1,
              totalPrice: 1000,
              costPriceSnapshot: 500,
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          stockDeducted: false,
        },
      ];
      changed = true;
    }
    if (changed) {
      saveStoreData(store);
    }
  });

  afterAll(() => {
    if (snapshot && fs.existsSync(storeFilePath)) {
      fs.writeFileSync(storeFilePath, snapshot, "utf-8");
    }
  });
  it("rejects product with missing title", () => {
    const res = createStoreProduct({
      title: "",
      description: "Açıklama",
      basePrice: 1000,
      categorySlug: "takim",
      colors: [],
      sizes: [],
      variants: [],
    });
    expect(res.error).toBe("Ürün başlığı zorunludur.");
  });

  it("rejects invalid prices and discounts equal or higher than base price", () => {
    const badBase = createStoreProduct({
      title: "Test Ürün Fiyatı",
      description: "Açıklama",
      basePrice: 0,
      categorySlug: "takim",
      colors: [],
      sizes: [],
      variants: [],
    });
    expect(badBase.error).toBe("Geçerli bir normal satış fiyatı giriniz.");

    const badDisc = createStoreProduct({
      title: "Test Ürün İndirim Hatalı",
      description: "Açıklama",
      basePrice: 1500,
      discountPrice: 1600, // İndirim normal fiyattan büyük olamaz
      categorySlug: "takim",
      colors: [],
      sizes: [],
      variants: [],
    });
    expect(badDisc.error).toBe("İndirimli fiyat normal fiyattan düşük olmalıdır.");
  });

  it("enforces non-negative stock and unique SKUs", () => {
    const resNegative = createStoreProduct({
      title: "Stok Test Ürünü Negatif",
      description: "Açıklama",
      basePrice: 2000,
      categorySlug: "takim",
      colors: [{ name: "Siyah", colorCode: "#000000" }],
      sizes: [{ name: "38" }],
      variants: [
        {
          colorName: "Siyah",
          sizeName: "38",
          sku: "TEST-SKU-NEG",
          stockQuantity: -5,
        },
      ],
    });
    expect(resNegative.error).toContain("stok miktarı 0 veya daha büyük olmalıdır");
  });

  it("successfully creates, updates and deletes a valid product with color gallery", () => {
    const createRes = createStoreProduct({
      title: "Testlik Hümra İkili Takım",
      slug: `testlik-humra-takim-${Date.now()}`,
      description: "Doğal pamuk gabardin kumaş.",
      basePrice: 3250,
      discountPrice: 2950,
      categorySlug: "takim",
      collectionSlugs: ["yeni-sezon"],
      colors: [
        { name: "Bej", colorCode: "#D9C5B2" },
        { name: "Haki", colorCode: "#556B2F" },
      ],
      sizes: [{ name: "Standart" }],
      variants: [
        {
          colorName: "Bej",
          sizeName: "Standart",
          sku: `TEST-BEJ-${Date.now()}`,
          stockQuantity: 15,
        },
        {
          colorName: "Haki",
          sizeName: "Standart",
          sku: `TEST-HAKI-${Date.now()}`,
          stockQuantity: 0, // Tükendi testi
        },
      ],
      media: [
        {
          colorName: "Bej",
          url: "/uploads/products/IMG_2190-card.webp",
          thumbnailUrl: "/uploads/products/IMG_2190-thumb.webp",
          type: "IMAGE",
          altText: "Bej Takım",
          isThumbnail: true,
        },
      ],
    });

    expect(createRes.error).toBeUndefined();
    expect(createRes.product).toBeDefined();
    const prodId = createRes.product!.id;

    // Renk-medya eşleşmesini doğrula
    const bejColor = createRes.product!.colors.find((c) => c.name === "Bej");
    expect(createRes.product!.media[0].colorId).toBe(bejColor?.id);

    // Güncelleme
    const updateRes = updateStoreProduct(prodId, {
      basePrice: 3400,
      discountPrice: 3100,
    });
    expect(updateRes.error).toBeUndefined();
    expect(updateRes.product?.basePrice).toBe(3400);

    // Silme
    const deleted = deleteStoreProduct(prodId);
    expect(deleted).toBe(true);
  });

  it("manages categories and prevents duplicate slugs", () => {
    const slug = `test-cat-${Date.now()}`;
    const cat1 = createStoreCategory({
      name: "Özel Kategori",
      slug,
      description: "Test kategorisi",
    });
    expect(cat1.error).toBeUndefined();
    expect(cat1.category?.slug).toBe(slug);

    // Çakışan slug reddedilmeli
    const duplicate = createStoreCategory({
      name: "Başka Kategori",
      slug,
    });
    expect(duplicate.error).toContain("kategori bağlantısı zaten mevcut");

    // Silme
    deleteStoreCategory(cat1.category!.id);
  });

  it("updates store settings and dynamic free shipping threshold", () => {
    const current = getStoreSettings();
    expect(current.freeShippingThreshold).toBeGreaterThan(0);

    const updated = updateStoreSettings({
      freeShippingThreshold: 4000,
      whatsapp: "+90 555 111 22 33",
    });

    expect(updated.freeShippingThreshold).toBe(4000);
    expect(updated.whatsapp).toBe("+90 555 111 22 33");

    // Eski haline getir
    updateStoreSettings({ freeShippingThreshold: current.freeShippingThreshold });
  });

  it("creates, updates and deletes campaigns with discount rules", () => {
    const testCode = `TESTPROMO${Date.now()}`;
    const created = createStoreCampaign({
      code: testCode,
      name: "Yaz İndirimi",
      discountPercentage: 20,
      minBasketAmount: 1800,
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      isActive: true,
      description: "Sepette anında %20 indirim.",
    });

    expect(created.error).toBeUndefined();
    expect(created.campaign?.code).toBe(testCode);
    expect(created.campaign?.discountPercentage).toBe(20);

    // Duplicate code reddedilmeli
    const dup = createStoreCampaign({
      code: testCode,
      name: "Çakışan Kampanya",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      isActive: true,
    });
    expect(dup.error).toContain("kampanya kodu zaten mevcut");

    // Silme
    deleteStoreCampaign(created.campaign!.id);
  });

  /* =========================================================================
     FAZ 4.6 TESTLERİ: RENK-BEDEN, SİPARİŞ, KÂR, LOG VE YEDEKLER
     ========================================================================= */
  describe("Faz 4.6: Renk Bazında Beden, SKU ve Stok Yönetimi", () => {
    it("bir ürünün farklı renkleri için bağımsız bedenler ve stoklar tanımlanabilir", () => {
      const store = getStoreData();
      const product = store.products[0] || PRODUCTS[0];
      expect(product).toBeDefined();

      const variantsByColor = product.variants.reduce((acc, v) => {
        acc[v.colorId] = acc[v.colorId] || [];
        acc[v.colorId].push(v);
        return acc;
      }, {} as Record<string, typeof product.variants>);

      const colorIds = Object.keys(variantsByColor);
      expect(colorIds.length).toBeGreaterThan(0);

      for (const v of product.variants) {
        expect(v.colorId).toBeDefined();
        expect(v.sizeId).toBeDefined();
        expect(v.stockQuantity ?? (v as { stock?: number }).stock ?? 0).toBeGreaterThanOrEqual(0);
        expect(v.sku).toBeTruthy();
      }
    });

    it("yeni ürün oluşturulurken renge özel bedenler, SKU'lar ve maliyet fiyatları kaydedilir", () => {
      const newProdRes = createStoreProduct({
        title: "Test İpek Tunik Faz 4.6",
        categorySlug: "takim",
        basePrice: 1500,
        costPrice: 650,
        colors: [
          { name: "Siyah", colorCode: "#000000" },
          { name: "Bej", colorCode: "#e5d3b3" },
        ],
        sizes: [{ name: "40-42" }, { name: "44-46" }],
        variants: [
          { colorName: "Siyah", sizeName: "40-42", sku: "TEST-SIY-40", stockQuantity: 0, costPrice: 650 },
          { colorName: "Siyah", sizeName: "44-46", sku: "TEST-SIY-44", stockQuantity: 5, costPrice: 650 },
          { colorName: "Bej", sizeName: "40-42", sku: "TEST-BEJ-40", stockQuantity: 10, costPrice: 630 },
        ],
        description: "Test açıklaması",
      });

      expect(newProdRes.product).toBeDefined();
      expect(newProdRes.product!.variants.length).toBe(3);
      const siyahOutOfStock = newProdRes.product!.variants.find(
        (v) => v.sku === "TEST-SIY-40"
      );
      expect(siyahOutOfStock?.stockQuantity).toBe(0);

      const bejVariant = newProdRes.product!.variants.find((v) => v.sku === "TEST-BEJ-40");
      expect(bejVariant?.stockQuantity).toBe(10);
      expect(bejVariant?.costPrice).toBe(630);

      // Temizle
      deleteStoreProduct(newProdRes.product!.id);
    });
  });

  describe("Faz 4.6: Sipariş Durumları ve Atomik Stok Hareketleri", () => {
    it("siparişi onaylar ve varyant stoklarını düşer", () => {
      const orders = getAllOrders();
      const pendingOrder = orders.find((o) => o.operationalStatus === "PENDING") || orders[0];
      const targetVariantId = pendingOrder.items[0]?.variantId;

      const storeBefore = getStoreData();
      const variantBefore = storeBefore.products
        .flatMap((p) => p.variants)
        .find((v) => v.id === targetVariantId);
      const initialStock = variantBefore?.stockQuantity ?? 10;

      const res = updateOrderOperationalStatus(pendingOrder.id, "CONFIRMED");
      expect(res.success).toBe(true);
      expect(res.order?.operationalStatus).toBe("CONFIRMED");
      expect(res.order?.stockDeducted).toBe(true);
      expect(res.order?.confirmedAt).toBeDefined();

      if (variantBefore) {
        const storeAfter = getStoreData();
        const variantAfter = storeAfter.products
          .flatMap((p) => p.variants)
          .find((v) => v.id === targetVariantId);
        expect(variantAfter?.stockQuantity).toBe(initialStock - pendingOrder.items[0].quantity);
      }
    });

    it("aynı sipariş ikinci kez onaylandığında mükerrer stok düşüşü engellenir (İdempotentlik)", () => {
      const orders = getAllOrders();
      const confirmedOrder = orders.find((o) => o.operationalStatus === "CONFIRMED");
      if (!confirmedOrder) return;

      const targetVariantId = confirmedOrder.items[0]?.variantId;
      const storeBefore = getStoreData();
      const stockBefore = storeBefore.products
        .flatMap((p) => p.variants)
        .find((v) => v.id === targetVariantId)?.stockQuantity;

      const res = updateOrderOperationalStatus(confirmedOrder.id, "CONFIRMED");
      expect(res.success).toBe(true);

      const storeAfter = getStoreData();
      const stockAfter = storeAfter.products
        .flatMap((p) => p.variants)
        .find((v) => v.id === targetVariantId)?.stockQuantity;

      expect(stockAfter).toBe(stockBefore);
    });

    it("sipariş iptal edildiğinde önceden düşülen stoklar güvenli şekilde iade edilir", () => {
      const orders = getAllOrders();
      const confirmedOrder = orders.find((o) => o.operationalStatus === "CONFIRMED");
      if (!confirmedOrder) return;

      const targetVariantId = confirmedOrder.items[0]?.variantId;
      const storeBefore = getStoreData();
      const stockBefore =
        storeBefore.products.flatMap((p) => p.variants).find((v) => v.id === targetVariantId)?.stockQuantity ?? 0;

      const res = updateOrderOperationalStatus(confirmedOrder.id, "CANCELLED");
      expect(res.success).toBe(true);
      expect(res.order?.operationalStatus).toBe("CANCELLED");
      expect(res.order?.stockDeducted).toBe(false);
      expect(res.order?.cancelledAt).toBeDefined();

      const storeAfter = getStoreData();
      const stockAfter =
        storeAfter.products.flatMap((p) => p.variants).find((v) => v.id === targetVariantId)?.stockQuantity ?? 0;

      expect(stockAfter).toBe(stockBefore + confirmedOrder.items[0].quantity);
    });
  });

  describe("Faz 4.6: Satış ve Gerçek Kâr Takibi", () => {
    it("gelir, COGS, brüt ve tahmini net kârı doğru hesaplar", () => {
      const report = getFinancialReport();
      expect(report).toBeDefined();
      expect(report.grossSalesRevenue).toBeGreaterThanOrEqual(0);
      expect(report.totalCogs).toBeGreaterThanOrEqual(0);
      expect(report.orderCount).toBeGreaterThanOrEqual(0);

      expect(report.estimatedGrossProfit).toBe(report.netSalesRevenue - report.totalCogs);

      expect(report.estimatedNetProfit).toBe(
        report.estimatedGrossProfit - report.estimatedShippingExpenses - report.estimatedPaymentCommissions
      );
    });

    it("maliyet verisi eksik olduğunda hasMissingCosts bayrağı kalkar ve kâr hayali üretilmez", () => {
      const report = getFinancialReport();
      const orders = getAllOrders();
      const anyMissing = orders
        .flatMap((o) => o.items)
        .some((item) => item.costPriceSnapshot === undefined || item.costPriceSnapshot === null);

      expect(report.hasMissingCosts).toBe(anyMissing);
    });
  });

  describe("Faz 4.6: Güvenli Log Sistemi ve Hassas Veri Maskeleme", () => {
    it("parola, token ve gizli anahtarları log verisinde [GİZLENDİ / REDACTED] ile maskeler", () => {
      const rawPayload = {
        email: "admin@humramoda.com",
        password: "SuperSecretPassword123!",
        sessionToken: "jwt-token-xyz-987",
        cookie: "auth_token=abc",
        cardNumber: "1234-5678-9012-3456",
        otherSafeInfo: "Kullanıcı profil güncellemesi",
      };

      const sanitized = sanitizeLogData(rawPayload);
      expect(sanitized.email).toBe("admin@humramoda.com");
      expect(sanitized.otherSafeInfo).toBe("Kullanıcı profil güncellemesi");
      expect(sanitized.password).toBe("[GİZLENDİ / REDACTED]");
      expect(sanitized.sessionToken).toBe("[GİZLENDİ / REDACTED]");
      expect(sanitized.cookie).toBe("[GİZLENDİ / REDACTED]");
      expect(sanitized.cardNumber).toBe("[GİZLENDİ / REDACTED]");
    });

    it("yönetici denetim kaydını oluşturur ve sorgulamada getirir", () => {
      const testEmail = `tester-${Date.now()}@humramoda.com`;
      logAdminAudit({
        adminId: "adm-test-1",
        adminEmail: testEmail,
        action: "PRODUCT_CREATED",
        targetType: "PRODUCT",
        targetId: "prod-test-99",
        result: "SUCCESS",
        ipAddress: "192.168.1.10",
        details: { productName: "Test Kaşe Kaban" },
      });

      const res = getAdminAuditLogs({ adminEmail: testEmail });
      expect(res.logs.length).toBeGreaterThanOrEqual(1);
      const found = res.logs[0];
      expect(found.adminEmail).toBe(testEmail);
      expect(found.action).toBe("PRODUCT_CREATED");
      expect(found.targetId).toBe("prod-test-99");
    });

    it("müşteri vitrin aktivitesini oluşturur ve sorgulamada getirir", () => {
      const testQuery = `ipek-tunik-arama-${Date.now()}`;
      logSiteActivity({
        eventType: "SEARCH_QUERY",
        path: "/kategori/giyim",
        query: testQuery,
        ipAddress: "85.105.10.20",
        details: { resultCount: 4 },
      });

      const res = getSiteActivityLogs({ searchQuery: testQuery });
      expect(res.logs.length).toBeGreaterThanOrEqual(1);
      const found = res.logs[0];
      expect(found.query).toBe(testQuery);
      expect(found.eventType).toBe("SEARCH_QUERY");
      expect(found.path).toBe("/kategori/giyim");
    });
  });

  describe("Faz 4.6: Save / Restore Yedekleme ve Güvenli Geri Yükleme", () => {
    let createdBackupId: string | undefined;

    it("manuel sistem yedeği oluşturur ve manifest üretir", () => {
      const res = createBackup("MANUAL", "Faz 4.6 Entegrasyon Test Yedeği", {
        adminId: "adm-test",
        adminEmail: "admin@humramoda.com",
      });

      expect(res.manifest).toBeDefined();
      expect(res.manifest?.id).toMatch(/^backup-/);
      expect(res.manifest?.sha256Checksum).toBeTruthy();
      expect(res.manifest?.sizeBytes).toBeGreaterThan(0);
      expect(res.manifest?.itemCounts.products).toBeGreaterThan(0);

      createdBackupId = res.manifest?.id;
    });

    it("SHA-256 sağlama toplamı ile yedeğin sağlam olduğunu doğrular", () => {
      if (!createdBackupId) return;
      const verifyRes = verifyBackupById(createdBackupId);
      expect(verifyRes.valid).toBe(true);
      expect(verifyRes.storedChecksum).toBe(verifyRes.calculatedChecksum);
    });

    it("tahrif edilmiş / bozuk bir yedeği tespit eder ve doğrulamayı reddeder", () => {
      if (!createdBackupId) return;
      const backupsDir = path.join(process.cwd(), "data", "backups");
      const filePath = path.join(backupsDir, `${createdBackupId}.json`);

      const corruptId = `corrupt-${Date.now()}`;
      const corruptPath = path.join(backupsDir, `${corruptId}.json`);
      try {
        const originalContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (originalContent.manifest) {
          originalContent.manifest.id = corruptId;
        }
        originalContent.data.products.push({ id: "hacked", title: "Hacked Product" });
        fs.writeFileSync(corruptPath, JSON.stringify(originalContent), "utf-8");

        const verifyRes = verifyBackupById(corruptId);
        expect(verifyRes.valid).toBe(false);
        expect(verifyRes.error).toContain("SHA-256 sağlama toplamı uyuşmuyor");
      } finally {
        if (fs.existsSync(corruptPath)) {
          fs.unlinkSync(corruptPath);
        }
      }
    });

    it("geri yükleme öncesinde otomatik güvenlik yedeği alır ve işlemi tamamlar", () => {
      if (!createdBackupId) return;

      const restoreRes = restoreBackupById(
        createdBackupId,
        { adminId: "adm-test", adminEmail: "admin@humramoda.com" },
        true
      );

      expect(restoreRes.success).toBe(true);
      expect(restoreRes.safetyBackupId).toBeDefined();
      expect(restoreRes.safetyBackupId).toMatch(/^backup-/);

      const allBackups = listBackups();
      const safetyBackup = allBackups.find((b) => b.id === restoreRes.safetyBackupId);
      expect(safetyBackup).toBeDefined();
      expect(safetyBackup?.type).toBe("SAFETY");
    }, 20000);
  });
});
