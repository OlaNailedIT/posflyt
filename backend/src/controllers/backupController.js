const { createBackupForBusiness, listBackups, BACKUP_DIR } = require("../services/backupService");
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
      "Restore by loading selected backup JSON and replaying records in dependency order: settings, products, customers, transactions, transaction items.",
  });
}

module.exports = { triggerBackup, getBackups, getRecoveryInfo };
