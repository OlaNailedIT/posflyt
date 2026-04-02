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
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.transaction.findMany({
      where,
      select: { id: true, total: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    totalSales: Number(aggregate._sum.total || 0),
    transactionsCount: aggregate._count._all,
    trend: transactions.map((tx) => ({
      id: tx.id,
      total: Number(tx.total),
      createdAt: tx.createdAt,
    })),
  };
}

module.exports = { getSalesReport };
