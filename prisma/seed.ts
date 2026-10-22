import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("==================================================");
  console.log("Hümra Moda — Veritabanı Tohumlama (Seed Workflow)");
  console.log("==================================================");

  // 1. Temel Mağaza Ayarları
  console.log("\n[1/4] Temel mağaza ayarları kaydediliyor...");
  const defaultSettings = [
    {
      key: "site_title",
      value: "Hümra Moda — Zamansız Kadın Giyim & Modern Tesettür",
      description: "Mağaza genel başlığı ve SEO etiketi",
    },
    {
      key: "free_shipping_threshold",
      value: "3500.00",
      description: "Ücretsiz kargo barajı (TL)",
    },
    {
      key: "default_shipping_fee",
      value: "95.00",
      description: "Varsayılan kargo gönderim bedeli (TL)",
    },
    {
      key: "whatsapp_support_number",
      value: "05000000000",
      description: "WhatsApp sipariş ve destek hattı (İnceleme bekliyor)",
    },
    {
      key: "contact_email",
      value: "info@humramoda.com",
      description: "Resmi iletişim e-posta adresi",
    },
  ];

  for (const s of defaultSettings) {
    await prisma.storeSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log(`  ✔ ${defaultSettings.length} mağaza ayarı doğrulandı.`);

  // 2. Temel Kategori Ağacı
  console.log("\n[2/4] Temel kategoriler yapılandırılıyor...");
  const categories = [
    {
      name: "Yeni Koleksiyon",
      slug: "yeni-koleksiyon",
      description: "En son sezon parçaları ve öne çıkan tasarımlar",
      displayOrder: 1,
    },
    {
      name: "İkili & Üçlü Takım",
      slug: "takim",
      description: "Modern kalıplı şardonlu ve scuba takımlar",
      displayOrder: 2,
    },
    {
      name: "Dış Giyim",
      slug: "dis-giyim",
      description: "Kaban, trençkot ve mevsimlik ceketler",
      displayOrder: 3,
    },
    {
      name: "Elbise",
      slug: "elbise",
      description: "Zarif kesimli günlük ve davet elbiseleri",
      displayOrder: 4,
    },
  ];

  const categoryMap = new Map<string, string>();
  for (const cat of categories) {
    const record = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        displayOrder: cat.displayOrder,
      },
    });
    categoryMap.set(cat.slug, record.id);
  }
  console.log(`  ✔ ${categories.length} kategori doğrulandı.`);

  // 3. Medya Manifesti Kontrolü ve Gerçek Varlıkların Taslak Olarak Kaydı
  console.log("\n[3/4] İşlenmiş gerçek görsel varlıkları kontrol ediliyor...");
  const manifestPath = path.join(process.cwd(), "public", "uploads", "products", "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    console.log("  [BİLGİ] Medya manifesti bulunamadı. Lütfen önce 'npm run media:process' çalıştırınız.");
    console.log("  Uygulama seed verisi olmadan da başarıyla çalışacak şekilde tasarlanmıştır.");
  } else {
    const rawManifest = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(rawManifest);
    const assets = manifest.assets || [];

    console.log(`  Toplam ${assets.length} işlenmiş görsel kaydı tespit edildi.`);

    // Gerçek çekim görselleri için taslak ürün grubu oluştur (Fiyat/stok uydurmadan!)
    const draftCategory = categoryMap.get("yeni-koleksiyon") || Array.from(categoryMap.values())[0];

    const draftProductSlug = "taslak-koleksiyon-cekimi-2026";
    const draftProduct = await prisma.product.upsert({
      where: { slug: draftProductSlug },
      update: {},
      create: {
        title: "Taslak Ürün — İlk Çekim Kataloğu (İnceleme Bekliyor)",
        slug: draftProductSlug,
        description:
          "humraresimler/ dizinindeki 22 adet gerçek çekim fotoğrafı sisteme başarıyla aktarılmıştır. Bu kayıt admin panelinde onaylanmak üzere taslak olarak tutulmaktadır. Kesin başlık, renk eşleşmesi, beden matrisi ve satış fiyatı panel üzerinden belirlenecektir.",
        basePrice: 0,
        categoryId: draftCategory,
        isActive: false, // Canlı vitrine çıkmasın
        isDraft: true,  // Taslak bayrağı
        badge: "TASLAK ÇEKİM",
      },
    });

    // Medyaları taslak ürüne bağla
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const mainDerivative =
        asset.derivatives.find((d: { size: string; format: string }) => d.size === "detail" && d.format === "webp") ||
        asset.derivatives[0];
      const thumbDerivative =
        asset.derivatives.find((d: { size: string; format: string }) => d.size === "thumb" && d.format === "webp") ||
        asset.derivatives[0];

      if (mainDerivative) {
        // Zaten ekli mi?
        const existingMedia = await prisma.productMedia.findFirst({
          where: {
            productId: draftProduct.id,
            url: mainDerivative.url,
          },
        });

        if (!existingMedia) {
          await prisma.productMedia.create({
            data: {
              productId: draftProduct.id,
              type: "IMAGE",
              url: mainDerivative.url,
              thumbnailUrl: thumbDerivative ? thumbDerivative.url : null,
              altText: `Hümra Moda Çekim Görseli — ${asset.baseName}`,
              displayOrder: i + 1,
              isThumbnail: i === 0,
            },
          });
        }
      }
    }

    console.log(`  ✔ Gerçek çekim medyaları ${draftProduct.title} altına bağlandı.`);
  }

  // 4. humravideolar Klasöründeki Videoların Taranması
  console.log("\n[4/4] humravideolar/ dizini kontrol ediliyor...");
  const videoDir = path.join(process.cwd(), "humravideolar");
  if (fs.existsSync(videoDir)) {
    const videoFiles = fs.readdirSync(videoDir).filter((f) => f.endsWith(".mp4"));
    console.log(`  Toplam ${videoFiles.length} adet moda videosu tespit edildi.`);
  } else {
    console.log("  [BİLGİ] humravideolar dizini mevcut değil.");
  }

  console.log("\n==================================================");
  console.log("Tohumlama Başarıyla Tamamlandı.");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.warn("\n[UYARI] Veritabanı tohumlama adımı gerçekleştirilemedi:");
    console.warn((e as Error).message);
    console.warn("\nBu durum yerel PostgreSQL veritabanının henüz yapılandırılmamış veya");
    console.warn("çalışmıyor olmasından kaynaklanabilir. Uygulama veritabanı olmadan da");
    console.warn("derlenebilir ve statik modda çalışabilir.");
    process.exit(0); // Derlemeyi veya kurulumu kırmaması için 0 ile çıkış
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
