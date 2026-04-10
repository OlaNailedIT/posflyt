const { getDashboardStats } = require("../services/dashboardService");
const { sendOk } = require("../utils/http");
const { ensureBusinessSubscription } = require("../services/subscriptionService");
const { isFeatureEnabled } = require("../services/featureFlagService");

async function getStats(req, res, next) {
  try {
    const sub = await ensureBusinessSubscription(req.auth.businessId);
    const lowStockAlertsEnabled = await isFeatureEnabled(req.auth.businessId, sub.plan, "LOW_STOCK_ALERTS");
    const data = await getDashboardStats(req.auth.businessId, { lowStockAlertsEnabled });
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

module.exports = { getStats };
