# Hümra Moda — Faz 7: Uçtan Uca Sistem Denetimi, Eksik Sayfalar, Yedekleme ve Canlıya Geçiş Hazırlığı Raporu

**Tarih:** 21 Ekim 2026  
**Durum:** Tamamlandı (Uçtan Uca Denetlendi, Tüm Testler Başarılı, Canlıya Geçişe Hazır)  
**Teknoloji:** Next.js App Router 16.4.2 (Turbopack), TypeScript 5.8, Prisma 6.4.1, Vitest 3.2.7, Node.js Crypto (HMAC-SHA256, timingSafeEqual), Vanilla CSS  

---

## 1. Yönetici Özeti ve Faz 7 Kapsamı

Faz 7 kapsamında Hümra Moda e-ticaret platformunda mağaza vitrini, yönetim paneli, ödeme ve kargo akışları baştan sona denetlenmiş; eksik kalan müşteri ve yasal sayfalar oluşturulmuş, iptal/iade/değişim akışı kullanıcı dostu ve güvenli bir motorla ayrıştırılmış, yedekleme ve geri yükleme altyapısı prova (dry-run) desteğiyle pekiştirilmiştir.

---

## 2. Oluşturulan ve Güncellenen Sayfalar

| Sayfa Adresi (URL) | Tür / Bileşen | Açıklama ve Standart | Durum |
| :--- | :--- | :--- | :---: |
| **`/siparis-takip`** | Müşteri Vitrini | Sipariş no ve e-posta/telefon ile iki faktörlü kargo ve sipariş takip ekranı. KVKK veri maskelemesi ve IDOR koruması doğrulanmıştır. | **TAMAMLANDI VE TEST EDİLDİ** |
| **`/iade-degisim`** | Müşteri Vitrini | Sipariş takibinden bağımsız, 8 adımlı iptal, iade ve beden/renk değişimi talep sihirbazı. Kalem bazlı kalan adet kontrolü ve mükerrer talep engellemesi içerir. | **TAMAMLANDI VE TEST EDİLDİ** |
| **`/mesafeli-satis-sozlesmesi`** | Yasal Sayfa | 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği'ne uygun, yazdırılabilir (`PrintButton`) ve sürümlenebilir (`2026-v1.0`) sözleşme sayfası. | **TAMAMLANDI VE TEST EDİLDİ** |
| **`/gizlilik-ve-cerez-politikasi`** | Yasal Sayfa | Gerçek sistem davranışını (oturum, sepet, cookie_consent) şeffafça açıklayan, harici reklam izleyicisi içermeyen ve interaktif çerez tercih butonu barındıran politika sayfası. | **TAMAMLANDI VE TEST EDİLDİ** |
| **`/kvkk-aydinlatma-metni`** | Yasal Sayfa | 6698 sayılı Kanun m. 10 uyarınca veri sorumlusu, veri kategorileri, işleme amaçları, PayTR/kargo aktarımları ve m. 11 başvuru haklarını içeren metin. | **TAMAMLANDI VE TEST EDİLDİ** |
| **`CookieConsent`** | Global Bileşen | Kalıcı çerez tercih çubuğu ve modalı (`cookie_consent`: `"necessary" | "all"`). İstediği zaman tercihi değiştirme imkanı sunar. | **TAMAMLANDI VE TEST EDİLDİ** |
| **`/api/returns/lookup`** | API Rotası | Müşterinin sipariş numarasını e-posta/telefon ile doğrulayarak iade/iptal/değişime uygun kalemleri ve kalan adetleri döndüren güvenli uç nokta. | **TAMAMLANDI VE TEST EDİLDİ** |
| **`/admin/iade-talepleri`** | Yönetim Paneli | İptal, iade ve değişim taleplerini tür rozetleri (`İptal`, `İade`, `Değişim`) ve istenen beden/renk detaylarıyla inceleme ekranı. | **TAMAMLANDI VE TEST EDİLDİ** |

---

## 3. Yapılan Güvenlik ve Bütünlük İyileştirmeleri

1. **IDOR ve Veri Sızıntısı Koruması:**
   - `/api/tracking/lookup` ve `/api/returns/lookup` uç noktalarında yalnızca sipariş numarası girmek yetersizdir; siparişle eşleşen e-posta veya telefon numarası doğrulanmadan hiçbir veri dönülmez.
   - Dönen yanıtlarda açık ev/iş adresi gizlenir, yalnızca ilçe ve il sunulur. Ad, e-posta ve telefon KVKK standartlarında maskelenir (`A*** Y***`, `0532 *** ** 12`).
2. **Kargolanmış Sipariş İptal Koruması:**
   - Sipariş kargoya verildiyse (`SHIPPED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`), müşteri doğrudan iptal talebi oluşturamaz; teslimat sonrası iade veya değişim talep etmesi gerektiği açıkça belirtilir.
3. **Mükerrer ve Eş Zamanlı Talep Koruması:**
   - Kalem bazında açıkta bekleyen talepler toplanarak `availableQuantity` hesaplanır. Bir ürün için mevcut sipariş adedinden fazla talep açılması engellenir.
4. **Tutar Aşım Sınırı (Refund Ceilings):**
   - Talep edilen toplam tutar, siparişin ödenen tutarından daha önce iade edilmiş ve talep edilmiş tutarlar düşüldükten sonra kalan bakiyeyi aşamaz.
5. **Yedekleme ve Geri Yükleme Dayanıklılığı:**
   - Yedekleme manifestosuna `shipments` ve `returns` sayıları eklenmiştir.
   - Geri yükleme sırasında `preserveNewerOrders: true` parametresiyle, yedek tarihinden sonra oluşturulmuş yeni siparişlerin, kargo gönderilerinin ve iade taleplerinin silinmesi engellenir.
   - `dryRunRestore` fonksiyonu ile veritabanı/dosya değiştirilmeden geri yükleme provası yapılabilir.
   - SHA-256 sağlama toplamı tutmayan tahrif edilmiş yedekler kesinlikle geri yüklenemez.
6. **Çerez İzin Yönetimi (GDPR / KVKK):**
   - Açık rıza alınmadan hiçbir isteğe bağlı izleyici veya analitik aracı çalıştırılmaz. Zorunlu oturum çerezleri (`admin_token`, `cookie_consent`) ile isteğe bağlı çerezler net biçimde ayrılmıştır.

---

## 4. Yedekleme ve Geri Yükleme Denetim Sonuçları

- **Manuel Yedekleme:** Başarıyla SHA-256 imzalı JSON manifestosu üretir.
- **Bütünlük Kontrolü:** Dosya içeriği tahrif edildiğinde SHA-256 uyuşmazlığı yakalanır ve işlem reddedilir.
- **Güvenlik Yedeği:** Herhangi bir geri yükleme başlatılmadan önce anlık durum otomatik olarak `SAFETY` tipiyle yedeklenir.
- **Prova Modu (Dry-Run):** `/api/admin/backups/[id]/restore` uç noktasına `{ dryRun: true }` gönderildiğinde hiçbir dosyaya dokunulmadan simülasyon yapılır.
- **Denetim Logları:** Yedek alma, doğrulama, geri yükleme ve prova adımları IP adresi ve yönetici bilgisiyle `logAdminAudit` sistemine işlenir.

---

## 5. Çalıştırılan Komutlar ve Gerçek Test Sonuçları

| Komut | Kapsam | Gerçek Sonuç |
| :--- | :--- | :---: |
| **`npm.cmd run typecheck`** | TypeScript (`tsc --noEmit`) | **0 HATA (Exit Code: 0)** |
| **`npm.cmd run lint`** | ESLint (`eslint .`) | **0 HATA (Exit Code: 0)** |
| **`npm.cmd test`** | Vitest Tüm Test Dosyaları | **11 TEST DOSYASI, 100/100 TEST BAŞARILI (%100 Pass)** |
| **`npm.cmd run build`** | Next.js Production Build (Turbopack) | **65 ROTA BAŞARIYLA DERLENDİ (Exit Code: 0)** |

### Vitest Test Dağılımı (100 Test):
- `tests/admin-store.test.ts`: 21 test (PASSED)
- `tests/shipping-returns.test.ts`: 15 test (PASSED)
- `tests/phase-7-audit-legal-backup.test.ts`: 10 test (PASSED)
- `tests/paytr.test.ts`: 11 test (PASSED)
- `tests/auth.test.ts`: 8 test (PASSED)
- `tests/catalog.test.ts`: 9 test (PASSED)
- `tests/media-upload.test.ts`: 8 test (PASSED)
- `tests/tokens-media.test.ts`: 6 test (PASSED)
- `tests/api-security.test.ts`: 5 test (PASSED)
- `tests/formatters.test.ts`: 4 test (PASSED)
- `tests/migration-safety.test.ts`: 3 test (PASSED)

---

## 6. Dış Bağımlılıkların Gerçek Durumu

1. **PostgreSQL Veritabanı:**
   - **Gerçek Durum:** Geliştirme ortamında PostgreSQL hizmeti (port 5432) çalışmamaktadır.
   - **Mimari:** Sistem `data/store.json` depolama katmanıyla tam ve kayıpsız çalışmaktadır.
   - **Hazırlık:** `prisma/schema.prisma` ve migration SQL dosyaları (`prisma/migrations/20261021200000_phase6_shipping_returns/migration.sql`) hazırdır. Canlı PostgreSQL sunucusu sağlandığında tek komutla (`npx prisma migrate deploy`) uygulanabilir.
2. **PayTR Ödeme Sistemi:**
   - **Gerçek Durum:** Canlı PayTR mağaza anahtarları ve canlı sözleşme bulunmadığından test/simülasyon modunda güvenle çalışmaktadır.
   - **Hazırlık:** Timing-safe imza doğrulama, token üretimi ve callback idempotency katmanı tamamlanmıştır.
3. **Kargo Entegrasyonu:**
   - **Gerçek Durum:** Yurtiçi/Aras/MNG kurumsal API sözleşmesi ve kurumsal müşteri numarası girilmediği için test modunda ve manuel takip desteğiyle çalışmaktadır.
   - **Hazırlık:** Sağlayıcıdan bağımsız servis adaptörü ve HMAC webhook doğrulayıcısı hazırdır.
4. **E-Posta / SMS Bildirimleri:**
   - **Gerçek Durum:** `ENABLE_LIVE_EMAILS="false"` olarak ayarlanmıştır; gerçek müşterilere spam e-posta gitmez.
   - **Hazırlık:** 9 olay için HTML/metin e-posta şablonları ve outbox idempotency motoru hazırdır.

---

## 7. Hukuki ve İşletme Onayı Bekleyen Alanlar

1. **Şirket Resmi Bilgileri:**
   - Ticari unvan, MERSİS numarası, vergi dairesi ve vergi kimlik numarası yönetim panelindeki `StoreSettings` üzerinden girilmeli ve tescil edilmelidir.
2. **Mesafeli Satış Sözleşmesi Hukuk Müşaviri Onayı:**
   - 6502 sayılı Kanun kapsamında hazırlanan taslak sözleşme metninin şirket avukatı tarafından nihai paraflanması gerekmektedir.
3. **KVKK Veri Sorumlusu Tescili:**
   - VERBİS yükümlülüğü durumunun ve başvuru e-posta adresinin (`kvkk@humramoda.com`) şirket yetkililerince teyidi.

---

## 8. Canlıya Geçiş Öncesi Yapılacaklar Listesi

- [ ] Canlı ortam `.env` dosyasında güçlü rastgele gizli anahtarlar tanımlanması (`SESSION_SECRET`, `PAYTR_MERCHANT_KEY`, `SHIPPING_WEBHOOK_SECRET`).
- [ ] Canlı PostgreSQL bağlantı URL'sinin (`DATABASE_URL`) girilerek `npx prisma migrate deploy` komutunun çalıştırılması.
- [ ] PayTR kurumsal mağaza paneli üzerinden canlı merchant bilgileri ve callback URL'sinin (`https://humramoda.com/api/payments/paytr/callback`) tanımlanması.
- [ ] Tercih edilen kargo firması (Yurtiçi/Aras/MNG) kurumsal API anahtarlarının girilmesi.
- [ ] Kurumsal SMTP veya Resend/SES e-posta sunucusunun bağlanarak `ENABLE_LIVE_EMAILS="true"` yapılması.
- [ ] Yönetim paneli varsayılan yönetici parolasının güçlü bir parolayla değiştirilmesi.
