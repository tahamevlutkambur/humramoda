import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  analyzeMigrationPlan,
  readAndVerifyStore,
  EXPECTED_BASELINE_HASH,
} from "../scripts/migrate-json-to-pg";

const STORE_PATH = path.resolve("data/store.json");
let baselineStoreJson: string = "";

function computeStoreHash(): string {
  const content = fs.readFileSync(STORE_PATH);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

describe("FAZ 7.9: PostgreSQL Şema Hazırlığı, Veri Eşleştirme ve Aktarım Provası Test Paketi", () => {
  beforeAll(() => {
    if (fs.existsSync(STORE_PATH)) {
      baselineStoreJson = fs.readFileSync(STORE_PATH, "utf8");
    }
  });

  afterAll(() => {
    // Veri bütünlüğü koruması: test sonrasında dosyanın orijinal hali güvenceye alınır
    if (baselineStoreJson && fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, baselineStoreJson, "utf8");
    }
  });

  // 1. VERİ KAYNAĞI VE HASH BÜTÜNLÜĞÜ
  describe("1. Veri Kaynağı ve SHA256 Bütünlük Denetimi", () => {
    it("1.1. data/store.json dosyasının SHA256 hash değeri beklenen başlangıç hash'i ile birebir eşleşmelidir", () => {
      const currentHash = computeStoreHash();
      expect(currentHash).toBe(EXPECTED_BASELINE_HASH);
    });

    it("1.2. readAndVerifyStore fonksiyonu geçerli buffer, parse edilmiş JSON ve isHashValid=true dönmelidir", () => {
      const res = readAndVerifyStore(STORE_PATH);
      expect(res.isHashValid).toBe(true);
      expect(res.sha256).toBe(EXPECTED_BASELINE_HASH);
      expect(Array.isArray(res.store.products)).toBe(true);
    });
  });

  // 2. KAYIT SAYILARI VE VARLIK EŞLEŞTİRMELERİ
  describe("2. JSON Kayıt Sayıları ve Varlık Doğrulaması", () => {
    it("2.1. Tüm temel varlık sayıları hedeflenen sayılarla tam eşleşmelidir", () => {
      const plan = analyzeMigrationPlan(STORE_PATH);
      expect(plan.entityCounts.products).toBe(13);
      expect(plan.entityCounts.colors).toBe(36);
      expect(plan.entityCounts.sizes).toBe(37);
      expect(plan.entityCounts.variants).toBe(118);
      expect(plan.entityCounts.media).toBe(24);
      expect(plan.entityCounts.categories).toBe(7);
      expect(plan.entityCounts.collections).toBe(3);
      expect(plan.entityCounts.adminUsers).toBe(4);
      expect(plan.entityCounts.campaigns).toBe(1);
      expect(plan.entityCounts.notifications).toBe(58);
      expect(plan.entityCounts.auditLogs).toBe(47);
      expect(plan.entityCounts.featuredVideos).toBe(2);
      expect(plan.entityCounts.settings).toBe(20);
    });
  });

  // 3. BETÜL TRENÇKOT VE VARYANT KORUMASI
  describe("3. Betül Trençkot Varyant ve Stok Koruma Denetimi", () => {
    it("3.1. Betül Trençkot'un 10 varyantı, 100 toplam stoku ve 2 mükerrer kombinasyonu doğrulanmalıdır", () => {
      const plan = analyzeMigrationPlan(STORE_PATH);
      const b = plan.betulTrenckotCheck;
      expect(b.productId).toBe("prod-1793185888547");
      expect(b.variantCount).toBe(10);
      expect(b.totalStock).toBe(100);
      expect(b.distinctSkus).toBe(10);
      expect(b.duplicateCombinations.length).toBe(2);
      expect(b.status).toBe("PASS");
    });
  });

  // 4. SKU BENZERSİZLİK ANALİZİ
  describe("4. SKU Benzersizlik Denetimi", () => {
    it("4.1. Tüm 118 varyantın SKU değerleri benzersiz olmalı, mükerrer SKU bulunmamalıdır", () => {
      const plan = analyzeMigrationPlan(STORE_PATH);
      expect(plan.skuUniquenessCheck.totalVariants).toBe(118);
      expect(plan.skuUniquenessCheck.totalUniqueSkus).toBe(118);
      expect(plan.skuUniquenessCheck.duplicateSkus.length).toBe(0);
      expect(plan.skuUniquenessCheck.status).toBe("PASS");
    });
  });

  // 5. 58 ESKİ BİLDİRİM VE LEGACY ORDER İLİŞKİSİ
  describe("5. 58 Bildirim ve Legacy Order İlişki Tasarımı", () => {
    it("5.1. 58 eski bildirimin tamamı korunmalı ve legacyOrderId ile ilişkilendirilmelidir", () => {
      const plan = analyzeMigrationPlan(STORE_PATH);
      expect(plan.notificationsCheck.totalNotifications).toBe(58);
      expect(plan.notificationsCheck.notificationsWithLegacyOrder).toBe(58);
      expect(plan.notificationsCheck.status).toBe("PASS");
    });
  });

  // 6. KULLANICI ROLLERİ VE CARRIER ENUM KORUMASI
  describe("6. Kullanıcı Rolleri ve CARRIER Doğrulaması", () => {
    it("6.1. CARRIER ve ADMIN rolleri mevcut JSON'da bulunmalı ve şemada desteklenmelidir", () => {
      const plan = analyzeMigrationPlan(STORE_PATH);
      expect(plan.userRoleCheck.hasCarrier).toBe(true);
      expect(plan.userRoleCheck.hasAdmin).toBe(true);
      expect(plan.userRoleCheck.rolesFound).toContain("CARRIER");
      expect(plan.userRoleCheck.status).toBe("PASS");
    });
  });

  // 7. İLİŞKİ VE FOREIGN KEY ANALİZİ
  describe("7. Foreign Key ve Referans Doğrulaması", () => {
    it("7.1. Kategori, Ürün, Renk, Beden ve Medya arası tüm ilişkiler geçerli olmalıdır", () => {
      const plan = analyzeMigrationPlan(STORE_PATH);
      expect(plan.foreignKeyAnalysis.categoryParentsValid).toBe(true);
      expect(plan.foreignKeyAnalysis.productCategoriesValid).toBe(true);
      expect(plan.foreignKeyAnalysis.variantColorsValid).toBe(true);
      expect(plan.foreignKeyAnalysis.variantSizesValid).toBe(true);
      expect(plan.foreignKeyAnalysis.mediaColorsValid).toBe(true);
      expect(plan.foreignKeyAnalysis.issuesFound.length).toBe(0);
    });
  });

  // 8. PRISMA SCHEMA VALİDASYON KONTROLÜ
  describe("8. Prisma Schema Şeması Uyumluluk Kontrolü", () => {
    it("8.1. prisma/schema.prisma dosyası UserRole.CARRIER, FeaturedVideo, AuditLog ve SiteActivity modellerini içermelidir", () => {
      const schemaContent = fs.readFileSync(path.resolve("prisma/schema.prisma"), "utf8");
      expect(schemaContent).toContain("CARRIER");
      expect(schemaContent).toContain("model FeaturedVideo");
      expect(schemaContent).toContain("model AuditLog");
      expect(schemaContent).toContain("model SiteActivity");
      expect(schemaContent).toContain("model PasswordResetToken");
      expect(schemaContent).toContain("legacyOrderId");
      expect(schemaContent).toContain("requestType");
      expect(schemaContent).toContain("exchangeDetails");
    });

    it("8.2. ProductVariant modelinde @@unique([productId, colorId, sizeId]) kısıtı kaldırılmış olmalıdır", () => {
      const schemaContent = fs.readFileSync(path.resolve("prisma/schema.prisma"), "utf8");
      expect(schemaContent).not.toContain("@@unique([productId, colorId, sizeId])");
      expect(schemaContent).toContain("@@index([productId, colorId, sizeId])");
    });
  });
});

