const prisma = require("../config/prisma");
const { isLowStockCondition } = require("../utils/lowStock");

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

async function getProfitAnalytics(businessId) {
  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const dayEnd = endOfUtcDay(now);
  const weekStart = new Date(dayStart);
  weekStart.setUTCDate(dayStart.getUTCDate() - 6);

  const [dailyItems, weeklyItems] = await Promise.all([
    prisma.transactionItem.findMany({
      where: {
        transaction: { businessId, createdAt: { gte: dayStart, lte: dayEnd } },
      },
      select: {
        quantity: true,
        price: true,
        product: { select: { costPrice: true } },
      },
    }),
    prisma.transactionItem.findMany({
      where: {
        transaction: { businessId, createdAt: { gte: weekStart, lte: dayEnd } },
      },
      select: {
        quantity: true,
        price: true,
        product: { select: { costPrice: true } },
      },
    }),
  ]);

  const sumRevenue = (items) => items.reduce((acc, item) => acc + Number(item.price) * item.quantity, 0);
  const sumCost = (items) =>
    items.reduce((acc, item) => acc + Number(item.product?.costPrice || 0) * item.quantity, 0);

  const dailyRevenue = sumRevenue(dailyItems);
  const dailyCost = sumCost(dailyItems);
  const weeklyRevenue = sumRevenue(weeklyItems);
  const weeklyCost = sumCost(weeklyItems);

  return {
    daily: {
      revenue: dailyRevenue,
      cost: dailyCost,
      profit: dailyRevenue - dailyCost,
    },
    weekly: {
      revenue: weeklyRevenue,
      cost: weeklyCost,
      profit: weeklyRevenue - weeklyCost,
    },
  };
}

async function getStaffPerformance(businessId) {
  const users = await prisma.user.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      transactions: {
        select: { totalAmount: true },
      },
    },
  });

  return users.map((user) => {
    const totalSales = user.transactions.reduce((sum, tx) => sum + Number(tx.totalAmount), 0);
    const transactionsCount = user.transactions.length;
    return {
      userId: user.id,
      name: user.name,
      totalSales,
      transactionsCount,
      averageTransactionValue: transactionsCount ? totalSales / transactionsCount : 0,
    };
  });
}

async function generateSmartAlerts(businessId) {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = endOfUtcDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setUTCDate(todayStart.getUTCDate() - 1);
  const yesterdayEnd = new Date(todayEnd);
  yesterdayEnd.setUTCDate(todayEnd.getUTCDate() - 1);

  const [todayAgg, yesterdayAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { businessId, createdAt: { gte: todayStart, lte: todayEnd } },
      _sum: { totalAmount: true },
    }),
    prisma.transaction.aggregate({
      where: { businessId, createdAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      _sum: { totalAmount: true },
    }),
  ]);

  const today = Number(todayAgg._sum.totalAmount || 0);
  const yesterday = Number(yesterdayAgg._sum.totalAmount || 0);

  if (yesterday > 0 && today >= yesterday * 1.5) {
    await prisma.smartAlert.upsert({
      where: {
        businessId_type_alertDate: {
          businessId,
          type: "SALES_SPIKE",
          alertDate: todayStart,
        },
      },
      update: {},
      create: {
        businessId,
        type: "SALES_SPIKE",
        alertDate: todayStart,
        message: `Sales spike detected: ${today.toFixed(2)} vs ${yesterday.toFixed(2)} yesterday.`,
      },
    });
  }

  if (yesterday > 0 && today <= yesterday * 0.5) {
    await prisma.smartAlert.upsert({
      where: {
        businessId_type_alertDate: {
          businessId,
          type: "SALES_DROP",
          alertDate: todayStart,
        },
      },
      update: {},
      create: {
        businessId,
        type: "SALES_DROP",
        alertDate: todayStart,
        message: `Sales drop detected: ${today.toFixed(2)} vs ${yesterday.toFixed(2)} yesterday.`,
      },
    });
  }
}

async function getSmartAlerts(businessId) {
  await generateSmartAlerts(businessId);
  return prisma.smartAlert.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

async function getInsights(businessId) {
  const grouped = await prisma.transactionItem.groupBy({
    by: ["productId"],
    where: { transaction: { businessId } },
    _sum: { quantity: true },
  });
  if (!grouped.length) {
    return {
      topSellingProduct: null,
      leastSellingProduct: null,
      predictedSlowPeriods: [],
      predictedHighDemandPeriods: [],
      suggestions: [],
    };
  }

  const sorted = [...grouped].sort((a, b) => Number(b._sum.quantity || 0) - Number(a._sum.quantity || 0));
  const top = sorted[0];
  const least = sorted[sorted.length - 1];
  const productIds = [top.productId, least.productId];
  const products = await prisma.product.findMany({
    where: { businessId, id: { in: productIds } },
    select: { id: true, name: true, stock: true, lowStockThreshold: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const topProduct = byId.get(top.productId) || null;
  const leastProduct = byId.get(least.productId) || null;

  const txHours = await prisma.transaction.findMany({
    where: { businessId },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const hourCounts = new Map();
  for (const tx of txHours) {
    const h = tx.createdAt.getUTCHours();
    hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
  }
  const sortedHours = [...hourCounts.entries()].sort((a, b) => b[1] - a[1]);
  const predictedHighDemandPeriods = sortedHours
    .slice(0, 3)
    .map(([hour]) => `${String(hour).padStart(2, "0")}:00-${String((hour + 1) % 24).padStart(2, "0")}:00`);
  const predictedSlowPeriods = sortedHours
    .slice(-3)
    .map(([hour]) => `${String(hour).padStart(2, "0")}:00-${String((hour + 1) % 24).padStart(2, "0")}:00`);

  const suggestions = [];
  if (topProduct && isLowStockCondition(Number(topProduct.stock), topProduct.lowStockThreshold)) {
    suggestions.push(`Restock product ${topProduct.name}.`);
  }
  suggestions.push("Review weekly sales trend for sudden drops.");
  if (predictedSlowPeriods.length) {
    suggestions.push(`Promote offers during slow period ${predictedSlowPeriods[0]}.`);
  }

  return {
    topSellingProduct: topProduct
      ? { ...topProduct, soldQty: Number(top._sum.quantity || 0) }
      : null,
    leastSellingProduct: leastProduct
      ? { ...leastProduct, soldQty: Number(least._sum.quantity || 0) }
      : null,
    predictedSlowPeriods,
    predictedHighDemandPeriods,
    suggestions,
  };
}

async function getForecast(businessId) {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 13);

  const txs = await prisma.transaction.findMany({
    where: { businessId, createdAt: { gte: start, lte: now } },
    select: { totalAmount: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const dayBuckets = new Map();
  for (const tx of txs) {
    const key = tx.createdAt.toISOString().slice(0, 10);
    dayBuckets.set(key, (dayBuckets.get(key) || 0) + Number(tx.totalAmount));
  }
  const last7 = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - i);
    const key = day.toISOString().slice(0, 10);
    last7.push(dayBuckets.get(key) || 0);
  }
  const movingAverage = last7.reduce((a, b) => a + b, 0) / (last7.length || 1);

  const productDemand = await prisma.transactionItem.groupBy({
    by: ["productId"],
    where: { transaction: { businessId, createdAt: { gte: start, lte: now } } },
    _sum: { quantity: true },
  });
  const topDemandIds = productDemand
    .sort((a, b) => Number(b._sum.quantity || 0) - Number(a._sum.quantity || 0))
    .slice(0, 5)
    .map((p) => p.productId);
  const products = await prisma.product.findMany({
    where: { businessId, id: { in: topDemandIds } },
    select: { id: true, name: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p.name]));

  return {
    lookbackDays: 14,
    expectedSalesNextDay: movingAverage,
    demandPredictions: topDemandIds.map((id) => ({
      productId: id,
      name: productMap.get(id) || "Unknown",
      estimatedDemand: Number(productDemand.find((p) => p.productId === id)?._sum.quantity || 0),
    })),
  };
}

async function getForecastDataset(businessId) {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 90);
  const txs = await prisma.transaction.findMany({
    where: { businessId, createdAt: { gte: start, lte: now } },
    select: { createdAt: true, totalAmount: true },
    orderBy: { createdAt: "asc" },
  });
  const series = txs.map((tx) => ({
    timestamp: tx.createdAt.toISOString(),
    value: Number(tx.totalAmount),
  }));
  return {
    series,
    features: ["timestamp", "value"],
    trendWindowDays: 7,
  };
}

async function getSalesOptimization(businessId) {
  const [topProductsRaw, byHour, staff] = await Promise.all([
    prisma.transactionItem.groupBy({
      by: ["productId"],
      where: { transaction: { businessId } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.transaction.findMany({
      where: { businessId },
      select: { createdAt: true },
    }),
    getStaffPerformance(businessId),
  ]);

  const productIds = topProductsRaw.map((p) => p.productId);
  const products = await prisma.product.findMany({
    where: { businessId, id: { in: productIds } },
    select: { id: true, name: true },
  });
  const productName = new Map(products.map((p) => [p.id, p.name]));

  const hourMap = new Map();
  for (const tx of byHour) {
    const hour = tx.createdAt.getUTCHours();
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
  }
  const peakHours = [...hourMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, count]) => ({ hour, transactions: count }));

  return {
    topProducts: topProductsRaw.map((p) => ({
      productId: p.productId,
      name: productName.get(p.productId) || "Unknown",
      qty: Number(p._sum.quantity || 0),
    })),
    peakHours,
    highPerformingStaff: [...staff].sort((a, b) => b.totalSales - a.totalSales).slice(0, 5),
  };
}

module.exports = {
  getProfitAnalytics,
  getStaffPerformance,
  getSmartAlerts,
  getInsights,
  getForecast,
  getSalesOptimization,
  getForecastDataset,
};
