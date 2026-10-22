-- Hümra Moda — Faz 5: PayTR Ödeme Entegrasyonu ve Ödeme Durumu Ayrımı

-- 1. OrderPaymentStatus enum oluşturma
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderPaymentStatus') THEN
    CREATE TYPE "OrderPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');
  ELSE
    BEGIN
      ALTER TYPE "OrderPaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
      ALTER TYPE "OrderPaymentStatus" ADD VALUE IF NOT EXISTS 'PAID';
      ALTER TYPE "OrderPaymentStatus" ADD VALUE IF NOT EXISTS 'FAILED';
      ALTER TYPE "OrderPaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
      ALTER TYPE "OrderPaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 2. PaymentStatus enum değerlerini genişletme
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    BEGIN
      ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
      ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
      ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  ELSE
    CREATE TYPE "PaymentStatus" AS ENUM ('INITIALIZED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');
  END IF;
END $$;

-- 3. Order tablosuna finansal ödeme durumu ve PayTR referans alanlarını ekleme
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT NOT NULL DEFAULT 'PAYTR';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentFailedReason" TEXT;

-- 4. PaymentTransaction tablosuna test modu ve istemci IP alanlarını ekleme
ALTER TABLE "PaymentTransaction" ADD COLUMN IF NOT EXISTS "testMode" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PaymentTransaction" ADD COLUMN IF NOT EXISTS "clientIp" TEXT;

-- 5. Performans ve raporlama indeksleri
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_idx" ON "Order"("paymentStatus");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_status_idx" ON "PaymentTransaction"("status");
