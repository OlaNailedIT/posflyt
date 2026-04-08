-- Phase 7: billing idempotency, webhook dedupe, optional trial window.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "trialEndsAt" TIMESTAMP(3);

-- Remove duplicate PaymentHistory rows (same provider + providerRef), keep newest by createdAt.
DELETE FROM "PaymentHistory" p
WHERE p.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "provider", "providerRef" ORDER BY "createdAt" DESC) AS rn
    FROM "PaymentHistory"
  ) t
  WHERE t.rn > 1
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentHistory_provider_providerRef_key" ON "PaymentHistory"("provider", "providerRef");

-- CreateTable
CREATE TABLE "BillingWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "businessId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingWebhookEvent_provider_dedupeKey_key" ON "BillingWebhookEvent"("provider", "dedupeKey");
CREATE INDEX "BillingWebhookEvent_businessId_idx" ON "BillingWebhookEvent"("businessId");
CREATE INDEX "BillingWebhookEvent_createdAt_idx" ON "BillingWebhookEvent"("createdAt");
