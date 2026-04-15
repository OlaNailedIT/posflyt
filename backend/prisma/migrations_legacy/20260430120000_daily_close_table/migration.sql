-- Phase 7.13.1: operational daily close records

CREATE TABLE "DailyClose" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalSales" DOUBLE PRECISION NOT NULL,
    "startOfDay" TIMESTAMP(3) NOT NULL,
    "endOfDay" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessDayKey" TEXT NOT NULL,

    CONSTRAINT "DailyClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyClose_businessId_businessDayKey_key" ON "DailyClose"("businessId", "businessDayKey");
CREATE INDEX "DailyClose_businessId_idx" ON "DailyClose"("businessId");
CREATE INDEX "DailyClose_userId_idx" ON "DailyClose"("userId");
CREATE INDEX "DailyClose_closedAt_idx" ON "DailyClose"("closedAt" DESC);

ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
