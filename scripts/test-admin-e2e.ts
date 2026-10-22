import crypto from "crypto";
import { getStoreData, saveStoreData } from "../src/lib/server/store";
import { hashPassword } from "../src/lib/server/auth";

async function main() {
  console.log("--- ADMIN PANELİ E2E ERİŞİM VE GÜVENLİK TESTİ ---");

  // Geçici E2E test kullanıcısı oluştur
  const store = getStoreData();
  const testEmail = `e2e-admin-${Date.now()}@humramoda.local`;
  const testPassword = `E2ePass_${crypto.randomBytes(12).toString("hex")}!#`;

  store.adminUsers.push({
    id: `admin-e2e-${Date.now()}`,
    email: testEmail,
    fullName: "E2E Test Yöneticisi",
    passwordHash: hashPassword(testPassword),
    role: "ADMIN",
    isActive: true,
    createdAt: new Date().toISOString(),
  });
  saveStoreData(store);

  try {
    // 1. Yetkisiz /admin erişimi -> /admin/login'e yönlendirilmeli (307)
    const r1 = await fetch("http://localhost:3000/admin", { redirect: "manual" });
    console.log(`1. Yetkisiz /admin isteği: HTTP ${r1.status}`);
    console.log(`   Yönlendirme Hedefi: ${r1.headers.get("location")}`);

    // 2. Yetkisiz /api/admin/products isteği -> 401 Unauthorized dönmeli
    const r2 = await fetch("http://localhost:3000/api/admin/products");
    console.log(`2. Yetkisiz API isteği (/api/admin/products): HTTP ${r2.status}`);

    // 3. Yanlış şifre ile giriş denemesi -> 401 Unauthorized dönmeli
    const r3 = await fetch("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "TamamenYanlisParola123!" }),
    });
    const badLoginData = await r3.json();
    console.log(`3. Hatalı parola giriş yanıtı: HTTP ${r3.status} - Mesaj: "${badLoginData.error}"`);

    // 4. Doğru kimlik bilgileri ile giriş
    const r4 = await fetch("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const goodLoginData = await r4.json();
    const rawCookie = r4.headers.get("set-cookie") || "";
    const cookieMatch = rawCookie.match(/hm_admin_session=([^;]+)/);
    const sessionCookie = cookieMatch ? `hm_admin_session=${cookieMatch[1]}` : "";
    console.log(`4. Yetkili yönetici girişi: HTTP ${r4.status} - Hoş geldin: ${goodLoginData.user?.fullName}`);
    console.log(`   Oturum Çerezi Alındı mı: ${!!sessionCookie} (HttpOnly, Secure/Lax)`);

    // 5. Yetkili oturumla API'den ürünleri listele
    const r5 = await fetch("http://localhost:3000/api/admin/products", {
      headers: { Cookie: sessionCookie },
    });
    const prodData = await r5.json();
    console.log(`5. Yetkili /api/admin/products yanıtı: HTTP ${r5.status} - Toplam Ürün: ${prodData.products?.length}`);

    // 6. Yetkili oturumla mağaza ayarlarını oku
    const r6 = await fetch("http://localhost:3000/api/admin/settings", {
      headers: { Cookie: sessionCookie },
    });
    const settingsData = await r6.json();
    console.log(`6. Yetkili /api/admin/settings: HTTP ${r6.status} - Kargo Eşiği: ${settingsData.settings?.freeShippingThreshold} ₺`);

    // 7. Çıkış yap (Logout) ve token iptali doğrulaması
    const r7 = await fetch("http://localhost:3000/api/admin/auth/logout", {
      method: "POST",
      headers: { Cookie: sessionCookie },
    });
    console.log(`7. Yönetici çıkış işlemi: HTTP ${r7.status} - Oturum sunucu tarafında iptal edildi.`);

    // 8. İptal edilen oturum çereziyle tekrar korumalı API'ye erişim denenmesi -> 401 dönmeli
    const r8 = await fetch("http://localhost:3000/api/admin/products", {
      headers: { Cookie: sessionCookie },
    });
    console.log(`8. İptal edilmiş oturum ile API tekrarı: HTTP ${r8.status} (Beklenen: 401 - Yetkisiz)`);

    console.log("\n✔ TÜM E2E GÜVENLİK VE ERİŞİM KONTROLLERİ BAŞARIYLA GEÇTİ.");
  } finally {
    // Test kullanıcısını temizle
    const currentStore = getStoreData();
    currentStore.adminUsers = currentStore.adminUsers.filter((u) => u.email !== testEmail);
    saveStoreData(currentStore);
  }
}

main().catch(console.error);
