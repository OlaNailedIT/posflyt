const { incrementApiUsageAndAssert } = require("../services/usageQuotaService");

/**
 * Counts authenticated API calls toward monthly quota (Phase 7.5).
 * Attach to high-volume routes (e.g. BI) — not every `/products` read to avoid noise.
 */
async function meterApiUsage(req, res, next) {
  try {
    await incrementApiUsageAndAssert(req.auth.businessId);
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { meterApiUsage };
