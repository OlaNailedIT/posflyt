const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const {
  triggerBackup,
  getBackups,
  getRecoveryInfo,
  postIndexedDBBackup,
  downloadBackup,
} = require("../controllers/backupController");

const router = express.Router();

router.post("/backups/trigger", requireAuth, requireAdmin, triggerBackup);
router.post("/backups/indexeddb", requireAuth, requireAdmin, postIndexedDBBackup);
router.get("/backups", requireAuth, requireAdmin, getBackups);
router.get("/backups/recovery-info", requireAuth, requireAdmin, getRecoveryInfo);
router.get("/backups/:id/download", requireAuth, requireAdmin, downloadBackup);

module.exports = router;
