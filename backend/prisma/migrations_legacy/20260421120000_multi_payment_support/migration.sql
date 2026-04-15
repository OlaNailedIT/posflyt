-- Phase 7.10.4: multi-payment (split tender) + MULTI payment method label

ALTER TYPE "PaymentMethod" ADD VALUE 'MULTI';

ALTER TABLE "Transaction" ADD COLUMN "payments" JSONB;
