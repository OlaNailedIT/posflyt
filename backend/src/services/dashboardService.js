const prisma = require("../config/prisma");
const { assertExpenseConsistency } = require("./expenseService");
const { getBusinessDayRange } = require("../utils/businessDayRange");
const { isLowStockCondition } = require("../utils/lowStock");
const { aggregateDailyProfit } = require("./dailyProfitService");

async function getDashboardStats(businessId, options = {}) {
  const lowStockAlertsEnabled = Boolean(options.lowStockAlertsEnabled);
  const settings = await prisma.settings.findUnique({
    where: { businessId },
    select: { businessTimeZone: true },
  });
  const tzRaw = settings?.businessTimeZone != null ? String(settings.businessTimeZone).trim() : "";
  const tz = tzRaw || "UTC";
  const now = new Date();
  const { from: dayStart, to: dayEnd, dateKey } = getBusinessDayRange(now, tz);
  const todayWhere = { businessId, createdAt: { gte: dayStart, lte: dayEnd } };

  const [dpe, transactionsToday, customersCount, recurringCustomersRaw, inventorySnapshot] = await Promise.all([
    aggregateDailyProfit(businessId, dayStart, dayEnd),
    prisma.transaction.count({
      where: {
        ...todayWhere,
        transactionType: "SALE",
      },
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

  /** Today's top-selling products by line quantity (SALE transactions in business day). */
  const saleLines = await prisma.transactionItem.findMany({
    where: {
      transaction: {
        businessId,
        transactionType: "SALE",
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    },
    select: {
      productId: true,
      quantity: true,
      product: { select: { name: true } },
    },
  });
  const qtyByProduct = new Map();
  const nameByProduct = new Map();
  for (const row of saleLines) {
    const pid = row.productId;
    const q = Math.abs(Number(row.quantity) || 0);
    qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + q);
    if (!nameByProduct.has(pid)) nameByProduct.set(pid, row.product?.name || "Product");
  }
  const topSellingToday = [...qtyByProduct.entries()]
    .map(([productId, unitsSold]) => ({
      productId,
      name: nameByProduct.get(productId) || "Product",
      unitsSold,
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 5);

  const totalExpenses = assertExpenseConsistency(dpe.totalExpenses);
  const summaryDate = dateKey;

  return {
    date: summaryDate,
    calendar: { timeZone: tz },
    /** Net subtotal sales (SALE − RETURN), business calendar day. */
    revenue: dpe.revenue,
    /** Cost of goods sold (snapshot at sale; returns reduce). */
    cogs: dpe.cogs,
    /** Revenue − COGS (subtotal basis, before operating expenses). */
    grossProfit: dpe.grossProfit,
    totalExpenses,
    /** Gross profit − expenses. */
    netProfit: dpe.netProfit,
    dailyProfit: dpe.netProfit,
    profit: dpe.netProfit,
    profitType: "net",
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
    topSellingToday,
  };
}

module.exports = { getDashboardStats };
