const {
  ensureBusinessSubscription,
  hasPlanAccess,
  isSubscriptionActive,
  isTrialExpired,
} = require("../services/subscriptionService");
const { sendError } = require("../utils/http");

function requirePlan(minimumPlan) {
  return async function planMiddleware(req, res, next) {
    try {
      const subscription = await ensureBusinessSubscription(req.auth.businessId);
      req.subscription = subscription;
      if (!isSubscriptionActive(subscription)) {
        const trialExpired =
          subscription.plan === "FREE" && isTrialExpired(subscription);
        return sendError(res, {
          statusCode: trialExpired ? 402 : 403,
          code: trialExpired ? "PAYMENT_REQUIRED" : "SUBSCRIPTION_EXPIRED",
          message: trialExpired
            ? "Trial ended or subscription inactive. Choose a plan to continue."
            : "Subscription expired. Please renew your plan.",
          location: "middlewares/subscription.requirePlan",
          details: { requestId: req.requestId },
        });
      }
      if (!hasPlanAccess(subscription.plan, minimumPlan)) {
        return sendError(res, {
          statusCode: 403,
          code: "PLAN_UPGRADE_REQUIRED",
          message: `This feature requires ${minimumPlan} plan or higher.`,
          location: "middlewares/subscription.requirePlan",
          details: { requestId: req.requestId, minimumPlan },
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { requirePlan };
