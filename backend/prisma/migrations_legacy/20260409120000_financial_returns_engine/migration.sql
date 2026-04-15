-- Financial-grade returns: SaleReturn state machine, append-only ledger, line items for partial returns.

CREATE TYPE "SaleReturnState" AS ENUM (
  'RETURN_INITIATED',
  'RETURN_VALIDATED',
  'LEDGER_RECORDED',
  'INVENTORY_RESTORED',
  'REFUND_PROCESSED',
  'RETURN_COMPLETED',
  'RETURN_FAILED_VALIDATION',
  'RETURN_FAILED_LEDGER',
  'RETURN_FAILED_INVENTORY',
  'RETURN_FAILED_REFUND'
);

CREATE TYPE "LedgerEntryKind" AS ENUM ('RETURN_REVERSAL');

CREATE TABLE "SaleReturn" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientReturnId" TEXT NOT NULL,
    "originalTransactionId" TEXT NOT NULL,
    "state" "SaleReturnState" NOT NULL DEFAULT 'RETURN_INITIATED',
    "returnTransactionId" TEXT,
    "failureCode" TEXT,
    "failureDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SaleReturn_returnTransactionId_key" ON "SaleReturn"("returnTransactionId");

CREATE UNIQUE INDEX "SaleReturn_businessId_clientReturnId_key" ON "SaleReturn"("businessId", "clientReturnId");

CREATE INDEX "SaleReturn_businessId_originalTransactionId_idx" ON "SaleReturn"("businessId", "originalTransactionId");

CREATE INDEX "SaleReturn_businessId_state_idx" ON "SaleReturn"("businessId", "state");

CREATE TABLE "SaleReturnLine" (
    "id" TEXT NOT NULL,
    "saleReturnId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SaleReturnLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SaleReturnLine_saleReturnId_idx" ON "SaleReturnLine"("saleReturnId");

CREATE INDEX "SaleReturnLine_productId_idx" ON "SaleReturnLine"("productId");

CREATE TABLE "FinancialLedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "LedgerEntryKind" NOT NULL,
    "saleReturnId" TEXT NOT NULL,
    "originalTransactionId" TEXT NOT NULL,
    "subtotalAmount" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialLedgerEntry_saleReturnId_key" ON "FinancialLedgerEntry"("saleReturnId");

CREATE INDEX "FinancialLedgerEntry_businessId_createdAt_idx" ON "FinancialLedgerEntry"("businessId", "createdAt" DESC);

CREATE INDEX "FinancialLedgerEntry_originalTransactionId_idx" ON "FinancialLedgerEntry"("originalTransactionId");

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_originalTransactionId_fkey" FOREIGN KEY ("originalTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_returnTransactionId_fkey" FOREIGN KEY ("returnTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleReturnLine" ADD CONSTRAINT "SaleReturnLine_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialLedgerEntry" ADD CONSTRAINT "FinancialLedgerEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialLedgerEntry" ADD CONSTRAINT "FinancialLedgerEntry_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
