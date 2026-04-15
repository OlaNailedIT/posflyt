-- Phase 7.4: grace period, cancel flag, lifecycle analytics events
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "graceEndsAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "SubscriptionLifecycleEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SubscriptionLifecycleEvent_businessId_createdAt_idx" ON "SubscriptionLifecycleEvent"("businessId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SubscriptionLifecycleEvent_eventType_createdAt_idx" ON "SubscriptionLifecycleEvent"("eventType", "createdAt" DESC);

ALTER TABLE "SubscriptionLifecycleEvent" ADD CONSTRAINT "SubscriptionLifecycleEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
