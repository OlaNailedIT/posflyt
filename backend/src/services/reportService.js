const prisma = require("../config/prisma");

async function getSalesReport(businessId, from, to) {
  const where = {
    businessId,
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const [aggregate, transactions] = await Promise.all([
    prisma.transaction.aggregate({
      where,
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.transaction.findMany({
      where,
      select: { id: true, totalAmount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    totalSales: Number(aggregate._sum.totalAmount || 0),
    transactionsCount: aggregate._count._all,
    trend: transactions.map((tx) => ({
      id: tx.id,
      total: Number(tx.totalAmount),
      createdAt: tx.createdAt,
    })),
  };
}

module.exports = { getSalesReport };
