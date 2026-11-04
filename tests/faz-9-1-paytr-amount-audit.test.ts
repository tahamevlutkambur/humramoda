import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  computePayTRCallbackHash,
  verifyPayTRCallbackHash,
  processPayTRCallback,
} from "../src/lib/server/paytr";
import { PaymentWriteDAO } from "../src/lib/server/dao/payment-write-dao";
import { getStoreData } from "../src/lib/server/store";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://humra_test:Yc1RJPBs3A9Xt0dfFU3R0P3W@127.0.0.1:5432/humra_migration_test?schema=public";

const MOCK_MERCHANT_KEY = "D3gr1fBEUkkgjRaR";
const MOCK_MERCHANT_SALT = "mzAPqkRnYqakr2Qo";

describe("FAZ 9.1: PayTR Tutar Hesaplama, Callback ve Taksit Güvenlik Denetimi", () => {
  let prisma: PrismaClient | null = null;
  const paymentDao = new PaymentWriteDAO();

  beforeAll(async () => {
    try {
      const client = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
      await client.$connect();
      prisma = client;
    } catch (err) {
      console.warn("PostgreSQL test veritabanına bağlanılamadı:", err);
      prisma = null;
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  // SENARYO 1: TEK ÇEKİM BAŞARILI ÖDEME
  it("Senaryo 1: Tek çekim başarılı ödemede tutar birebir eşleşmeli, sipariş PAID olmalıdır", async () => {
    if (!prisma) return;
    const testOid = `HM-TEST-S1-${Date.now().toString().slice(-4)}`;
    const testOrderId = `order_s1_${Date.now()}`;

    await prisma.order.create({
      data: {
        id: testOrderId,
        orderNumber: testOid,
        customerEmail: "s1@humramoda.local",
        customerFullName: "Senaryo 1 Test",
        customerPhone: "05551110001",
        totalAmount: 150,
        totalKurus: 15000,
        subtotal: 150,
        shippingAddress: { city: "İstanbul" },
        status: "PENDING",
        paymentStatus: "PENDING",
        refundedAmount: 0,
      },
    });

    const validHash = computePayTRCallbackHash({
      merchantOid: testOid,
      status: "success",
      totalAmount: "15000",
      merchantKey: MOCK_MERCHANT_KEY,
      merchantSalt: MOCK_MERCHANT_SALT,
    });

    const result = await prisma.$transaction(async (tx) => {
      return await paymentDao.verifyAndProcessCallback(tx, {
        merchantOid: testOid,
        status: "success",
        totalAmount: "15000",
        hash: validHash,
        merchantKey: MOCK_MERCHANT_KEY,
        merchantSalt: MOCK_MERCHANT_SALT,
      });
    });

    expect(result.ok).toBe(true);
    const updated = await prisma.order.findUnique({ where: { id: testOrderId } });
    expect(updated?.paymentStatus).toBe("PAID");
    expect(updated?.status).toBe("CONFIRMED");

    // Temizlik
    await prisma.paymentTransaction.deleteMany({ where: { merchantOid: testOid } });
    await prisma.order.delete({ where: { id: testOrderId } });
  });

  // SENARYO 2: TAKSİTLİ ÖDEME (VADE FARKI DAHİL BRÜT TUTAR GELDİĞİNDE)
  it("Senaryo 2: Taksit vade farkı nedeniyle total_amount sipariş kuruşundan büyükse mevcut sistem uyuşmazlık olarak reddeder", async () => {
    if (!prisma) return;
    const testOid = `HM-TEST-S2-${Date.now().toString().slice(-4)}`;
    const testOrderId = `order_s2_${Date.now()}`;

    // Sipariş net 200 TL (20000 kuruş)
    await prisma.order.create({
      data: {
        id: testOrderId,
        orderNumber: testOid,
        customerEmail: "s2@humramoda.local",
        customerFullName: "Senaryo 2 Taksit Test",
        customerPhone: "05551110002",
        totalAmount: 200,
        totalKurus: 20000,
        subtotal: 200,
        shippingAddress: { city: "İzmir" },
        status: "PENDING",
        paymentStatus: "PENDING",
        refundedAmount: 0,
      },
    });

    // Müşteri 3 taksit seçti ve PayTR banka komisyonuyla brüt 210 TL (21000 kuruş) bildirdi
    const grossKurus = "21000";
    const grossHash = computePayTRCallbackHash({
      merchantOid: testOid,
      status: "success",
      totalAmount: grossKurus,
      merchantKey: MOCK_MERCHANT_KEY,
      merchantSalt: MOCK_MERCHANT_SALT,
    });

    const result = await prisma.$transaction(async (tx) => {
      return await paymentDao.verifyAndProcessCallback(tx, {
        merchantOid: testOid,
        status: "success",
        totalAmount: grossKurus,
        hash: grossHash,
        merchantKey: MOCK_MERCHANT_KEY,
        merchantSalt: MOCK_MERCHANT_SALT,
      });
    });

    // MEVCUT SİSTEMİN KESİN DAVRANIŞI:
    // Katı eşitlik kontrolü (amountKurus !== order.totalKurus) nedeniyle reddedilir!
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Tutar uyuşmazlığı");

    // Siparişin onaylanmadığını doğrula
    const orderCheck = await prisma.order.findUnique({ where: { id: testOrderId } });
    expect(orderCheck?.paymentStatus).toBe("PENDING");

    // Temizlik
    await prisma.paymentTransaction.deleteMany({ where: { merchantOid: testOid } });
    await prisma.order.delete({ where: { id: testOrderId } });
  });

  // SENARYO 3: EKSİK TAHSİLAT (UNDERPAYMENT)
  it("Senaryo 3: Eksik tahsilat durumunda (örn. 100 TL yerine 80 TL) callback reddedilmelidir", async () => {
    if (!prisma) return;
    const testOid = `HM-TEST-S3-${Date.now().toString().slice(-4)}`;
    const testOrderId = `order_s3_${Date.now()}`;

    await prisma.order.create({
      data: {
        id: testOrderId,
        orderNumber: testOid,
        customerEmail: "s3@humramoda.local",
        customerFullName: "Senaryo 3 Eksik Test",
        customerPhone: "05551110003",
        totalAmount: 100,
        totalKurus: 10000,
        subtotal: 100,
        shippingAddress: { city: "Bursa" },
        status: "PENDING",
        paymentStatus: "PENDING",
        refundedAmount: 0,
      },
    });

    const underpaidKurus = "8000";
    const hash = computePayTRCallbackHash({
      merchantOid: testOid,
      status: "success",
      totalAmount: underpaidKurus,
      merchantKey: MOCK_MERCHANT_KEY,
      merchantSalt: MOCK_MERCHANT_SALT,
    });

    const result = await prisma.$transaction(async (tx) => {
      return await paymentDao.verifyAndProcessCallback(tx, {
        merchantOid: testOid,
        status: "success",
        totalAmount: underpaidKurus,
        hash,
        merchantKey: MOCK_MERCHANT_KEY,
        merchantSalt: MOCK_MERCHANT_SALT,
      });
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Tutar uyuşmazlığı");

    const orderCheck = await prisma.order.findUnique({ where: { id: testOrderId } });
    expect(orderCheck?.paymentStatus).toBe("PENDING");

    // Temizlik
    await prisma.paymentTransaction.deleteMany({ where: { merchantOid: testOid } });
    await prisma.order.delete({ where: { id: testOrderId } });
  });

  // SENARYO 4: FAZLA TAHSİLAT (OVERPAYMENT)
  it("Senaryo 4: Fazla tahsilat durumunda tolerans uygulanmamalı, işlem reddedilmelidir", async () => {
    if (!prisma) return;
    const testOid = `HM-TEST-S4-${Date.now().toString().slice(-4)}`;
    const testOrderId = `order_s4_${Date.now()}`;

    await prisma.order.create({
      data: {
        id: testOrderId,
        orderNumber: testOid,
        customerEmail: "s4@humramoda.local",
        customerFullName: "Senaryo 4 Fazla Test",
        customerPhone: "05551110004",
        totalAmount: 100,
        totalKurus: 10000,
        subtotal: 100,
        shippingAddress: { city: "Ankara" },
        status: "PENDING",
        paymentStatus: "PENDING",
        refundedAmount: 0,
      },
    });

    const overpaidKurus = "12000"; // 20 TL fazla
    const hash = computePayTRCallbackHash({
      merchantOid: testOid,
      status: "success",
      totalAmount: overpaidKurus,
      merchantKey: MOCK_MERCHANT_KEY,
      merchantSalt: MOCK_MERCHANT_SALT,
    });

    const result = await prisma.$transaction(async (tx) => {
      return await paymentDao.verifyAndProcessCallback(tx, {
        merchantOid: testOid,
        status: "success",
        totalAmount: overpaidKurus,
        hash,
        merchantKey: MOCK_MERCHANT_KEY,
        merchantSalt: MOCK_MERCHANT_SALT,
      });
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Tutar uyuşmazlığı");

    // Temizlik
    await prisma.paymentTransaction.deleteMany({ where: { merchantOid: testOid } });
    await prisma.order.delete({ where: { id: testOrderId } });
  });

  // SENARYO 5: BİR KURUŞLUK FARK
  it("Senaryo 5: 1 kuruşluk fark (yuvarlama/tolerans yok) durumunda da işlem reddedilmelidir", async () => {
    if (!prisma) return;
    const testOid = `HM-TEST-S5-${Date.now().toString().slice(-4)}`;
    const testOrderId = `order_s5_${Date.now()}`;

    await prisma.order.create({
      data: {
        id: testOrderId,
        orderNumber: testOid,
        customerEmail: "s5@humramoda.local",
        customerFullName: "Senaryo 5 1 Kurus Test",
        customerPhone: "05551110005",
        totalAmount: 150,
        totalKurus: 15000,
        subtotal: 150,
        shippingAddress: { city: "İstanbul" },
        status: "PENDING",
        paymentStatus: "PENDING",
        refundedAmount: 0,
      },
    });

    const oneKurusDiff = "15001"; // 150.01 TL
    const hash = computePayTRCallbackHash({
      merchantOid: testOid,
      status: "success",
      totalAmount: oneKurusDiff,
      merchantKey: MOCK_MERCHANT_KEY,
      merchantSalt: MOCK_MERCHANT_SALT,
    });

    const result = await prisma.$transaction(async (tx) => {
      return await paymentDao.verifyAndProcessCallback(tx, {
        merchantOid: testOid,
        status: "success",
        totalAmount: oneKurusDiff,
        hash,
        merchantKey: MOCK_MERCHANT_KEY,
        merchantSalt: MOCK_MERCHANT_SALT,
      });
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Tutar uyuşmazlığı");

    // Temizlik
    await prisma.paymentTransaction.deleteMany({ where: { merchantOid: testOid } });
    await prisma.order.delete({ where: { id: testOrderId } });
  });

  // SENARYO 6: GEÇERSİZ PARA BİRİMİ / TUTAR FORMATI
  it("Senaryo 6: Sayısal olmayan veya negatif tutar bildirildiğinde PAYTR_INVALID_AMOUNT fırlatılmalıdır", async () => {
    if (!prisma) return;
    const testOid = `HM-TEST-S6-${Date.now().toString().slice(-4)}`;

    const invalidHash = computePayTRCallbackHash({
      merchantOid: testOid,
      status: "success",
      totalAmount: "GEÇERSİZ_TUTAR",
      merchantKey: MOCK_MERCHANT_KEY,
      merchantSalt: MOCK_MERCHANT_SALT,
    });

    const result = await prisma.$transaction(async (tx) => {
      return await paymentDao.verifyAndProcessCallback(tx, {
        merchantOid: testOid,
        status: "success",
        totalAmount: "GEÇERSİZ_TUTAR",
        hash: invalidHash,
        merchantKey: MOCK_MERCHANT_KEY,
        merchantSalt: MOCK_MERCHANT_SALT,
      });
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("PAYTR_INVALID_AMOUNT");
  });

  // SENARYO 7: AYNI CALLBACK'İN TEKRAR GÖNDERİLMESİ (İDEMPOTENCY)
  it("Senaryo 7: Aynı callback mükerrer geldiğinde (idempotency) hata vermeden OK dönmeli, tekrar stok düşmemelidir", async () => {
    if (!prisma) return;
    const testOid = `HM-TEST-S7-${Date.now().toString().slice(-4)}`;
    const testOrderId = `order_s7_${Date.now()}`;

    await prisma.order.create({
      data: {
        id: testOrderId,
        orderNumber: testOid,
        customerEmail: "s7@humramoda.local",
        customerFullName: "Senaryo 7 Idempotency Test",
        customerPhone: "05551110007",
        totalAmount: 100,
        totalKurus: 10000,
        subtotal: 100,
        shippingAddress: { city: "Antalya" },
        status: "CONFIRMED",
        paymentStatus: "PAID", // Zaten ödenmiş!
        stockDeducted: true,
        refundedAmount: 0,
      },
    });

    const hash = computePayTRCallbackHash({
      merchantOid: testOid,
      status: "success",
      totalAmount: "10000",
      merchantKey: MOCK_MERCHANT_KEY,
      merchantSalt: MOCK_MERCHANT_SALT,
    });

    const result = await prisma.$transaction(async (tx) => {
      return await paymentDao.verifyAndProcessCallback(tx, {
        merchantOid: testOid,
        status: "success",
        totalAmount: "10000",
        hash,
        merchantKey: MOCK_MERCHANT_KEY,
        merchantSalt: MOCK_MERCHANT_SALT,
      });
    });

    expect(result.ok).toBe(true);
    expect(result.idempotent).toBe(true);

    // Temizlik
    await prisma.order.delete({ where: { id: testOrderId } });
  });

  // SENARYO 8: HATALI HMAC İMZA
  it("Senaryo 8: Hatalı veya değiştirilmiş HMAC hash'i derhal PAYTR_BAD_HASH ile reddedilmelidir", async () => {
    if (!prisma) return;
    const testOid = `HM-TEST-S8-${Date.now().toString().slice(-4)}`;

    const result = await prisma.$transaction(async (tx) => {
      return await paymentDao.verifyAndProcessCallback(tx, {
        merchantOid: testOid,
        status: "success",
        totalAmount: "10000",
        hash: "sahte_ve_hatali_hmac_imza_hash_degeri",
        merchantKey: MOCK_MERCHANT_KEY,
        merchantSalt: MOCK_MERCHANT_SALT,
      });
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("PAYTR_BAD_HASH");
  });

  // SENARYO 9: SİPARİŞ NUMARASI EŞLEŞMEYEN CALLBACK
  it("Senaryo 9: Sistemde bulunmayan bir merchant_oid geldiğinde işlem güvenle reddedilmelidir", async () => {
    if (!prisma) return;
    const unknownOid = `HM-UNKNOWN-${Date.now()}`;

    const validHash = computePayTRCallbackHash({
      merchantOid: unknownOid,
      status: "success",
      totalAmount: "10000",
      merchantKey: MOCK_MERCHANT_KEY,
      merchantSalt: MOCK_MERCHANT_SALT,
    });

    const result = await prisma.$transaction(async (tx) => {
      return await paymentDao.verifyAndProcessCallback(tx, {
        merchantOid: unknownOid,
        status: "success",
        totalAmount: "10000",
        hash: validHash,
        merchantKey: MOCK_MERCHANT_KEY,
        merchantSalt: MOCK_MERCHANT_SALT,
      });
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Sipariş sistemde bulunamadı");
  });

  // SENARYO 10: BEKLENMEYEN TUTAR FARKI (TUTAR DEĞİŞTİRME SALDIRISI)
  it("Senaryo 10: 1000 TL'lik siparişi 1 TL (100 kuruş) olarak bildirmeye çalışan istek engellenmelidir", async () => {
    if (!prisma) return;
    const testOid = `HM-TEST-S10-${Date.now().toString().slice(-4)}`;
    const testOrderId = `order_s10_${Date.now()}`;

    await prisma.order.create({
      data: {
        id: testOrderId,
        orderNumber: testOid,
        customerEmail: "s10@humramoda.local",
        customerFullName: "Senaryo 10 Manipülasyon Test",
        customerPhone: "05551110010",
        totalAmount: 1000,
        totalKurus: 100000, // 1000 TL
        subtotal: 1000,
        shippingAddress: { city: "İstanbul" },
        status: "PENDING",
        paymentStatus: "PENDING",
        refundedAmount: 0,
      },
    });

    // Saldırgan 100 kuruş (1 TL) ile geçerli HMAC üretse dahi
    const manipulatedKurus = "100";
    const validHmacFor1TL = computePayTRCallbackHash({
      merchantOid: testOid,
      status: "success",
      totalAmount: manipulatedKurus,
      merchantKey: MOCK_MERCHANT_KEY,
      merchantSalt: MOCK_MERCHANT_SALT,
    });

    const result = await prisma.$transaction(async (tx) => {
      return await paymentDao.verifyAndProcessCallback(tx, {
        merchantOid: testOid,
        status: "success",
        totalAmount: manipulatedKurus,
        hash: validHmacFor1TL,
        merchantKey: MOCK_MERCHANT_KEY,
        merchantSalt: MOCK_MERCHANT_SALT,
      });
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Tutar uyuşmazlığı");

    const orderCheck = await prisma.order.findUnique({ where: { id: testOrderId } });
    expect(orderCheck?.paymentStatus).toBe("PENDING");

    // Temizlik
    await prisma.paymentTransaction.deleteMany({ where: { merchantOid: testOid } });
    await prisma.order.delete({ where: { id: testOrderId } });
  });
});

