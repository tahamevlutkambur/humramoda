# Hümra Moda — E-Ticaret Platformu

Hümra Moda, seçkin Türk kadın giyim ve modern tesettür modası için tasarlanmış, yüksek performanslı, mobil öncelikli ve PayTR entegrasyonlu modern bir e-ticaret platformudur.

> **Mevcut Aşama:** **Faz 2 (Proje Temeli, Tasarım Sistemi, Veritabanı ve Medya Hattı)** tamamlanmıştır.  
> Bu aşamada tasarım sistemi token'ları, PostgreSQL Prisma şeması, HEIC görsel dönüştürücü pipeline ve temel bileşen iskeleti oluşturulmuştur. Mağaza vitrini ve katalog sonraki aşamada (Faz 3) geliştirilecektir.

---

## 1. Kullanılan Kararlı Sürümler (Teknoloji Yığını)

| Teknoloji | Kararlı Sürüm | Seçim Gerekçesi |
|---|---|---|
| **Node.js** | `v24.20.0` (LTS) | En güncel kararlı LTS sürümü, yerleşik `node:test` ve modern V8 motoru. |
| **Next.js** | `16.4.2` (Turbopack) | En güncel kararlı sürüm; Server Components (RSC) ile FCP < 1s, gelişmiş görsel ve font optimizasyonu. |
| **React & React DOM** | `19.3.0` | Next.js 16 ile tam uyumlu resmi kararlı React motoru. |
| **TypeScript** | `5.7.3` | Sıkı tip denetimi (`strict: true`), Zod ve Prisma ile uçtan uca tip güvenliği. |
| **Prisma ORM** | `6.19.3` | PostgreSQL için en güncel kararlı ORM; stok kilitleme ve ACID transaction desteği. |
| **Sharp & heic-convert** | `0.35.5` / `2.1.0` | Apple HEIC fotoğraflarını Windows üzerinde harici OS bağımlılığı olmadan WebP ve AVIF'e dönüştürme. |
| **Vitest** | `3.2.7` | Hızlı ESM ve TypeScript birim test motoru. |

---

## 2. Ön Koşullar

1. **Node.js:** `v20.0.0` veya üzeri (Önerilen: `v24.20.0 LTS`).
2. **PostgreSQL:** `15` veya `16+` (Yerel PostgreSQL sunucusu, Docker konteyneri veya Supabase/Neon bulut veritabanı).
3. **PowerShell İpucu (Windows):** Windows üzerinde betik çalıştırma kısıtlamasıyla karşılaşırsanız oturumunuzda şu komutu çalıştırabilirsiniz:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

---

## 3. Kurulum ve Başlangıç Adımları

### 3.1. Ortam Değişkenlerini Hazırlama
`.env.example` dosyasını kopyalayarak yerel ortam dosyanızı oluşturun:
```powershell
Copy-Item .env.example .env.local
```
`.env.local` dosyasını açıp PostgreSQL bağlantı bilginizi (`DATABASE_URL`) tanımlayınız:
```env
DATABASE_URL="postgresql://postgres:parola@localhost:5432/humramoda?schema=public"
```

### 3.2. Bağımlılıkları Yükleme
```powershell
npm.cmd install
```

### 3.3. Prisma İstemcisini Derleme
```powershell
npm.cmd run prisma:generate
```
*(Bu komut yerel veritabanı bağlantısı **gerektirmez**; Prisma tip tanımlarını `node_modules` içine üretir).*

---

## 4. Medya Dönüştürme Pipeline'ı (HEIC -> WebP / AVIF)

Markaya ait çekim fotoğrafları `humraresimler/` klasöründe **22 adet orijinal Apple `.HEIC`** dosyası olarak yer almaktadır. Ayrıca `humravideolar/` klasöründe dikey moda videoları bulunmaktadır.

Orijinal dosyalara dokunmadan WebP ve AVIF türevlerini üretmek için:
```powershell
npm.cmd run media:process
```

- **Giriş:** `humraresimler/*.HEIC`
- **Çıkış:** `public/uploads/products/`
- **Kırılımlar:**
  - `thumb`: `240x320` (PDP küçük resimleri, sepet çekmecesi)
  - `card`: `640x853` (3:4 en-boy oranlı kategori kartları)
  - `detail`: `1440px` (Detay sayfası yüksek çözünürlüklü görünüm)
- **Güvenlik & Tekrarlanabilirlik:** Script idempotent'tir. Çıktı dosyaları mevcutsa dönüştürmeyi tekrarlamaz ve orijinal dosyaları asla silmez veya üzerine yazmaz.
- **Manifest:** `public/uploads/products/manifest.json` dosyasına tüm boyutlar, piksel ölçüleri ve dosya yolları kaydedilir.

---

## 5. Veritabanı ve Tohumlama (Seed) İşlemleri

### 5.1. Canlı Veritabanı Gerektiren Görevler
Aşağıdaki komutlar **yalnızca** çalışan bir PostgreSQL veritabanı (`DATABASE_URL`) yapılandırıldığında çalıştırılmalıdır:
1. **Migrasyon Çalıştırma:**
   ```powershell
   npm.cmd run prisma:migrate
   ```
2. **Tohumlama (Seed):**
   ```powershell
   npm.cmd run prisma:seed
   ```
   *Seed scripti uydurma müşteri verisi veya sahte fiyatlar eklemez; `manifest.json` içindeki gerçek çekim fotoğraflarını inceleme bekleyen taslak kayıtlar (`isDraft: true`, `isActive: false`) olarak kaydeder.*

### 5.2. Veritabanı Olmadan Çalışabilen Görevler
Uygulamanın mimarisi veritabanına bağlı kalmadan geliştirilebilecek şekilde tasarlanmıştır:
- `npm.cmd run dev` (Geliştirme sunucusu)
- `npm.cmd run build` (Statik derleme & paketleme)
- `npm.cmd run lint` (ESLint kod kontrolü)
- `npm.cmd run typecheck` (TypeScript tip kontrolü)
- `npm.cmd test` (Birim testleri)
- `npm.cmd run media:process` (Medya dönüştürücü)

---

## 6. Proje Doğrulama Komutları

| Komut | Açıklama |
|---|---|
| `npm.cmd run typecheck` | Sıkı TypeScript tip kontrolü (`tsc --noEmit`). |
| `npm.cmd run lint` | Next.js ve ESLint flat config kod kalitesi denetimi. |
| `npm.cmd test` | Vitest ile para birimi, kuruş ve tasarım token testleri. |
| `npm.cmd run build` | Next.js optimize üretim derlemesi (`next build`). |
| `npm.cmd run dev` | `http://localhost:3000` adresinde yerel geliştirme sunucusu. |

---

## 7. Sorun Giderme (Troubleshooting)

1. **`npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded...` Hatası:**
   - PowerShell betik güvenlik ilkesinden kaynaklanır. Terminalde `npm.cmd` veya `npx.cmd` kullanınız ya da `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` komutunu çalıştırınız.
2. **`Environment variable not found: DATABASE_URL` Hatası:**
   - Veritabanı migrasyonu veya seed çalıştırmadan önce `.env.local` dosyasının oluşturulduğundan ve `DATABASE_URL` değişkeninin tanımlı olduğundan emin olunuz.
3. **HEIC Dosyalarında Hata Alınması:**
   - `scripts/process-images.ts` dosyası saf WebAssembly / JavaScript tabanlı `heic-convert` motoru kullandığından ek bir C++ derleyicisine veya OS kütüphanesine ihtiyaç duymaz.

---

## 8. Sırada Ne Var?

- **Sonraki Aşama (Faz 3):** Çekirdek Katalog, Kategori Listeleme Sayfaları, Renge Özel Galeri ve Dinamik Ürün Detay Sayfası (PDP).
