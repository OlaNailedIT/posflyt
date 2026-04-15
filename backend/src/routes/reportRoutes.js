const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requirePermission } = require("../middlewares/permission");
const { requirePlan } = require("../middlewares/subscription");
const { requireFeature } = require("../middlewares/requireFeature");
const { getSales, getOwnerDailySummaryHandler } = require("../controllers/reportController");
const { getDailySummaryHandler } = require("../controllers/expenseController");
const { requireSubscriptionActive } = require("../middlewares/subscriptionActive");

const router = express.Router();

router.get(
  "/reports/sales",
  requireAuth,
  requirePermission("viewReports"),
  requirePlan("BASIC"),
  requireFeature("REPORTING"),
  getSales
);

router.get(
  "/reports/daily-summary",
  requireAuth,
  requireSubscriptionActive,
  requireFeature("DAILY_PROFIT_SUMMARY"),
  getDailySummaryHandler
);

router.get(
  "/reports/owner-daily-summary",
  requireAuth,
  requireSubscriptionActive,
  requirePermission("viewReports"),
  requireFeature("DAILY_SUMMARY_OWNER"),
  getOwnerDailySummaryHandler
);

module.exports = router;
