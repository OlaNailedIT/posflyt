const { nowISOString } = require("../utils/date.js");
const path = require("path");
const fs = require("fs/promises");
const prisma = require("../config/prisma");
const { nodeEnv } = require("../config/env");

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
/** Full IndexedDB export must stay under this size (matches route JSON limit). */
const MAX_INDEXEDDB_BACKUP_BYTES = 32 * 1024 * 1024;

/** Object store names from `src/services/db.js` (offline DB). */
const INDEXEDDB_STORE_KEYS = [
  "products",
  "dashboard",
  "transactions_queue",
  "customers_cache",
  "outbox",
  "inventory_count_session",
];

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
    generatedAt: nowISOString(),
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
      kind: "SERVER",
    },
  });

  return { filePath, sizeBytes: Number(stat.size) };
}

function validateIndexedDBSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    const e = new Error("Invalid snapshot: expected an object");
    e.statusCode = 400;
    e.code = "INVALID_SNAPSHOT";
    return e;
  }
  const stores = snapshot.stores;
  if (!stores || typeof stores !== "object" || Array.isArray(stores)) {
    const e = new Error("Snapshot must include a stores object");
    e.statusCode = 400;
    e.code = "INVALID_SNAPSHOT";
    return e;
  }
  for (const key of INDEXEDDB_STORE_KEYS) {
    if (stores[key] !== undefined && !Array.isArray(stores[key])) {
      const e = new Error(`Invalid stores.${key}: expected an array`);
      e.statusCode = 400;
      e.code = "INVALID_SNAPSHOT";
      return e;
    }
  }
  return null;
}

/**
 * Persist a full client IndexedDB export as JSON; metadata row kind INDEXEDDB.
 * @param {string} businessId
 * @param {string} userId
 * @param {object} snapshot — `{ dbName, dbVersion, exportedAt?, stores: { ... } }`
 */
async function saveIndexedDBBackupSnapshot(businessId, userId, snapshot) {
  const err = validateIndexedDBSnapshot(snapshot);
  if (err) throw err;

  await ensureBackupDir();
  const fileName = `indexeddb_${businessId}_${Date.now()}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);
  const content = JSON.stringify(snapshot);
  if (Buffer.byteLength(content, "utf8") > MAX_INDEXEDDB_BACKUP_BYTES) {
    const e = new Error("Backup payload too large");
    e.statusCode = 413;
    e.code = "PAYLOAD_TOO_LARGE";
    throw e;
  }

  await fs.writeFile(filePath, content, "utf8");
  const stat = await fs.stat(filePath);
  const record = await prisma.backupRecord.create({
    data: {
      businessId,
      filePath,
      sizeBytes: Number(stat.size),
      status: "READY",
      kind: "INDEXEDDB",
      createdByUserId: userId || null,
    },
  });

  return {
    id: record.id,
    filePath,
    sizeBytes: Number(stat.size),
    kind: "INDEXEDDB",
    createdAt: record.createdAt,
  };
}

async function readBackupPayload(backupId, businessId) {
  const record = await prisma.backupRecord.findFirst({
    where: { id: backupId, businessId },
  });
  if (!record) {
    const e = new Error("Backup not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }
  const raw = await fs.readFile(record.filePath, "utf8");
  try {
    return { record, data: JSON.parse(raw) };
  } catch {
    const e = new Error("Backup file is corrupted");
    e.statusCode = 500;
    e.code = "BACKUP_READ_ERROR";
    throw e;
  }
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

module.exports = {
  createBackupForBusiness,
  listBackups,
  startBackupScheduler,
  BACKUP_DIR,
  saveIndexedDBBackupSnapshot,
  readBackupPayload,
  validateIndexedDBSnapshot,
  INDEXEDDB_STORE_KEYS,
};
