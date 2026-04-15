-- Phase 7.12.2: WhatsApp receipt (deep link; frontend-driven)
INSERT INTO "FeatureFlag" ("id", "key", "label", "freeEnabled", "basicEnabled", "premiumEnabled", "abRolloutPercent", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'WHATSAPP_RECEIPT', 'WhatsApp receipt deep link from POS', true, true, true, NULL, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
