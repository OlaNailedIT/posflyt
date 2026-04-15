const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const {
  getObsSummary,
  getObsHealth,
  getObsExplain,
  getObsAnomalies,
} = require("../controllers/observabilityController");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/obs/summary", getObsSummary);
router.get("/obs/health", getObsHealth);
router.get("/obs/anomalies", getObsAnomalies);
router.get("/obs/transactions/:clientTransactionId", getObsExplain);

module.exports = router;
