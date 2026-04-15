-- Append-only business audit trail (accountability layer; separate from AuditLog / UFEC).
CREATE TABLE IF NOT EXISTS "AuditEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditEvent_businessId_createdAt_idx" ON "AuditEvent"("businessId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditEvent_businessId_entityType_entityId_idx" ON "AuditEvent"("businessId", "entityType", "entityId");

ALTER TABLE "AuditEvent" DROP CONSTRAINT IF EXISTS "AuditEvent_businessId_fkey";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
