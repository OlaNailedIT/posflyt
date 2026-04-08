const prisma = require("../config/prisma");
const { logger } = require("../utils/logger");
const { trialWarningDaysBefore, slackBillingWebhookUrl } = require("../config/env");

async function recordLifecycleEvent(businessId, eventType, metadata = {}) {
  try {
    return await prisma.subscriptionLifecycleEvent.create({
      data: {
        businessId,
        eventType,
        metadata: metadata && typeof metadata === "object" ? metadata : {},
      },
    });
  } catch (e) {
    logger.warn({ err: e, businessId, eventType }, "subscription lifecycle event write failed");
    return null;
  }
}

async function hasRecentEvent(businessId, eventType, withinMs) {
  const since = new Date(Date.now() - withinMs);
  const row = await prisma.subscriptionLifecycleEvent.findFirst({
    where: { businessId, eventType, createdAt: { gte: since } },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Emit trial warnings and record lifecycle events (idempotent within windows).
 * Also notifies Slack when configured (no separate email server required).
 */
async function processTrialNotifications(subscription) {
  const sub = subscription;
  if (!sub?.trialEndsAt || sub.plan !== "FREE") return { warnings: [] };

  const end = new Date(sub.trialEndsAt).getTime();
  const now = Date.now();
  const msLeft = end - now;
  const daysLeft = msLeft / 86400000;

  const warnings = [];

  if (msLeft <= 0) {
    const already = await hasRecentEvent(sub.businessId, "TRIAL_EXPIRED", 86400000 * 2);
    if (!already) {
      await recordLifecycleEvent(sub.businessId, "TRIAL_EXPIRED", {
        trialEndsAt: sub.trialEndsAt,
      });
      await maybeSlack(
        `Trial expired for business ${sub.businessId}. Upgrade to paid to restore full access.`
      );
    }
    warnings.push({ code: "TRIAL_EXPIRED", message: "Your trial has ended. Choose a plan to continue." });
    return { warnings };
  }

  if (trialWarningDaysBefore > 0 && daysLeft <= trialWarningDaysBefore && daysLeft > 0) {
    const already = await hasRecentEvent(sub.businessId, "TRIAL_EXPIRING_SOON", 86400000);
    if (!already) {
      await recordLifecycleEvent(sub.businessId, "TRIAL_EXPIRING_SOON", {
        trialEndsAt: sub.trialEndsAt,
        daysRemaining: Math.ceil(daysLeft),
      });
      await maybeSlack(
        `Trial ending soon for business ${sub.businessId}: ~${Math.ceil(daysLeft)} day(s) left.`
      );
    }
    warnings.push({
      code: "TRIAL_EXPIRING_SOON",
      message: `Trial ends in ${Math.ceil(daysLeft)} day(s).`,
      daysRemaining: Math.ceil(daysLeft),
    });
  }

  return { warnings };
}

async function maybeSlack(text) {
  if (!slackBillingWebhookUrl) return;
  try {
    await fetch(slackBillingWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[POSflyt lifecycle] ${text}` }),
    });
  } catch (e) {
    logger.warn({ err: e }, "slack lifecycle notify failed");
  }
}

module.exports = {
  recordLifecycleEvent,
  processTrialNotifications,
  hasRecentEvent,
};
