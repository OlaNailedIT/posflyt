-- Phase 5: materialized financial state cache (derived; event stream remains SoR).

CREATE TABLE "IntegritySnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientTransactionId" TEXT NOT NULL,
    "lastEventId" TEXT,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "stateJson" JSONB NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "ledgerHash" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegritySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegritySnapshot_businessId_clientTransactionId_key" ON "IntegritySnapshot"("businessId", "clientTransactionId");

CREATE INDEX "IntegritySnapshot_businessId_createdAt_idx" ON "IntegritySnapshot"("businessId", "createdAt");

ALTER TABLE "IntegritySnapshot" ADD CONSTRAINT "IntegritySnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
