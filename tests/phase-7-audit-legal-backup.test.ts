/**
 * Hümra Moda — Faz 7: Uçtan Uca Sistem Denetimi, İade/Değişim, Yedekleme ve Yasal Sayfalar Testleri
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { PRODUCTS } from "../src/lib/catalog";
import {
  createReturnRequest,
  lookupOrderForReturns,
} from "../src/lib/server/returns";
import {
  verifyCustomerTrackingAccess,
  getMaskedOrderTrackingView,
} from "../src/lib/server/shipping";
import {
  createBackup,
  verifyBackupById,
  restoreBackupById,
  dryRunRestore,
} from "../src/lib/server/backup";
import {
  getStoreData,
  saveStoreData,
  StoreOrder,
  getStoreSettings,
} from "../src/lib/server/store";

describe("Faz 7: Uçtan Uca Sistem Denetimi ve Canlıya Geçiş Test Paketi", () => {
  let paidOrder: StoreOrder;
  let shippedOrder: StoreOrder;

  const storeFilePath = path.join(process.cwd(), "data", "store.json");
  let snapshot: string | null = null;

  beforeAll(() => {
    if (fs.existsSync(storeFilePath)) {
      snapshot = fs.readFileSync(storeFilePath, "utf-8");
    }
  });

  afterAll(() => {
    if (snapshot && fs.existsSync(storeFilePath)) {
      fs.writeFileSync(storeFilePath, snapshot, "utf-8");
    }
  });

  beforeEach(() => {
    const store = getStoreData();
    if (!store.products || store.products.length === 0) {
      store.products = JSON.parse(JSON.stringify(PRODUCTS));
    }

    // Test için stokları ve ürünleri sıfırla / güvenceye al
    if (store.products && store.products.length > 0) {
      for (const p of store.products) {
        for (const v of p.variants) {
          if (v.stockQuantity < 10) {
            v.stockQuantity = 50;
          }
        }
      }
    }

    // Test Siparişi 1: Ödenmiş ve kargo bekleyen sipariş
    paidOrder = {
      id: "ord-test-p7-1",
      orderNumber: "HM-20261021-P701",
      customerFullName: "Ayşe Yılmaz",
      customerEmail: "ayse.yilmaz@example.com",
      customerPhone: "0532 111 22 33",
      shippingAddress: {
        city: "İstanbul",
        district: "Kadıköy",
        fullAddress: "Moda Cad. No: 12 D: 4",
      },
      paymentStatus: "PAID",
      operationalStatus: "CONFIRMED",
      shippingStatus: "AWAITING_SHIPMENT",
      subtotal: 3148.2,
      discountAmount: 1574.1,
      shippingAmount: 0,
      totalAmount: 1574.1,
      totalKurus: 157410,
      stockDeducted: true,
      items: [
        {
          id: "item-p7-1",
          productId: "prod-1",
          productName: "Qapitone Garnili Scuba İkili Takım",
          variantId: "var-prod-1-0",
          colorName: "Siyah",
          sizeName: "1 Beden (36-38)",
          sku: "HM-SCB-SYH-B1",
          unitPrice: 1574.1,
          quantity: 2,
          totalPrice: 3148.2,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Test Siparişi 2: Kargoya verilmiş sipariş
    shippedOrder = {
      id: "ord-test-p7-2",
      orderNumber: "HM-20261021-P702",
      customerFullName: "Zeynep Kaya",
      customerEmail: "zeynep.kaya@example.com",
      customerPhone: "0542 999 88 77",
      shippingAddress: {
        city: "İzmir",
        district: "Karşıyaka",
        fullAddress: "Bahar Sok. No: 5",
      },
      paymentStatus: "PAID",
      operationalStatus: "CONFIRMED",
      shippingStatus: "SHIPPED",
      carrier: "yurtici",
      carrierName: "Yurtiçi Kargo",
      trackingNumber: "YK123456789",
      subtotal: 1800,
      discountAmount: 0,
      shippingAmount: 0,
      totalAmount: 1800,
      totalKurus: 180000,
      stockDeducted: true,
      items: [
        {
          id: "item-p7-2",
          productId: "prod-2",
          productName: "Şardonlu Ceket Geniş Paça Takım",
          variantId: "var-prod-2-0",
          colorName: "Vizon",
          sizeName: "2 Beden (40-42)",
          sku: "HM-SRD-VZN-B2",
          unitPrice: 1800,
          quantity: 1,
          totalPrice: 1800,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.orders = (store.orders || []).filter(
      (o) => o.id !== paidOrder.id && o.id !== shippedOrder.id
    );
    store.orders.unshift(paidOrder, shippedOrder);

    // İade taleplerini bu siparişler için temizle
    store.returnRequests = (store.returnRequests || []).filter(
      (r) => r.orderId !== paidOrder.id && r.orderId !== shippedOrder.id
    );

    saveStoreData(store);
  });

  afterEach(() => {
    const store = getStoreData();
    store.orders = (store.orders || []).filter(
      (o) => o.id !== paidOrder?.id && o.id !== shippedOrder?.id
    );
    store.returnRequests = (store.returnRequests || []).filter(
      (r) => r.orderId !== paidOrder?.id && r.orderId !== shippedOrder?.id
    );
    saveStoreData(store);
  });

  // Test 1: Sipariş ve Kargo Takibi Doğrulama ve Maskeleme
  it("1. Sipariş takibi doğru e-posta veya telefonla çalışır; yetkisiz sorguyu ve açık veriyi sızdırmaz", () => {
    // Geçerli e-posta ile sorgu
    const authByEmail = verifyCustomerTrackingAccess(paidOrder.orderNumber, {
      email: "ayse.yilmaz@example.com",
    });
    expect(authByEmail.authorized).toBe(true);
    expect(authByEmail.order?.orderNumber).toBe(paidOrder.orderNumber);

    // Geçerli telefon ile sorgu
    const authByPhone = verifyCustomerTrackingAccess(paidOrder.orderNumber, {
      phone: "0532 111 22 33",
    });
    expect(authByPhone.authorized).toBe(true);

    // Yanlış kimlik bilgisiyle sorgu (yetkisiz)
    const unauthorized = verifyCustomerTrackingAccess(paidOrder.orderNumber, {
      email: "baska.biri@example.com",
    });
    expect(unauthorized.authorized).toBe(false);

    // Maskeli görünümde açık adres ve telefonun gizlenmesi
    const masked = getMaskedOrderTrackingView(paidOrder);
    expect(masked.customerName).toContain("*");
    expect(masked.customerEmail).toContain("***");
    expect(masked.customerPhone).toContain("***");
    expect((masked as Record<string, unknown>).shippingAddress).toBeUndefined();
    expect(masked.city).toBe("İstanbul");
    expect(masked.district).toBe("Kadıköy");
  });

  // Test 2: İade/Değişim için Sipariş Sorgulama (lookupOrderForReturns)
  it("2. İade ve değişim sipariş sorgulaması uygun eylemleri ve kalan adetleri doğru listeler", () => {
    // Henüz kargolanmamış sipariş: İptal, İade ve Değişim uygun olmalıdır
    const lookup1 = lookupOrderForReturns(paidOrder.orderNumber, {
      email: paidOrder.customerEmail,
    });
    expect(lookup1.authorized).toBe(true);
    expect(lookup1.eligibleActions?.canCancel).toBe(true);
    expect(lookup1.eligibleActions?.canReturn).toBe(true);
    expect(lookup1.eligibleActions?.canExchange).toBe(true);
    expect(lookup1.items?.[0].availableQuantity).toBe(2);

    // Kargoya verilmiş sipariş: Doğrudan iptal uygun OLMAMALI (kargo yolda), İade ve Değişim uygun olmalıdır
    const lookup2 = lookupOrderForReturns(shippedOrder.orderNumber, {
      phone: shippedOrder.customerPhone,
    });
    expect(lookup2.authorized).toBe(true);
    expect(lookup2.eligibleActions?.canCancel).toBe(false);
    expect(lookup2.eligibleActions?.cancelReasonMessage).toContain("kargoya verildiğinden");
    expect(lookup2.eligibleActions?.canReturn).toBe(true);
    expect(lookup2.eligibleActions?.canExchange).toBe(true);
  });

  // Test 3: Kargoya verilmiş sipariş için doğrudan iptal engellenmeli
  it("3. Kargoya verilmiş sipariş için iptal talebi engellenir, iade/değişime yönlendirilir", () => {
    const cancelResult = createReturnRequest({
      orderNumber: shippedOrder.orderNumber,
      customerEmail: shippedOrder.customerEmail,
      requestType: "CANCEL",
      reason: "Vazgeçtim",
      items: [{ orderItemId: shippedOrder.items[0].id, quantity: 1 }],
    });

    expect(cancelResult.success).toBe(false);
    expect(cancelResult.error).toContain("Kargoya verilmiş olan siparişler doğrudan iptal edilemez");
  });

  // Test 4: Kargolanmamış sipariş için iptal talebi oluşturulabilir
  it("4. Kargolanmamış sipariş için geçerli iptal talebi oluşturulur", () => {
    const cancelResult = createReturnRequest({
      orderNumber: paidOrder.orderNumber,
      customerPhone: paidOrder.customerPhone,
      requestType: "CANCEL",
      reason: "Fikrimi değiştirdim",
      items: [{ orderItemId: paidOrder.items[0].id, quantity: 1 }],
    });

    expect(cancelResult.success).toBe(true);
    expect(cancelResult.returnRequest?.requestType).toBe("CANCEL");
    expect(cancelResult.returnRequest?.status).toBe("REQUESTED");
  });

  // Test 5: Beden ve Renk Değişim Talebi Oluşturma
  it("5. Beden ve renk değişim talebi tercih edilen varyant bilgileriyle kaydedilir", () => {
    const exchangeResult = createReturnRequest({
      orderNumber: paidOrder.orderNumber,
      customerEmail: paidOrder.customerEmail,
      requestType: "EXCHANGE",
      reason: "Beden dar geldi",
      exchangeDetails: {
        requestedSize: "2 Beden (40-42)",
        requestedColor: "Siyah",
        notes: "Mümkünse bir üst beden ile değişim rica ederim",
      },
      items: [{ orderItemId: paidOrder.items[0].id, quantity: 1 }],
    });

    expect(exchangeResult.success).toBe(true);
    expect(exchangeResult.returnRequest?.requestType).toBe("EXCHANGE");
    expect(exchangeResult.returnRequest?.exchangeDetails?.requestedSize).toBe("2 Beden (40-42)");
    expect(exchangeResult.returnRequest?.exchangeDetails?.requestedColor).toBe("Siyah");
  });

  // Test 6: Aynı kalem için mükerrer talep engellenir
  it("6. Aynı sipariş kalemi için kalan adetten fazla talep açılması engellenir", () => {
    // 1. Talep: 2 adetten 1 adedini talep et
    const req1 = createReturnRequest({
      orderNumber: paidOrder.orderNumber,
      customerEmail: paidOrder.customerEmail,
      requestType: "RETURN",
      reason: "Kumaş rengi uymadı",
      items: [{ orderItemId: paidOrder.items[0].id, quantity: 1 }],
    });
    expect(req1.success).toBe(true);

    // 2. Talep: Kalan 1 adet varken 2 adet daha talep etmeye çalış -> Hata vermelidir
    const req2 = createReturnRequest({
      orderNumber: paidOrder.orderNumber,
      customerEmail: paidOrder.customerEmail,
      requestType: "RETURN",
      reason: "Kumaş rengi uymadı",
      items: [{ orderItemId: paidOrder.items[0].id, quantity: 2 }],
    });
    expect(req2.success).toBe(false);
    expect(req2.error).toContain("talep edilebilir adet");
  });

  // Test 7: Yedekleme Manifesti ve Kapsam Denetimi
  it("7. Yedekleme işlemi oluşturulurken sipariş, kargo ve iade sayılarını da manifestoya kaydeder", () => {
    const backupResult = createBackup("MANUAL", "Faz 7 Denetim Yedeği", {
      adminId: "ADMIN-TEST",
      adminEmail: "admin@humramoda.local",
    });

    expect(backupResult.manifest).toBeDefined();
    expect(backupResult.manifest?.isValid).toBe(true);
    expect(backupResult.manifest?.sha256Checksum).toHaveLength(64);
    expect(backupResult.manifest?.itemCounts.orders).toBeGreaterThan(0);
    expect(backupResult.manifest?.itemCounts.shipments).toBeDefined();
    expect(backupResult.manifest?.itemCounts.returns).toBeDefined();
  });

  // Test 8: Yedek Bütünlüğü Doğrulama ve Dry-Run (Prova Geri Yükleme)
  it("8. Yedek bütünlüğü SHA-256 ile doğrulanır ve prova geri yükleme veriyi değiştirmeden çalışır", () => {
    const backup = createBackup("MANUAL", "Doğrulama ve Prova Yedeği");
    expect(backup.manifest).toBeDefined();
    const backupId = backup.manifest!.id;

    // Bütünlük kontrolü
    const verify = verifyBackupById(backupId);
    expect(verify.isValid).toBe(true);
    expect(verify.calculatedChecksum).toBe(backup.manifest!.sha256Checksum);

    // Dry-run prova
    const dryRun = dryRunRestore(backupId, true);
    expect(dryRun.success).toBe(true);
    expect(dryRun.preview).toBeDefined();
    expect(dryRun.preview?.productsCount).toBeGreaterThan(0);
  });

  // Test 9: Bozulmuş / değiştirilmiş yedek geri yüklenemez
  it("9. SHA-256 sağlama toplamı tutmayan bozuk yedek geri yüklenemez", () => {
    const backup = createBackup("MANUAL", "Bozulacak Yedek");
    const backupId = backup.manifest!.id;
    const filePath = path.join(process.cwd(), "data", "backups", `${backupId}.json`);

    // Dosyayı oku ve veriyi manipüle et (checksum eski kalırken veri değişir)
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    parsed.data.products.push({ id: "hacked-product", title: "Sahte Ürün" });
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf-8");

    // Doğrulama başarısız olmalıdır
    const verify = verifyBackupById(backupId);
    expect(verify.isValid).toBe(false);
    expect(verify.error).toContain("Bütünlük hatası");

    // Geri yükleme reddedilmelidir
    const restoreResult = restoreBackupById(backupId, {
      adminId: "ADMIN",
      adminEmail: "admin@humramoda.local",
    });
    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain("Bütünlük hatası");
  });

  // Test 10: Kurumsal ve Yasal Ayarların Varlığı
  it("10. Mağaza ayarları yasal sözleşmeler için gerekli kurumsal alanları içerir", () => {
    const settings = getStoreSettings();
    expect(settings.storeName).toBe("Hümra Moda");
    expect(settings.companyTitle).toBeDefined();
    expect(settings.taxOffice).toBeDefined();
    expect(settings.address).toContain("İstanbul");
    expect(settings.email).toBeDefined();
  });
});
