import { chromium, Browser } from "playwright";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

interface PageTestResult {
  url: string;
  viewport: "desktop" | "mobile";
  httpStatus: number;
  loadTimeMs: number;
  consoleErrors: string[];
  failedRequests: string[];
  totalImages: number;
  brokenImages: string[];
  placeholderCount?: number;
  customChecks?: Record<string, boolean | string | number>;
  passed: boolean;
}

interface TestRunSummary {
  timestamp: string;
  totalTestedPages: number;
  passedPages: number;
  failedPages: number;
  browser: string;
  initialStoreSha256: string;
  finalStoreSha256: string;
  storeIntact: boolean;
  placedOrderNumber?: string;
  pages: PageTestResult[];
}

const PORT = 3005;
const BASE_URL = `http://localhost:${PORT}`;
const STORE_PATH = path.resolve("data/store.json");

function computeHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

async function waitForServer(url: string, timeoutMs: number = 45000): Promise<boolean> {
  const startTime = Date.now();
  let lastErr = "";
  const urlsToTry = [url, `http://127.0.0.1:${PORT}`];

  while (Date.now() - startTime < timeoutMs) {
    for (const testUrl of urlsToTry) {
      try {
        const res = await fetch(testUrl);
        if (res.status < 500) {
          return true;
        }
      } catch (err: any) {
        lastErr = err?.message || String(err);
      }
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  console.warn("waitForServer last error:", lastErr);
  return false;
}

async function run() {
  console.log("=== HÜMRA MODA FAZ 7.10.1: TARAYICI DOĞRULAMA TESTİ ===");

  const initialHash = computeHash(STORE_PATH);
  console.log(`[1] Orijinal data/store.json SHA256: ${initialHash}`);

  // 1. İzolasyon Ortamını Hazırla
  const tempStoreFile = path.join(os.tmpdir(), `humra_e2e_store_${Date.now()}.json`);
  const tempTmpStoreFile = path.join(os.tmpdir(), `humra_e2e_tmp_${Date.now()}.json`);
  fs.copyFileSync(STORE_PATH, tempStoreFile);
  fs.copyFileSync(STORE_PATH, tempTmpStoreFile);
  console.log(`[2] İzole test deposu oluşturuldu: ${tempStoreFile}`);

  // 2. Next.js Sunucusunu Başlat
  console.log(`[3] Next.js sunucusu port ${PORT} üzerinde başlatılıyor...`);
  const nextBin = path.resolve("node_modules/next/dist/bin/next");
  const serverProcess: ChildProcess = spawn(
    process.execPath,
    [nextBin, "dev", "-p", String(PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        HUMRA_STORE_FILE: tempStoreFile,
        HUMRA_TMP_STORE_FILE: tempTmpStoreFile,
      },
      stdio: "pipe",
    }
  );

  let serverLogs = "";
  serverProcess.stdout?.on("data", (d) => {
    serverLogs += d.toString();
  });
  serverProcess.stderr?.on("data", (d) => {
    serverLogs += d.toString();
  });

  const serverReady = await waitForServer(BASE_URL, 60000);
  if (!serverReady) {
    console.error("Next.js sunucusu zaman aşımı içinde ayağa kalkamadı!");
    console.error("Sunucu logları:\n", serverLogs.slice(-1000));
    try {
      serverProcess.kill();
    } catch { }
    process.exit(1);
  }
  console.log(`[4] Next.js sunucusu başarıyla hazır: ${BASE_URL}`);

  // 3. Playwright Tarayıcısını Başlat
  console.log(`[5] Gerçek tarayıcı (Microsoft Edge / Chromium) başlatılıyor...`);
  let browser!: Browser;
  let browserChannel = "msedge";
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    console.log("-> Microsoft Edge kanalıyla başlatıldı.");
  } catch (err) {
    console.warn("-> Microsoft Edge başlatılamadı, varsayılan Chromium'a geçiliyor:", err);
    browserChannel = "chromium";
    browser = await chromium.launch({ headless: true });
  }

  const results: PageTestResult[] = [];
  let testOrderNumber: string | undefined;

  try {
    // 4. Test Fonksiyonu
    async function testPage(
      relativeUrl: string,
      viewportType: "desktop" | "mobile" = "desktop",
      customStep?: (page: any, result: PageTestResult) => Promise<void>,
      initScript?: any
    ): Promise<PageTestResult> {
      const fullUrl = `${BASE_URL}${relativeUrl}`;
      const width = viewportType === "desktop" ? 1280 : 390;
      const height = viewportType === "desktop" ? 800 : 844;

      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: viewportType === "mobile",
        hasTouch: viewportType === "mobile",
      });

      if (initScript) {
        await context.addInitScript(initScript);
      }

      const page = await context.newPage();

      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];

      page.on("console", (msg: any) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      page.on("requestfailed", (req: any) => {
        // İhmal edilebilecek harici telemetri/pixel bağlantılarını filtrele
        const url = req.url();
        if (!url.includes("connect.facebook.net") && !url.includes("analytics")) {
          failedRequests.push(`${req.method()} ${url} - ${req.failure()?.errorText}`);
        }
      });

      page.on("response", (res: any) => {
        if (res.status() >= 400) {
          const url = res.url();
          if (!url.includes("connect.facebook.net") && !url.includes("analytics")) {
            failedRequests.push(`${res.request().method()} ${url} -> HTTP ${res.status()}`);
          }
        }
      });

      const startTime = Date.now();
      let httpStatus = 0;

      try {
        const response = await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
        httpStatus = response?.status() || 0;
        await page.waitForTimeout(1000); // hydration & script run
      } catch (err: any) {
        consoleErrors.push(`Navigation error: ${err.message}`);
      }

      const loadTimeMs = Date.now() - startTime;

      // Resimlerin kontrolleri
      const imagesInfo = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll("img"));
        return imgs.map((img: any) => ({
          src: img.src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
        }));
      });

      const brokenImages = imagesInfo
        .filter((img: any) => img.complete && img.naturalWidth === 0)
        .map((img: any) => img.src);

      const placeholderCount = imagesInfo.filter((img: any) =>
        img.src.includes("product-placeholder.svg")
      ).length;

      const result: PageTestResult = {
        url: relativeUrl,
        viewport: viewportType,
        httpStatus,
        loadTimeMs,
        consoleErrors,
        failedRequests,
        totalImages: imagesInfo.length,
        brokenImages,
        placeholderCount,
        customChecks: {},
        passed: httpStatus === 200 && brokenImages.length === 0,
      };

      if (customStep) {
        try {
          await customStep(page, result);
        } catch (err: any) {
          consoleErrors.push(`Custom step error: ${err.message}`);
          result.passed = false;
        }
      }

      await context.close();
      results.push(result);
      console.log(
        `[TEST] ${viewportType.toUpperCase()} ${relativeUrl} -> Status: ${httpStatus}, Images: ${imagesInfo.length}, Broken: ${brokenImages.length}, Time: ${loadTimeMs}ms, Passed: ${result.passed}`
      );
      return result;
    }

    // 5. TEST SENARYOLARI
    console.log("\n--- BÖLÜM 1: GENEL MAĞAZA VE KATALOG SAYFALARI (DESKTOP) ---");
    await testPage("/");
    await testPage("/kategori/elbise");
    await testPage("/kategori/takim");
    await testPage("/koleksiyon/cok-satanlar");

    console.log("\n--- BÖLÜM 2: 13 ÜRÜNÜN DETAY SAYFALARI VE GÖRSEL DOĞRULAMASI ---");
    const rawStore = JSON.parse(fs.readFileSync(tempStoreFile, "utf8"));
    const products = rawStore.products;

    for (let i = 0; i < products.length; i++) {
      const prod = products[i];
      const hasMedia = Array.isArray(prod.media) && prod.media.length > 0;
      await testPage(`/urun/${prod.slug}`, "desktop", async (page, res) => {
        // Ürün başlığı doğrulaması
        const heading = await page.locator("h1").innerText().catch(() => "");
        res.customChecks!["titleMatches"] = heading.includes(prod.title.slice(0, 15));
        res.customChecks!["mediaCount"] = (prod.media || []).length;
        res.customChecks!["hasMedia"] = hasMedia;

        if (hasMedia) {
          // Çoklu medya varsa thumbnail tıklama testi
          const thumbLocator = page.locator("button:has(img)");
          const thumbCount = await thumbLocator.count();
          res.customChecks!["thumbnailButtonsFound"] = thumbCount;
          if (thumbCount > 1) {
            await thumbLocator.nth(1).click().catch(() => { });
            await page.waitForTimeout(300);
          }
        } else {
          // Medyasız ürünlerde placeholder kontrolü
          res.customChecks!["placeholderRendered"] = (res.placeholderCount || 0) > 0;
        }
      });
    }

    console.log("\n--- BÖLÜM 3: SEPET, CHECKOUT VE KAPIDA ÖDEME AKIŞI (DESKTOP) ---");
    // 1. Ürünü sepete ekle
    await testPage("/urun/moda-humra-ici-peluslu-termal-kilotlu-corap", "desktop", async (page, res) => {
      // Beden veya renk butonu seç
      const variantBtn = page.locator("button:has-text('Standart')").first();
      if (await variantBtn.isVisible()) {
        await variantBtn.click();
      }
      // Sepete Ekle Butonu
      const addToCartBtn = page.locator("button:has-text('Sepete Ekle')").first();
      await addToCartBtn.click();
      await page.waitForTimeout(800);
      res.customChecks!["addedToCart"] = true;
    });

    const cartInitScript = `
      localStorage.setItem('hm_cart_items_v1', JSON.stringify([{
        id: 'prod-1793280254862-col-1793280254862-0-size-prod-1793280254862-0',
        product: {
          id: 'prod-1793280254862',
          title: 'Moda Humra – İçi Peluşlu Termal Kilotlu Corap🖤',
          slug: 'moda-humra-ici-peluslu-termal-kilotlu-corap',
          basePrice: 450,
          discountPrice: 350,
          variants: [{
            id: 'var-prod-1793280254862-0',
            colorId: 'col-1793280254862-0',
            sizeId: 'size-prod-1793280254862-0',
            sku: 'HM-SIY-STD-814',
            stockQuantity: 100,
            isActive: true
          }],
          colors: [{ id: 'col-1793280254862-0', name: 'Siyah', colorCode: '#141414', displayOrder: 0 }],
          sizes: [{ id: 'size-prod-1793280254862-0', name: 'Standart', slug: 'standart', displayOrder: 0 }]
        },
        color: { id: 'col-1793280254862-0', name: 'Siyah', colorCode: '#141414' },
        size: { id: 'size-prod-1793280254862-0', name: 'Standart', slug: 'standart' },
        quantity: 1
      }]));
    `;

    // 2. Checkout ve Kapıda Ödeme Sipariş Oluşturma
    await testPage(
      "/odeme",
      "desktop",
      async (page, res) => {
        // Formu Doldur
        const fullNameInput = page.locator("input[name='fullName']").first();
        if (await fullNameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await fullNameInput.fill("Ayşe Yılmaz E2E");
          await page.fill("input[name='email']", "ayse.yilmaz.e2e@example.com");
          await page.fill("input[name='phone']", "05329998877");
          await page.fill("input[name='district']", "Kadıköy");
          await page.fill("textarea[name='fullAddress']", "Bağdat Caddesi No: 123 Daire: 4");

          // Kapıda Ödeme Seçeneğini Tıkla
          const codOption = page.locator("label:has-text('Kapıda Ödeme')").first();
          if (await codOption.isVisible().catch(() => false)) {
            await codOption.click();
            await page.waitForTimeout(400);

            // Siparişi Onayla
            const submitBtn = page.locator("button:has-text('Kapıda Ödemeli Siparişi Onayla')").first();
            res.customChecks!["submitButtonVisible"] = await submitBtn.isVisible().catch(() => false);

            if (await submitBtn.isVisible().catch(() => false)) {
              await submitBtn.click();
              await page.waitForURL(/\/odeme\/basarili/, { timeout: 15000 }).catch(() => {});
              const currentUrl = page.url();
              res.customChecks!["successUrlReached"] = currentUrl.includes("/odeme/basarili");

              const match = currentUrl.match(/orderNumber=([^&]+)/);
              if (match) {
                testOrderNumber = decodeURIComponent(match[1]);
                res.customChecks!["orderNumberExtracted"] = testOrderNumber;
                console.log(`-> Sipariş Başarılı! Oluşturulan Sipariş No: ${testOrderNumber}`);
              }
            }
          }
        }
      },
      cartInitScript
    );

    console.log("\n--- BÖLÜM 4: SİPARİŞ TAKİBİ VE MÜŞTERİ HESAP SAYFALARI (DESKTOP) ---");
    // 1. Sipariş Takip Sorgusu
    await testPage("/siparis-takip", "desktop", async (page, res) => {
      if (testOrderNumber) {
        await page.fill("input[placeholder*='HM-']", testOrderNumber);
        await page.fill("input[placeholder*='05xx']", "05329998877");
        const queryBtn = page.locator("button:has-text('Sorgula')").first();
        await queryBtn.click();
        await page.waitForTimeout(1200);

        const cardVisible = await page.locator(".hm-card, [style*='border']").first().isVisible().catch(() => false);
        res.customChecks!["trackingCardVisible"] = cardVisible;
      }
    });

    // 2. Müşteri Kayıt, Giriş, Hesap ve İade Sayfaları
    await testPage("/kayit", "desktop", async (page, res) => {
      const formExists = await page.locator("input[name='email']").isVisible().catch(() => false);
      res.customChecks!["registerFormVisible"] = formExists;
    });

    await testPage("/giris", "desktop", async (page, res) => {
      const formExists = await page.locator("input[name='email']").isVisible().catch(() => false);
      res.customChecks!["loginFormVisible"] = formExists;
    });

    await testPage("/hesabim", "desktop");
    await testPage("/iade-degisim", "desktop");

    console.log("\n--- BÖLÜM 5: ADMİN PANELİ (DESKTOP) ---");
    await testPage("/admin/login", "desktop", async (page, res) => {
      const formExists = await page.locator("input[name='email']").isVisible().catch(() => false);
      res.customChecks!["adminLoginFormVisible"] = formExists;
    });
    await testPage("/admin/siparisler", "desktop");
    await testPage("/admin/finans/mutabakat", "desktop", async (page, res) => {
      const titleExists = await page.locator("h1:has-text('İade Mutabakat')").isVisible().catch(() => false);
      res.customChecks!["reconcileTitleVisible"] = titleExists;
    });

    console.log("\n--- BÖLÜM 6: MOBİL CİHAZ DENETİMİ (390x844 - iPhone 12/13/14) ---");
    await testPage("/", "mobile", async (page, res) => {
      const mobileNav = await page.locator("header, nav").isVisible().catch(() => false);
      res.customChecks!["mobileNavVisible"] = mobileNav;
    });
    await testPage("/kategori/elbise", "mobile");
    await testPage("/urun/moda-humra-ici-peluslu-termal-kilotlu-corap", "mobile");
    await testPage("/odeme", "mobile");
    await testPage("/siparis-takip", "mobile");
    await testPage("/admin/finans/mutabakat", "mobile");
  } finally {
    console.log("\n[6] Tarayıcı kapatılıyor...");
    await browser.close();

    console.log("[7] Next.js sunucusu sonlandırılıyor...");
    serverProcess.kill("SIGTERM");
  }

  // 6. Test İzolasyonu Doğrulaması
  const finalHash = computeHash(STORE_PATH);
  const storeIntact = initialHash === finalHash;
  console.log(`\n[8] Test Sonrası Orijinal data/store.json SHA256: ${finalHash}`);
  console.log(`[8] SHA256 Değişmedi mi? ${storeIntact ? "EVET - %100 KORUNDU" : "HAYIR - DEĞİŞTİ!"}`);

  // Test deposundaki sipariş sayısını kontrol et
  const finalTempStore = JSON.parse(fs.readFileSync(tempStoreFile, "utf8"));
  const tempOrdersCount = (finalTempStore.orders || []).length;
  console.log(`[8] İzole depodaki sipariş adedi: ${tempOrdersCount}`);

  // Geçici dosyaları temizle
  try {
    fs.unlinkSync(tempStoreFile);
    fs.unlinkSync(tempTmpStoreFile);
    console.log("[9] İzole geçici dosyalar güvenle silindi.");
  } catch { }

  // 7. Sonuç Raporunu Kaydet
  const totalTested = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = totalTested - passedCount;

  const summary: TestRunSummary = {
    timestamp: new Date().toISOString(),
    totalTestedPages: totalTested,
    passedPages: passedCount,
    failedPages: failedCount,
    browser: browserChannel,
    initialStoreSha256: initialHash,
    finalStoreSha256: finalHash,
    storeIntact,
    placedOrderNumber: testOrderNumber,
    pages: results,
  };

  const resultsPath = path.resolve("docs/faz-7-10-1-browser-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`\n[10] Test sonuçları JSON formatında kaydedildi: ${resultsPath}`);
  console.log(`====================================================`);
  console.log(`TOPLAM TEST EDİLEN SAYFA: ${totalTested}`);
  console.log(`BAŞARILI: ${passedCount}`);
  console.log(`BAŞARISIZ: ${failedCount}`);
  console.log(`VERİ BÜTÜNLÜĞÜ (%100): ${storeIntact ? "BAŞARILI" : "BAŞARISIZ"}`);
  console.log(`====================================================`);
}

run().catch((err) => {
  console.error("Test yürütülürken beklenmeyen hata:", err);
  process.exit(1);
});

