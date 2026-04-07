const prisma = require("../config/prisma");
const { getRuntimeMetrics } = require("../services/runtimeMetricsService");
const { getInventoryIntegrityStatus } = require("../services/inventoryIntegrityService");
const { sendOk } = require("../utils/http");

async function getSystemHealth(_req, res) {
  let db = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "down";
  }
  return sendOk(res, {
    api: "up",
    database: db,
    timestamp: new Date().toISOString(),
  });
}

async function getReliabilitySummary(req, res, next) {
  try {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24);
    const sevenDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
    const [
      transactions24h,
      duplicateConflicts,
      inventoryConflicts,
      warningMismatches,
      criticalMismatches,
      retryResolved,
      mismatchLogs7d,
      failureLogs24h,
    ] =
      await Promise.all([
        prisma.transaction.count({
          where: { businessId: req.auth.businessId, createdAt: { gte: since } },
        }),
        prisma.auditLog.count({
          where: {
            businessId: req.auth.businessId,
            action: "SYNC_DUPLICATE_TRANSACTION",
            createdAt: { gte: since },
          },
        }),
        prisma.auditLog.count({
          where: {
            businessId: req.auth.businessId,
            action: "SYNC_INVENTORY_CONFLICT",
            createdAt: { gte: since },
          },
        }),
        prisma.auditLog.count({
          where: {
            businessId: req.auth.businessId,
            action: "INVENTORY_MISMATCH_WARNING",
            createdAt: { gte: since },
          },
        }),
        prisma.auditLog.count({
          where: {
            businessId: req.auth.businessId,
            action: "INVENTORY_MISMATCH_CRITICAL",
            createdAt: { gte: since },
          },
        }),
        prisma.auditLog.findMany({
          where: {
            businessId: req.auth.businessId,
            action: "SYNC_RETRY_RESOLVED",
            createdAt: { gte: since },
          },
          select: { metadata: true },
        }),
        prisma.auditLog.findMany({
          where: {
            businessId: req.auth.businessId,
            action: { in: ["INVENTORY_MISMATCH_WARNING", "INVENTORY_MISMATCH_CRITICAL"] },
            createdAt: { gte: sevenDaysAgo },
          },
          select: { action: true, createdAt: true },
        }),
        prisma.auditLog.findMany({
          where: {
            businessId: req.auth.businessId,
            action: {
              in: ["SYNC_INVENTORY_CONFLICT", "SYNC_DUPLICATE_TRANSACTION", "SYNC_RETRY_FAILED"],
            },
            createdAt: { gte: since },
          },
          select: { action: true, metadata: true },
        }),
      ]);

    const runtime = getRuntimeMetrics();
    const integrity = getInventoryIntegrityStatus();
    const mismatches = warningMismatches + criticalMismatches;
    const denominator = transactions24h + duplicateConflicts + inventoryConflicts;
    const syncSuccessRate = denominator > 0 ? Number((transactions24h / denominator).toFixed(4)) : 1;
    const duplicateRate = denominator > 0 ? Number((duplicateConflicts / denominator).toFixed(4)) : 0;
    const retryResolutionFromLogs = retryResolved
      .map((entry) => Number(entry?.metadata?.resolutionMs))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const retryResolutionFromLogsAvg = retryResolutionFromLogs.length
      ? Number(
          (
            retryResolutionFromLogs.reduce((sum, value) => sum + value, 0) /
            retryResolutionFromLogs.length
          ).toFixed(2)
        )
      : null;
    const trendMap = new Map();
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(Date.now() - i * 1000 * 60 * 60 * 24).toISOString().slice(0, 10);
      trendMap.set(day, { date: day, warningCount: 0, criticalCount: 0 });
    }
    for (const log of mismatchLogs7d) {
      const day = new Date(log.createdAt).toISOString().slice(0, 10);
      if (!trendMap.has(day)) continue;
      const row = trendMap.get(day);
      if (log.action === "INVENTORY_MISMATCH_WARNING") row.warningCount += 1;
      if (log.action === "INVENTORY_MISMATCH_CRITICAL") row.criticalCount += 1;
    }
    const reconciliationTrend7d = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const byEndpoint = {};
    for (const log of failureLogs24h) {
      const endpoint = log?.metadata?.endpoint || "unknown";
      byEndpoint[endpoint] = (byEndpoint[endpoint] || 0) + 1;
    }

    return sendOk(res, {
      window: "24h",
      syncSuccessRate,
      duplicateTransactionRate: duplicateRate,
      stockMismatchCount: mismatches,
      stockMismatchWarningCount: warningMismatches,
      stockMismatchCriticalCount: criticalMismatches,
      api5xxCount: runtime.api5xxCount,
      eventLoopDelayMeanSeconds: runtime.eventLoopDelayMeanSeconds,
      averageSyncRetryResolutionTimeMs:
        retryResolutionFromLogsAvg ?? runtime.averageSyncRetryResolutionTimeMs ?? null,
      openSyncFailures: inventoryConflicts,
      failureCohorts: {
        byCode: {
          DUPLICATE_ID: duplicateConflicts,
          INVENTORY_CONFLICT: inventoryConflicts,
          TRANSIENT_SYNC_FAILURE: failureLogs24h.filter((log) => log.action === "SYNC_RETRY_FAILED")
            .length,
        },
        byEndpoint,
        byBusiness: {
          [req.auth.businessId]: failureLogs24h.length,
        },
      },
      reconciliationTrend7d,
      lastIncrementalReconciliationRunAt: integrity.lastIncrementalRunAt,
      lastFullReconciliationRunAt: integrity.lastFullRunAt,
      lastReconciliationStatus: integrity.lastRunStatus,
      lastReconciliationError: integrity.lastRunError,
      lastUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getSystemHealth, getReliabilitySummary };
