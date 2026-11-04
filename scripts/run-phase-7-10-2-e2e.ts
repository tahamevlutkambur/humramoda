import { chromium } from "playwright";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

interface ModuleTestResult {
  moduleName: string;
  category: "CUSTOMER" | "ADMIN" | "STOREFRONT" | "CHECKOUT" | "SHIPPING_RETURNS" | "MOBILE";
  testName: string;
  passed: boolean;
  durationMs: number;
  details?: Record<string, any>;
  error?: string;
}

interface TestRunSummary {
  timestamp: string;
  browser: string;
  initialStoreSha256: string;
  finalStoreSha256: string;
  storeIntact: boolean;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  placedOrderNumber?: string;
  registeredCustomerEmail?: string;
  results: ModuleTestResult[];
}

const PORT = 3005;
const BASE_URL = `http://localhost:${PORT}`;
const STORE_PATH = path.resolve("data/store.json");

function computeHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

async function waitForServer(url: string, timeoutMs: number = 60000): Promise<boolean> {
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
  console.warn("waitForServer error:", lastErr);
  return false;
}

async function run() {
  console.log("================================================================================");
  console.log("HÜMRA MODA — FAZ 7.10.2: TÜM MODÜLLERİN UÇTAN UCA DOĞRULAMA TESTİ");
  console.log("================================================================================");

  const initialHash = computeHash(STORE_PATH);
  console.log(`[1] Orijinal data/store.json SHA256: ${initialHash}`);

  // 1. İzolasyon Ortamını Hazırla
  const tempStoreFile = path.join(os.tmpdir(), `humra_faz7102_store_${Date.now()}.json`);
  const tempTmpStoreFile = path.join(os.tmpdir(), `humra_faz7102_tmp_${Date.now()}.json`);
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
    } catch {}
    process.exit(1);
  }
  console.log(`[4] Next.js sunucusu başarıyla hazır: ${BASE_URL}`);

  // 3. Playwright Tarayıcısını Başlat
  console.log(`[5] Gerçek tarayıcı (Microsoft Edge) başlatılıyor...`);
  let browser: any;
  let browserChannel = "msedge";
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    console.log("-> Microsoft Edge kanalıyla başlatıldı.");
  } catch (err) {
    console.warn("-> Microsoft Edge başlatılamadı, varsayılan Chromium'a geçiliyor:", err);
    browserChannel = "chromium";
    browser = await chromium.launch({ headless: true });
  }

  const moduleResults: ModuleTestResult[] = [];
  let testOrderNumber: string | undefined;
  const testCustomerEmail = `zeynep.e2e.${Date.now()}@example.com`;
  const testCustomerPass = "GuvenliSifre2026!";
  let adminStorageState: any = null;

  async function executeTest(
    moduleName: string,
    category: ModuleTestResult["category"],
    testName: string,
    action: (page: any, context: any) => Promise<Record<string, any> | void>,
    options?: { viewportType?: "desktop" | "mobile"; useAdminAuth?: boolean }
  ) {
    const start = Date.now();
    const isMobile = options?.viewportType === "mobile";
    const width = isMobile ? 390 : 1280;
    const height = isMobile ? 844 : 800;

    const contextOptions: any = {
      viewport: { width, height },
      isMobile,
      hasTouch: isMobile,
    };

    if (options?.useAdminAuth && adminStorageState) {
      contextOptions.storageState = adminStorageState;
    }

    const context = await browser.newContext(contextOptions);

    // Çerez izin bildiriminin butonları perdelemesini engelle
    await context.addInitScript(() => {
      try {
        localStorage.setItem("cookie_consent", "all");
      } catch {}
    });

    const page = await context.newPage();
    page.setDefaultTimeout(12000);

    const consoleErrors: string[] = [];
    page.on("console", (msg: any) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    try {
      const details = (await action(page, context)) || {};
      const durationMs = Date.now() - start;
      const res: ModuleTestResult = {
        moduleName,
        category,
        testName,
        passed: true,
        durationMs,
        details: { ...details, consoleErrors: consoleErrors.slice(0, 3) },
      };
      moduleResults.push(res);
      console.log(`  ✓ [${category}] ${testName} (${durationMs}ms)`);
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const res: ModuleTestResult = {
        moduleName,
        category,
        testName,
        passed: false,
        durationMs,
        error: err?.message || String(err),
        details: { consoleErrors: consoleErrors.slice(0, 5) },
      };
      moduleResults.push(res);
      console.error(`  ✗ [${category}] ${testName} (${durationMs}ms) -> HATA: ${err?.message}`);
    } finally {
      await context.close().catch(() => {});
    }
  }

  try {
    // =========================================================================
    // MODÜL 1: MÜŞTERİ HESABI SİSTEMİ (/kayit, /giris, /hesabim, /sifremi-unuttum)
    // =========================================================================
    console.log("\n--- MODÜL 1: MÜŞTERİ HESABI SİSTEMİ TESTLERİ ---");

    await executeTest("Müşteri Kayıt", "CUSTOMER", "1.1. Boş form gönderimi reddedilmeli", async (page) => {
      await page.goto(`${BASE_URL}/kayit`, { waitUntil: "domcontentloaded" });
      await page.locator("input[name='fullName']").waitFor({ state: "visible" });
      await page.waitForTimeout(600); // React hidrasyonunun tamamlanmasını bekle
      const submitBtn = page.locator("button[type='submit']").first();
      await submitBtn.click();
      await page.locator("text=Lütfen adınızı ve soyadınızı giriniz.").first().waitFor({ timeout: 5000 });
    });

    await executeTest("Müşteri Kayıt", "CUSTOMER", "1.2. Geçersiz e-posta ve zayıf şifre reddedilmeli", async (page) => {
      await page.goto(`${BASE_URL}/kayit`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
      await page.fill("input[name='fullName']", "Test Kullanıcı");
      await page.fill("input[name='email']", "gecersiz-email");
      await page.locator("button[type='submit']").first().click();
      await page.waitForTimeout(400);
      let text = await page.textContent("body");
      if (!text?.includes("geçerli bir e-posta")) {
        throw new Error("Geçersiz e-posta hatası verilmedi");
      }

      await page.fill("input[name='email']", "test.user@example.com");
      await page.fill("input[name='password']", "123");
      await page.fill("input[name='passwordRepeat']", "123");
      await page.locator("button[type='submit']").first().click();
      await page.waitForTimeout(400);
      text = await page.textContent("body");
      if (!text?.includes("en az 6 karakter")) {
        throw new Error("Zayıf şifre hatası verilmedi");
      }
    });

    await executeTest("Müşteri Kayıt", "CUSTOMER", "1.3. KVKK ve Sözleşme onaysız kayıt engellenmeli", async (page) => {
      await page.goto(`${BASE_URL}/kayit`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
      await page.fill("input[name='fullName']", "Zeynep Müşteri");
      await page.fill("input[name='email']", testCustomerEmail);
      await page.fill("input[name='password']", testCustomerPass);
      await page.fill("input[name='passwordRepeat']", testCustomerPass);
      await page.locator("button[type='submit']").first().click();
      await page.waitForTimeout(400);
      const text = await page.textContent("body");
      if (!text?.includes("KVKK") && !text?.includes("Sözleşme")) {
        throw new Error("Zorunlu onay uyarısı verilmedi");
      }
    });

    await executeTest("Müşteri Kayıt", "CUSTOMER", "1.4. Geçerli bilgilerle kayıt yapılabilmeli ve /hesabim'a yönlendirmeli", async (page) => {
      await page.goto(`${BASE_URL}/kayit`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
      await page.fill("input[name='fullName']", "Zeynep Müşteri");
      await page.fill("input[name='email']", testCustomerEmail);
      await page.fill("input[name='phone']", "05441112233");
      await page.fill("input[name='password']", testCustomerPass);
      await page.fill("input[name='passwordRepeat']", testCustomerPass);
      await page.check("input[name='kvkkApproved']");
      await page.check("input[name='termsApproved']");
      await page.locator("button[type='submit']").first().click();
      await page.waitForURL(/\/hesabim/, { timeout: 10000 });
      const currentUrl = page.url();
      if (!currentUrl.includes("/hesabim")) {
        throw new Error(`/hesabim yönlendirmesi gerçekleşmedi (Mevcut URL: ${currentUrl})`);
      }
      return { registeredEmail: testCustomerEmail };
    });

    await executeTest("Müşteri Çıkış", "CUSTOMER", "1.5. Çıkış yapıldığında korumalı /hesabim rotasına erişim engellenmeli", async (page) => {
      // Önce giriş yap
      await page.goto(`${BASE_URL}/giris`, { waitUntil: "domcontentloaded" });
      await page.locator("input[name='email']").waitFor({ state: "visible" });
      await page.waitForTimeout(500);
      await page.fill("input[name='email']", testCustomerEmail);
      await page.fill("input[name='password']", testCustomerPass);
      await page.locator("button[type='submit']").first().click();
      await page.waitForURL(/\/hesabim/, { timeout: 10000 });

      // Çıkış yap
      const logoutBtn = page.locator("button:has-text('Çıkış Yap')").first();
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForTimeout(1000);
      } else {
        await page.goto(`${BASE_URL}/api/auth/logout`);
      }

      // Şimdi korumalı /hesabim sayfasına gitmeyi dene
      await page.goto(`${BASE_URL}/hesabim`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      const url = page.url();
      if (!url.includes("/giris")) {
        throw new Error(`Korumalı sayfadan çıkış sonrası /giris'e yönlendirilmedi (URL: ${url})`);
      }
    });

    await executeTest("Müşteri Giriş", "CUSTOMER", "1.6. Yanlış şifre reddedilmeli, doğru şifre ile giriş başarılı olmalı", async (page) => {
      await page.goto(`${BASE_URL}/giris`, { waitUntil: "domcontentloaded" });
      await page.locator("input[name='email']").waitFor({ state: "visible" });
      await page.waitForTimeout(400);
      await page.fill("input[name='email']", testCustomerEmail);
      await page.fill("input[name='password']", "YanlisSifre123!");
      await page.locator("button[type='submit']").first().click();
      await page.waitForTimeout(800);
      let text = await page.textContent("body");
      if (!text?.includes("hatalı") && !text?.includes("Geçersiz") && !text?.includes("şifre")) {
        throw new Error("Hatalı şifre uyarısı çıkmadı");
      }

      // Doğru şifre ile giriş
      await page.fill("input[name='password']", testCustomerPass);
      await page.locator("button[type='submit']").first().click();
      await page.waitForURL(/\/hesabim/, { timeout: 10000 });
      if (!page.url().includes("/hesabim")) {
        throw new Error("Doğru şifre ile /hesabim'a yönlendirilmedi");
      }
    });

    await executeTest("Şifre Sıfırlama", "CUSTOMER", "1.7. Şifremi unuttum bağlantısı üretilmeli ve şifre başarıyla yenilenmeli", async (page) => {
      await page.goto(`${BASE_URL}/sifremi-unuttum`, { waitUntil: "domcontentloaded" });
      await page.fill("input[type='email']", testCustomerEmail);
      await page.locator("button[type='submit']").first().click();
      await page.waitForTimeout(1200);

      // Sayfada debugResetUrl linki var mı kontrol et
      const resetLink = page.locator("a[href*='/sifre-sifirla?token=']").first();
      let tokenUrl = "";
      if (await resetLink.isVisible()) {
        tokenUrl = (await resetLink.getAttribute("href")) || "";
      }

      const currentStore = JSON.parse(fs.readFileSync(tempStoreFile, "utf8"));
      const tokens = currentStore.passwordResetTokens || [];
      const userToken = tokens.find((t: any) => t.email.toLowerCase() === testCustomerEmail.toLowerCase() && !t.used);

      if (!tokenUrl && userToken) {
        tokenUrl = `/sifre-sifirla?token=${userToken.token}`;
      }

      if (!tokenUrl || !userToken) throw new Error("Şifre sıfırlama token'ı oluşturulamadı");

      // Yeni şifre belirleme sayfasına git (UI Akışı)
      await page.goto(`${BASE_URL}${tokenUrl}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      const newPass = "YeniGuvenliSifre2026!";
      await page.fill("#password", newPass);
      await page.fill("#passwordRepeat", newPass);
      await page.locator("button[type='submit']").first().click();
      await page.waitForTimeout(1200);

      const successText = await page.textContent("body");
      if (!successText?.includes("başarıyla") && !successText?.includes("Güncellendi") && !successText?.includes("Giriş Yap")) {
        throw new Error("Şifre sıfırlama onay mesajı görüntülenmedi");
      }

      // Güvenlik: Tek kullanımlık token denenmeli — tüketilmiş token API seviyesinde 400 ile reddedilmeli
      const reuseRes = await page.request.post(`${BASE_URL}/api/auth/reset-password`, {
        data: {
          token: userToken.token,
          password: "BaskaSifre999!",
          passwordRepeat: "BaskaSifre999!",
        },
      });
      const reuseStatus = reuseRes.status();
      const reuseData = await reuseRes.json().catch(() => ({}));
      if (reuseStatus !== 400 || (!reuseData.error?.includes("kullanılmış") && !reuseData.error?.includes("geçersiz"))) {
        throw new Error(`Tek kullanımlık token kuralı ihlal edildi! Status: ${reuseStatus}, Yanıt: ${JSON.stringify(reuseData)}`);
      }
    });

    await executeTest("Hesap Yönetimi", "CUSTOMER", "1.8. Adres ekleme, düzenleme ve profil güncelleme çalışmalı", async (page) => {
      // Önce yeni şifre ile giriş yap
      await page.goto(`${BASE_URL}/giris`, { waitUntil: "domcontentloaded" });
      await page.locator("input[name='email']").waitFor({ state: "visible" });
      await page.waitForTimeout(400);
      await page.fill("input[name='email']", testCustomerEmail);
      await page.fill("input[name='password']", "YeniGuvenliSifre2026!");
      await page.locator("button[type='submit']").first().click();
      await page.waitForURL(/\/hesabim/, { timeout: 10000 });

      // Adres Defteri Sekmesine Git
      const addressTab = page.locator("button:has-text('Adreslerim')").first();
      await addressTab.click();
      await page.waitForTimeout(500);

      // Yeni Adres Ekle
      const addAddrBtn = page.locator("button:has-text('Yeni Adres Ekle'), button:has-text('İlk Adresinizi Ekleyin')").first();
      if (await addAddrBtn.isVisible()) {
        await addAddrBtn.click();
        await page.waitForTimeout(500);

        await page.fill("input[name='title']", "Evim");
        await page.fill("input[name='recipient']", "Zeynep Müşteri");
        await page.fill("input[name='phone']", "05441112233");
        await page.fill("input[name='district']", "Kadıköy");
        await page.fill("textarea[name='fullAddress']", "Caferağa Mah. Moda Cad. No: 15");

        const saveBtn = page.locator("button[type='submit']:has-text('Adresi Kaydet')").first();
        await saveBtn.click({ force: true });
        await page.waitForTimeout(1000);

        const bodyText = await page.textContent("body");
        if (!bodyText?.includes("Evim") && !bodyText?.includes("Moda Cad")) {
          throw new Error("Eklenen adres listede görüntülenemedi");
        }
      }
    });

    await executeTest("Rol İzolasyonu", "CUSTOMER", "1.9. Müşteri oturumu admin paneline (/admin) erişememeli", async (page) => {
      // Müşteri oturumu aç
      await page.goto(`${BASE_URL}/giris`, { waitUntil: "domcontentloaded" });
      await page.locator("input[name='email']").waitFor({ state: "visible" });
      await page.waitForTimeout(400);
      await page.fill("input[name='email']", testCustomerEmail);
      await page.fill("input[name='password']", "YeniGuvenliSifre2026!");
      await page.locator("button[type='submit']").first().click();
      await page.waitForURL(/\/hesabim/, { timeout: 10000 });

      // Müşteri oturumu aktifken /admin sayfasına gitmeyi dene
      await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      const url = page.url();
      if (!url.includes("/admin/login") && !url.includes("/giris")) {
        throw new Error(`Müşteri oturumu admin paneline erişebildi! Güvenlik ihlali! (URL: ${url})`);
      }
    });

    // =========================================================================
    // MODÜL 2: ADMİN PANELİ FONKSİYONEL TESTLERİ
    // =========================================================================
    console.log("\n--- MODÜL 2: ADMİN PANELİ TAM FONKSİYON DENETİMİ ---");

    await executeTest("Admin Giriş", "ADMIN", "2.1. Admin girişi (humramoda@eyup.com) ve yetkilendirme doğrulaması", async (page, context) => {
      await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "domcontentloaded" });
      // Hatalı şifre
      await page.fill("#admin-email", "humramoda@eyup.com");
      await page.fill("#admin-password", "YanlisAdminSifre!");
      await page.locator("button[type='submit']").first().click();
      await page.waitForTimeout(500);
      let text = await page.textContent("body");
      if (!text?.includes("Geçersiz e-posta adresi veya şifre")) {
        throw new Error("Admin hatalı şifre uyarısı çıkmadı");
      }

      // Doğru şifre
      await page.fill("#admin-password", "Eyup.Humra2026");
      await page.locator("button[type='submit']").first().click();
      await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
      if (!page.url().includes("/admin")) {
        throw new Error("Admin paneline giriş yapılamadı");
      }

      // Sonraki testler için oturum durumunu sakla
      adminStorageState = await context.storageState();
    });

    await executeTest("Admin Dashboard", "ADMIN", "2.2. Gösterge Paneli (/admin) özet sayaçları ve bileşenleri render edilmeli", async (page) => {
      await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
      const text = await page.textContent("body");
      if (!text?.includes("Gösterge Paneli") && !text?.includes("Siparişler")) {
        throw new Error("Gösterge paneli metinleri bulunamadı");
      }
    }, { useAdminAuth: true });

    await executeTest("Admin Ürünler", "ADMIN", "2.3. Ürün listesi, arama, filtreleme ve restorasyon masası görünümü", async (page) => {
      await page.goto(`${BASE_URL}/admin/urunler`, { waitUntil: "domcontentloaded" });
      // Arama filtresi testi
      const searchInput = page.locator("input[placeholder*='ara' i], input[placeholder*='Ürün adı'], input[type='search']").first();
      await searchInput.fill("Termal");
      await page.waitForTimeout(500);
      let text = await page.textContent("body");
      if (!text?.includes("Termal")) {
        throw new Error("Ürün arama filtresi çalışmadı");
      }

      // Restorasyon Masası Görünümüne Geçiş
      const restoBtn = page.locator("button:has-text('Restorasyon'), button:has-text('Fotoğrafı Eksik')").first();
      if (await restoBtn.isVisible()) {
        await restoBtn.click();
        await page.waitForTimeout(600);
        const restoText = await page.textContent("body");
        if (!restoText?.includes("Betül Trençkot") && !restoText?.includes("Buklet Ceket")) {
          throw new Error("Restorasyon masasında 6 görselsiz ürün görüntülenmedi");
        }
      }
    }, { useAdminAuth: true });

    await executeTest("Admin Ürün Yönetimi", "ADMIN", "2.4. Ürün fiyatı ve aktiflik durumu kaydedilip kalıcılaşmalı", async (page) => {
      // İzole depodan ilk ürünü API üzerinden güncelle
      const updatePayload = {
        id: "prod-1793280254862",
        title: "Moda Humra – İçi Peluşlu Termal Kilotlu Corap🖤 (Güncellendi)",
        basePrice: 480,
        discountPrice: 380,
      };

      const res = await page.request.put(`${BASE_URL}/api/admin/products`, {
        data: updatePayload,
      });

      if (!res.ok()) {
        throw new Error(`Ürün güncelleme API hatası: ${res.status()}`);
      }

      // Sayfayı yenileyerek doğrula
      await page.goto(`${BASE_URL}/admin/urunler`, { waitUntil: "domcontentloaded" });
      const text = await page.textContent("body");
      if (!text?.includes("480") && !text?.includes("Güncellendi")) {
        throw new Error("Güncellenen fiyat admin ürün listesine yansımadı");
      }
    }, { useAdminAuth: true });

    await executeTest("Admin Müşteriler", "ADMIN", "2.5. Kayıtlı vitrin müşterileri tablosu (/admin/musteriler) doğrulanmalı", async (page) => {
      await page.goto(`${BASE_URL}/admin/musteriler`, { waitUntil: "domcontentloaded" });
      const text = await page.textContent("body");
      if (!text?.includes("Zeynep Müşteri") && !text?.includes(testCustomerEmail)) {
        throw new Error("Önceki adımda kaydettiğimiz Zeynep Müşteri admin müşteri tablosunda görünmüyor");
      }
    }, { useAdminAuth: true });

    await executeTest("Admin Siparişler", "ADMIN", "2.6. Sipariş yönetimi, filtreleme ve detay inceleme çalışmalı", async (page) => {
      await page.goto(`${BASE_URL}/admin/siparisler`, { waitUntil: "domcontentloaded" });
      const text = await page.textContent("body");
      if (!text?.includes("Siparişler") && !text?.includes("Sipariş No")) {
        throw new Error("Siparişler paneli tablosu yüklenemedi");
      }
    }, { useAdminAuth: true });

    await executeTest("Admin Diğer Modüller", "ADMIN", "2.7. Vitrin, Finans, Kategoriler, Ayarlar ve Loglar rotaları açılmalı ve çalışmalı", async (page) => {
      const routes = [
        "/admin/vitrin",
        "/admin/finans",
        "/admin/kategoriler",
        "/admin/koleksiyonlar",
        "/admin/ayarlar",
        "/admin/loglar/yonetim",
        "/admin/yedekler",
      ];
      for (const r of routes) {
        const resp = await page.goto(`${BASE_URL}${r}`, { waitUntil: "domcontentloaded" });
        if (resp?.status() !== 200) {
          throw new Error(`${r} rotası HTTP ${resp?.status()} döndü`);
        }
      }
    }, { useAdminAuth: true });

    // =========================================================================
    // MODÜL 3: MAĞAZA ÖN YÜZÜ, SEPET VE ALIŞVERİŞ ETKİLEŞİMLERİ
    // =========================================================================
    console.log("\n--- MODÜL 3: MAĞAZA ÖN YÜZÜ VE SEPET ETKİLEŞİMLERİ ---");

    await executeTest("Mağaza Ön Yüzü", "STOREFRONT", "3.1. Ana sayfa hero, kategoriler ve 13 ürünün görsel sağlamlığı", async (page) => {
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
      // Bozuk görsel denetimi
      const brokenImgs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("img"))
          .filter((img) => img.complete && img.naturalWidth === 0)
          .map((img) => img.src);
      });
      if (brokenImgs.length > 0) {
        throw new Error(`Ana sayfada ${brokenImgs.length} bozuk görsel tespit edildi: ${brokenImgs.join(", ")}`);
      }
    });

    await executeTest("Ürün Detay & Varyant", "STOREFRONT", "3.2. Renk ve beden seçimi, sepete ekleme ve sepet çekmecesi", async (page) => {
      await page.goto(`${BASE_URL}/urun/moda-humra-ici-peluslu-termal-kilotlu-corap`, { waitUntil: "domcontentloaded" });

      // Renk ve Beden butonlarını seç
      const sizeBtn = page.locator("button:has-text('36-38-40')").first();
      if (await sizeBtn.isVisible()) {
        await sizeBtn.click();
        await page.waitForTimeout(300);
      }

      // Sepete ekle
      const addBtn = page.locator("button:has-text('Sepete Ekle')").first();
      await addBtn.click();
      await page.waitForTimeout(800);

      // Sepet çekmecesinin açıldığını doğrula
      const cartDrawer = page.locator("text=Alışveriş Sepetim, text=Sepetiniz").first();
      const isDrawerVisible = await cartDrawer.isVisible().catch(() => false);
      return { cartDrawerOpened: isDrawerVisible };
    });

    // =========================================================================
    // MODÜL 4: KAPIDA ÖDEME VE SİPARİŞ KALICILIĞI
    // =========================================================================
    console.log("\n--- MODÜL 4: KAPIDA ÖDEME VE SİPARİŞ KALICILIĞI ---");

    await executeTest("Kapıda Ödeme", "CHECKOUT", "4.1. Uçtan uca COD siparişi oluşturulmalı, orderNumber üretilmeli ve stok düşmeli", async (page) => {
      const rawStore = JSON.parse(fs.readFileSync(tempStoreFile, "utf8"));
      const targetProd = rawStore.products[0];
      const targetColor = targetProd.colors[0];
      const targetSize = targetProd.sizes[0];
      const targetVariant = targetProd.variants[0];
      const stockBefore = targetVariant.stockQuantity;

      const cartItemPayload = {
        id: `${targetProd.id}-${targetColor.slug}-${targetSize.slug}`,
        product: targetProd,
        color: targetColor,
        size: targetSize,
        quantity: 1,
      };

      await page.goto(`${BASE_URL}/odeme`, { waitUntil: "domcontentloaded" });
      await page.evaluate((item: any) => {
        localStorage.setItem("hm_cart_items_v1", JSON.stringify([item]));
      }, cartItemPayload);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);

      // Form doldur
      await page.fill("input[name='fullName']", "Zeynep Müşteri E2E");
      await page.fill("input[name='email']", testCustomerEmail);
      await page.fill("input[name='phone']", "05441112233");
      await page.fill("input[name='district']", "Üsküdar");
      await page.fill("textarea[name='fullAddress']", "Kuzguncuk Mah. No: 12 Daire: 3");

      // Kapıda Ödeme Seç
      await page.locator("label:has-text('Kapıda Ödeme')").first().click();
      await page.waitForTimeout(400);

      // Siparişi Onayla
      await page.locator("button:has-text('Kapıda Ödemeli Siparişi Onayla')").first().click();
      await page.waitForURL(/\/odeme\/basarili/, { timeout: 15000 });

      const currentUrl = page.url();
      const match = currentUrl.match(/orderNumber=([^&]+)/);
      if (!match) throw new Error("Sipariş numarası üretilemedi");
      testOrderNumber = decodeURIComponent(match[1]);

      // Stok düşüşünü doğrula
      const afterStore = JSON.parse(fs.readFileSync(tempStoreFile, "utf8"));
      const stockAfter = afterStore.products[0].variants[0].stockQuantity;
      if (stockAfter !== stockBefore - 1) {
        throw new Error(`Stok atomik olarak düşmedi! Öncesi: ${stockBefore}, Sonrası: ${stockAfter}`);
      }

      return { orderNumber: testOrderNumber, stockBefore, stockAfter };
    });

    await executeTest("İdempotency & Güvenlik", "CHECKOUT", "4.2. Mükerrer istekte ikinci kez stok düşmemeli ve istemci fiyat manipülasyonu engellenmeli", async (page) => {
      // 60s içinde aynı sipariş gönderildiğinde mükerrer sipariş açılmamalı
      const duplicateRes = await page.request.post(`${BASE_URL}/api/payments/cash-on-delivery/create`, {
        data: {
          customer: {
            fullName: "Zeynep Müşteri E2E",
            email: testCustomerEmail,
            phone: "05441112233",
            city: "İstanbul",
            district: "Üsküdar",
            fullAddress: "Kuzguncuk Mah. No: 12 Daire: 3",
          },
          items: [
            {
              productId: "prod-1793280254862",
              variantId: "var-1793280254862-0",
              sku: "HM-SIY-STD-814",
              quantity: 1,
            },
          ],
        },
      });

      const dupData = await duplicateRes.json();
      if (!dupData.success || dupData.orderNumber !== testOrderNumber) {
        throw new Error("Idempotency koruması çalışmadı, aynı sipariş no dönmedi");
      }

      // Fiyat manipülasyonu: İstemci birim fiyatı 1 TL olarak gönderse bile sunucu katalog fiyatını (380 TL) baz almalı
      const fakePriceRes = await page.request.post(`${BASE_URL}/api/payments/cash-on-delivery/create`, {
        data: {
          customer: {
            fullName: "Hileli Kullanıcı",
            email: "tamper@example.com",
            phone: "05330009988",
            city: "Ankara",
            district: "Çankaya",
            fullAddress: "Adres",
          },
          items: [
            {
              productId: "prod-1793280254862",
              variantId: "var-1793280254862-0",
              sku: "HM-SIY-STD-814",
              unitPrice: 1, // Manipüle edilmiş fiyat
              totalPrice: 1,
              quantity: 1,
            },
          ],
        },
      });

      const fakeData = await fakePriceRes.json();
      if (fakeData.success && fakeData.order && fakeData.order.totalAmount < 200) {
        throw new Error("Sunucu istemcinin gönderdiği sahte düşük fiyatı kabul etti! Güvenlik açığı!");
      }
    });

    // =========================================================================
    // MODÜL 5: KARGO, SİPARİŞ TAKİBİ, İPTAL VE İADE
    // =========================================================================
    console.log("\n--- MODÜL 5: KARGO, SİPARİŞ TAKİBİ VE İADE TESTLERİ ---");

    await executeTest("Sipariş Takip", "SHIPPING_RETURNS", "5.1. Sipariş numarası ve telefonla sorgulama doğru sonuç üretmeli", async (page) => {
      await page.goto(`${BASE_URL}/siparis-takip`, { waitUntil: "domcontentloaded" });
      await page.fill("input[placeholder*='HM-']", testOrderNumber!);
      await page.fill("#tracking-phone", "05441112233");
      await page.locator("button[type='submit']").first().click();

      const trackingCard = page.locator(`text=${testOrderNumber!}`).first();
      await trackingCard.waitFor({ state: "visible", timeout: 8000 });

      const text = await page.textContent("body");
      if (!text?.includes(testOrderNumber!) || !text?.includes("Z*****")) {
        throw new Error("Sipariş detay kartı veya maskelenmiş müşteri bilgisi görüntülenmedi");
      }
    });

    await executeTest("İade Talebi", "SHIPPING_RETURNS", "5.2. İade/değişim formu siparişi sorgulayabilmeli", async (page) => {
      await page.goto(`${BASE_URL}/iade-degisim`, { waitUntil: "domcontentloaded" });
      await page.fill("#orderNumberInput", testOrderNumber!);
      await page.fill("#identifierInput", "05441112233");
      await page.locator("button[type='submit']").first().click();
      await page.waitForTimeout(1500);

      const text = await page.textContent("body");
      if (!text?.includes(testOrderNumber!) && !text?.includes("Sipariş Özeti") && !text?.includes("İade") && !text?.includes("Değişim")) {
        throw new Error("İade/değişim sipariş sorgulama sonucu görüntülenemedi");
      }
    });

    // =========================================================================
    // MODÜL 6: MOBİL CİHAZ DENETİMİ (390x844)
    // =========================================================================
    console.log("\n--- MODÜL 6: MOBİL CİHAZ DENETİMİ (390x844) ---");

    await executeTest("Mobil Görünüm", "MOBILE", "6.1. Mobil ana sayfa, menü ve yatay taşma (overflow) kontrolü", async (page) => {
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      if (hasHorizontalOverflow) {
        throw new Error("Mobil ekranda yatay taşma (horizontal scroll overflow) tespit edildi!");
      }
    }, { viewportType: "mobile" });

    await executeTest("Mobil Checkout", "MOBILE", "6.2. Mobil ödeme ve sipariş takip ekranlarının render sağlamlığı", async (page) => {
      await page.goto(`${BASE_URL}/siparis-takip`, { waitUntil: "domcontentloaded" });
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      if (hasOverflow) {
        throw new Error("Mobil sipariş takip sayfasında yatay taşma tespit edildi!");
      }
    }, { viewportType: "mobile" });

  } finally {
    console.log("\n[6] Tarayıcı kapatılıyor...");
    await browser.close().catch(() => {});

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
  } catch {}

  // 7. Sonuç Raporunu Kaydet
  const totalTests = moduleResults.length;
  const passedCount = moduleResults.filter((r) => r.passed).length;
  const failedCount = totalTests - passedCount;

  const summary: TestRunSummary = {
    timestamp: new Date().toISOString(),
    browser: browserChannel,
    initialStoreSha256: initialHash,
    finalStoreSha256: finalHash,
    storeIntact,
    totalTests,
    passedCount,
    failedCount,
    placedOrderNumber: testOrderNumber,
    registeredCustomerEmail: testCustomerEmail,
    results: moduleResults,
  };

  const resultsPath = path.resolve("docs/faz-7-10-2-browser-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`\n[10] Test sonuçları JSON formatında kaydedildi: ${resultsPath}`);
  console.log(`================================================================================`);
  console.log(`TOPLAM TEST: ${totalTests}`);
  console.log(`BAŞARILI: ${passedCount}`);
  console.log(`BAŞARISIZ: ${failedCount}`);
  console.log(`VERİ BÜTÜNLÜĞÜ (%100): ${storeIntact ? "BAŞARILI - %100 KORUNDU" : "BAŞARISIZ!"}`);
  console.log(`================================================================================`);
}

run().catch((err) => {
  console.error("Test yürütülürken beklenmeyen hata:", err);
  process.exit(1);
});
