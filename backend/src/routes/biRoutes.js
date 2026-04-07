const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireBiAccess } = require("../middlewares/biAccess");
const { requirePlan } = require("../middlewares/subscription");
const { requireFeature } = require("../middlewares/requireFeature");
const { meterApiUsage } = require("../middlewares/meterApiUsage");
const { biLimiter } = require("../middlewares/biLimiter");
const { logBiApiAccess } = require("../middlewares/biApiLog");
const {
  getBiSnapshot,
  getBiTransactions,
  getBiTransactionById,
  postSlackSummary,
} = require("../controllers/biController");

const router = express.Router();

const guard = [
  requireAuth,
  requireBiAccess,
  requirePlan("BASIC"),
  requireFeature("BI_DASHBOARD"),
  meterApiUsage,
  biLimiter,
  logBiApiAccess,
];

router.get("/snapshot", ...guard, getBiSnapshot);
router.get("/transactions/:id", ...guard, getBiTransactionById);
router.get("/transactions", ...guard, getBiTransactions);
router.post("/reports/slack-summary", ...guard, postSlackSummary);

module.exports = router;
