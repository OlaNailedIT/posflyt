const path = require("path");
const fs = require("fs/promises");
const prisma = require("../config/prisma");
const { nodeEnv } = require("../config/env");

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
let schedulerStarted = false;

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function createBackupForBusiness(businessId) {
  await ensureBackupDir();
  const [products, customers, transactions, settings] = await Promise.all([
    prisma.product.findMany({ where: { businessId } }),
    prisma.customer.findMany({ where: { businessId } }),
    prisma.transaction.findMany({
      where: { businessId },
      include: { items: true },
    }),
    prisma.settings.findUnique({ where: { businessId } }),
  ]);
  const payload = {
    businessId,
    generatedAt: new Date().toISOString(),
    products,
    customers,
    transactions,
    settings,
  };
  const fileName = `backup_${businessId}_${Date.now()}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);
  const content = JSON.stringify(payload, null, 2);
  await fs.writeFile(filePath, content, "utf8");

  const stat = await fs.stat(filePath);
  await prisma.backupRecord.create({
    data: {
      businessId,
      filePath,
      sizeBytes: Number(stat.size),
      status: "READY",
    },
  });

  return { filePath, sizeBytes: Number(stat.size) };
}

async function listBackups(businessId) {
  return prisma.backupRecord.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function createBackupsForAllBusinesses() {
  const businesses = await prisma.business.findMany({ select: { id: true } });
  for (const business of businesses) {
    // Best-effort backup for each business.
    // eslint-disable-next-line no-await-in-loop
    await createBackupForBusiness(business.id);
  }
}

function startBackupScheduler() {
  if (schedulerStarted || nodeEnv === "test") return;
  schedulerStarted = true;
  setInterval(() => {
    createBackupsForAllBusinesses().catch(() => {});
  }, 1000 * 60 * 60 * 6);
}

module.exports = { createBackupForBusiness, listBackups, startBackupScheduler, BACKUP_DIR };
