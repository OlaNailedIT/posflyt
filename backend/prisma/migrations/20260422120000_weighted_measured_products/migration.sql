-- Phase 7.11.1: weighted / measured products (unitType, pricePerUnit, fractional stock & line qty)

ALTER TABLE "Product" ADD COLUMN "unitType" TEXT NOT NULL DEFAULT 'unit';
ALTER TABLE "Product" ADD COLUMN "pricePerUnit" DOUBLE PRECISION;

ALTER TABLE "Product" ALTER COLUMN "stock" TYPE DOUBLE PRECISION USING "stock"::double precision;
ALTER TABLE "Product" ALTER COLUMN "lowStockThreshold" TYPE DOUBLE PRECISION USING "lowStockThreshold"::double precision;

ALTER TABLE "TransactionItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision;

INSERT INTO "FeatureFlag" ("id", "key", "label", "freeEnabled", "basicEnabled", "premiumEnabled", "abRolloutPercent", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'WEIGHTED_PRODUCTS', 'Sell and stock by weight or volume (kg, litre)', true, true, true, NULL, NOW(), NOW());
