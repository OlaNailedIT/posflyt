-- Idempotency: SHA-256 hex of canonical sale payload (client-computed, excluding payload_hash field).
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "payloadHash" TEXT;
