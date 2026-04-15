-- Phase 7.11.2: Quick sales mode (pinned product ids) + feature flag

ALTER TABLE "Settings" ADD COLUMN "quickSalesProductIds" JSONB;

INSERT INTO "FeatureFlag" ("id", "key", "label", "freeEnabled", "basicEnabled", "premiumEnabled", "abRolloutPercent", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'QUICK_SALES_MODE', 'Quick sales single-screen checkout', true, true, true, NULL, NOW(), NOW());
