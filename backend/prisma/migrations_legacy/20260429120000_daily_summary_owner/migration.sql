-- Phase 7.12.4: business calendar for daily owner summary + feature flag

ALTER TABLE "Settings" ADD COLUMN "businessTimeZone" TEXT NOT NULL DEFAULT 'UTC';

INSERT INTO "FeatureFlag" ("id", "key", "label", "freeEnabled", "basicEnabled", "premiumEnabled", "abRolloutPercent", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'DAILY_SUMMARY_OWNER', 'Daily summary to owner (WhatsApp deep link)', true, true, true, NULL, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
