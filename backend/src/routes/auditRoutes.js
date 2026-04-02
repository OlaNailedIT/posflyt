const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const { getAuditLogs } = require("../controllers/auditController");

const router = express.Router();

router.get("/audit-logs", requireAuth, requireAdmin, getAuditLogs);

module.exports = router;
