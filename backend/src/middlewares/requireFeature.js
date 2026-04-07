const { ensureBusinessSubscription } = require("../services/subscriptionService");
const { isFeatureEnabled } = require("../services/featureFlagService");
const { sendError } = require("../utils/http");

/**
 * Enforces DB-backed feature flags (tier + optional A/B). Use after `requireAuth`.
 */
function requireFeature(featureKey) {
  return async function requireFeatureMiddleware(req, res, next) {
    try {
      const subscription = await ensureBusinessSubscription(req.auth.businessId);
      req.subscription = subscription;
      const ok = await isFeatureEnabled(req.auth.businessId, subscription.plan, featureKey);
      if (!ok) {
        return sendError(res, {
          statusCode: 403,
          code: "FEATURE_DISABLED",
          message: `This feature is not available on your current plan (${featureKey}). Upgrade to unlock.`,
          location: "middlewares/requireFeature",
          details: { requestId: req.requestId, featureKey },
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireFeature };
