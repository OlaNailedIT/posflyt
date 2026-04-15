-- AlterTable
ALTER TABLE "BackupRecord" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'SERVER';
ALTER TABLE "BackupRecord" ADD COLUMN "createdByUserId" TEXT;
