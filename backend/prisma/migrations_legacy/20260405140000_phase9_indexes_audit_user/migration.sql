-- Phase 9: audit lookups by user (admin / support queries)
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
