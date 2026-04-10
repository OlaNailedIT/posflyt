-- Phase 7.10.2: expenses + EXPENSES feature flag

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requestId" TEXT,
    "eventId" TEXT,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Expense_requestId_key" ON "Expense"("requestId");
CREATE INDEX "Expense_businessId_idx" ON "Expense"("businessId");
CREATE INDEX "Expense_createdAt_idx" ON "Expense"("createdAt");
CREATE UNIQUE INDEX "Expense_businessId_eventId_key" ON "Expense"("businessId", "eventId");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FeatureFlag" ("id", "key", "label", "freeEnabled", "basicEnabled", "premiumEnabled", "abRolloutPercent", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'EXPENSES', 'Expense tracking & derived profit', true, true, true, NULL, NOW(), NOW());
