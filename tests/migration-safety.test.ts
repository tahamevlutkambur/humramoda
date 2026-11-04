import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getStoreData } from "../src/lib/server/store";
import { runMigration } from "../scripts/migrate-store-to-postgres";

describe("PostgreSQL Migration & Backup Safety Engine", () => {
  it("preserves source data/store.json integrity before and after migration attempt", async () => {
    const dataDir = path.join(process.cwd(), "data");
    const storePath = path.join(dataDir, "store.json");

    expect(fs.existsSync(storePath)).toBe(true);
    const initialContent = fs.readFileSync(storePath, "utf-8");
    const initialData = getStoreData();

    // Mevcut JSON'da yinelenen varyant kombinasyonları var. Aktarım ön
    // doğrulaması bu tutarsızlıkta veritabanına hiç yazmamalı.
    const result = await runMigration();

    expect(result.success).toBe(false);
    expect(result.message).toContain("tutarsızlık");

    // Kaynak dosya içeriğinin harfiyen korunduğunu doğrula
    const afterContent = fs.readFileSync(storePath, "utf-8");
    expect(afterContent).toBe(initialContent);

    // Veri yapısının sağlamlığını teyit et
    const afterData = getStoreData();
    expect(afterData.products.length).toBe(initialData.products.length);
    expect(afterData.categories.length).toBe(initialData.categories.length);
    expect(afterData.collections.length).toBe(initialData.collections.length);
  });

  it("creates timestamped backups in data/backups directory", async () => {
    const backupDir = path.join(process.cwd(), "data", "backups");
    if (fs.existsSync(backupDir)) {
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => (f.startsWith("store-backup-") || f.startsWith("backup-")) && f.endsWith(".json"));
      // En az 1 yedek dosyası oluşmuş olmalıdır
      expect(files.length).toBeGreaterThanOrEqual(1);

      const latestBackup = path.join(backupDir, files[files.length - 1]);
      const raw = fs.readFileSync(latestBackup, "utf-8");
      const parsed = JSON.parse(raw);
      const products = parsed.data?.products || parsed.products;
      const categories = parsed.data?.categories || parsed.categories;
      expect(products).toBeDefined();
      expect(categories).toBeDefined();
    }
  });

  it("ensures all products in store have valid SKU, non-negative stock, and consistent prices", () => {
    const store = getStoreData();
    const seenSkus = new Set<string>();

    for (const product of store.products) {
      expect(product.title.trim().length).toBeGreaterThan(0);
      expect(product.slug.trim().length).toBeGreaterThan(0);
      expect(product.basePrice).toBeGreaterThan(0);

      if (product.discountPrice !== undefined && product.discountPrice !== null) {
        expect(product.discountPrice).toBeLessThan(product.basePrice);
      }

      for (const variant of product.variants || []) {
        expect(variant.sku).toBeTruthy();
        expect(seenSkus.has(variant.sku)).toBe(false);
        seenSkus.add(variant.sku);
        expect(variant.stockQuantity).toBeGreaterThanOrEqual(0);
      }

      for (const media of product.media || []) {
        expect(media.url).toBeTruthy();
        if (media.colorId) {
          const colorExists = product.colors.some((c) => c.id === media.colorId);
          expect(colorExists).toBe(true);
        }
      }
    }
  });
});
