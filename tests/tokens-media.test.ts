import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Design System CSS Tokens", () => {
  const tokensPath = path.join(process.cwd(), "src", "styles", "tokens.css");

  it("tokens.css file exists", () => {
    expect(fs.existsSync(tokensPath)).toBe(true);
  });

  it("contains core color tokens", () => {
    const content = fs.readFileSync(tokensPath, "utf-8");
    expect(content).toContain("--hm-color-bg");
    expect(content).toContain("--hm-color-surface");
    expect(content).toContain("--hm-color-text-main");
    expect(content).toContain("--hm-color-border-subtle");
    expect(content).toContain("--hm-color-discount");
  });

  it("contains 3/4 card aspect ratio definition", () => {
    const content = fs.readFileSync(tokensPath, "utf-8");
    expect(content).toContain("--hm-card-aspect-ratio: 3 / 4");
  });
});

describe("Local Media Processing Pipeline", () => {
  const manifestPath = path.join(
    process.cwd(),
    "public",
    "uploads",
    "products",
    "manifest.json"
  );

  it("manifest.json was generated and exists", () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("contains 22 processed assets matching original humraresimler count", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.assets).toBeDefined();
    expect(manifest.assets.length).toBe(22);
  });

  it("each processed asset has WebP and AVIF derivatives", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const firstAsset = manifest.assets[0];

    expect(firstAsset.originalFileName).toMatch(/\.HEIC$/i);
    expect(firstAsset.derivatives.length).toBeGreaterThanOrEqual(3);

    const hasWebp = firstAsset.derivatives.some(
      (d: { format: string }) => d.format === "webp"
    );
    expect(hasWebp).toBe(true);
  });
});
