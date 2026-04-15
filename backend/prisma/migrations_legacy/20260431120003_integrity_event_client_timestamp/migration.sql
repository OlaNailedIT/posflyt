-- Phase 4C: deterministic projection ordering (client clock + tie-break eventId).
ALTER TABLE "IntegrityLedgerEvent" ADD COLUMN "clientTimestampMs" BIGINT;

CREATE INDEX "IntegrityLedgerEvent_businessId_clientTx_ts_idx" ON "IntegrityLedgerEvent"("businessId", "clientTransactionId", "clientTimestampMs", "eventId");
