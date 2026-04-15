/**
 * Phase 4C — deterministic ordering + full replay from an event stream (pure).
 */
const { initialTransactionFinancialState, reduceTransactionFinancialState } = require("./stateReducer");

/**
 * @param {object} e — IntegrityLedgerEvent-shaped row
 * @returns {number}
 */
function eventTimestampMs(e) {
  if (e.clientTimestampMs != null) {
    const v = e.clientTimestampMs;
    return typeof v === "bigint" ? Number(v) : Number(v);
  }
  return new Date(e.createdAt).getTime();
}

/**
 * Deterministic total order: client time (ms), then eventId (lexicographic).
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compareIntegrityEvents(a, b) {
  const ta = eventTimestampMs(a);
  const tb = eventTimestampMs(b);
  if (ta !== tb) return ta - tb;
  if (a.eventId < b.eventId) return -1;
  if (a.eventId > b.eventId) return 1;
  return 0;
}

/**
 * @template T
 * @param {T[]} events
 * @returns {T[]}
 */
function sortIntegrityEvents(events) {
  return [...events].sort(compareIntegrityEvents);
}

/**
 * Fold the full sorted stream into terminal financial state (reconciler / audit).
 * @param {object[]} sortedEvents
 * @returns {ReturnType<typeof initialTransactionFinancialState>}
 */
function rebuildFinancialState(sortedEvents) {
  if (!sortedEvents.length) {
    return initialTransactionFinancialState("");
  }
  const id = sortedEvents[0].clientTransactionId;
  let state = initialTransactionFinancialState(id);
  for (const e of sortedEvents) {
    state = reduceTransactionFinancialState(state, e);
  }
  return state;
}

/** @alias rebuildFinancialState */
const rebuildBalance = rebuildFinancialState;

module.exports = {
  eventTimestampMs,
  compareIntegrityEvents,
  sortIntegrityEvents,
  rebuildFinancialState,
  rebuildBalance,
};
