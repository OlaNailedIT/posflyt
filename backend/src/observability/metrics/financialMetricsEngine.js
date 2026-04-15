const { nowISOString } = require("../../utils/date.js");
/**
 * Phase 6 — aggregates from integrity + commerce tables (system health, lag, volume).
 */
const { Prisma } = require("@prisma/client");

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {number} limit
 */
async function findStaleSnapshotScopes(prisma, businessId, limit) {
  return prisma.$queryRaw(Prisma.sql`
    SELECT e."clientTransactionId"::text AS "clientTransactionId",
           COUNT(*)::int AS "eventCount",
           COALESCE(MAX(s."eventCount"), 0)::int AS "snapshotEventCount"
    FROM "IntegrityLedgerEvent" e
    LEFT JOIN "IntegritySnapshot" s
      ON s."businessId" = e."businessId" AND s."clientTransactionId" = e."clientTransactionId"
    WHERE e."businessId" = ${businessId}
    GROUP BY e."clientTransactionId"
    HAVING COUNT(*)::int > COALESCE(MAX(s."eventCount"), 0)
    LIMIT ${limit}
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 */
async function getObservabilitySummary(prisma, businessId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    integrityEventTotal,
    integrityEvent24h,
    ledgerLineTotal,
    snapshotTotal,
    distinctScopes,
    transactions24h,
    salesCount24h,
  ] = await Promise.all([
    prisma.integrityLedgerEvent.count({ where: { businessId } }),
    prisma.integrityLedgerEvent.count({ where: { businessId, createdAt: { gte: since } } }),
    prisma.integrityLedgerLine.count({ where: { businessId } }),
    prisma.integritySnapshot.count({ where: { businessId } }),
    prisma.integrityLedgerEvent.findMany({
      where: { businessId },
      distinct: ["clientTransactionId"],
      select: { clientTransactionId: true },
    }),
    prisma.transaction.count({ where: { businessId, createdAt: { gte: since } } }),
    prisma.transaction.count({
      where: {
        businessId,
        createdAt: { gte: since },
        transactionType: "SALE",
      },
    }),
  ]);

  const staleRows = await findStaleSnapshotScopes(prisma, businessId, 500);

  return {
    integrityEvents: { total: integrityEventTotal, last24h: integrityEvent24h },
    ledgerLines: { total: ledgerLineTotal },
    snapshots: { total: snapshotTotal },
    transactionScopes: { distinctCount: distinctScopes.length },
    commerce: {
      transactionsLast24h: transactions24h,
      salesLast24h: salesCount24h,
    },
    snapshotLag: {
      staleScopeCount: staleRows.length,
      sampleStaleScopes: staleRows.slice(0, 10).map((r) => ({
        clientTransactionId: r.clientTransactionId,
        eventCount: r.eventCount,
        snapshotEventCount: r.snapshotEventCount,
      })),
    },
    syncHealth: {
      /** Heuristic: stale snapshots imply projection/snapshot path behind ingest. */
      snapshotBehindScopes: staleRows.length,
    },
    generatedAt: nowISOString(),
  };
}

function snapshotTotalBehind(summary) {
  return summary.snapshotLag.staleScopeCount > 0;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 */
async function getObservabilityHealth(prisma, businessId) {
  const summary = await getObservabilitySummary(prisma, businessId);
  const stale = summary.snapshotLag.staleScopeCount;
  const scopes = summary.transactionScopes.distinctCount;

  let score = 100;
  if (scopes > 0 && stale > 0) {
    const ratio = stale / scopes;
    score = Math.max(0, Math.round(100 - ratio * 80 - Math.min(20, stale * 2)));
  } else if (summary.integrityEvents.total > 0 && snapshotTotalBehind(summary)) {
    score = Math.max(40, score - 15);
  }

  /** Composite 0–100: reconciliation posture is derived in explain; here we weight snapshot lag + integrity presence. */
  return {
    healthScore: score,
    factors: {
      snapshotStalenessScopes: stale,
      distinctTransactionScopes: scopes,
      transactionsLast24h: summary.commerce.transactionsLast24h,
    },
    summary: {
      integrityEventsTotal: summary.integrityEvents.total,
      snapshotsTotal: summary.snapshots.total,
    },
    generatedAt: nowISOString(),
  };
}

module.exports = {
  findStaleSnapshotScopes,
  getObservabilitySummary,
  getObservabilityHealth,
};
