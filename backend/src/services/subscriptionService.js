const prisma = require("../config/prisma");

const PLAN_ORDER = {
  FREE: 0,
  BASIC: 1,
  PREMIUM: 2,
};

const PLAN_LIMITS = {
  FREE: { maxProducts: 50, advancedAnalytics: false, reports: false, staffAnalytics: false },
  BASIC: { maxProducts: 1000, advancedAnalytics: true, reports: true, staffAnalytics: true },
  PREMIUM: { maxProducts: 10000, advancedAnalytics: true, reports: true, staffAnalytics: true },
};

async function ensureBusinessSubscription(businessId) {
  const existing = await prisma.subscription.findUnique({ where: { businessId } });
  if (existing) {
    if (existing.plan !== "FREE" && existing.status === "ACTIVE" && existing.expiresAt) {
      if (new Date(existing.expiresAt).getTime() < Date.now()) {
        return prisma.subscription.update({
          where: { businessId },
          data: { status: "EXPIRED" },
        });
      }
    }
    return existing;
  }
  return prisma.subscription.create({
    data: {
      businessId,
      plan: "FREE",
      status: "ACTIVE",
      usageLimits: PLAN_LIMITS.FREE,
    },
  });
}

function hasPlanAccess(currentPlan, minimumPlan) {
  return PLAN_ORDER[currentPlan] >= PLAN_ORDER[minimumPlan];
}

function isSubscriptionActive(subscription) {
  if (!subscription) return false;
  if (subscription.plan === "FREE") return true;
  if (subscription.status !== "ACTIVE") return false;
  if (subscription.expiresAt && new Date(subscription.expiresAt).getTime() < Date.now()) return false;
  return true;
}

module.exports = { PLAN_LIMITS, ensureBusinessSubscription, hasPlanAccess, isSubscriptionActive };
