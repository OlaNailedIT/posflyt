const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/role");
const { requirePlan } = require("../middlewares/subscription");
const {
  getProfit,
  getStaff,
  getAlerts,
  getInsightsFeed,
  getForecastData,
  getSalesOptimizationData,
  getForecastDatasetData,
} = require("../controllers/analyticsController");

const router = express.Router();

const guard = [requireAuth, requireAdmin, requirePlan("BASIC")];
router.get("/analytics/profit", ...guard, getProfit);
router.get("/analytics/staff-performance", ...guard, getStaff);
router.get("/analytics/smart-alerts", ...guard, getAlerts);
router.get("/analytics/insights", ...guard, getInsightsFeed);
router.get("/analytics/forecast", ...guard, getForecastData);
router.get("/analytics/forecast-dataset", ...guard, getForecastDatasetData);
router.get("/analytics/sales-optimization", ...guard, getSalesOptimizationData);

module.exports = router;
