-- Phase 7.3 BI: accelerate customer acquisition / time-range queries per tenant
CREATE INDEX IF NOT EXISTS "Customer_businessId_createdAt_idx" ON "Customer"("businessId", "createdAt" DESC);
