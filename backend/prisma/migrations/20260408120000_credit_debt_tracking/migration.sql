-- Phase 7.10.1: credit / debt tracking per customer

DO $$ BEGIN
  ALTER TYPE "PaymentMethod" ADD VALUE 'CREDIT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Customer" ADD COLUMN "totalOutstanding" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Transaction" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'paid';
ALTER TABLE "Transaction" ADD COLUMN "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "dueDate" TIMESTAMP(3);
