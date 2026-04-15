const { nowISOString } = require("../../utils/date.js");
/**
 * Structured observability log shape (Phase 6 bus). Safe to pipe to logger or future event sink.
 * @param {object} o
 * @param {string} o.type — e.g. SALE_APPLIED, SNAPSHOT_UPDATED
 * @param {string} o.businessId
 * @param {string} [o.clientTransactionId]
 * @param {object} [o.meta]
 * @param {number} [o.latencyMs]
 */
function buildStructuredObservabilityEvent(o) {
  return {
    v: 1,
    ts: nowISOString(),
    type: o.type,
    businessId: o.businessId,
    clientTransactionId: o.clientTransactionId ?? null,
    source: o.source ?? "observability",
    latencyMs: o.latencyMs ?? null,
    meta: o.meta && typeof o.meta === "object" ? o.meta : null,
  };
}

module.exports = {
  buildStructuredObservabilityEvent,
};
