# HÜMRA MODA — FAZ 7.7
# MÜŞTERİ ÜYELİK, GİRİŞ VE HESAP YÖNETİMİ RAPORU

**Tarih:** 2 Kasım 2026  
**Çalışma Ortamı:** Yalnızca LOCAL DEVELOPMENT  
**Aktif Veri Kaynağı:** `data/store.json`  
**Başlangıç SHA256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`  
**Bitiş SHA256:** `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` (%100 Birebir Eşleşme)  
**Medya Envanteri Doğrulama:** 155 / 155 Dosya (%100 Birebir Eşleşme)  
**Test Durumu:** 20 Test Paketi / 218 Test (%100 Başarılı)  
**Derleme (Build) Durumu:** Next.js 16.4.2 Production Build Başarılı (0 Hata)

---

## 1. KORUMA KURALLARINA UYUM VE VERİ BÜTÜNLÜĞÜ

Faz 7.7 süresince belirlenen tüm veri koruma ve sistem sınırlarına eksiksiz uyulmuştur:

- [x] **Local Development İzolasyonu:** Canlı sunucuya veya Vercel prodüksiyon ortamına bağlanılmadı; `git push` ve canlı deploy işlemleri yapılmadı.
- [x] **PostgreSQL Koruması:** Bu fazda PostgreSQL'e geçiş YAPILMAMIŞTIR. Herhangi bir migration veya reset komutu çalıştırılmamıştır.
- [x] **JSON Bütünlüğü:** `data/store.json` dosyasının başlangıç ve bitiş SHA256 hash değeri tam olarak korunmuştur (`2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A`).
- [x] **Betül Trençkot Koruması:** `prod-1793185888547` ID'li Betül Trençkot'un 10 varyantı, 4 SKU'su ve 100 stok adedi korunmuş; otomatik birleştirme yapılmamıştır.
- [x] **58 Eski Bildirim Koruması:** Geçmiş siparişlere ait 58 bildirim kaydına dokunulmamış, silinmemiş veya değiştirilmemiştir.
- [x] **155 Medya Dosyası Koruması:** `public/uploads` altındaki 155 dosyanın tamamı korunmuştur (0 kayıp, 0 fark).
- [x] **Misafir Alışverişi Koruması:** Mevcut misafir alışverişi, COD ve PayTR akışları geriye dönük uyumlu biçimde çalışmaya devam etmektedir.
- [x] **Gerçek İletişim İzolasyonu:** Canlı SMTP veya SMS servisi çağrılmamıştır.

---

## 2. GELİŞTİRİLEN VE ENTEGRE EDİLEN BİLEŞENLER

### 2.1. Ön Yüz Sayfaları (Pages)

| Rota | Başlık | İşlev ve Yetenekler |
| :--- | :--- | :--- |
| `/kayit` | Müşteri Kayıt Sayfası | Ad Soyad, E-posta, Telefon, Şifre, Şifre Tekrar. KVKK ve Üyelik Sözleşmesi onayları zorunlu; Pazarlama İzni ayrı ve önceden seçilmemiş. Başarılı kayıtta otomatik oturum açarak yönlendirir. |
| `/giris` | Müşteri Giriş Sayfası | E-posta ve şifreyle giriş. Şifre göster/gizle, rate limit geri sayımı, "Şifremi Unuttum" ve "Kayıt Ol" bağlantıları. `?redirect=...` parametresini destekler. |
| `/sifremi-unuttum` | Şifre Sıfırlama Talebi | E-posta doğrulaması, tek kullanımlık 32-byte kriptografik token üretimi, rate limiting koruması. Yerel geliştirme ortamında simülasyon test bağlantısı sunar. |
| `/sifre-sifirla` | Yeni Şifre Belirleme | Token parametresi kontrolü, yeni şifre ve tekrarı, güvenli scrypt güncellemesi, tek kullanımlık tüketim ve tüm eski oturumları geçersiz kılma. |
| `/hesabim` | Müşteri Hesap Paneli | 5 sekmeli yönetim: Hesap Özeti, Siparişlerim (kargo takibi ve sipariş detayı), Adreslerim (CRUD ve varsayılan seçimi), Kişisel Bilgiler, Şifre Değiştirme ve Güvenli Çıkış. |

### 2.2. Müşteri API Rotaları (Route Handlers)

| Rota | Metot | Açıklama ve Güvenlik Denetimleri |
| :--- | :---: | :--- |
| `/api/auth/register` | `POST` | Müşteri kaydı. Case-insensitive benzersiz e-posta kontrolü, scrypt hashleme, `hm_customer_session` HttpOnly çerezi tanımlama. |
| `/api/auth/login` | `POST` | Müşteri girişi. Brute-force korumalı rate limiter (5 denemede 15 dk blokaj), timing-safe parola doğrulaması. |
| `/api/auth/logout` | `POST` | Güvenli çıkış. Bellek içi token iptali (revocation) ve çerez temizleme (`maxAge: 0`). |
| `/api/auth/me` | `GET` | Oturum açmış müşterinin güvenli profil ve adres bilgileri (Parola hash'i asla dönülmez). |
| `/api/auth/forgot-password` | `POST` | Şifre sıfırlama token talebi. 15 dakikada en fazla 3 istek rate limit korumalı, kullanıcı enumeration engelli. |
| `/api/auth/reset-password` | `POST` | Tek kullanımlık token ile yeni şifre kaydetme ve eski oturumları anında geçersiz kılma (`tokenVersionTimestamp`). |
| `/api/customer/profile` | `PATCH` | Ad soyad, telefon ve pazarlama izni güncelleme (Yalnızca oturum açmış müşteri). |
| `/api/customer/password` | `POST` | Mevcut şifre doğrulamalı şifre değiştirme. |
| `/api/customer/addresses` | `GET`, `POST` | Adres listeleme ve yeni adres ekleme (İlk eklenen adres otomatik varsayılan yapılır). |
| `/api/customer/addresses/[id]`| `PUT`, `DELETE`| Adres düzenleme ve silme. **IDOR Korumalı:** Yalnızca müşterinin kendi adresine müdahale edilebilir. |
| `/api/customer/orders` | `GET` | Müşterinin kendi sipariş geçmişi. **IDOR Korumalı:** Yalnızca `order.userId === session.userId` siparişleri döner. |
| `/api/customer/orders/[id]` | `GET` | Tekil sipariş detay görünümü. **IDOR Korumalı:** Başka müşterinin siparişine erişim 404 ile engellenir. |

### 2.3. Context ve Arayüz Entegrasyonu

- **`CustomerAuthContext.tsx`:** Müşteri oturum durumunu yöneten global React Context. `useCustomerAuth()` hook'u ile giriş, kayıt, çıkış ve profil yenileme fonksiyonları sunar.
- **`StoreProviders.tsx`:** `CustomerAuthProvider` ana provider ağacına entegre edilmiştir.
- **`Header.tsx`:** Sağ aksiyon alanına kullanıcı profili ikonu eklendi. Giriş yapılmışsa doğrudan `/hesabim` paneline, giriş yapılmamışsa `/giris` sayfasına yönlendirir.
- **`MobileNav.tsx`:** Mobil yan çekmeceye "👤 Hesabım" ve "📦 Siparişlerim" veya "👤 Giriş Yap / Üye Ol" linkleri eklendi.
- **`CheckoutPage` (`/odeme`):**
  - Giriş yapmış müşteri için ad, soyad, e-posta ve telefon bilgileri otomatik doldurulur.
  - Kayıtlı adresler açılır menüden seçilebilir ("Evim", "İş Yerim" vb.).
  - Yeni adres girilirse "Bu adresi adres defterime kaydet" seçeneği sunulur.
  - Misafir alışverişi seçeneği tamamen korunmuştur.
  - Sipariş gönderiminde `order.userId` otomatik atanır.

---

## 3. GÜVENLİK VE TEKNİK DENETİMLER

### 3.1. Admin ve Müşteri Oturumlarının Tam Ayrılığı

- **Admin Oturumu:** `hm_admin_session` çerez adı ile saklanır. `ADMIN`, `STAFF` veya `CARRIER` rollerini taşır.
- **Müşteri Oturumu:** `hm_customer_session` çerez adı ile saklanır. Yalnızca `CUSTOMER` rolünü taşır.
- **Yetki İzolasyonu:**
  - Bir müşteri oturum çerezi `/admin` veya `/api/admin/*` rotalarına ASLA erişemez (`middleware.ts` ve `session-guard.ts` tarafından 401/403 ile engellenir).
  - Admin oturum çerezi müşteri korumalı API'lere müşteri kimliği gibi davranamaz (`verifyCustomerSessionToken` rol kontrolüyle reddeder).
  - İki oturum çerezi tarayıcıda aynı anda bulunsa dahi birbirine karışmaz.

### 3.2. Parola ve Kriptografi Güvenliği

- Parolalar düz metin (plaintext) olarak hiçbir yerde saklanmaz ve loglanmaz.
- Parola hashleme: Node.js yerel `crypto.scryptSync` (16-byte rastgele salt, 64-byte anahtar).
- Parola doğrulama: Zamanlama saldırılarını (timing attack) önleyen `crypto.timingSafeEqual`.
- Şifre sıfırlama token'ları: 32-byte (64 karakter hex) kriptografik rastgele değer (`crypto.randomBytes(32)`).
- Token geçerlilik süresi: 15 dakika; kullanıldığında anında `used: true` olarak tüketilir.

### 3.3. IDOR (Insecure Direct Object Reference) Önleme

- `/api/customer/addresses/[id]` rotalarında `address.customerId === session.userId` kontrolü zorunludur. Saldırgan başka bir müşterinin adres ID'sini gönderdiğinde 404 döner.
- `/api/customer/orders/[id]` rotasında `order.userId === session.userId` kontrolü zorunludur. Başka bir müşterinin sipariş numarası sorgulandığında sipariş verisi kesinlikle sızdırılmaz.
- Eski misafir siparişleri, sonradan aynı e-posta ile üye olan müşterilere yetkisiz olarak otomatik bağlanmaz; misafir siparişleri bağımsız kalır.

### 3.4. Brute-Force ve Rate Limiting

- **Müşteri Girişi:** 5 başarısız denemeden sonra hesap 15 dakika kilitlenir (`HTTP 429 Too Many Requests`).
- **Şifre Sıfırlama:** Aynı e-posta adresi için 15 dakikada en fazla 3 talep gönderilebilir.

---

## 4. BAĞIMSIZ DOĞRULAMA TEST SONUÇLARI

Faz 7.7 kapsamında geliştirilen tüm senaryolar otomatik testlerle doğrulanmıştır:

| Doğrulama Aracı | Çalıştırılan Komut | Sonuç / Çıktı | Durum |
| :--- | :--- | :--- | :---: |
| **TypeScript Tip Kontrolü** | `npx.cmd tsc --noEmit` | 0 Hata (Sıfır hata ile tamamlandı) | `BAŞARILI` |
| **Prisma Şema Doğrulama** | `npx.cmd prisma validate` | The schema at prisma\schema.prisma is valid | `BAŞARILI` |
| **Özel Müşteri Test Paketi** | `npx.cmd vitest run tests/customer-auth-account.test.ts` | 19 / 19 Test Başarılı | `BAŞARILI` |
| **Tüm Birim ve Entegrasyon Testleri** | `npm.cmd test` | 20 Test Paketi, 218 Test Başarılı (%100) | `BAŞARILI` |
| **Next.js Standalone Build** | `npm.cmd run build` | Tüm yeni rotalar derlendi, 0 Hata | `BAŞARILI` |
| **Medya Manifest Bütünlüğü** | `node scripts/verify-manifest.js` | 155 / 155 Dosya Tam Birebir Eşleşme | `BAŞARILI` |
| **store.json SHA256** | `node -e "..."` | `2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A` | `BAŞARILI` |

---

## 5. ÇÖZÜLEMEYEN KONULAR VE SONRAKİ AŞAMA ÖNERİLERİ

1. **E-posta ve SMS Servis Entegrasyonu:**
   - Mevcut sistemde gerçek SMTP veya SMS kimlik bilgileri tanımlı olmadığı için, şifre sıfırlama akışı yerel geliştirme ortamında simülasyon bağlantısı (`debugResetUrl`) ile çalışmaktadır.
   - Canlı prodüksiyona geçilmeden önce kurumsal e-posta sağlayıcısı (örn: Amazon SES, SendGrid veya özel SMTP) ve SMS sağlayıcı bilgileri `.env` üzerinden entegre edilmelidir.
2. **PostgreSQL Geçişi Öncesi Kararlar:**
   - Betül Trençkot'un 10 varyantındaki 2 çakışan kombinasyonun birleştirilmesi ve 58 eski bildirimin `orderId` ilişkisi kullanıcı onayı beklemektedir.
   - Bu kararlar kesinleştikten sonra PostgreSQL veritabanı şemasına `CARRIER` rolü, `FeaturedVideo`, `AuditLog` ve `SiteActivity` modelleri eklenerek geçiş tamamlanabilir.

---

## 6. ÖZET VE SONUÇ

Hümra Moda e-ticaret platformuna profesyonel, modern, güvenli ve lüks tasarım çizgisine tam uyumlu bir **Müşteri Üyelik, Giriş ve Hesap Yönetimi** sistemi başarıyla entegre edilmiştir.
Tüm koruma kurallarına uyulmuş, aktif veri kaynağı `data/store.json` hash değeri korunmuş, 155 medya dosyasına dokunulmamış ve PostgreSQL'e aktarım yapılmamıştır.
Sistem yerel ortamda %100 kararlı ve fonksiyoneldir.

