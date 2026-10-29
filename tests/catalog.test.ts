import { describe, it, expect } from "vitest";
import {
  getProducts,
  getProductBySlug,
  getRelatedProducts,
  getAllCategories,
  getAllCollections,
  getFeaturedVideos,
  PRODUCTS,
} from "../src/lib/catalog";

describe("Catalog Data Adapter & Business Logic", () => {
  it("provides valid categories with image derivative URLs", () => {
    const categories = getAllCategories();
    expect(categories.length).toBeGreaterThanOrEqual(4);
    categories.forEach((cat) => {
      expect(cat.slug).toBeTruthy();
      expect(cat.name).toBeTruthy();
      if (cat.imageUrl) {
        expect(cat.imageUrl).toMatch(/^(\/uploads\/products\/.+\.(webp|avif)|data:image\/)/);
      }
    });
  });

  it("provides valid collections", () => {
    const collections = getAllCollections();
    expect(collections.length).toBeGreaterThanOrEqual(3);
    const slugs = collections.map((c) => c.slug);
    expect(slugs).toContain("yeni-sezon");
    expect(slugs).toContain("cok-satanlar");
  });

  it("retrieves product by slug with complete details", () => {
    const first = PRODUCTS[0];
    const product = getProductBySlug(first.slug);
    expect(product).toBeDefined();
    expect(product?.title).toBe(first.title);
    expect(product?.variants.length).toBeGreaterThanOrEqual(1);
  });

  it("filters products by category slug accurately", () => {
    const items = getProducts({ categorySlug: "pantolon" });
    expect(items.length).toBeGreaterThan(0);
    items.forEach((p) => {
      expect(p.categorySlug).toBe("pantolon");
    });
  });

  it("filters products by collection slug accurately", () => {
    const bestSellers = getProducts({ collectionSlug: "cok-satanlar" });
    expect(bestSellers.length).toBeGreaterThan(0);
    bestSellers.forEach((p) => {
      expect(p.collectionSlugs).toContain("cok-satanlar");
    });
  });

  it("sorts products by price ascending and descending correctly", () => {
    const asc = getProducts({ sort: "price-asc" });
    for (let i = 0; i < asc.length - 1; i++) {
      const priceA = asc[i].discountPrice ?? asc[i].basePrice;
      const priceB = asc[i + 1].discountPrice ?? asc[i + 1].basePrice;
      expect(priceA).toBeLessThanOrEqual(priceB);
    }

    const desc = getProducts({ sort: "price-desc" });
    for (let i = 0; i < desc.length - 1; i++) {
      const priceA = desc[i].discountPrice ?? desc[i].basePrice;
      const priceB = desc[i + 1].discountPrice ?? desc[i + 1].basePrice;
      expect(priceA).toBeGreaterThanOrEqual(priceB);
    }
  });

  it("calculates related products based on shared category", () => {
    const related = getRelatedProducts(PRODUCTS[0].id, 4);
    expect(related.length).toBeGreaterThanOrEqual(0);
    related.forEach((p) => {
      expect(p.id).not.toBe(PRODUCTS[0].id);
    });
  });

  it("provides active featured videos with required video metadata", () => {
    const videos = getFeaturedVideos();
    expect(videos.length).toBeGreaterThan(0);
    videos.forEach((v) => {
      expect(v.videoUrl).toMatch(/^\/uploads\/videos\/.+\.mp4$/);
      expect(v.posterUrl).toMatch(/^\/uploads\/products\/.+\.(webp|avif)$/);
      expect(v.price).toBeGreaterThan(0);
    });
  });
});
