-- Phase 7.10.1 hardening: totalAmount, TransactionPaymentStatus enum, CHECK constraints, idempotency fields.

ALTER TABLE "Transaction" RENAME COLUMN "total" TO "totalAmount";

ALTER TABLE "Customer" ADD COLUMN "lastCreditSettlementRequestId" TEXT;

ALTER TABLE "Transaction" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Transaction" SET "updatedAt" = "createdAt" WHERE "updatedAt" < "createdAt";

ALTER TABLE "Transaction" ADD COLUMN "lastSettlementRequestId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "lastProcessedEventId" TEXT;

-- Normalize amounts before swapping payment status type
UPDATE "Transaction"
SET
  "amountPaid" = CASE LOWER(TRIM(COALESCE("paymentStatus", 'paid')))
    WHEN 'paid' THEN "totalAmount"
    WHEN 'credit' THEN 0
    ELSE "amountPaid"
  END;

UPDATE "Transaction"
SET
  "balanceDue" = CASE LOWER(TRIM(COALESCE("paymentStatus", 'paid')))
    WHEN 'paid' THEN 0
    WHEN 'credit' THEN "totalAmount"
    ELSE GREATEST(0, "totalAmount" - "amountPaid")
  END;

CREATE TYPE "TransactionPaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'CREDIT');

ALTER TABLE "Transaction" ADD COLUMN "paymentStatus_new" "TransactionPaymentStatus";

UPDATE "Transaction"
SET
  "paymentStatus_new" = CASE LOWER(TRIM(COALESCE("paymentStatus", 'paid')))
    WHEN 'paid' THEN 'PAID'::"TransactionPaymentStatus"
    WHEN 'partial' THEN 'PARTIAL'::"TransactionPaymentStatus"
    WHEN 'credit' THEN 'CREDIT'::"TransactionPaymentStatus"
    ELSE 'PAID'::"TransactionPaymentStatus"
  END;

ALTER TABLE "Transaction" DROP COLUMN "paymentStatus";
ALTER TABLE "Transaction" RENAME COLUMN "paymentStatus_new" TO "paymentStatus";
ALTER TABLE "Transaction" ALTER COLUMN "paymentStatus" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "paymentStatus" SET DEFAULT 'PAID'::"TransactionPaymentStatus";

ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS transaction_amount_paid_non_negative;
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS transaction_balance_due_non_negative;
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS transaction_amount_paid_not_exceed_total;
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS transaction_balance_due_correct;

ALTER TABLE "Transaction"
ADD CONSTRAINT transaction_amount_paid_non_negative CHECK ("amountPaid" >= 0);

ALTER TABLE "Transaction"
ADD CONSTRAINT transaction_balance_due_non_negative CHECK ("balanceDue" >= 0);

ALTER TABLE "Transaction"
ADD CONSTRAINT transaction_amount_paid_not_exceed_total CHECK ("amountPaid" <= "totalAmount" + 0.0001);

ALTER TABLE "Transaction"
ADD CONSTRAINT transaction_balance_due_correct CHECK (
  ABS("balanceDue" - ("totalAmount" - "amountPaid")) < 0.01
);

-- Reconcile customer cache from source of truth (sum of balanceDue)
UPDATE "Customer" AS c
SET "totalOutstanding" = COALESCE((
  SELECT SUM(t."balanceDue") FROM "Transaction" t WHERE t."customerId" = c.id
), 0);
