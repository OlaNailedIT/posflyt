const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const { adminOpsLimiter } = require("../middlewares/adminOpsLimiter");
const { logAdminApiAccess } = require("../middlewares/adminApiLog");
const {
  getTransactions,
  getTransactionById,
  getEvents,
  getEventById,
  getPayments,
  getWebhookEvents,
  getSyncSummaryHandler,
  getErrors,
  getMonitoringAlerts,
  postAlertTest,
} = require("../controllers/adminOpsController");

const router = express.Router();

router.use(requireAuth);
router.use(requireAdmin);
router.use(adminOpsLimiter);
router.use(logAdminApiAccess);

/** Read-only monitoring APIs (Phase 7.2). JWT + admin role; requestId in envelope + logs. */
router.get("/transactions", getTransactions);
router.get("/transactions/:id", getTransactionById);
router.get("/events", getEvents);
router.get("/events/:id", getEventById);
router.get("/payments", getPayments);
router.get("/webhook-events", getWebhookEvents);
router.get("/sync-summary", getSyncSummaryHandler);
router.get("/errors", getErrors);
router.get("/monitoring-alerts", getMonitoringAlerts);
/** Optional: verify Slack (or similar) alert wiring. */
router.post("/alerts/test", postAlertTest);

module.exports = router;
