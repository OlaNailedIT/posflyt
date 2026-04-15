-- Phase 4: immutable server system-of-record tables for integrity events + ledger projection.
-- Distinct from `FinancialLedgerEntry` (return-reversal ledger only).

CREATE TYPE "LedgerIntegritySource" AS ENUM ('ONLINE', 'OFFLINE', 'SYNC');

CREATE TYPE "IntegrityLedgerLineKind" AS ENUM ('SALE', 'REFUND', 'ADJUSTMENT');

CREATE TABLE "IntegrityLedgerEvent" (
    "eventId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientTransactionId" TEXT NOT NULL,
    "transactionId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "source" "LedgerIntegritySource" NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrityLedgerEvent_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "IntegrityLedgerEvent_businessId_clientTransactionId_idx" ON "IntegrityLedgerEvent"("businessId", "clientTransactionId");

CREATE INDEX "IntegrityLedgerEvent_businessId_createdAt_idx" ON "IntegrityLedgerEvent"("businessId", "createdAt" DESC);

ALTER TABLE "IntegrityLedgerEvent" ADD CONSTRAINT "IntegrityLedgerEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrityLedgerEvent" ADD CONSTRAINT "IntegrityLedgerEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrityLedgerEvent" ADD CONSTRAINT "IntegrityLedgerEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "IntegrityLedgerLine" (
    "ledgerLineId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientTransactionId" TEXT NOT NULL,
    "transactionId" TEXT,
    "debit" DOUBLE PRECISION NOT NULL,
    "credit" DOUBLE PRECISION NOT NULL,
    "lineKind" "IntegrityLedgerLineKind" NOT NULL,
    "sourceEventId" TEXT,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrityLedgerLine_pkey" PRIMARY KEY ("ledgerLineId")
);

CREATE INDEX "IntegrityLedgerLine_businessId_clientTransactionId_idx" ON "IntegrityLedgerLine"("businessId", "clientTransactionId");

CREATE INDEX "IntegrityLedgerLine_businessId_transactionId_idx" ON "IntegrityLedgerLine"("businessId", "transactionId");

CREATE INDEX "IntegrityLedgerLine_sourceEventId_idx" ON "IntegrityLedgerLine"("sourceEventId");

ALTER TABLE "IntegrityLedgerLine" ADD CONSTRAINT "IntegrityLedgerLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrityLedgerLine" ADD CONSTRAINT "IntegrityLedgerLine_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrityLedgerLine" ADD CONSTRAINT "IntegrityLedgerLine_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "IntegrityLedgerEvent"("eventId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrityLedgerLine" ADD CONSTRAINT "IntegrityLedgerLine_debit_nonnegative" CHECK ("debit" >= 0);

ALTER TABLE "IntegrityLedgerLine" ADD CONSTRAINT "IntegrityLedgerLine_credit_nonnegative" CHECK ("credit" >= 0);
