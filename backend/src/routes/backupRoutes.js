const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const { triggerBackup, getBackups, getRecoveryInfo } = require("../controllers/backupController");

const router = express.Router();

router.post("/backups/trigger", requireAuth, requireAdmin, triggerBackup);
router.get("/backups", requireAuth, requireAdmin, getBackups);
router.get("/backups/recovery-info", requireAuth, requireAdmin, getRecoveryInfo);

module.exports = router;
