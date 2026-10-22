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
        expect(cat.imageUrl).toMatch(/^\/uploads\/products\/.+\.(webp|avif)$/);
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

  it("retrieves product by slug with complete color-specific media", () => {
    const product = getProductBySlug("qapitone-garnili-scuba-ikili-takim");
    expect(product).toBeDefined();
    expect(product?.title).toBe("Qapitone Garnili Scuba İkili Takım");
    expect(product?.colors.length).toBe(2);

    // Her rengin kendine ait görselleri olmalı ve diğer renkle karışmamalı
    const siyahColor = product?.colors.find((c) => c.slug === "siyah");
    const hakiColor = product?.colors.find((c) => c.slug === "haki");

    expect(siyahColor).toBeDefined();
    expect(hakiColor).toBeDefined();

    const siyahMedia = product?.media.filter((m) => m.colorId === siyahColor?.id);
    const hakiMedia = product?.media.filter((m) => m.colorId === hakiColor?.id);

    expect(siyahMedia?.length).toBeGreaterThanOrEqual(3);
    expect(hakiMedia?.length).toBeGreaterThanOrEqual(3);

    // Siyah medya listesinde haki colorId bulunamaz
    siyahMedia?.forEach((m) => {
      expect(m.colorId).toBe(siyahColor?.id);
      expect(m.url).toMatch(/^\/uploads\/products\/.+\.(webp|avif)$/);
    });
  });

  it("filters products by category slug accurately", () => {
    const takimlar = getProducts({ categorySlug: "takim" });
    expect(takimlar.length).toBeGreaterThan(0);
    takimlar.forEach((p) => {
      expect(p.categorySlug).toBe("takim");
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
      const priceA = asc[i].discountPrice || asc[i].basePrice;
      const priceB = asc[i + 1].discountPrice || asc[i + 1].basePrice;
      expect(priceA).toBeLessThanOrEqual(priceB);
    }

    const desc = getProducts({ sort: "price-desc" });
    for (let i = 0; i < desc.length - 1; i++) {
      const priceA = desc[i].discountPrice || desc[i].basePrice;
      const priceB = desc[i + 1].discountPrice || desc[i + 1].basePrice;
      expect(priceA).toBeGreaterThanOrEqual(priceB);
    }
  });

  it("searches products by query string matching title or description or color", () => {
    const searchScuba = getProducts({ query: "scuba" });
    expect(searchScuba.length).toBeGreaterThan(0);
    expect(searchScuba.some((p) => p.slug.includes("scuba"))).toBe(true);

    const searchBordo = getProducts({ query: "bordo" });
    expect(searchBordo.length).toBeGreaterThan(0);
    expect(searchBordo.some((p) => p.colors.some((c) => c.name.toLowerCase().includes("bordo")))).toBe(true);

    const searchNone = getProducts({ query: "nonexistentdressxyz" });
    expect(searchNone.length).toBe(0);
  });

  it("returns related products excluding the current product", () => {
    const firstProduct = PRODUCTS[0];
    const related = getRelatedProducts(firstProduct.id, 3);
    expect(related.length).toBeLessThanOrEqual(3);
    expect(related.some((p) => p.id === firstProduct.id)).toBe(false);
  });

  it("provides vertical fashion look videos backed by real files", () => {
    const videos = getFeaturedVideos();
    expect(videos.length).toBe(2);
    videos.forEach((vid) => {
      expect(vid.videoUrl).toMatch(/^\/uploads\/videos\/.+\.mp4$/);
      expect(vid.posterUrl).toMatch(/^\/uploads\/products\/.+\.webp$/);
      expect(vid.productSlug).toBeTruthy();
    });
  });
});
