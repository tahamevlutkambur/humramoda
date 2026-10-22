-- Hümra Moda — Faz 6: Kargo, İade Talepleri, Bildirimler ve Webhook Altyapısı

-- 1. ShippingStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ShippingStatus') THEN
    CREATE TYPE "ShippingStatus" AS ENUM (
      'AWAITING_SHIPMENT',
      'SHIPPED',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'SHIPMENT_ISSUE',
      'RETURNED'
    );
  END IF;
END $$;

-- 2. ReturnStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReturnStatus') THEN
    CREATE TYPE "ReturnStatus" AS ENUM (
      'REQUESTED',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'AWAITING_PACKAGE',
      'PACKAGE_RECEIVED',
      'REFUND_PENDING',
      'REFUND_COMPLETED'
    );
  END IF;
END $$;

-- 3. ReturnRestockDecision enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReturnRestockDecision') THEN
    CREATE TYPE "ReturnRestockDecision" AS ENUM (
      'PENDING',
      'RESTOCKED',
      'DAMAGED_NOT_RESTOCKED',
      'REJECTED'
    );
  END IF;
END $$;

-- 4. NotificationChannel enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationChannel') THEN
    CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');
  END IF;
END $$;

-- 5. NotificationStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationStatus') THEN
    CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
  END IF;
END $$;

-- 6. Order tablosuna Faz 6 kargo ve iade alanlarını ekleme
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingStatus" "ShippingStatus" NOT NULL DEFAULT 'AWAITING_SHIPMENT';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "carrier" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "trackingUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Order_shippingStatus_idx" ON "Order"("shippingStatus");

-- 7. Shipment tablosu oluşturma
CREATE TABLE IF NOT EXISTS "Shipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "carrier" TEXT NOT NULL,
  "carrierName" TEXT NOT NULL,
  "trackingNumber" TEXT NOT NULL,
  "trackingUrl" TEXT,
  "labelUrl" TEXT,
  "status" "ShippingStatus" NOT NULL DEFAULT 'AWAITING_SHIPMENT',
  "method" TEXT NOT NULL DEFAULT 'MANUAL',
  "providerReference" TEXT,
  "shippedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Shipment_orderId_idx" ON "Shipment"("orderId");
CREATE INDEX IF NOT EXISTS "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");
CREATE INDEX IF NOT EXISTS "Shipment_status_idx" ON "Shipment"("status");

-- 8. ShippingEvent tablosu oluşturma
CREATE TABLE IF NOT EXISTS "ShippingEvent" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "status" "ShippingStatus" NOT NULL,
  "description" TEXT NOT NULL,
  "location" TEXT,
  "carrierReference" TEXT,
  "eventTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShippingEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShippingEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ShippingEvent_shipmentId_idx" ON "ShippingEvent"("shipmentId");

-- 9. ReturnRequest tablosu oluşturma
CREATE TABLE IF NOT EXISTS "ReturnRequest" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedAmount" DECIMAL(10,2) NOT NULL,
  "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "customerNotes" TEXT,
  "adminNotes" TEXT,
  "restockDecision" "ReturnRestockDecision" NOT NULL DEFAULT 'PENDING',
  "isRestocked" BOOLEAN NOT NULL DEFAULT false,
  "actualRefundVerified" BOOLEAN NOT NULL DEFAULT false,
  "refundTransactionRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");
CREATE INDEX IF NOT EXISTS "ReturnRequest_orderNumber_idx" ON "ReturnRequest"("orderNumber");
CREATE INDEX IF NOT EXISTS "ReturnRequest_status_idx" ON "ReturnRequest"("status");

-- 10. ReturnItem tablosu oluşturma
CREATE TABLE IF NOT EXISTS "ReturnItem" (
  "id" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "variantSku" TEXT NOT NULL,
  "colorName" TEXT,
  "sizeName" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "totalPrice" DECIMAL(10,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "condition" TEXT,

  CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReturnItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ReturnItem_returnRequestId_idx" ON "ReturnItem"("returnRequestId");

-- 11. CustomerNotification tablosu oluşturma
CREATE TABLE IF NOT EXISTS "CustomerNotification" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
  "eventType" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "contentHtml" TEXT NOT NULL,
  "contentText" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerNotification_idempotencyKey_key" ON "CustomerNotification"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "CustomerNotification_orderId_idx" ON "CustomerNotification"("orderId");
CREATE INDEX IF NOT EXISTS "CustomerNotification_orderNumber_idx" ON "CustomerNotification"("orderNumber");
CREATE INDEX IF NOT EXISTS "CustomerNotification_status_idx" ON "CustomerNotification"("status");

-- 12. WebhookEvent tablosu oluşturma
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventId" TEXT,
  "payload" JSONB NOT NULL,
  "isProcessed" BOOLEAN NOT NULL DEFAULT false,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebhookEvent_provider_eventId_idx" ON "WebhookEvent"("provider", "eventId");
