/**
 * Phase 6 — observability package (metrics, explain, anomalies).
 */
const prisma = require("../config/prisma");
const metrics = require("./metrics/financialMetricsEngine");
const { explainTransactionScope } = require("./explain/explainTransaction");
const { getObservabilityAnomalies } = require("./anomalies/anomalyDetector");

module.exports = {
  getObservabilitySummary: (businessId) => metrics.getObservabilitySummary(prisma, businessId),
  getObservabilityHealth: (businessId) => metrics.getObservabilityHealth(prisma, businessId),
  explainTransactionScope: (businessId, clientTransactionId) =>
    explainTransactionScope(prisma, businessId, clientTransactionId),
  getObservabilityAnomalies: (businessId, opts) => getObservabilityAnomalies(prisma, businessId, opts),
};
