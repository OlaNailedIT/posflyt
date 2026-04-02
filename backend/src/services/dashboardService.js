const prisma = require("../config/prisma");

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

async function getDashboardStats(businessId) {
  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const dayEnd = endOfUtcDay(now);
  const todayWhere = { businessId, createdAt: { gte: dayStart, lte: dayEnd } };

  const [revenueAgg, transactionsToday, customersCount, recurringCustomersRaw, inventorySnapshot] =
    await Promise.all([
    prisma.transaction.aggregate({
      where: todayWhere,
      _sum: { total: true },
    }),
    prisma.transaction.count({ where: todayWhere }),
    prisma.customer.count({ where: { businessId } }),
    prisma.transaction.groupBy({
      by: ["customerId"],
      where: { businessId, customerId: { not: null } },
      _count: { _all: true },
      having: {
        customerId: { _count: { gt: 1 } },
      },
    }),
    prisma.product.findMany({
      where: { businessId },
      select: { id: true, name: true, stock: true, lowStockThreshold: true, updatedAt: true },
      orderBy: [{ stock: "asc" }, { updatedAt: "desc" }],
    }),
  ]);

  const lowStockProducts = inventorySnapshot
    .filter((p) => Number(p.stock) <= Number(p.lowStockThreshold || 10))
    .slice(0, 25)
    .map(({ updatedAt, ...p }) => p);
  const lowStockCount = lowStockProducts.length;

  return {
    revenue: Number(revenueAgg._sum.total || 0),
    transactions: transactionsToday,
    lowStock: lowStockCount,
    customers: customersCount,
    returningCustomers: recurringCustomersRaw.length,
    lowStockProducts: lowStockProducts.map((p) => ({
      ...p,
      isCritical: Number(p.stock) <= Math.max(1, Math.floor(Number(p.lowStockThreshold) / 2)),
    })),
  };
}

module.exports = { getDashboardStats };
