const {
  createBackupForBusiness,
  listBackups,
  BACKUP_DIR,
  saveIndexedDBBackupSnapshot,
  readBackupPayload,
} = require("../services/backupService");
const { sendOk } = require("../utils/http");

async function triggerBackup(req, res, next) {
  try {
    const data = await createBackupForBusiness(req.auth.businessId);
    return sendOk(res, data, 201);
  } catch (error) {
    return next(error);
  }
}

async function getBackups(req, res, next) {
  try {
    const data = await listBackups(req.auth.businessId);
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

function getRecoveryInfo(_req, res) {
  return sendOk(res, {
    backupDirectory: BACKUP_DIR,
    restorePreparation:
      "Server backups: restore by loading selected backup JSON and replaying records in dependency order: settings, products, customers, transactions, transaction items. Device (IndexedDB) backups: use Restore on a device backup below to replace local offline data; the app reloads after import.",
  });
}

async function postIndexedDBBackup(req, res, next) {
  try {
    const snapshot = req.body?.snapshot != null ? req.body.snapshot : req.body;
    const data = await saveIndexedDBBackupSnapshot(
      req.auth.businessId,
      req.auth.userId,
      snapshot
    );
    return sendOk(res, data, 201);
  } catch (error) {
    return next(error);
  }
}

async function downloadBackup(req, res, next) {
  try {
    const { data, record } = await readBackupPayload(req.params.id, req.auth.businessId);
    return sendOk(res, {
      id: record.id,
      kind: record.kind,
      createdAt: record.createdAt,
      sizeBytes: record.sizeBytes,
      snapshot: record.kind === "INDEXEDDB" ? data : null,
      serverExport: record.kind === "SERVER" ? data : null,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  triggerBackup,
  getBackups,
  getRecoveryInfo,
  postIndexedDBBackup,
  downloadBackup,
};
