const prisma = require("../config/prisma");
const { roundCurrency } = require("../utils/paymentState");
const { assertExpenseConsistency } = require("./expenseService");
const { getBusinessDayRange } = require("../utils/businessDayRange");
const { isLowStockCondition } = require("../utils/lowStock");

async function getDashboardStats(businessId, options = {}) {
  const lowStockAlertsEnabled = Boolean(options.lowStockAlertsEnabled);
  const now = new Date();
  /** Explicit UTC business day until per-business IANA zone is stored on Settings. */
  const { from: dayStart, to: dayEnd } = getBusinessDayRange(now, "UTC");
  const todayWhere = { businessId, createdAt: { gte: dayStart, lte: dayEnd } };

  const [revenueAgg, transactionsToday, expenseTodayAgg, customersCount, recurringCustomersRaw, inventorySnapshot] =
    await Promise.all([
    prisma.transaction.aggregate({
      where: todayWhere,
      _sum: { totalAmount: true },
    }),
    prisma.transaction.count({ where: todayWhere }),
    prisma.expense.aggregate({
      where: todayWhere,
      _sum: { amount: true },
    }),
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

  const lowStockProducts = lowStockAlertsEnabled
    ? inventorySnapshot
        .filter((p) => isLowStockCondition(Number(p.stock), p.lowStockThreshold))
        .slice(0, 25)
        .map(({ updatedAt, ...p }) => p)
    : [];
  const lowStockCount = lowStockProducts.length;

  const revenue = roundCurrency(Number(revenueAgg._sum.totalAmount || 0));
  const rawExpenseSum = Number(expenseTodayAgg._sum.amount || 0);
  const totalExpenses = assertExpenseConsistency(rawExpenseSum);
  const grossProfit = roundCurrency(revenue - totalExpenses);
  const dailyProfit = grossProfit;
  const summaryDate = dayStart.toISOString().slice(0, 10);

  return {
    date: summaryDate,
    revenue,
    totalExpenses,
    dailyProfit,
    grossProfit,
    profit: grossProfit,
    profitType: "gross",
    transactions: transactionsToday,
    lowStock: lowStockCount,
    customers: customersCount,
    returningCustomers: recurringCustomersRaw.length,
    lowStockProducts: lowStockProducts.map((p) => {
      const thr = Number(p.lowStockThreshold);
      const half = Number.isFinite(thr) && thr > 0 ? Math.max(1, Math.floor(thr / 2)) : 1;
      return {
        ...p,
        isCritical: Number(p.stock) <= half,
      };
    }),
  };
}

module.exports = { getDashboardStats };
