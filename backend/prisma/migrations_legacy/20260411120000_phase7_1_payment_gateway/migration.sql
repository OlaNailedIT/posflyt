-- Phase 7.1: payment correlation, retry fields, webhook event outcome.

ALTER TABLE "PaymentHistory" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "PaymentHistory" ADD COLUMN "gatewayEventId" TEXT;
ALTER TABLE "PaymentHistory" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PaymentHistory" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "PaymentHistory" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "PaymentHistory" ADD COLUMN "failureReason" TEXT;

CREATE INDEX "PaymentHistory_status_nextRetryAt_idx" ON "PaymentHistory"("status", "nextRetryAt");
CREATE INDEX "PaymentHistory_clientRequestId_idx" ON "PaymentHistory"("clientRequestId");

ALTER TABLE "BillingWebhookEvent" ADD COLUMN "outcome" TEXT DEFAULT 'SUCCESS';
