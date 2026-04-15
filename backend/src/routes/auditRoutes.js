const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const { getAuditLogs } = require("../controllers/auditController");
const { postAuditEventsBulk } = require("../controllers/auditEventController");

const router = express.Router();

router.post("/audit-events/bulk", requireAuth, postAuditEventsBulk);
router.get("/audit-logs", requireAuth, requireAdmin, getAuditLogs);

module.exports = router;
