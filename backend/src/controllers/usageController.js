const { sendOk } = require("../utils/http");
const { ensureBusinessSubscription } = require("../services/subscriptionService");
const { buildUsageSummary } = require("../services/usageQuotaService");
const { getResolvedFeatureMap } = require("../services/featureFlagService");

async function getUsageSummary(req, res, next) {
  try {
    const data = await buildUsageSummary(req.auth.businessId);
    return sendOk(res, data);
  } catch (err) {
    return next(err);
  }
}

async function getUsageFeatures(req, res, next) {
  try {
    const sub = await ensureBusinessSubscription(req.auth.businessId);
    const flags = await getResolvedFeatureMap(req.auth.businessId, sub.plan);
    return sendOk(res, { plan: sub.plan, flags });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getUsageSummary, getUsageFeatures };
