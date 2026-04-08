const prisma = require("../config/prisma");
const { isSubscriptionActive } = require("./subscriptionService");

async function getSalesFeed(businessId) {
  const transactions = await prisma.transaction.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      user: {
        select: {
          name: true,
        },
      },
    },
  });

  return transactions.map((tx) => ({
    id: tx.id,
    sellerName: tx.user?.name || "Unknown",
    totalAmount: Number(tx.total),
    paymentMethod: tx.paymentMethod,
    createdAt: tx.createdAt,
    date: tx.createdAt.toISOString().slice(0, 10),
    time: tx.createdAt.toISOString().slice(11, 19),
  }));
}

async function getDailyCloseStatus(businessId) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const [salesAgg, transactionsCount, inventoryConflicts, syncFailures, existingClose] = await Promise.all([
    prisma.transaction.aggregate({
      where: { businessId, createdAt: { gte: dayStart, lte: dayEnd } },
      _sum: { total: true },
    }),
    prisma.transaction.count({
      where: { businessId, createdAt: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.auditLog.count({
      where: {
        businessId,
        action: "SYNC_INVENTORY_CONFLICT",
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.auditLog.count({
      where: {
        businessId,
        action: "SYNC_RETRY_FAILED",
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.auditLog.findFirst({
      where: {
        businessId,
        action: "DAILY_CLOSE_CONFIRMED",
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, userId: true, metadata: true },
    }),
  ]);

  const varianceFlags = [];
  if (syncFailures > 0) varianceFlags.push("Unsynced sales detected");
  if (inventoryConflicts > 0) varianceFlags.push("Inventory conflicts detected");

  return {
    date: dayStart.toISOString().slice(0, 10),
    totalRevenue: Number(salesAgg._sum.total || 0),
    transactionCount: transactionsCount,
    varianceFlags,
    isClosed: Boolean(existingClose),
    closedAt: existingClose?.createdAt || null,
    closedByUserId: existingClose?.userId || null,
    closeSummary: existingClose?.metadata || null,
  };
}

async function confirmDailyClose(businessId, userId) {
  const status = await getDailyCloseStatus(businessId);
  if (status.isClosed) {
    return status;
  }
  const metadata = {
    date: status.date,
    totalRevenue: status.totalRevenue,
    transactionCount: status.transactionCount,
    varianceFlags: status.varianceFlags,
  };
  await prisma.auditLog.create({
    data: {
      businessId,
      userId,
      action: "DAILY_CLOSE_CONFIRMED",
      metadata,
    },
  });
  return getDailyCloseStatus(businessId);
}

async function getInvestorMetrics() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const [revenueAgg, monthlyAgg, txCount, activeBusinesses] = await Promise.all([
    prisma.transaction.aggregate({ _sum: { total: true } }),
    prisma.transaction.aggregate({
      where: { createdAt: { gte: monthStart, lte: now } },
      _sum: { total: true },
    }),
    prisma.transaction.count(),
    prisma.onboardingProgress.count({
      where: {
        lastActiveAt: {
          gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
        },
      },
    }),
  ]);

  const trendRaw = await prisma.transaction.groupBy({
    by: ["createdAt"],
    _sum: { total: true },
    orderBy: { createdAt: "asc" },
    where: { createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90) } },
  });
  const trend = trendRaw.map((t) => ({
    timestamp: t.createdAt,
    value: Number(t._sum.total || 0),
  }));

  return {
    totalRevenue: Number(revenueAgg._sum.total || 0),
    monthlyRevenue: Number(monthlyAgg._sum.total || 0),
    activeBusinesses,
    transactionsVolume: txCount,
    growthTrend: trend,
  };
}

/**
 * Tenant admin: SaaS billing + sync health for the authenticated business.
 */
async function getBillingOverview(businessId) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  const [
    subscription,
    paymentCount,
    paidDay,
    paidWeek,
    paidMonth,
    syncConflicts,
    syncFails,
    recentPayments,
  ] = await Promise.all([
    prisma.subscription.findUnique({ where: { businessId } }),
    prisma.paymentHistory.count({ where: { businessId } }),
    prisma.paymentHistory.aggregate({
      where: { businessId, status: "paid", paidAt: { gte: dayStart } },
      _sum: { amount: true },
    }),
    prisma.paymentHistory.aggregate({
      where: { businessId, status: "paid", paidAt: { gte: weekStart } },
      _sum: { amount: true },
    }),
    prisma.paymentHistory.aggregate({
      where: { businessId, status: "paid", paidAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.auditLog.count({
      where: {
        businessId,
        action: "SYNC_INVENTORY_CONFLICT",
        createdAt: { gte: weekStart },
      },
    }),
    prisma.auditLog.count({
      where: {
        businessId,
        action: "SYNC_RETRY_FAILED",
        createdAt: { gte: weekStart },
      },
    }),
    prisma.paymentHistory.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        provider: true,
        providerRef: true,
        plan: true,
        amount: true,
        currency: true,
        status: true,
        paidAt: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    subscription,
    subscriptionActive: subscription ? isSubscriptionActive(subscription) : false,
    paymentCount,
    revenue: {
      day: Number(paidDay._sum.amount || 0),
      week: Number(paidWeek._sum.amount || 0),
      month: Number(paidMonth._sum.amount || 0),
    },
    sync: {
      inventoryConflicts7d: syncConflicts,
      retryFailed7d: syncFails,
    },
    recentPayments,
  };
}

async function listWebhookEventsForBusiness(businessId, { limit = 50 } = {}) {
  return prisma.billingWebhookEvent.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
  });
}

async function listPaymentsForAdmin(businessId, { q, status, from, to } = {}) {
  const where = { businessId };
  if (status && String(status).trim()) {
    const s = String(status).trim().toLowerCase();
    const allowed = new Set(["pending", "paid", "failed", "retrying", "canceled"]);
    if (allowed.has(s)) {
      where.status = s;
    }
  }
  if (q && String(q).trim()) {
    const term = String(q).trim();
    where.OR = [
      { providerRef: { contains: term, mode: "insensitive" } },
      { clientRequestId: { contains: term, mode: "insensitive" } },
      { gatewayEventId: { contains: term, mode: "insensitive" } },
    ];
  }
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  return prisma.paymentHistory.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

module.exports = {
  getSalesFeed,
  getDailyCloseStatus,
  confirmDailyClose,
  getInvestorMetrics,
  getBillingOverview,
  listWebhookEventsForBusiness,
  listPaymentsForAdmin,
};
