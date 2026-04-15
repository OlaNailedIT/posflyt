/**
 * Phase 6.5 — in-memory replay (ring buffer). Durable Kafka-style log = Phase 8+.
 */
const { getEventBus } = require("../eventBus/eventBus");

/**
 * @param {{ businessId?: string, clientTransactionId?: string, types?: string[], sinceMs?: number, limit?: number }} filter
 */
function replayEvents(filter = {}) {
  return getEventBus().queryRecent(filter);
}

/**
 * @param {string} clientTransactionId
 * @param {string} businessId
 */
function replayTransactionScope(businessId, clientTransactionId, limit = 200) {
  return getEventBus().queryRecent({
    businessId,
    clientTransactionId,
    limit,
  });
}

module.exports = {
  replayEvents,
  replayTransactionScope,
};
