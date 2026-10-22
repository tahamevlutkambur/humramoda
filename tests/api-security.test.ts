import { describe, it, expect } from "vitest";
import { POST as createProductApi } from "../src/app/api/admin/products/route";
import { PUT as updateProductApi, DELETE as deleteProductApi } from "../src/app/api/admin/products/[id]/route";
import { POST as createCategoryApi } from "../src/app/api/admin/categories/route";
import { POST as createCollectionApi } from "../src/app/api/admin/collections/route";
import { PUT as updateContentApi } from "../src/app/api/admin/content/route";
import { PUT as updateSettingsApi } from "../src/app/api/admin/settings/route";
import { POST as createCampaignApi } from "../src/app/api/admin/campaigns/route";
import { POST as uploadMediaApi } from "../src/app/api/admin/media/upload/route";

describe("Admin API Route Security & Authorization Guards", () => {
  it("rejects unauthorized POST to /api/admin/products with 401", async () => {
    const req = new Request("http://localhost:3000/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Yetkisiz Ürün" }),
    });

    const res = await createProductApi(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Yetkisiz");
  });

  it("rejects unauthorized PUT and DELETE to /api/admin/products/[id] with 401", async () => {
    const reqPut = new Request("http://localhost:3000/api/admin/products/prod-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basePrice: 9999 }),
    });
    const resPut = await updateProductApi(reqPut, { params: Promise.resolve({ id: "prod-1" }) });
    expect(resPut.status).toBe(401);

    const reqDel = new Request("http://localhost:3000/api/admin/products/prod-1", {
      method: "DELETE",
    });
    const resDel = await deleteProductApi(reqDel, { params: Promise.resolve({ id: "prod-1" }) });
    expect(resDel.status).toBe(401);
  });

  it("rejects unauthorized category, collection, content and settings mutations with 401", async () => {
    const reqCat = new Request("http://localhost:3000/api/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Yetkisiz Kategori" }),
    });
    expect((await createCategoryApi(reqCat)).status).toBe(401);

    const reqCol = new Request("http://localhost:3000/api/admin/collections", {
      method: "POST",
      body: JSON.stringify({ name: "Yetkisiz Koleksiyon" }),
    });
    expect((await createCollectionApi(reqCol)).status).toBe(401);

    const reqContent = new Request("http://localhost:3000/api/admin/content", {
      method: "PUT",
      body: JSON.stringify({ hero: { title: "Hacklendi" } }),
    });
    expect((await updateContentApi(reqContent)).status).toBe(401);

    const reqSettings = new Request("http://localhost:3000/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ freeShippingThreshold: 0 }),
    });
    expect((await updateSettingsApi(reqSettings)).status).toBe(401);

    const reqCamp = new Request("http://localhost:3000/api/admin/campaigns", {
      method: "POST",
      body: JSON.stringify({ code: "BEDAVA" }),
    });
    expect((await createCampaignApi(reqCamp)).status).toBe(401);
  });

  it("rejects unauthorized file uploads with 401", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["fake-image-content"], { type: "image/jpeg" }), "test.jpg");

    const req = new Request("http://localhost:3000/api/admin/media/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadMediaApi(req);
    expect(res.status).toBe(401);
  });

  it("safely sanitizes open redirect attempts", () => {
    function sanitize(target: string | null): string {
      if (!target) return "/admin";
      const trimmed = target.trim();
      if (
        !trimmed.startsWith("/") ||
        trimmed.startsWith("//") ||
        trimmed.includes("\\") ||
        trimmed.includes(":")
      ) {
        return "/admin";
      }
      return trimmed;
    }

    // Zararlı yönlendirmeler varsayılan /admin rotasına çekilmelidir
    expect(sanitize("https://evil.com")).toBe("/admin");
    expect(sanitize("http://attacker.com/steal")).toBe("/admin");
    expect(sanitize("//evil.com")).toBe("/admin");
    expect(sanitize("javascript:alert(1)")).toBe("/admin");
    expect(sanitize("/\\evil.com")).toBe("/admin");

    // Geçerli yerel admin rotaları korunmalıdır
    expect(sanitize("/admin")).toBe("/admin");
    expect(sanitize("/admin/urunler")).toBe("/admin/urunler");
    expect(sanitize("/admin/urunler/yeni")).toBe("/admin/urunler/yeni");
  });
});
