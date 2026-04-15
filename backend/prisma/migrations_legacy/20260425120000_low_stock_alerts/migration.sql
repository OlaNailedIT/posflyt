-- Phase 7.11.3: nullable per-product threshold; daily dedupe for alert observability.

ALTER TABLE "Product" ALTER COLUMN "lowStockThreshold" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "lowStockThreshold" DROP NOT NULL;

CREATE TABLE "LowStockAlertDay" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "dayUtc" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LowStockAlertDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LowStockAlertDay_businessId_productId_dayUtc_key" ON "LowStockAlertDay"("businessId", "productId", "dayUtc");
CREATE INDEX "LowStockAlertDay_businessId_idx" ON "LowStockAlertDay"("businessId");

ALTER TABLE "LowStockAlertDay" ADD CONSTRAINT "LowStockAlertDay_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LowStockAlertDay" ADD CONSTRAINT "LowStockAlertDay_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FeatureFlag" ("id", "key", "label", "freeEnabled", "basicEnabled", "premiumEnabled", "abRolloutPercent", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'LOW_STOCK_ALERTS', 'Low stock alerts and dashboard widget', true, true, true, NULL, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
