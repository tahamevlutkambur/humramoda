import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  getStoreData,
  saveStoreData,
  createCashOnDeliveryOrder,
  createPendingOrder,
  executeWithOrderLock,
} from "@/lib/server/store";
import { processPayTRCallback, computePayTRCallbackHash, getPayTRConfig } from "@/lib/server/paytr";

const REFERENCE_HASH = "2875173586111553955594984012CBD0AD2BFB366CBD87D1FB85BD2C71753E5A";
const storePath = path.resolve("data/store.json");
let pristineStore = "";

describe("FAZ 7.3.2: Sipariş Güvenliği ve Mutex Kilit Regresyon Testleri", () => {
  beforeAll(() => {
    pristineStore = fs.readFileSync(storePath, "utf8");
  });

  afterAll(() => {
    if (pristineStore) {
      try {
        const cur = fs.readFileSync(storePath, "utf8");
        if (cur !== pristineStore) {
          fs.writeFileSync(storePath, pristineStore, "utf8");
        }
      } catch {}
    }
    const currentHash = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex").toUpperCase();
    expect(currentHash).toBe(REFERENCE_HASH);
  });

  it("1. İki eşzamanlı COD isteği: Stok 1 iken sadece 1'i başarılı olmalı, diğeri reddedilmeli ve stok 0 kalmalıdır", async () => {
    const store = getStoreData();
    const product = store.products[0];
    const targetVariant = product.variants[0];

    const originalStock = targetVariant.stockQuantity;
    targetVariant.stockQuantity = 1;
    saveStoreData(store);

    try {
      const payloadA = {
        customer: {
          fullName: "Eşzamanlı COD A",
          email: "cod.concurrent.a@example.com",
          phone: "05321112233",
          city: "İstanbul",
          district: "Kadıköy",
          fullAddress: "Moda Cad. No: 10",
        },
        items: [
          {
            productId: product.id,
            variantId: targetVariant.id,
            sku: targetVariant.sku,
            quantity: 1,
          },
        ],
      };

      const payloadB = {
        customer: {
          fullName: "Eşzamanlı COD B",
          email: "cod.concurrent.b@example.com",
          phone: "05321112244",
          city: "İzmir",
          district: "Karşıyaka",
          fullAddress: "Bostanlı Mah. No: 20",
        },
        items: [
          {
            productId: product.id,
            variantId: targetVariant.id,
            sku: targetVariant.sku,
            quantity: 1,
          },
        ],
      };

      const [resA, resB] = await Promise.all([
        executeWithOrderLock(async () => createCashOnDeliveryOrder(payloadA)),
        executeWithOrderLock(async () => createCashOnDeliveryOrder(payloadB)),
      ]);

      const successes = [resA, resB].filter((r) => r.success);
      const failures = [resA, resB].filter((r) => !r.success);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect(failures[0].error).toContain("yeterli stok bulunmuyor");

      const latestStore = getStoreData();
      const updatedVariant = latestStore.products[0].variants[0];
      expect(updatedVariant.stockQuantity).toBe(0);
    } finally {
      const resetStore = getStoreData();
      resetStore.products[0].variants[0].stockQuantity = originalStock;
      saveStoreData(resetStore);
    }
  });

  it("2. İki eşzamanlı PayTR isteği: Stok 1 iken oluşturulan taslak siparişlerin onay/callback sürecinde çift stok düşülmemeli", async () => {
    const store = getStoreData();
    const product = store.products[0];
    const targetVariant = product.variants[0];

    const originalStock = targetVariant.stockQuantity;
    targetVariant.stockQuantity = 1;
    saveStoreData(store);

    try {
      const payloadA = {
        customer: {
          fullName: "PayTR Müşteri A",
          email: "paytr.concurrent.a@example.com",
          phone: "05322223344",
          city: "Ankara",
          district: "Çankaya",
          fullAddress: "Tunalı No: 5",
        },
        items: [
          {
            productId: product.id,
            variantId: targetVariant.id,
            sku: targetVariant.sku,
            quantity: 1,
          },
        ],
      };

      const payloadB = {
        customer: {
          fullName: "PayTR Müşteri B",
          email: "paytr.concurrent.b@example.com",
          phone: "05322223355",
          city: "Bursa",
          district: "Nilüfer",
          fullAddress: "Özlüce No: 8",
        },
        items: [
          {
            productId: product.id,
            variantId: targetVariant.id,
            sku: targetVariant.sku,
            quantity: 1,
          },
        ],
      };

      const [orderResA, orderResB] = await Promise.all([
        executeWithOrderLock(async () => createPendingOrder(payloadA)),
        executeWithOrderLock(async () => createPendingOrder(payloadB)),
      ]);

      expect(orderResA.success).toBe(true);
      expect(orderResB.success).toBe(true);

      const config = getPayTRConfig();

      // İki callback'i eşzamanlı olarak executeWithOrderLock altında yarıştır
      const hashA = computePayTRCallbackHash({
        merchantOid: orderResA.order!.orderNumber,
        status: "success",
        totalAmount: orderResA.order!.totalKurus,
        merchantSalt: config.merchantSalt,
        merchantKey: config.merchantKey,
      });

      const hashB = computePayTRCallbackHash({
        merchantOid: orderResB.order!.orderNumber,
        status: "success",
        totalAmount: orderResB.order!.totalKurus,
        merchantSalt: config.merchantSalt,
        merchantKey: config.merchantKey,
      });

      const [cbA, cbB] = await Promise.all([
        executeWithOrderLock(async () =>
          processPayTRCallback({
            merchantOid: orderResA.order!.orderNumber,
            status: "success",
            totalAmount: String(orderResA.order!.totalKurus),
            hash: hashA,
          })
        ),
        executeWithOrderLock(async () =>
          processPayTRCallback({
            merchantOid: orderResB.order!.orderNumber,
            status: "success",
            totalAmount: String(orderResB.order!.totalKurus),
            hash: hashB,
          })
        ),
      ]);

      expect(cbA.ok).toBe(true);
      expect(cbB.ok).toBe(true);

      const latestStore = getStoreData();
      const updatedVariant = latestStore.products[0].variants[0];
      // Stok Math.max(0, ...) ile asla negatife düşmemeli
      expect(updatedVariant.stockQuantity).toBe(0);
      expect(updatedVariant.stockQuantity).toBeGreaterThanOrEqual(0);
    } finally {
      const resetStore = getStoreData();
      resetStore.products[0].variants[0].stockQuantity = originalStock;
      saveStoreData(resetStore);
    }
  });

  it("3. COD ve PayTR rotalarından aynı varyanta eşzamanlı istek: COD anında stok düşer, PayTR callback stok altına düşemez", async () => {
    const store = getStoreData();
    const product = store.products[0];
    const targetVariant = product.variants[0];

    const originalStock = targetVariant.stockQuantity;
    targetVariant.stockQuantity = 1;
    saveStoreData(store);

    try {
      const codPayload = {
        customer: {
          fullName: "Yarış COD",
          email: "race.cod@example.com",
          phone: "05333334455",
          city: "Antalya",
          district: "Muratpaşa",
          fullAddress: "Lara Cad. No: 15",
        },
        items: [
          {
            productId: product.id,
            variantId: targetVariant.id,
            sku: targetVariant.sku,
            quantity: 1,
          },
        ],
      };

      const paytrPayload = {
        customer: {
          fullName: "Yarış PayTR",
          email: "race.paytr@example.com",
          phone: "05333334466",
          city: "Eskişehir",
          district: "Tepebaşı",
          fullAddress: "Bağlar Cad. No: 4",
        },
        items: [
          {
            productId: product.id,
            variantId: targetVariant.id,
            sku: targetVariant.sku,
            quantity: 1,
          },
        ],
      };

      // COD ve PayTR taslak siparişini eşzamanlı Mutex altında yarıştır
      const [codRes, paytrRes] = await Promise.all([
        executeWithOrderLock(async () => createCashOnDeliveryOrder(codPayload)),
        executeWithOrderLock(async () => createPendingOrder(paytrPayload)),
      ]);

      expect(codRes.success).toBe(true);
      // COD anında stok 1'den 0'a düşmüştür
      const midStore = getStoreData();
      expect(midStore.products[0].variants[0].stockQuantity).toBe(0);

      // Şimdi PayTR için callback gelirse stok 0 iken stok altına (-1'e) inmemeli
      if (paytrRes.success && paytrRes.order) {
        const config = getPayTRConfig();
        const hash = computePayTRCallbackHash({
          merchantOid: paytrRes.order.orderNumber,
          status: "success",
          totalAmount: paytrRes.order.totalKurus,
          merchantSalt: config.merchantSalt,
          merchantKey: config.merchantKey,
        });

        const cbRes = await executeWithOrderLock(async () =>
          processPayTRCallback({
            merchantOid: paytrRes.order!.orderNumber,
            status: "success",
            totalAmount: String(paytrRes.order!.totalKurus),
            hash,
          })
        );
        expect(cbRes.ok).toBe(true);

        const finalStore = getStoreData();
        expect(finalStore.products[0].variants[0].stockQuantity).toBe(0);
      }
    } finally {
      const resetStore = getStoreData();
      resetStore.products[0].variants[0].stockQuantity = originalStock;
      saveStoreData(resetStore);
    }
  });

  it("4. Aynı idempotency isteğinin tekrarlanması: 60s içinde aynı istekte mükerrer sipariş açılmaz, stok tekrar düşülmez", async () => {
    const store = getStoreData();
    const product = store.products[0];
    const targetVariant = product.variants[0];

    const originalStock = targetVariant.stockQuantity;
    targetVariant.stockQuantity = 5;
    saveStoreData(store);

    try {
      const payload = {
        customer: {
          fullName: "İdempotent Müşteri",
          email: "idempotent.test@example.com",
          phone: "05344445566",
          city: "Trabzon",
          district: "Ortahisar",
          fullAddress: "Meydan Parkı No: 1",
        },
        items: [
          {
            productId: product.id,
            variantId: targetVariant.id,
            sku: targetVariant.sku,
            quantity: 2,
          },
        ],
      };

      // 1. İstek
      const res1 = await executeWithOrderLock(async () => createCashOnDeliveryOrder(payload));
      expect(res1.success).toBe(true);
      const stockAfterFirst = getStoreData().products[0].variants[0].stockQuantity;
      expect(stockAfterFirst).toBe(3); // 5 - 2 = 3

      // 2. Aynı İstek (Tekrar / Retry)
      const res2 = await executeWithOrderLock(async () => createCashOnDeliveryOrder(payload));
      expect(res2.success).toBe(true);
      // Dönen sipariş numarası aynı olmalıdır
      expect(res2.order?.orderNumber).toBe(res1.order?.orderNumber);

      // Stok ikinci kez düşülmemelidir
      const stockAfterSecond = getStoreData().products[0].variants[0].stockQuantity;
      expect(stockAfterSecond).toBe(3);
    } finally {
      const resetStore = getStoreData();
      resetStore.products[0].variants[0].stockQuantity = originalStock;
      saveStoreData(resetStore);
    }
  });

  it("5. Başarısız siparişte stok ve sipariş kaydı rollback davranışı: Kayıt başarısız olursa stok eski haline döner", async () => {
    const store = getStoreData();
    const product = store.products[0];
    const targetVariant = product.variants[0];

    const originalStock = targetVariant.stockQuantity;
    targetVariant.stockQuantity = 4;
    saveStoreData(store);

    const initialOrderCount = (getStoreData().orders || []).length;

    try {
      // Disk yazma fonksiyonunu geçici olarak hata verecek şekilde mock'la veya simüle et
      const writeFileSyncSpy = (fs as any).writeFileSync;
      let shouldFail = true;

      // createCashOnDeliveryOrder içindeki rollback mekanizmasını doğrudan doğrulamak için:
      // saveStoreData fonksiyonunun false dönmesi durumunu test ediyoruz
      const payload = {
        customer: {
          fullName: "Rollback Testi",
          email: "rollback.test@example.com",
          phone: "05355556677",
          city: "Samsun",
          district: "Atakum",
          fullAddress: "Sahil Cad. No: 88",
        },
        items: [
          {
            productId: product.id,
            variantId: targetVariant.id,
            sku: targetVariant.sku,
            quantity: 2,
          },
        ],
      };

      // fs.writeFileSync geçici olarak hata fırlatacak
      (fs as any).writeFileSync = () => {
        if (shouldFail) {
          throw new Error("Disk yazma hatası simülasyonu (EACCES/ENOSPC)");
        }
      };

      let result;
      try {
        result = await executeWithOrderLock(async () => createCashOnDeliveryOrder(payload));
      } finally {
        (fs as any).writeFileSync = writeFileSyncSpy;
        shouldFail = false;
      }

      // Sipariş başarısız dönmeli
      expect(result.success).toBe(false);
      expect(result.error).toContain("kaydedilemedi");

      // Stok düşülmemiş olmalı (rollback başarılı)
      const afterStore = getStoreData();
      expect(afterStore.products[0].variants[0].stockQuantity).toBe(4);

      // Sipariş listesine eklenmemiş olmalı (veya temizlenmiş olmalı)
      expect((afterStore.orders || []).length).toBe(initialOrderCount);
    } finally {
      const resetStore = getStoreData();
      resetStore.products[0].variants[0].stockQuantity = originalStock;
      saveStoreData(resetStore);
    }
  });
});

