-- Payment lifecycle enum + idempotency + provider metadata; rename lastAttemptAt -> lastRetryAt.

CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'retrying', 'canceled');

ALTER TABLE "PaymentHistory" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "PaymentHistory" ADD COLUMN "providerMetadata" JSONB;

ALTER TABLE "PaymentHistory" RENAME COLUMN "lastAttemptAt" TO "lastRetryAt";

ALTER TABLE "PaymentHistory" ADD COLUMN "status_new" "PaymentStatus";

UPDATE "PaymentHistory" SET "status_new" = CASE
  WHEN UPPER(TRIM(COALESCE("status", ''))) = 'PENDING' THEN 'pending'::"PaymentStatus"
  WHEN UPPER(TRIM(COALESCE("status", ''))) = 'PAID' THEN 'paid'::"PaymentStatus"
  WHEN UPPER(TRIM(COALESCE("status", ''))) = 'FAILED' THEN 'failed'::"PaymentStatus"
  WHEN UPPER(TRIM(COALESCE("status", ''))) = 'RETRYING' THEN 'retrying'::"PaymentStatus"
  WHEN UPPER(TRIM(COALESCE("status", ''))) = 'CANCELED' THEN 'canceled'::"PaymentStatus"
  ELSE 'pending'::"PaymentStatus"
END;

ALTER TABLE "PaymentHistory" DROP COLUMN "status";
ALTER TABLE "PaymentHistory" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "PaymentHistory" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "PaymentHistory" ALTER COLUMN "status" SET DEFAULT 'pending'::"PaymentStatus";

CREATE UNIQUE INDEX "PaymentHistory_idempotencyKey_key" ON "PaymentHistory"("idempotencyKey");
