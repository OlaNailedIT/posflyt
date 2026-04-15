-- Phase 7.11.4: Inventory Count Mode (barcode boost)
INSERT INTO "FeatureFlag" ("id", "key", "label", "freeEnabled", "basicEnabled", "premiumEnabled", "abRolloutPercent", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'INVENTORY_COUNT_MODE', 'Barcode inventory count mode', true, true, true, NULL, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
