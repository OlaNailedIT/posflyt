-- Phase 7.10.2 final seal: DB-level positive amount (defense in depth)

ALTER TABLE "Expense" ALTER COLUMN "amount" SET NOT NULL;

ALTER TABLE "Expense" ADD CONSTRAINT "expense_amount_positive" CHECK ("amount" > 0);
