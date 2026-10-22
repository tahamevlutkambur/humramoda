-- Hümra Moda — Faz 4.6 Veritabanı Değişiklikleri (Sipariş Durumları Sadeleştirme, Maliyet ve Snapshot Alanları)

-- 1. Product ve ProductVariant tablolarına birim maliyet alanı ekleme
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(10, 2);
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(10, 2);

-- 2. Order tablosuna stok düşme ve teyit zaman damgaları ekleme
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stockDeducted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

-- 3. OrderItem tablosuna geriye dönük maliyet bozulmasını önleyen snapshot alanı ekleme
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "costPriceSnapshot" DECIMAL(10, 2);

-- 4. OrderStatus enum durumlarını sadeleştirme (CONFIRMED, CANCELLED, PENDING)
-- Not: Mevcut PostgreSQL enum yapısında yeni değerler eklenir, kullanılmayan ara durumlar arayüzden soyutlanır.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'PENDING');
  ELSE
    BEGIN
      ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
      ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
      ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
