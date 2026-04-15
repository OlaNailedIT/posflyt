/**
 * Phase 6.5 — built-in subscribers (logger + lightweight counters). Idempotent register.
 */
const { logger } = require("../../utils/logger");
const { getEventBus } = require("../eventBus/eventBus");

/** @type {Map<string, number>} */
const typeCounts = new Map();
let registered = false;

function bump(event) {
  const t = event.type || "?";
  typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
}

/**
 * Rolling counts since process start (in-memory).
 */
function getStreamTypeCounts() {
  return Object.fromEntries(typeCounts);
}

function registerDefaultSubscribers() {
  if (registered) return;
  registered = true;
  const bus = getEventBus();

  bus.subscribe("*", (event) => {
    bump(event);
    logger.debug(
      {
        stream: "vessa",
        eventId: event.eventId,
        type: event.type,
        businessId: event.businessId,
        clientTransactionId: event.clientTransactionId,
        partitionKey: event.meta?.partitionKey,
      },
      "STREAM_EVENT"
    );
  });
}

module.exports = {
  registerDefaultSubscribers,
  getStreamTypeCounts,
};
