-- Staff invite (WhatsApp link) + optional phone on User for PIN login
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");

CREATE TABLE IF NOT EXISTS "StaffInvite" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffInvite_token_key" ON "StaffInvite"("token");
CREATE INDEX IF NOT EXISTS "StaffInvite_businessId_idx" ON "StaffInvite"("businessId");
CREATE INDEX IF NOT EXISTS "StaffInvite_businessId_phone_idx" ON "StaffInvite"("businessId", "phone");

ALTER TABLE "StaffInvite" DROP CONSTRAINT IF EXISTS "StaffInvite_businessId_fkey";
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffInvite" DROP CONSTRAINT IF EXISTS "StaffInvite_storeId_fkey";
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
