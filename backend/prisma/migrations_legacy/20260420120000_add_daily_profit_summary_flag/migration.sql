-- Phase 7.10.3: Daily Profit Summary feature flag (Money Control Layer)

INSERT INTO "FeatureFlag" ("id", "key", "label", "freeEnabled", "basicEnabled", "premiumEnabled", "abRolloutPercent", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'DAILY_PROFIT_SUMMARY', 'Daily profit summary (sales − expenses)', true, true, true, NULL, NOW(), NOW());
