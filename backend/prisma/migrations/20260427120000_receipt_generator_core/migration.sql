-- Phase 7.12.1: receipt generator (PDF + shareable link metadata)

ALTER TABLE "Transaction" ADD COLUMN "receiptId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "receiptUrl" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "receiptPublicToken" TEXT;

CREATE UNIQUE INDEX "Transaction_receiptId_key" ON "Transaction"("receiptId");
CREATE UNIQUE INDEX "Transaction_receiptPublicToken_key" ON "Transaction"("receiptPublicToken");

INSERT INTO "FeatureFlag" ("id", "key", "label", "freeEnabled", "basicEnabled", "premiumEnabled", "abRolloutPercent", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'RECEIPT_GENERATOR', 'PDF receipts and shareable links', true, true, true, NULL, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
