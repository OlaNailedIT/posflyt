const { randomUUID } = require("crypto");
const { partitionKey, partitionLane } = require("./partitioner");
const { streamTopicForBusiness } = require("../sharding/streamNaming");

/**
 * Standard Phase 6.5 stream envelope.
 * @param {object} o
 * @param {string} o.type
 * @param {string} o.businessId
 * @param {string} [o.clientTransactionId]
 * @param {"ingest"|"sync"|"reconciliation"|"snapshot"|"projection"|"system"} [o.source]
 * @param {object} [o.payload]
 * @param {object} [o.meta]
 */
function buildStreamEvent(o) {
  const ts = Date.now();
  return {
    eventId: randomUUID(),
    type: o.type,
    businessId: o.businessId,
    clientTransactionId: o.clientTransactionId ?? null,
    timestampMs: ts,
    source: o.source ?? "system",
    payload: o.payload && typeof o.payload === "object" ? o.payload : {},
    meta: {
      partitionKey: partitionKey(o.businessId, o.clientTransactionId),
      partitionLane: partitionLane(o.businessId, o.clientTransactionId),
      ...(o.businessId
        ? { streamTopic: streamTopicForBusiness(o.businessId) }
        : {}),
      ...(o.meta && typeof o.meta === "object" ? o.meta : {}),
    },
  };
}

module.exports = {
  buildStreamEvent,
};
