-- Phase 7.5: feature flags, usage metering, payment metadata for proration

CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "freeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "basicEnabled" BOOLEAN NOT NULL DEFAULT false,
    "premiumEnabled" BOOLEAN NOT NULL DEFAULT false,
    "abRolloutPercent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

CREATE TABLE "UsageMonthly" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "apiRequestCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageMonthly_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageMonthly_businessId_yearMonth_key" ON "UsageMonthly"("businessId", "yearMonth");
CREATE INDEX "UsageMonthly_businessId_idx" ON "UsageMonthly"("businessId");

ALTER TABLE "UsageMonthly" ADD CONSTRAINT "UsageMonthly_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentHistory" ADD COLUMN "metadata" JSONB;

INSERT INTO "FeatureFlag" ("id", "key", "label", "freeEnabled", "basicEnabled", "premiumEnabled", "abRolloutPercent", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'REPORTING', 'Sales & operational reports', false, true, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'BI_DASHBOARD', 'BI snapshot & drill-down', false, true, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'CSV_EXPORT', 'CSV exports', false, true, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'ADVANCED_ANALYTICS', 'Profit, forecast, optimization', false, true, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'STAFF_ANALYTICS', 'Staff performance analytics', false, true, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'API_INTEGRATIONS', 'Webhooks & API-heavy integrations', false, false, true, NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'NEW_FEATURE_AB_SAMPLE', 'A/B sample (50% rollout)', false, true, true, 50, NOW(), NOW());
