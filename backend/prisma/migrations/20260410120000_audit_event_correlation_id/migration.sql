-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN "correlationId" TEXT;

-- CreateIndex
CREATE INDEX "AuditEvent_businessId_correlationId_idx" ON "AuditEvent"("businessId", "correlationId");
