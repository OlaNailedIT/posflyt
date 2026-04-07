const prisma = require("../config/prisma");
const { SOFT_QUOTA_RATIO, PLAN_QUOTAS } = require("../config/planEntitlements");
const { ensureBusinessSubscription, PLAN_LIMITS, isSubscriptionActive } = require("./subscriptionService");
const { logAudit } = require("./auditService");
const { notifyQuotaApproaching, notifyQuotaExceeded } = require("./lifecycleEmailService");

function utcYearMonth(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBoundsUtc(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { start, end };
}

function quotaError(resource, message, details) {
  const err = new Error(message);
  err.statusCode = 429;
  err.code = "QUOTA_EXCEEDED";
  err.details = { resource, upsell: true, upgradePath: "/billing", ...details };
  return err;
}

function getQuotasForPlan(plan) {
  return PLAN_QUOTAS[plan] || PLAN_QUOTAS.FREE;
}

async function countTransactionsThisMonth(businessId, ym = utcYearMonth()) {
  const { start, end } = monthBoundsUtc(ym);
  return prisma.transaction.count({
    where: { businessId, createdAt: { gte: start, lt: end } },
  });
}

async function incrementApiUsageAndAssert(businessId) {
  const sub = await ensureBusinessSubscription(businessId);
  if (!isSubscriptionActive(sub)) {
    const err = new Error("Subscription inactive");
    err.statusCode = 403;
    err.code = "SUBSCRIPTION_EXPIRED";
    throw err;
  }
  const ym = utcYearMonth();
  const limits = getQuotasForPlan(sub.plan);

  let next = 0;
  await prisma.$transaction(async (tx) => {
    const row = await tx.usageMonthly.findUnique({
      where: { businessId_yearMonth: { businessId, yearMonth: ym } },
    });
    const cur = row?.apiRequestCount ?? 0;
    if (cur + 1 > limits.apiRequestsPerMonth) {
      await logAudit({
        businessId,
        action: "QUOTA_BLOCKED",
        metadata: { resource: "api_requests", used: cur, limit: limits.apiRequestsPerMonth },
      });
      await notifyQuotaExceeded({ businessId, resource: "api_requests" });
      throw quotaError(
        "api_requests",
        "API request quota reached for this billing period — upgrade to increase limits.",
        { used: cur, limit: limits.apiRequestsPerMonth, period: ym }
      );
    }
    const updated = await tx.usageMonthly.upsert({
      where: { businessId_yearMonth: { businessId, yearMonth: ym } },
      create: { businessId, yearMonth: ym, apiRequestCount: 1 },
      update: { apiRequestCount: { increment: 1 } },
    });
    next = updated.apiRequestCount;
  });

  const soft = Math.floor(limits.apiRequestsPerMonth * SOFT_QUOTA_RATIO);
  if (next === soft + 1) {
    await notifyQuotaApproaching({
      businessId,
      resource: "api_requests",
      used: next,
      limit: limits.apiRequestsPerMonth,
    });
  }
}

async function assertTransactionQuota(businessId, additionalCount, { userId } = {}) {
  if (additionalCount < 1) return;
  const sub = await ensureBusinessSubscription(businessId);
  if (!isSubscriptionActive(sub)) {
    const err = new Error("Subscription inactive");
    err.statusCode = 403;
    err.code = "SUBSCRIPTION_EXPIRED";
    throw err;
  }
  const ym = utcYearMonth();
  const limits = getQuotasForPlan(sub.plan);
  const used = await countTransactionsThisMonth(businessId, ym);
  if (used + additionalCount > limits.transactionsPerMonth) {
    await logAudit({
      businessId,
      userId: userId || null,
      action: "QUOTA_BLOCKED",
      metadata: { resource: "transactions", used, add: additionalCount, limit: limits.transactionsPerMonth, period: ym },
    });
    await notifyQuotaExceeded({ businessId, resource: "transactions" });
    throw quotaError(
      "transactions",
      "Monthly transaction quota reached — upgrade to Pro for more capacity.",
      { used, limit: limits.transactionsPerMonth, period: ym },
    );
  }
  const soft = Math.floor(limits.transactionsPerMonth * SOFT_QUOTA_RATIO);
  if (used + additionalCount > soft && used <= soft) {
    await notifyQuotaApproaching({
      businessId,
      resource: "transactions",
      used: used + additionalCount,
      limit: limits.transactionsPerMonth,
    });
    await logAudit({
      businessId,
      userId: userId || null,
      action: "QUOTA_SOFT_WARNING",
      metadata: { resource: "transactions", used: used + additionalCount, limit: limits.transactionsPerMonth, period: ym },
    });
  }
}

async function assertCustomerQuota(businessId, { userId } = {}) {
  const sub = await ensureBusinessSubscription(businessId);
  if (!isSubscriptionActive(sub)) {
    const err = new Error("Subscription inactive");
    err.statusCode = 403;
    err.code = "SUBSCRIPTION_EXPIRED";
    throw err;
  }
  const limits = getQuotasForPlan(sub.plan);
  const used = await prisma.customer.count({ where: { businessId } });
  if (used + 1 > limits.customers) {
    await logAudit({
      businessId,
      userId: userId || null,
      action: "QUOTA_BLOCKED",
      metadata: { resource: "customers", used, limit: limits.customers },
    });
    await notifyQuotaExceeded({ businessId, resource: "customers" });
    throw quotaError(
      "customers",
      "Customer quota reached — upgrade to add more customers.",
      { used, limit: limits.customers },
    );
  }
  const soft = Math.floor(limits.customers * SOFT_QUOTA_RATIO);
  if (used + 1 > soft && used <= soft) {
    await notifyQuotaApproaching({ businessId, resource: "customers", used: used + 1, limit: limits.customers });
    await logAudit({
      businessId,
      userId: userId || null,
      action: "QUOTA_SOFT_WARNING",
      metadata: { resource: "customers", used: used + 1, limit: limits.customers },
    });
  }
}

async function assertProductQuota(businessId, { userId } = {}) {
  const sub = await ensureBusinessSubscription(businessId);
  if (!isSubscriptionActive(sub)) {
    const err = new Error("Subscription inactive");
    err.statusCode = 403;
    err.code = "SUBSCRIPTION_EXPIRED";
    throw err;
  }
  const maxProducts = PLAN_LIMITS[sub.plan]?.maxProducts || PLAN_LIMITS.FREE.maxProducts;
  const used = await prisma.product.count({ where: { businessId } });
  if (used + 1 > maxProducts) {
    await logAudit({
      businessId,
      userId: userId || null,
      action: "QUOTA_BLOCKED",
      metadata: { resource: "products", used, limit: maxProducts },
    });
    await notifyQuotaExceeded({ businessId, resource: "products" });
    throw quotaError(
      "products",
      `Product limit reached (${maxProducts} on ${sub.plan} plan). Upgrade to add more inventory items.`,
      { used, limit: maxProducts, plan: sub.plan },
    );
  }
  const soft = Math.floor(maxProducts * SOFT_QUOTA_RATIO);
  if (used + 1 > soft && used <= soft) {
    await notifyQuotaApproaching({ businessId, resource: "products", used: used + 1, limit: maxProducts });
    await logAudit({
      businessId,
      userId: userId || null,
      action: "QUOTA_SOFT_WARNING",
      metadata: { resource: "products", used: used + 1, limit: maxProducts },
    });
  }
}

function utcDayKey(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

async function computeActivityStreak(businessId) {
  const since = addDays(new Date(), -120);
  const txs = await prisma.transaction.findMany({
    where: { businessId, createdAt: { gte: since } },
    select: { createdAt: true },
    take: 8000,
  });
  const days = new Set(txs.map((t) => utcDayKey(t.createdAt)));
  const today = utcDayKey(new Date());
  const yesterday = utcDayKey(addDays(new Date(), -1));
  if (!days.has(today) && !days.has(yesterday)) return 0;
  let cursor = days.has(today) ? new Date() : addDays(new Date(), -1);
  let streak = 0;
  for (let i = 0; i < 120; i++) {
    const k = utcDayKey(cursor);
    if (days.has(k)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else break;
  }
  return streak;
}

async function buildUsageSummary(businessId) {
  const sub = await ensureBusinessSubscription(businessId);
  const ym = utcYearMonth();
  const limits = getQuotasForPlan(sub.plan);
  const maxProducts = PLAN_LIMITS[sub.plan]?.maxProducts || PLAN_LIMITS.FREE.maxProducts;

  const [txMonth, customerCount, productCount, apiRow, paidRenewals, onboarding] = await Promise.all([
    countTransactionsThisMonth(businessId, ym),
    prisma.customer.count({ where: { businessId } }),
    prisma.product.count({ where: { businessId } }),
    prisma.usageMonthly.findUnique({
      where: { businessId_yearMonth: { businessId, yearMonth: ym } },
    }),
    prisma.paymentHistory.count({
      where: { businessId, status: "paid" },
    }),
    prisma.onboardingProgress.findUnique({ where: { businessId } }),
  ]);

  const apiUsed = apiRow?.apiRequestCount ?? 0;
  const soft = (n) => Math.floor(n * SOFT_QUOTA_RATIO);

  const streak = await computeActivityStreak(businessId);
  const loyaltyEligible = streak >= 7 && paidRenewals >= 2;

  return {
    plan: sub.plan,
    subscriptionActive: isSubscriptionActive(sub),
    period: ym,
    quotas: {
      transactions: {
        used: txMonth,
        limit: limits.transactionsPerMonth,
        softLimit: soft(limits.transactionsPerMonth),
        nearLimit: txMonth >= soft(limits.transactionsPerMonth),
        atLimit: txMonth >= limits.transactionsPerMonth,
      },
      customers: {
        used: customerCount,
        limit: limits.customers,
        softLimit: soft(limits.customers),
        nearLimit: customerCount >= soft(limits.customers),
        atLimit: customerCount >= limits.customers,
      },
      products: {
        used: productCount,
        limit: maxProducts,
        softLimit: soft(maxProducts),
        nearLimit: productCount >= soft(maxProducts),
        atLimit: productCount >= maxProducts,
      },
      apiRequests: {
        used: apiUsed,
        limit: limits.apiRequestsPerMonth,
        softLimit: soft(limits.apiRequestsPerMonth),
        nearLimit: apiUsed >= soft(limits.apiRequestsPerMonth),
        atLimit: apiUsed >= limits.apiRequestsPerMonth,
      },
    },
    loyalty: {
      activityStreakDays: streak,
      paidRenewals,
      lastActiveAt: onboarding?.lastActiveAt ?? null,
      loyaltyOfferEligible: loyaltyEligible,
    },
    upsell: {
      showUpgrade:
        txMonth >= soft(limits.transactionsPerMonth) ||
        customerCount >= soft(limits.customers) ||
        productCount >= soft(maxProducts) ||
        apiUsed >= soft(limits.apiRequestsPerMonth),
    },
  };
}

module.exports = {
  utcYearMonth,
  incrementApiUsageAndAssert,
  assertTransactionQuota,
  assertCustomerQuota,
  assertProductQuota,
  buildUsageSummary,
  countTransactionsThisMonth,
  getQuotasForPlan,
};
