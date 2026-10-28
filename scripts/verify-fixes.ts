import {
  createStoreCategory,
  deleteStoreCategory,
  getAllStoreCategories,
  createStoreProduct,
  updateStoreProduct,
  getStoreProductById,
  deleteStoreProduct,
  getStoreData,
  saveStoreData,
} from "../src/lib/server/store";

async function main() {
  console.log("=== 1. KATEGORİ EKLEME & SİLME DOĞRULAMASI ===");
  const catRes = createStoreCategory({ name: "Deneme", description: "Test açıklaması" });
  console.log("Kategori eklendi:", catRes.category?.name, "ID:", catRes.category?.id, "Slug:", catRes.category?.slug);
  if (!catRes.category) throw new Error("Kategori oluşturulamadı!");

  const delCatId = deleteStoreCategory(catRes.category.id);
  console.log("Kategori ID ile silindi:", delCatId);
  if (!delCatId) throw new Error("Kategori ID ile silinemedi!");

  const catRes2 = createStoreCategory({ name: "Deneme 2" });
  console.log("İkinci kategori eklendi:", catRes2.category?.name);
  const delCatName = deleteStoreCategory("Deneme 2");
  console.log("Kategori adıyla silindi:", delCatName);
  if (!delCatName) throw new Error("Kategori adıyla silinemedi!");

  console.log("\n=== 2. ÜRÜN OLUŞTURMA & DÜZENLEME (404 ENGELLEME) DOĞRULAMASI ===");
  const prodRes = createStoreProduct({
    title: "Özel Deneme Kaban",
    basePrice: 2450,
    categorySlug: "dis-giyim",
    description: "Kusursuz kalıp, pamuklu gabardin kumaş.",
    colors: [{ name: "Taş Rengi", colorCode: "#C8B89C" }],
    sizes: ["1 Beden", "2 Beden"],
    variants: [
      { colorName: "Taş Rengi", sizeName: "1 Beden", sku: "HM-TEST-TAS-B1", stockQuantity: 15 },
      { colorName: "Taş Rengi", sizeName: "2 Beden", sku: "HM-TEST-TAS-B2", stockQuantity: 8 },
    ],
  });
  console.log("Ürün eklendi:", prodRes.product?.title, "ID:", prodRes.product?.id, "Slug:", prodRes.product?.slug);
  if (!prodRes.product) throw new Error("Ürün oluşturulamadı!");

  const foundById = getStoreProductById(prodRes.product.id);
  console.log("Ürün ID ile bulundu (404 Yok):", foundById?.title);
  if (!foundById) throw new Error("Ürün ID ile bulunamadı (404)!");

  const foundBySlug = getStoreProductById(prodRes.product.slug);
  console.log("Ürün Slug ile bulundu:", foundBySlug?.title);
  if (!foundBySlug) throw new Error("Ürün slug ile bulunamadı!");

  const updateRes = updateStoreProduct(prodRes.product.id, {
    title: "Özel Deneme Kaban — Revize Edildi",
    basePrice: 2650,
  });
  console.log("Ürün başarıyla güncellendi:", updateRes.product?.title, "Yeni Fiyat:", updateRes.product?.basePrice);
  if (updateRes.product?.title !== "Özel Deneme Kaban — Revize Edildi") throw new Error("Ürün güncellenemedi!");

  const delProd = deleteStoreProduct(prodRes.product.id);
  console.log("Ürün silindi:", delProd);
  if (!delProd) throw new Error("Ürün silinemedi!");

  console.log("\n=== 3. SİTE TEMİZLİĞİ: BÜTÜN ÜRÜNLERİ SİLME ===");
  const store = getStoreData();
  store.products = [];
  store.orders = [];
  saveStoreData(store);
  console.log("Mağazadaki aktif ürün sayısı:", store.products.length);
  console.log("Mağazadaki aktif sipariş sayısı:", store.orders.length);
  console.log("Mevcut kategoriler:", store.categories.map((c) => c.name).join(", "));

  console.log("\n>>> TÜM DOĞRULAMALAR EKSİKSİZ VE BAŞARIYLA TAMAMLANDI! <<<");
}

main().catch((err) => {
  console.error("Doğrulama hatası:", err);
  process.exit(1);
});
