const { ensureBusinessSubscription, isSubscriptionActive } = require("../services/subscriptionService");
const { sendError } = require("../utils/http");

/**
 * Blocks requests when the business subscription (or FREE trial) is no longer active.
 * Use on routes that should not run after trial expiry (e.g. dashboard stats).
 */
async function requireSubscriptionActive(req, res, next) {
  try {
    const subscription = await ensureBusinessSubscription(req.auth.businessId);
    req.subscription = subscription;
    if (!isSubscriptionActive(subscription)) {
      return sendError(res, {
        statusCode: 403,
        code: "SUBSCRIPTION_EXPIRED",
        message: "Subscription or trial expired. Upgrade to continue.",
        location: "middlewares.subscriptionActive.requireSubscriptionActive",
        details: { requestId: req.requestId },
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireSubscriptionActive };
