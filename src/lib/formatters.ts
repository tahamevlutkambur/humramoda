/**
 * Hümra Moda — Yardımcı Biçimlendiriciler ve Dönüştürücüler
 * Türk Lirası para birimi, kuruş hesaplama ve Türkçe karakter uyumlu sluglar.
 */

/**
 * Sayıyı Türk Lirası para birimi formatına çevirir.
 * Örnek: 1574.1 -> "1.574,10 ₺"
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0,00 ₺";

  const formatted = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);

  return `${formatted} ₺`;
}

/**
 * TL tutarını PayTR'ın beklediği tam sayı kuruş değerine dönüştürür.
 * Kuruş yuvarlama kayıplarını engeller.
 * Örnek: 1574.10 -> 157410
 */
export function toKurus(amountInTL: number | string): number {
  const num = typeof amountInTL === "string" ? parseFloat(amountInTL) : amountInTL;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Kuruş değerini TL ondalık sayısına çevirir.
 * Örnek: 157410 -> 1574.10
 */
export function fromKurus(amountInKurus: number): number {
  return amountInKurus / 100;
}

/**
 * Türkçe karakterleri ASCII karşılıklarına dönüştürerek URL dostu slug üretir.
 * Örnek: "Qapitone Garnili Scuba İkili Takım" -> "qapitone-garnili-scuba-ikili-takim"
 */
export function slugifyTurkish(text: string): string {
  const charMap: Record<string, string> = {
    ç: "c",
    Ç: "c",
    ğ: "g",
    Ğ: "g",
    ı: "i",
    İ: "i",
    ö: "o",
    Ö: "o",
    ş: "s",
    Ş: "s",
    ü: "u",
    Ü: "u",
  };

  return text
    .split("")
    .map((char) => charMap[char] || char)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
