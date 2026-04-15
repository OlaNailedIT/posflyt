/**
 * Phase 6 — admin financial observability API.
 */
const { z } = require("zod");
const { sendOk, sendError } = require("../utils/http");
const {
  getObservabilitySummary,
  getObservabilityHealth,
  explainTransactionScope,
  getObservabilityAnomalies,
} = require("../services/observabilityService");
const { getSyncSummary } = require("../services/adminOpsService");

/**
 * Server-side operational posture (parallels client `getOperationalResilienceSnapshot` intent — DB-backed).
 */
function deriveOperationalMode(health, syncSummary, anomalyCount) {
  const failed = syncSummary.transactionsBySyncStatus.FAILED;
  const pending = syncSummary.transactionsBySyncStatus.PENDING;
  const failedRetries24h = syncSummary.last24h.syncRetryFailed;
  const score = health.healthScore;

  if (failed > 0 || score < 30) return "CRITICAL";
  if (score < 50 || pending > 80 || anomalyCount > 25) return "DEGRADED";
  if (pending > 0 || anomalyCount > 0 || failedRetries24h > 3 || score < 75) return "ELEVATED";
  return "NORMAL";
}

function syncPressureLabel(pending, failed) {
  if (failed > 0) return "HIGH";
  if (pending > 50) return "HIGH";
  if (pending > 10) return "MODERATE";
  if (pending > 0) return "LOW";
  return "NONE";
}

const txParams = z.object({
  clientTransactionId: z.string().min(1),
});

async function getObsSummary(req, res, next) {
  try {
    const data = await getObservabilitySummary(req.auth.businessId);
    return sendOk(res, data);
  } catch (err) {
    return next(err);
  }
}

async function getObsHealth(req, res, next) {
  try {
    const data = await getObservabilityHealth(req.auth.businessId);
    return sendOk(res, data);
  } catch (err) {
    return next(err);
  }
}

async function getObsExplain(req, res, next) {
  try {
    const { clientTransactionId } = txParams.parse(req.params);
    const data = await explainTransactionScope(req.auth.businessId, clientTransactionId);
    return sendOk(res, data);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/observabilityController.getObsExplain",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

async function getObsAnomalies(req, res, next) {
  try {
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const deep = String(req.query.deep || "") === "1";
    const data = await getObservabilityAnomalies(req.auth.businessId, { limit, deep });
    return sendOk(res, data);
  } catch (error) {
    return next(error);
  }
}

/** Phase 7 — single control-tower payload: health + IFETS-style anomalies + sync / backlog (admin). */
async function getUfecHealth(req, res, next) {
  try {
    const businessId = req.auth.businessId;
    const [health, anomalies, syncSummary] = await Promise.all([
      getObservabilityHealth(businessId),
      getObservabilityAnomalies(businessId, { limit: 50, deep: false }),
      getSyncSummary(businessId),
    ]);

    const items = anomalies.items ?? [];
    const operationalMode = deriveOperationalMode(health, syncSummary, items.length);
    const pending = syncSummary.transactionsBySyncStatus.PENDING;
    const failed = syncSummary.transactionsBySyncStatus.FAILED;

    return sendOk(res, {
      operationalMode,
      syncPressure: syncPressureLabel(pending, failed),
      resilienceSnapshot: {
        healthScore: health.healthScore,
        factors: health.factors,
        summary: health.summary,
        syncSummary,
        generatedAt: health.generatedAt,
        note: "Server aggregates (integrity + commerce). Client UFEC/IFETS adds offline detail in-browser.",
      },
      anomalies: items,
      anomaliesMeta: {
        count: items.length,
        deepScan: anomalies.deepScan,
        generatedAt: anomalies.generatedAt,
      },
      reconciliationBacklog: {
        pendingTransactions: pending,
        failedTransactions: failed,
        staleSnapshotScopes: health.factors?.snapshotStalenessScopes ?? 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getObsSummary,
  getObsHealth,
  getObsExplain,
  getObsAnomalies,
  getUfecHealth,
};
