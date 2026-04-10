const prisma = require("../config/prisma");
const { wrapCache } = require("./cacheService");
const { maskEmail } = require("./adminOpsService");

const CACHE_TTL_MS = 45_000;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

function cacheKey(parts) {
  return parts.join("|");
}

function parseRange(fromStr, toStr) {
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    const err = new Error("Invalid date range");
    err.statusCode = 400;
    throw err;
  }
  if (from > to) {
    const err = new Error("`from` must be before `to`");
    err.statusCode = 400;
    throw err;
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    const err = new Error("Date range cannot exceed 366 days");
    err.statusCode = 400;
    throw err;
  }
  return { from, to };
}

function previousPeriod(from, to) {
  const rangeMs = to.getTime() - from.getTime() + 1;
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - rangeMs + 1);
  return { from: prevFrom, to: prevTo };
}

function whitelistGranularity(g) {
  if (g === "week" || g === "month") return g;
  return "day";
}

/** All monetary values in business currency (from Settings); timestamps ISO UTC in API layer. */
async function getSnapshot(businessId, query) {
  const { from, to } = parseRange(query.from, query.to);
  const granularity = whitelistGranularity(query.granularity);
  const productId = query.productId && /^[0-9a-f-]{36}$/i.test(query.productId) ? query.productId : null;
  const storeId = query.storeId && /^[0-9a-f-]{36}$/i.test(query.storeId) ? query.storeId : null;

  const key = cacheKey([
    "snap",
    businessId,
    from.toISOString(),
    to.toISOString(),
    granularity,
    productId || "",
    storeId || "",
  ]);

  return wrapCache(`bi:${key}`, async () => {
    const { from: prevFrom, to: prevTo } = previousPeriod(from, to);

    const txWhere = {
      businessId,
      createdAt: { gte: from, lte: to },
      ...(productId
        ? {
            items: { some: { productId } },
          }
        : {}),
      ...(storeId ? { storeId } : {}),
    };

    const txWherePrev = {
      businessId,
      createdAt: { gte: prevFrom, lte: prevTo },
      ...(productId ? { items: { some: { productId } } } : {}),
      ...(storeId ? { storeId } : {}),
    };

    const u = granularity;

    const pid = productId || null;
    const sid = storeId || null;
    const filterTx = `
      AND ($4::uuid IS NULL OR EXISTS (
        SELECT 1 FROM "TransactionItem" ti
        WHERE ti."transactionId" = t."id" AND ti."productId" = $4))
      AND ($5::uuid IS NULL OR t."storeId" = $5)`;
    const filterTi = `
      AND ($4::uuid IS NULL OR ti."productId" = $4)
      AND ($5::uuid IS NULL OR t."storeId" = $5)`;

    const [
      revenueAgg,
      revenuePrevAgg,
      txCount,
      failedTxCount,
      activeCustomerRows,
      newCustomersCount,
      paymentStats,
      lowStockCount,
      settings,
      topProducts,
      conflictRows,
      salesBuckets,
      syncBuckets,
      paymentFailuresByDay,
    ] = await Promise.all([
      prisma.transaction.aggregate({
        where: txWhere,
        _sum: { totalAmount: true },
      }),
      prisma.transaction.aggregate({
        where: txWherePrev,
        _sum: { totalAmount: true },
      }),
      prisma.transaction.count({ where: txWhere }),
      prisma.transaction.count({ where: { ...txWhere, syncStatus: "FAILED" } }),
      prisma.$queryRawUnsafe(
        `SELECT COUNT(DISTINCT t."customerId")::int AS c
         FROM "Transaction" t
         WHERE t."businessId" = $1 AND t."createdAt" >= $2 AND t."createdAt" <= $3
           AND t."customerId" IS NOT NULL
           ${filterTx}`,
        businessId,
        from,
        to,
        pid,
        sid
      ),
      prisma.customer.count({
        where: { businessId, createdAt: { gte: from, lte: to } },
      }),
      prisma.paymentHistory.groupBy({
        by: ["status"],
        where: { businessId, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS c
        FROM "Product"
        WHERE "businessId" = ${businessId}
          AND "lowStockThreshold" IS NOT NULL
          AND "lowStockThreshold" > 0
          AND "stock" <= "lowStockThreshold"
      `,
      prisma.settings.findUnique({
        where: { businessId },
        select: { currencyCode: true, currencySymbol: true },
      }),
      prisma.$queryRawUnsafe(
        `SELECT p."id", p."name",
                COALESCE(SUM(ti."price" * ti."quantity"), 0)::float AS revenue,
                COALESCE(SUM(ti."quantity"), 0)::int AS quantity
         FROM "TransactionItem" ti
         JOIN "Transaction" t ON t."id" = ti."transactionId"
         JOIN "Product" p ON p."id" = ti."productId"
         WHERE t."businessId" = $1 AND t."createdAt" >= $2 AND t."createdAt" <= $3
         ${filterTi}
         GROUP BY p."id", p."name"
         ORDER BY revenue DESC
         LIMIT 10`,
        businessId,
        from,
        to,
        pid,
        sid
      ),
      prisma.auditLog.groupBy({
        by: ["action"],
        where: {
          businessId,
          createdAt: { gte: from, lte: to },
          action: {
            in: [
              "SYNC_DUPLICATE_TRANSACTION",
              "SYNC_INVENTORY_CONFLICT",
              "SYNC_RETRY_FAILED",
              "SYNC_RETRY_RESOLVED",
            ],
          },
        },
        _count: { _all: true },
      }),
      prisma.$queryRawUnsafe(
        `SELECT date_trunc('${u}', t."createdAt" AT TIME ZONE 'UTC') AS bucket,
                COALESCE(SUM(t."totalAmount"), 0)::float AS revenue,
                COUNT(*)::int AS tx_count
         FROM "Transaction" t
         WHERE t."businessId" = $1 AND t."createdAt" >= $2 AND t."createdAt" <= $3
         ${filterTx}
         GROUP BY 1 ORDER BY 1 ASC`,
        businessId,
        from,
        to,
        pid,
        sid
      ),
      prisma.$queryRawUnsafe(
        `SELECT date_trunc('${u}', t."createdAt" AT TIME ZONE 'UTC') AS bucket,
                SUM(CASE WHEN t."syncStatus" = 'SYNCED' THEN 1 ELSE 0 END)::int AS synced,
                SUM(CASE WHEN t."syncStatus" = 'PENDING' THEN 1 ELSE 0 END)::int AS pending,
                SUM(CASE WHEN t."syncStatus" = 'FAILED' THEN 1 ELSE 0 END)::int AS failed
         FROM "Transaction" t
         WHERE t."businessId" = $1 AND t."createdAt" >= $2 AND t."createdAt" <= $3
         ${filterTx}
         GROUP BY 1 ORDER BY 1 ASC`,
        businessId,
        from,
        to,
        pid,
        sid
      ),
      prisma.$queryRaw`
        SELECT date_trunc('day', ph."createdAt" AT TIME ZONE 'UTC') AS bucket,
               COALESCE(SUM(CASE WHEN ph."status" = 'failed' THEN 1 ELSE 0 END), 0)::int AS failed,
               COUNT(*)::int AS total
        FROM "PaymentHistory" ph
        WHERE ph."businessId" = ${businessId}
          AND ph."createdAt" >= ${from}
          AND ph."createdAt" <= ${to}
        GROUP BY 1 ORDER BY 1 ASC
      `,
    ]);

    const revenue = Number(revenueAgg._sum.totalAmount || 0);
    const revenuePrev = Number(revenuePrevAgg._sum.totalAmount || 0);
    const revenueChangePct = revenuePrev > 0 ? (revenue - revenuePrev) / revenuePrev : revenue > 0 ? 1 : 0;

    const paymentTotal = paymentStats.reduce((a, s) => a + s._count._all, 0);
    const paymentFailed = paymentStats.find((s) => s.status === "failed")?._count._all || 0;
    const failedPaymentRate = paymentTotal > 0 ? paymentFailed / paymentTotal : 0;

    const failedTxRate = txCount > 0 ? failedTxCount / txCount : 0;

    const lowStock = Number(lowStockCount[0]?.c || 0);

    const alerts = [];
    if (revenuePrev > 0 && revenueChangePct < -0.2) {
      alerts.push({
        severity: "warning",
        code: "REVENUE_DROP",
        message: "Revenue is more than 20% below the previous period.",
        metric: "revenueChangePct",
        value: revenueChangePct,
      });
    }
    if (failedTxRate > 0.05) {
      alerts.push({
        severity: "warning",
        code: "HIGH_SYNC_FAILURE_RATE",
        message: "Over 5% of transactions failed to sync in this period.",
        metric: "failedTxRate",
        value: failedTxRate,
      });
    }
    if (failedPaymentRate > 0.1 && paymentTotal >= 3) {
      alerts.push({
        severity: "critical",
        code: "HIGH_PAYMENT_FAILURE_RATE",
        message: "Payment records show a high failure rate.",
        metric: "failedPaymentRate",
        value: failedPaymentRate,
      });
    }
    if (lowStock > 0) {
      alerts.push({
        severity: "info",
        code: "LOW_STOCK_SKUS",
        message: `${lowStock} product(s) at or below low-stock threshold.`,
        metric: "lowStockCount",
        value: lowStock,
      });
    }

    const revenueByProduct = (topProducts || []).map((row) => ({
      productId: row.id,
      name: row.name,
      revenue: Number(row.revenue),
      quantity: Number(row.quantity),
    }));

    const revenuePie = revenueByProduct.slice(0, 6);
    const otherRev = revenueByProduct.slice(6).reduce((a, x) => a + x.revenue, 0);
    if (otherRev > 0) {
      revenuePie.push({ productId: null, name: "Other", revenue: otherRev, quantity: 0 });
    }

    const conflictsPie = (conflictRows || []).map((r) => ({
      action: r.action,
      count: r._count._all,
    }));

    const inventoryVelocity = (topProducts || []).slice(0, 8).map((row) => {
      const days = Math.max(1, (to.getTime() - from.getTime()) / 86400000);
      return {
        productId: row.id,
        name: row.name,
        unitsPerDay: Number(row.quantity) / days,
        quantitySold: Number(row.quantity),
      };
    });

    return {
      meta: {
        currencyCode: settings?.currencyCode || "USD",
        currencySymbol: settings?.currencySymbol || "$",
        timezone: "UTC",
        granularity: u,
        range: { from: from.toISOString(), to: to.toISOString() },
        previousRange: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
      },
      kpis: {
        revenue,
        revenuePrevious: revenuePrev,
        revenueChangePct,
        transactionCount: txCount,
        failedTransactionCount: failedTxCount,
        failedTransactionRate: failedTxRate,
        activeCustomers: Number(activeCustomerRows[0]?.c || 0),
        newCustomers: newCustomersCount,
        failedPaymentRate,
        paymentRecordsTotal: paymentTotal,
        paymentFailures: paymentFailed,
        lowStockProductCount: lowStock,
      },
      timeSeries: {
        sales: (salesBuckets || []).map((row) => ({
          bucket: row.bucket,
          revenue: Number(row.revenue),
          transactionCount: Number(row.tx_count),
        })),
        syncHealth: (syncBuckets || []).map((row) => ({
          bucket: row.bucket,
          synced: Number(row.synced),
          pending: Number(row.pending),
          failed: Number(row.failed),
        })),
        paymentFailure: (paymentFailuresByDay || []).map((row) => ({
          bucket: row.bucket,
          failed: Number(row.failed),
          total: Number(row.total),
          rate: Number(row.total) > 0 ? Number(row.failed) / Number(row.total) : 0,
        })),
      },
      breakdowns: {
        topProducts: revenueByProduct,
        revenuePie,
        conflictsPie,
        inventoryVelocity,
      },
      alerts,
    };
  }, Math.ceil(CACHE_TTL_MS / 1000));
}

async function listTransactionsDrilldown(businessId, query) {
  const { from, to } = parseRange(query.from, query.to);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const skip = (page - 1) * pageSize;
  const productId = query.productId && /^[0-9a-f-]{36}$/i.test(query.productId) ? query.productId : undefined;
  const storeId = query.storeId && /^[0-9a-f-]{36}$/i.test(query.storeId) ? query.storeId : undefined;

  const where = {
    businessId,
    createdAt: { gte: from, lte: to },
    ...(productId ? { items: { some: { productId } } } : {}),
    ...(storeId ? { storeId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  const sanitized = rows.map((r) => ({
    id: r.id,
    total: r.totalAmount,
    totalAmount: r.totalAmount,
    paymentMethod: r.paymentMethod,
    paymentStatus: r.paymentStatus,
    amountPaid: r.amountPaid,
    balanceDue: r.balanceDue,
    createdAt: r.createdAt,
    syncStatus: r.syncStatus,
    customer: r.customer
      ? {
          id: r.customer.id,
          name: r.customer.name ? `${String(r.customer.name).slice(0, 1)}***` : null,
          emailMasked: maskEmail(r.customer.email),
        }
      : null,
    items: r.items.map((i) => ({
      quantity: i.quantity,
      price: i.price,
      product: i.product,
    })),
  }));

  return { rows: sanitized, total, page, pageSize };
}

async function buildSlackSummaryText(businessId, query) {
  const snap = await getSnapshot(businessId, query);
  const m = snap.meta;
  const k = snap.kpis;
  return [
    `*POSflyt BI summary* (${m.range.from.slice(0, 10)} → ${m.range.to.slice(0, 10)} UTC)`,
    `Revenue: *${m.currencySymbol}${k.revenue.toFixed(2)}* (${(k.revenueChangePct * 100).toFixed(1)}% vs prior)`,
    `Transactions: ${k.transactionCount} (failed sync: ${k.failedTransactionCount})`,
    `Active customers: ${k.activeCustomers} · New profiles: ${k.newCustomers}`,
    `Alerts: ${snap.alerts.length ? snap.alerts.map((a) => a.code).join(", ") : "none"}`,
  ].join("\n");
}

module.exports = {
  getSnapshot,
  listTransactionsDrilldown,
  buildSlackSummaryText,
  parseRange,
};
