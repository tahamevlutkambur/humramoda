/**
 * Hümra Moda — Güvenli Yönetici Hesabı Oluşturma / Parola Sıfırlama Aracı
 *
 * Güvenlik Standartları:
 * - Parola komut satırı argümanı olarak terminal geçmişine (history) veya işlem listesine (ps) yazılmaz.
 * - Parola `ADMIN_PASSWORD` çevre değişkeninden veya terminalde etkileşimli istemciyle (prompt) alınır.
 * - Minimum 10 karakter, büyük harf, küçük harf, rakam ve özel karakter zorunluluğu bulunur.
 * - Gerçek parolalar konsol çıktısına veya loglara asla yazdırılmaz.
 *
 * Kullanım (Ortam Değişkeni İle):
 *   $env:ADMIN_PASSWORD = "GucluParola_2026!#"; npx tsx scripts/create-admin.ts admin@humramoda.local "Yönetici Adı"
 *
 * Kullanım (Etkileşimli Giriş İle):
 *   npx tsx scripts/create-admin.ts admin@humramoda.local "Yönetici Adı"
 */

import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { hashPassword } from "../src/lib/server/auth";
import { getStoreData, saveStoreData, AdminUser } from "../src/lib/server/store";

function validatePasswordComplexity(pass: string): { isValid: boolean; reason?: string } {
  if (pass.length < 10) {
    return { isValid: false, reason: "Parola en az 10 karakter uzunluğunda olmalıdır." };
  }
  if (!/[A-Z]/.test(pass)) {
    return { isValid: false, reason: "Parola en az bir büyük harf (A-Z) içermelidir." };
  }
  if (!/[a-z]/.test(pass)) {
    return { isValid: false, reason: "Parola en az bir küçük harf (a-z) içermelidir." };
  }
  if (!/[0-9]/.test(pass)) {
    return { isValid: false, reason: "Parola en az bir rakam (0-9) içermelidir." };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) {
    return { isValid: false, reason: "Parola en az bir özel karakter (!@#$%^&*...) içermelidir." };
  }
  return { isValid: true };
}

async function main() {
  const args = process.argv.slice(2);
  const email = (args[0] || process.env.ADMIN_INITIAL_EMAIL || "").trim();
  const fullName = args[1] || "Hümra Moda Yöneticisi";

  if (!email || !email.includes("@")) {
    console.error("Hata: Geçerli bir e-posta adresi belirtilmelidir.");
    console.error("Kullanım: npx tsx scripts/create-admin.ts <email> [fullName]");
    process.exit(1);
  }

  let rawPassword = process.env.ADMIN_PASSWORD;

  // Eğer çevre değişkeninde tanımlı değilse etkileşimli sor
  if (!rawPassword) {
    if (process.stdin.isTTY) {
      const rl = readline.createInterface({ input, output });
      rawPassword = await rl.question("Yönetici Parolasını Giriniz (en az 10 karakter): ");
      rl.close();
    } else {
      console.error(
        "Hata: Parola sağlanmadı. Lütfen ADMIN_PASSWORD çevre değişkenini tanımlayınız veya etkileşimli terminal kullanınız."
      );
      process.exit(1);
    }
  }

  const check = validatePasswordComplexity(rawPassword);
  if (!check.isValid) {
    console.error(`Güvenlik Uyarısı: ${check.reason}`);
    process.exit(1);
  }

  const cleanEmail = email.toLowerCase().trim();
  const passwordHash = hashPassword(rawPassword);

  const store = getStoreData();
  const existingIdx = store.adminUsers.findIndex((u) => u.email === cleanEmail);

  if (existingIdx >= 0) {
    store.adminUsers[existingIdx].passwordHash = passwordHash;
    store.adminUsers[existingIdx].fullName = fullName;
    store.adminUsers[existingIdx].isActive = true;
    saveStoreData(store);
    console.log(`\n✔ Mevcut yönetici "${cleanEmail}" parolası güvenle sıfırlandı ve güncellendi.`);
  } else {
    const newAdmin: AdminUser = {
      id: `admin-${Date.now()}`,
      email: cleanEmail,
      fullName,
      passwordHash,
      role: "ADMIN",
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    store.adminUsers.push(newAdmin);
    saveStoreData(store);
    console.log(`\n✔ Yeni yönetici hesabı "${cleanEmail}" başarıyla oluşturuldu.`);
  }

  console.log(`E-Posta: ${cleanEmail}`);
  console.log(`Rol: ADMIN (Aktif)`);
  console.log(`Güvenlik: scrypt-kdf (16-byte cryptographically secure random salt, 64-byte keylen)`);
  console.log(`Not: Parola güvenlik kuralları gereği loglarda gösterilmemektedir.`);
}

main().catch((err) => {
  console.error("İşlem sırasında hata oluştu:", err instanceof Error ? err.message : err);
  process.exit(1);
});
