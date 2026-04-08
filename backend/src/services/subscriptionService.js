const prisma = require("../config/prisma");
const { billingTrialDays, subscriptionGracePeriodDays } = require("../config/env");
const { recordLifecycleEvent } = require("./subscriptionLifecycleService");

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

/**
 * Paid plan passed `expiresAt` but still within optional grace window.
 */
function isInPaidGrace(sub) {
  if (!sub?.expiresAt || sub.plan === "FREE") return false;
  const now = Date.now();
  const exp = new Date(sub.expiresAt).getTime();
  if (exp >= now) return false;
  if (!sub.graceEndsAt) return false;
  return new Date(sub.graceEndsAt).getTime() > now;
}

function isTrialExpired(sub) {
  if (sub.plan !== "FREE" || !sub.trialEndsAt) return false;
  return new Date(sub.trialEndsAt).getTime() < Date.now();
}

function trialDaysRemaining(sub) {
  if (sub.plan !== "FREE" || !sub.trialEndsAt) return null;
  const ms = new Date(sub.trialEndsAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86400000);
}

/**
 * Apply grace end date when a paid subscription first crosses `expiresAt`.
 */
async function applyGraceTransition(sub) {
  if (sub.plan === "FREE" || !sub.expiresAt) return sub;
  const now = Date.now();
  const exp = new Date(sub.expiresAt).getTime();
  if (exp >= now) return sub;

  if (!sub.graceEndsAt && subscriptionGracePeriodDays > 0) {
    const graceEndsAt = new Date(exp + subscriptionGracePeriodDays * 86400000);
    const updated = await prisma.subscription.update({
      where: { businessId: sub.businessId },
      data: {
        graceEndsAt,
        status: "EXPIRED",
      },
    });
    await recordLifecycleEvent(sub.businessId, "SUBSCRIPTION_GRACE_STARTED", {
      expiresAt: sub.expiresAt,
      graceEndsAt: graceEndsAt.toISOString(),
    });
    return updated;
  }

  if (sub.graceEndsAt && new Date(sub.graceEndsAt).getTime() <= now) {
    return prisma.subscription.update({
      where: { businessId: sub.businessId },
      data: { status: "EXPIRED" },
    });
  }

  return sub;
}

async function ensureBusinessSubscription(businessId) {
  const existing = await prisma.subscription.findUnique({ where: { businessId } });
  if (existing) {
    if (existing.plan !== "FREE" && existing.expiresAt && new Date(existing.expiresAt).getTime() < Date.now()) {
      return applyGraceTransition(existing);
    }
    return existing;
  }
  const trialEndsAt =
    billingTrialDays > 0 ? new Date(Date.now() + billingTrialDays * 86400000) : null;
  const created = await prisma.subscription.create({
    data: {
      businessId,
      plan: "FREE",
      status: "ACTIVE",
      usageLimits: PLAN_LIMITS.FREE,
      ...(trialEndsAt ? { trialEndsAt } : {}),
    },
  });
  if (trialEndsAt) {
    await recordLifecycleEvent(businessId, "TRIAL_STARTED", {
      trialEndsAt: trialEndsAt.toISOString(),
      billingTrialDays,
    });
  }
  return created;
}

function hasPlanAccess(currentPlan, minimumPlan) {
  return PLAN_ORDER[currentPlan] >= PLAN_ORDER[minimumPlan];
}

function isSubscriptionActive(subscription) {
  if (!subscription) return false;
  if (subscription.status === "CANCELED") return false;
  if (subscription.plan === "FREE") {
    if (isTrialExpired(subscription)) return false;
    return true;
  }
  const now = Date.now();
  if (subscription.expiresAt) {
    const exp = new Date(subscription.expiresAt).getTime();
    if (exp >= now) return subscription.status === "ACTIVE";
    if (isInPaidGrace(subscription)) return true;
    return false;
  }
  return subscription.status === "ACTIVE";
}

/**
 * Rich payload for billing UI and API (Phase 7.4).
 */
function getSubscriptionAccessSummary(sub) {
  const active = isSubscriptionActive(sub);
  let reason = active ? "OK" : "INACTIVE";
  if (active && isInPaidGrace(sub)) {
    reason = "GRACE_PERIOD";
  } else if (!active && sub.plan === "FREE" && isTrialExpired(sub)) {
    reason = "TRIAL_EXPIRED";
  } else if (!active && sub.plan !== "FREE") {
    reason = "SUBSCRIPTION_EXPIRED";
  }

  return {
    subscriptionActive: active,
    accessReason: reason,
    trialDaysRemaining: trialDaysRemaining(sub),
    trialExpired: isTrialExpired(sub),
    inGracePeriod: isInPaidGrace(sub),
    graceEndsAt: sub.graceEndsAt || null,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
  };
}

module.exports = {
  PLAN_LIMITS,
  ensureBusinessSubscription,
  hasPlanAccess,
  isSubscriptionActive,
  getSubscriptionAccessSummary,
  isTrialExpired,
  isInPaidGrace,
  applyGraceTransition,
};
