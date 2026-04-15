const { AUDIT_EVENT_TYPES } = require("../config/auditEventTypes");

/**
 * Lightweight fraud / ops summary over a batch of audit rows (same correlation or ad hoc list).
 * Does not block or mutate data.
 */
function analyzeCorrelation(events) {
  const list = Array.isArray(events) ? events : [];
  const summary = {
    totalEvents: list.length,
    hasReturn: list.some((e) => e.type === AUDIT_EVENT_TYPES.RETURN_CREATED),
    hasInventoryChange: list.some((e) => e.entityType === "inventory"),
    hasRetryPattern: list.filter((e) => e.type === AUDIT_EVENT_TYPES.SYNC).length > 2,
    riskScore: 0,
  };

  summary.riskScore =
    (summary.hasReturn ? 2 : 0) +
    (summary.hasRetryPattern ? 1 : 0) +
    (summary.totalEvents > 10 ? 1 : 0);

  return summary;
}

module.exports = { analyzeCorrelation };
